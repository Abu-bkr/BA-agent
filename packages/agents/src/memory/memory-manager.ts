import { Redis } from "ioredis";
import { ChromaClient } from "chromadb";

import prisma from "@ai-business-analyst/db";
import { createEmbeddingProvider, type EmbeddingProvider } from "./embeddings.js";

export type MemoryRole = "agent" | "client";
export type MemoryMetadata = Record<string, unknown>;

export interface MemoryTurn {
  id: string;
  projectId: string;
  role: MemoryRole;
  text: string;
  metadata: MemoryMetadata;
  createdAt: Date;
}

export interface MemoryManagerOptions {
  redis?: RedisLike;
  db?: DatabaseLike;
  chroma?: ChromaLike;
  embed?: EmbeddingProvider;
  shortTermLimit?: number;
  redisKeyPrefix?: string;
  chromaCollectionName?: string;
}

interface RedisLike {
  rpush(key: string, value: string): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<string>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

interface DatabaseLike {
  conversationTurn: {
    create(args: {
      data: {
        projectId: string;
        role: MemoryRole;
        question: string;
        answer: string;
        agentSource?: string;
      };
    }): Promise<{
      id: string;
      projectId: string;
      role: MemoryRole;
      question: string;
      answer: string;
      agentSource: string | null;
      createdAt: Date;
    }>;
    findMany(args: {
      where: { projectId: string };
      orderBy: { createdAt: "asc" | "desc" };
    }): Promise<
      Array<{
        id: string;
        projectId: string;
        role: MemoryRole;
        question: string;
        answer: string;
        agentSource: string | null;
        createdAt: Date;
      }>
    >;
  };
}

interface ChromaLike {
  getOrCreateCollection(args: {
    name: string;
  }): Promise<CollectionLike>;
}

interface CollectionLike {
  add(args: {
    ids: string[];
    embeddings: number[][];
    documents: string[];
    metadatas: Array<Record<string, string>>;
  }): Promise<unknown>;
  query(args: {
    queryEmbeddings: number[][];
    nResults: number;
    where: Record<string, string>;
  }): Promise<{
    ids?: string[][];
    documents?: Array<Array<string | null>>;
    metadatas?: Array<Array<Record<string, string> | null>>;
    distances?: Array<Array<number | null>>;
  }>;
}

export interface SemanticResult extends MemoryTurn {
  distance?: number;
}

const DEFAULT_SHORT_TERM_LIMIT = 20;
const DEFAULT_REDIS_PREFIX = "memory:project";
const DEFAULT_COLLECTION = "conversation_turns";

let defaultMemoryManagerInstance: MemoryManager | undefined;

/**
 * Lazily-constructed, process-wide MemoryManager singleton used as the
 * default by agent nodes. Constructing the manager connects to Redis and
 * initializes the embedding provider, so we defer it until a node actually
 * runs rather than on module import (which would throw without
 * OPENAI_API_KEY and crash tests / the API at load time).
 */
export function getDefaultMemoryManager(): MemoryManager {
  defaultMemoryManagerInstance ??= new MemoryManager();
  return defaultMemoryManagerInstance;
}

export class MemoryManager {
  private readonly redis: RedisLike;
  private readonly db: DatabaseLike;
  private readonly chroma: ChromaLike;
  private readonly embed: EmbeddingProvider;
  private readonly shortTermLimit: number;
  private readonly redisKeyPrefix: string;
  private readonly collectionName: string;
  private collection?: Promise<CollectionLike>;

  constructor(options: MemoryManagerOptions = {}) {
    this.redis = options.redis ?? new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    this.db = options.db ?? prisma;
    this.chroma = options.chroma ?? new ChromaClient({
      path: process.env.CHROMA_URL ?? "http://localhost:8000",
    });
    this.embed = options.embed ?? createEmbeddingProvider();
    this.shortTermLimit = options.shortTermLimit ?? DEFAULT_SHORT_TERM_LIMIT;
    this.redisKeyPrefix = options.redisKeyPrefix ?? DEFAULT_REDIS_PREFIX;
    this.collectionName =
      options.chromaCollectionName ?? DEFAULT_COLLECTION;
  }

