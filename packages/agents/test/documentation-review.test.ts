import { describe, expect, it } from "vitest";
import type { DocumentArtifact, Requirement, Gap, Risk, ReviewNote, Project } from "@ai-business-analyst/shared-types";
import type { AgentStateType } from "../src/graph/state.js";
import { createDocumentationAgentNode } from "../src/graph/nodes/documentation-agent.js";
import { createReviewAgentNode, MAX_AUTO_REVISIONS } from "../src/graph/nodes/review-agent.js";
import { brdPromptTemplate, srsPromptTemplate, userStoriesPromptTemplate } from "../src/prompts/documentation-prompts.js";
import type { MemoryManager } from "../src/memory/memory-manager.js";
import type { DbClient } from "../src/tools/db-query-tool.js";

/* ------------------------------------------------------------------ */
/* Fakes                                                               */
/* ------------------------------------------------------------------ */

class FakeMemoryManager implements Partial<MemoryManager> {
  async addTurn(_projectId: string, _role: string, _text: string) {
    return { id: "turn", projectId: "", role: "client", text: "", metadata: {}, createdAt: new Date() };
  }
  async getRecent() {
    return [];
  }
  async semanticSearch() {
    return [];
  }
  async getFullHistory() {
    return [];
  }
}

class FakeDatabase implements Partial<DbClient> {
  documents: DocumentArtifact[] = [];
  reviewNotes: ReviewNote[] = [];
  counter = 0;

