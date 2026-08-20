import { describe, expect, it } from "vitest";

import { MemoryManager } from "../src/memory/memory-manager.js";

type StoredTurn = {
  id: string;
  projectId: string;
  role: "agent" | "client";
  question: string;
  answer: string;
  agentSource: string | null;
  createdAt: Date;
};

class FakeRedis {
  private readonly lists = new Map<string, string[]>();

  async rpush(key: string, value: string): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return list.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<string> {
    const list = this.lists.get(key) ?? [];
    const normalizedStart = start < 0 ? Math.max(0, list.length + start) : start;
    const normalizedStop = stop < 0 ? list.length + stop : stop;
    this.lists.set(key, list.slice(normalizedStart, normalizedStop + 1));
    return "OK";
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    const normalizedStart = start < 0 ? Math.max(0, list.length + start) : start;
    const normalizedStop = stop < 0 ? list.length + stop : stop;
    return list.slice(normalizedStart, normalizedStop + 1);
  }
}

class FakeDatabase {
  private counter = 0;
  readonly turns: StoredTurn[] = [];

  conversationTurn = {
    create: async ({ data }: { data: Omit<StoredTurn, "id" | "agentSource" | "createdAt"> & { agentSource?: string } }) => {
      const turn: StoredTurn = {
        ...data,
        id: `turn-${++this.counter}`,
        agentSource: data.agentSource ?? null,
        createdAt: new Date(Date.now() + this.counter),
      };
      this.turns.push(turn);
      return turn;
    },
    findMany: async () => this.turns,
  };
}

class FakeCollection {
  readonly entries: Array<{
    id: string;
    embedding: number[];
    document: string;
    metadata: Record<string, string>;
  }> = [];

  async add(args: {
    ids: string[];
    embeddings: number[][];
    documents: string[];
    metadatas: Array<Record<string, string>>;
  }) {
    args.ids.forEach((id, index) => {
      this.entries.push({
        id,
        embedding: args.embeddings[index]!,
        document: args.documents[index]!,
        metadata: args.metadatas[index]!,
      });
    });
  }

  async query(args: {
    queryEmbeddings: number[][];
    nResults: number;
    where: Record<string, string>;
  }) {
    const query = args.queryEmbeddings[0]!;
    const matches = this.entries
      .filter((entry) => entry.metadata.projectId === args.where.projectId)
      .map((entry) => ({
        entry,
        distance: Math.abs(entry.embedding[0]! - query[0]!),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, args.nResults);

    return {
      ids: [matches.map(({ entry }) => entry.id)],
      documents: [matches.map(({ entry }) => entry.document)],
      metadatas: [matches.map(({ entry }) => entry.metadata)],
      distances: [matches.map(({ distance }) => distance)],
    };
  }
}

class FakeChroma {
  readonly collection = new FakeCollection();

  async getOrCreateCollection() {
    return this.collection;
  }
}

describe("MemoryManager", () => {
  it("supports bounded recency and project-scoped semantic retrieval", async () => {
    const manager = new MemoryManager({
      redis: new FakeRedis(),
      db: new FakeDatabase(),
      chroma: new FakeChroma(),
      shortTermLimit: 2,
      embed: async (text) => [text.includes("payments") ? 1 : 10],
    });

    await manager.addTurn("project-a", "client", "The client needs payments reporting.");
    await manager.addTurn("project-a", "agent", "I will document the reporting workflow.");
    const paymentTurn = await manager.addTurn(
      "project-a",
      "client",
      "Payments must support monthly reconciliation.",
      { source: "interview" },
    );
    await manager.addTurn("project-b", "client", "Payments are out of scope.");

    const recent = await manager.getRecent("project-a", 2);
    expect(recent.map((turn) => turn.text)).toEqual([
      "I will document the reporting workflow.",
      "Payments must support monthly reconciliation.",
    ]);

    const matches = await manager.semanticSearch("project-a", "payment details", 3);
    expect(matches).toHaveLength(3);
    expect(matches.map((turn) => turn.id)).toContain(paymentTurn.id);
    expect(matches.every((turn) => turn.projectId === "project-a")).toBe(true);
    expect(matches.map((turn) => turn.text)).toContain(
      "The client needs payments reporting.",
    );
  });
});