  async addTurn(
    projectId: string,
    role: MemoryRole,
    text: string,
    metadata: MemoryMetadata = {},
  ): Promise<MemoryTurn> {
    if (!projectId.trim() || !text.trim()) {
      throw new Error("projectId and text are required.");
    }
    if (role !== "agent" && role !== "client") {
      throw new Error(`Unsupported memory role "${role}".`);
    }

    const record = await this.db.conversationTurn.create({
      data: {
        projectId,
        role,
        question: role === "client" ? text : "",
        answer: role === "agent" ? text : "",
        ...(typeof metadata.agentSource === "string"
          ? { agentSource: metadata.agentSource }
          : {}),
      },
    });

    const turn: MemoryTurn = {
      id: record.id,
      projectId: record.projectId,
      role: record.role,
      text,
      metadata,
      createdAt: record.createdAt,
    };

    await this.redis.rpush(this.redisKey(projectId), JSON.stringify(turn));
    await this.redis.ltrim(
      this.redisKey(projectId),
      -this.shortTermLimit,
      -1,
    );

    const embedding = await this.embed(text);
    const collection = await this.getCollection();
    await collection.add({
      ids: [turn.id],
      embeddings: [embedding],
      documents: [text],
      metadatas: [
        {
          projectId,
          role,
          metadata: JSON.stringify(metadata),
          createdAt: turn.createdAt.toISOString(),
        },
      ],
    });

    return turn;
  }

  async getRecent(projectId: string, n: number): Promise<MemoryTurn[]> {
    if (n <= 0) return [];

    const values = await this.redis.lrange(
      this.redisKey(projectId),
      -Math.floor(n),
      -1,
    );

    return values.map((value) => JSON.parse(value) as MemoryTurn);
  }

  async semanticSearch(
    projectId: string,
    query: string,
    k: number,
  ): Promise<SemanticResult[]> {
    if (k <= 0) return [];

    const [embedding, collection] = await Promise.all([
      this.embed(query),
      this.getCollection(),
    ]);
    const result = await collection.query({
      queryEmbeddings: [embedding],
      nResults: k,
      where: { projectId },
    });

    return (result.ids?.[0] ?? []).map((id, index) => {
      const metadata = result.metadatas?.[0]?.[index];
      const document = result.documents?.[0]?.[index] ?? "";
      const distance = result.distances?.[0]?.[index] ?? undefined;

      return {
        id,
        projectId,
        role: (metadata?.role ?? "client") as MemoryRole,
        text: document,
        metadata: parseMetadata(metadata?.metadata),
        createdAt: new Date(
          metadata?.createdAt ?? new Date().toISOString(),
        ),
        ...(distance === undefined ? {} : { distance }),
      };
    });
  }

  async getFullHistory(projectId: string): Promise<MemoryTurn[]> {
    const records = await this.db.conversationTurn.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    return records.map((record) => ({
      id: record.id,
      projectId: record.projectId,
      role: record.role,
      text: record.role === "client" ? record.question : record.answer,
      metadata:
        record.agentSource === null
          ? {}
          : { agentSource: record.agentSource },
      createdAt: record.createdAt,
    }));
  }

  private redisKey(projectId: string): string {
    return `${this.redisKeyPrefix}:${projectId}`;
  }

  private async getCollection(): Promise<CollectionLike> {
    this.collection ??= this.chroma
      .getOrCreateCollection({ name: this.collectionName })
      .then((collection) => collection);
    return this.collection;
  }
}

function parseMetadata(value?: string): MemoryMetadata {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object"
      ? (parsed as MemoryMetadata)
      : {};
  } catch {
    return {};
  }
}