import { describe, expect, it, vi } from "vitest";
import { MemorySaver } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_model";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { compileGraph, runTurn, type AgentStateType } from "../src/graph/index.js";
import type { MemoryManager } from "../src/memory/memory-manager.js";
import type { DbClient, DbQueryInput } from "../src/tools/db-query-tool.js";
import type { Requirement, Gap, Risk, DocumentArtifact } from "@ai-business-analyst/shared-types";

class FakeMemoryManager implements Partial<MemoryManager> {
  private turns: Array<{ projectId: string; role: string; text: string }> = [];

  async addTurn(
    projectId: string,
    role: "agent" | "client",
    text: string,
  ) {
    this.turns.push({ projectId, role, text });
    return {
      id: `turn-${this.turns.length}`,
      projectId,
      role,
      text,
      metadata: {},
      createdAt: new Date(),
    };
  }

  async getRecent(projectId: string, n: number) {
    return this.turns
      .filter((t) => t.projectId === projectId)
      .slice(-n)
      .map((t, i) => ({
        id: `turn-${i}`,
        projectId,
        role: t.role as "agent" | "client",
        text: t.text,
        metadata: {},
        createdAt: new Date(),
      }));
  }

  async semanticSearch() {
    return [];
  }

  async getFullHistory() {
    return [];
  }
}

class FakeDatabase implements Partial<DbClient> {
  private projects: Map<string, any> = new Map();
  private requirements: Requirement[] = [];
  private gaps: Gap[] = [];
  private risks: Risk[] = [];
  private documents: DocumentArtifact[] = [];
  private counter = 0;

  project = {
    findUnique: async ({ where }: any) => this.projects.get(where.id),
    findMany: async () => Array.from(this.projects.values()),
    create: async ({ data }: any) => {
      const proj = { id: data.id || `proj-${++this.counter}`, ...data };
      this.projects.set(proj.id, proj);
      return proj;
    },
    update: async ({ where, data }: any) => {
      const proj = this.projects.get(where.id);
      if (proj) {
        Object.assign(proj, data);
      }
      return proj;
    },
  };

  requirement = {
    create: async ({ data }: any) => {
      const req = {
        id: `req-${++this.counter}`,
        ...data,
        status: data.status || "draft",
      };
      this.requirements.push(req);
      return req;
    },
    findMany: async () => this.requirements,
  };

  gap = {
    create: async ({ data }: any) => {
      const gap = { id: `gap-${++this.counter}`, ...data };
      this.gaps.push(gap);
      return gap;
    },
    findMany: async () => this.gaps,
  };

  risk = {
    create: async ({ data }: any) => {
      const risk = { id: `risk-${++this.counter}`, ...data };
      this.risks.push(risk);
      return risk;
    },
    findMany: async () => this.risks,
  };

  documentArtifact = {
    create: async ({ data }: any) => {
      const doc = {
        id: `doc-${++this.counter}`,
        ...data,
        version: data.version || 1,
        createdAt: new Date(),
      };
      this.documents.push(doc);
      return doc;
    },
    findMany: async () => this.documents,
    findFirst: async () => null,
    update: async ({ data }: any) => ({}),
  };

  conversationTurn = {
    create: async ({ data }: any) => ({
      id: `turn-${++this.counter}`,
      ...data,
      createdAt: new Date(),
    }),
    findMany: async () => [],
  };
}

class FakeChatModel implements Partial<BaseChatModel> {
  private callCount = 0;

  async invoke(input: any) {
    this.callCount++;

    if (this.callCount === 1) {
      return { content: "Let me ask about your business goals. What problem are you trying to solve?" };
    } else if (this.callCount === 2) {
      return { content: "I understand. Can you tell me about your target users?" };
    } else if (this.callCount === 3) {
      return { content: "YES" };
    } else if (this.callCount === 4) {
      return {
        content: JSON.stringify({
          requirements: [
            { type: "functional", text: "User login system" },
            { type: "non_functional", text: "System must handle 1000 concurrent users" },
          ],
        }),
      };
    } else {
      return { content: "Task completed." };
    }
  }

  bindTools(tools: readonly StructuredToolInterface[]) {
    return this as any;
  }

  withStructuredOutput(schema: any) {
    return {
      invoke: async () => ({
        requirements: [
          { type: "functional", text: "User authentication" },
          { type: "non_functional", text: "System scalability" },
        ],
        gaps: [],
        risks: [],
      }),
    } as any;
  }

  async _generate() {
    return { generations: [] };
  }

  _llmType() {
    return "fake";
  }
}

describe("Graph workflow integration", () => {
  // SKIPPED (pre-existing): this scaffold defines fakes but never passes them
  // into compileGraph() — GraphDeps only carries a checkpointer, so the graph
  // builds nodes with real defaults (real MemoryManager -> needs OPENAI_API_KEY,
  // real prisma/Redis). Making it pass requires a graph-level DI refactor plus
  // a live model; Stage 05 tests exercise nodes directly with injected fakes
  // instead (see test/documentation-review.test.ts).
  it.skip("progresses from interviewing to requirement_extraction over 3-4 turns", async () => {
    const fakeMemoryManager = new FakeMemoryManager();
    const fakeDb = new FakeDatabase();
    const fakeCheckpointer = new MemorySaver();

    vi.stubGlobal("getChatModel", () => new FakeChatModel());

    const projectId = "test-project-1";
    const project = await fakeDb.project.create({
      data: {
        id: projectId,
        clientName: "Acme Corp",
        businessDomain: "E-commerce",
        rawIdeaText: "We want to build a marketplace platform",
        status: "intake",
      },
    });

    const depsOverride = {
      memoryManager: fakeMemoryManager,
      db: fakeDb,
    };

    const compiledGraph = compileGraph({ checkpointer: fakeCheckpointer });
    const config = { configurable: { thread_id: projectId } };

    const initialState: Partial<AgentStateType> = {
      projectId,
      clientMessage: "",
      currentStage: "intake",
      conversationHistory: [],
      extractedRequirements: [],
      gaps: [],
      risks: [],
      finalDocuments: [],
      nextAgent: undefined,
    };

    const turn1 = await compiledGraph.invoke(initialState, config);
    expect(turn1.currentStage).toBe("interviewing");

    const state2: Partial<AgentStateType> = {
      ...turn1,
      clientMessage: "We need a marketplace for selling handmade goods",
    };
    const turn2 = await compiledGraph.invoke(state2, config);
    expect(turn2.currentStage).toBe("interviewing");

    const state3: Partial<AgentStateType> = {
      ...turn2,
      clientMessage: "Our target users are artists and craft makers worldwide",
    };
    const turn3 = await compiledGraph.invoke(state3, config);
    expect([turn3.currentStage]).toContain("interviewing" || "requirement_extraction");
  });
});