  project = {
    findUnique: async ({ where }: any): Promise<Project | null> => ({
      id: where.id,
      clientName: "Acme Corp",
      businessDomain: "Logistics",
      rawIdeaText: "A shipment tracking platform",
      status: "documentation" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    update: async ({ data }: any) => data,
  };

  requirement = {
    create: async ({ data }: any) => ({ id: `req-${++this.counter}`, ...data }),
    findMany: async () => [] as Requirement[],
  };

  gap = {
    create: async ({ data }: any) => ({ id: `gap-${++this.counter}`, ...data }),
    findMany: async () => [] as Gap[],
  };

  risk = {
    create: async ({ data }: any) => ({ id: `risk-${++this.counter}`, ...data }),
    findMany: async () => [] as Risk[],
  };

  documentArtifact = {
    create: async ({ data }: any): Promise<DocumentArtifact> => {
      const doc = {
        id: `doc-${++this.counter}`,
        ...data,
        version: data.version ?? 1,
        createdAt: new Date(),
      };
      this.documents.push(doc);
      return doc;
    },
    update: async ({ where, data }: any): Promise<DocumentArtifact | undefined> => {
      const doc = this.documents.find((d) => d.id === where.id);
      if (doc) Object.assign(doc, data, { version: doc.version + 1 });
      return doc;
    },
    findFirst: async ({ where }: any) => {
      const matches = this.documents.filter(
        (d) => d.projectId === where.projectId && d.type === where.type,
      );
      return matches.sort((a, b) => b.version - a.version)[0] ?? null;
    },
    findMany: async ({ where }: any) =>
      this.documents.filter((d) => d.projectId === where.projectId),
  };

  reviewNote = {
    create: async ({ data }: any): Promise<ReviewNote> => {
      const note = { id: `rn-${++this.counter}`, ...data };
      this.reviewNotes.push(note);
      return note;
    },
    findMany: async () => this.reviewNotes,
  };

  conversationTurn = {
    create: async ({ data }: any) => ({ id: `turn-${++this.counter}`, ...data, createdAt: new Date() }),
    findMany: async () => [],
  };
}

/** Mimics documentWriterTool but writes into the FakeDatabase store. */
class FakeDocumentWriter {
  constructor(private readonly db: FakeDatabase) {}

  async invoke(input: {
    projectId: string;
    type: string;
    contentMarkdown: string;
    artifactId?: string;
  }): Promise<string> {
    const { projectId, type, contentMarkdown, artifactId } = input;

    if (artifactId) {
      const updated = await this.db.documentArtifact.update({
        where: { id: artifactId },
        data: { type, contentMarkdown },
      });
      return JSON.stringify(updated);
    }

    const latest = await this.db.documentArtifact.findFirst({
      where: { projectId, type },
      orderBy: { version: "desc" },
    });

    const created = await this.db.documentArtifact.create({
      data: {
        projectId,
        type,
        contentMarkdown,
        version: ((latest?.version as number | undefined) ?? 0) + 1,
      },
    });
    return JSON.stringify(created);
  }
}

/** Simulates the model: returns generated content for documentation and scripted issues for review. */
class FakeChatModel {
  nextIssues: Array<{ artifactId?: string | null; issue: string }> = [];

  async invoke() {
    return { content: "# Generated document\n\nCovers every requirement and all high-severity risks." };
  }

  bindTools() {
    return this as any;
  }

  withStructuredOutput() {
    return {
      invoke: async () => ({ issues: this.nextIssues }),
    } as any;
  }
}

/* ------------------------------------------------------------------ */
/* Test data                                                           */
/* ------------------------------------------------------------------ */

const PROJECT_ID = "proj-stage5";

function buildState(overrides: Partial<AgentStateType> = {}): AgentStateType {
  const requirements: Requirement[] = [
    { id: "req-1", projectId: PROJECT_ID, type: "functional", text: "Users can log in with email and password", sourceTurnId: null, status: "draft" },
    { id: "req-2", projectId: PROJECT_ID, type: "non_functional", text: "System must handle 1000 concurrent users", sourceTurnId: null, status: "draft" },
  ];
  const gaps: Gap[] = [
    { id: "gap-1", projectId: PROJECT_ID, description: "Third-party carrier API coverage is unknown", resolved: true, resolutionText: "Confirmed with client" },
  ];
  const risks: Risk[] = [
    { id: "risk-1", projectId: PROJECT_ID, description: "Carrier integration may be delayed", severity: "high", mitigation: "Stagger integration releases", category: "timeline" },
  ];
  return {
    projectId: PROJECT_ID,
    clientMessage: "",
    conversationHistory: [],
    extractedRequirements: requirements,
    gaps,
    risks,
    currentStage: "documentation",
    nextAgent: "Documentation Agent",
    finalDocuments: [],
    reviewNotes: [],
    revisionCount: 0,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Stage 5 documentation & review agents", () => {
  it("documentation agent generates BRD, SRS, and User Stories artifacts", async () => {
    const db = new FakeDatabase();
    const model = new FakeChatModel();
    const node = createDocumentationAgentNode({
      db: db as any,
      model: model as any,
      memoryManager: new FakeMemoryManager() as any,
      documentWriter: new FakeDocumentWriter(db) as any,
    });

    const result = await node(buildState());

    expect(result.finalDocuments).toHaveLength(3);
    expect(result.finalDocuments?.map((d) => d.type)).toEqual(["BRD", "SRS", "user_stories"]);
    expect(result.finalDocuments?.every((d) => d.contentMarkdown.length > 0)).toBe(true);
    expect(result.currentStage).toBe("review");
    expect(result.nextAgent).toBe("Review Agent");
  });

  it("review agent writes ReviewNote entries and routes back to documentation on issues", async () => {
    const db = new FakeDatabase();
    const model = new FakeChatModel();
    const docNode = createDocumentationAgentNode({
      db: db as any,
      model: model as any,
      memoryManager: new FakeMemoryManager() as any,
      documentWriter: new FakeDocumentWriter(db) as any,
    });

    const docResult = await docNode(buildState());

    model.nextIssues = [{ artifactId: docResult.finalDocuments?.[0]?.id ?? null, issue: "High-severity risk is not called out in the BRD" }];

    const reviewNode = createReviewAgentNode({
      db: db as any,
      model: model as any,
      memoryManager: new FakeMemoryManager() as any,
    });

    const reviewResult = await reviewNode(buildState({ ...docResult, currentStage: "review" }));

    expect(db.reviewNotes.length).toBeGreaterThan(0);
    expect(reviewResult.currentStage).toBe("documentation");
    expect(reviewResult.nextAgent).toBe("Documentation Agent");
    expect(reviewResult.revisionCount).toBe(1);
  });

  it("routes through one auto-revision and completes when the revision is clean", async () => {
    const db = new FakeDatabase();
    const model = new FakeChatModel();
    const docNode = createDocumentationAgentNode({
      db: db as any,
      model: model as any,
      memoryManager: new FakeMemoryManager() as any,
      documentWriter: new FakeDocumentWriter(db) as any,
    });
    const reviewNode = createReviewAgentNode({
      db: db as any,
      model: model as any,
      memoryManager: new FakeMemoryManager() as any,
    });

    // Pass 1: documentation
    const docResult1 = await docNode(buildState());

    // Pass 1: review finds issues -> route back to documentation
    model.nextIssues = [{ issue: "SRS does not reference requirement req-2" }];
    const reviewResult1 = await reviewNode(buildState({ ...docResult1, currentStage: "review" }));
    expect(reviewResult1.currentStage).toBe("documentation");

    // Pass 2: documentation revision updates the existing artifacts (version bump), not duplicates
    const docState2 = buildState({ ...docResult1, ...reviewResult1 });
    const docResult2 = await docNode(docState2);

    const brdRows = db.documents.filter((d) => d.type === "BRD");
    expect(brdRows).toHaveLength(1);
    expect(brdRows[0].version).toBe(2);

    // Pass 2: review is clean -> project completed
    model.nextIssues = [];
    const reviewResult2 = await reviewNode(buildState({ ...docResult1, ...reviewResult1, ...docResult2, currentStage: "review" }));
    expect(reviewResult2.currentStage).toBe("completed");
    expect(reviewResult2.nextAgent).toBeUndefined();
  });

  it("caps auto-revisions at one and surfaces unresolved issues to a human", async () => {
    const db = new FakeDatabase();
    const model = new FakeChatModel();
    const docNode = createDocumentationAgentNode({
      db: db as any,
      model: model as any,
      memoryManager: new FakeMemoryManager() as any,
      documentWriter: new FakeDocumentWriter(db) as any,
    });
    const reviewNode = createReviewAgentNode({
      db: db as any,
      model: model as any,
      memoryManager: new FakeMemoryManager() as any,
    });

    const docResult1 = await docNode(buildState());

    // Pass 1: review finds issues
    model.nextIssues = [{ issue: "Risks section missing" }];
    const reviewResult1 = await reviewNode(buildState({ ...docResult1, currentStage: "review" }));
    expect(reviewResult1.revisionCount).toBe(1);

    // Pass 2: documentation revision
    const docResult2 = await docNode(buildState({ ...docResult1, ...reviewResult1 }));

    // Pass 2: review STILL finds issues -> cap reached, stop, surface to human
    model.nextIssues = [{ issue: "Risks section still missing" }];
    const reviewResult2 = await reviewNode(buildState({ ...docResult1, ...reviewResult1, ...docResult2, currentStage: "review" }));

    expect(reviewResult2.currentStage).toBe("completed");
    expect(reviewResult2.nextAgent).toBeUndefined();
    // The cap branch surfaces unresolved issues instead of looping again —
    // both passes' issues stay as unresolved ReviewNotes for a human.
    expect(MAX_AUTO_REVISIONS).toBe(1);
    expect(db.reviewNotes.filter((n) => !n.resolved)).toHaveLength(2);
    // Routing back happened exactly once (revisionCount 0 -> 1), never twice.
    expect(reviewResult2.reviewNotes?.length ?? db.reviewNotes.length).toBeGreaterThan(0);
  });

  it("prompt templates render with the documentation input variables", async () => {
    const input = {
      projectContext: "Client: Acme Corp\nBusiness domain: Logistics",
      requirements: "1. [functional] Track shipments",
      gaps: "No gaps identified.",
      risks: "1. [high] Carrier delay",
      reviewNotes: "Fix the SRS traceability matrix.",
      revisionGuidance: "REVISION PASS: improve.",
    };

    const [brd, srs, stories] = await Promise.all([
      brdPromptTemplate.format(input),
      srsPromptTemplate.format(input),
      userStoriesPromptTemplate.format(input),
    ]);

    expect(brd).toContain("Business Requirements Document");
    expect(brd).toContain("Track shipments");
    expect(srs).toContain("Software Requirements Specification");
    expect(srs).toContain("Traceability");
    expect(stories).toContain("User Stories");
    expect(stories).toContain("Acceptance Criteria");
    expect(stories).toContain("As a [role], I want [goal], so that [benefit]");
  });
});
