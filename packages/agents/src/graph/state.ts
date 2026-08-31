import { Annotation } from "@langchain/langgraph";
import type { ProjectStatus, Requirement, Gap, Risk, DocumentArtifact, ReviewNote } from "@ai-business-analyst/shared-types";
import type { MemoryTurn } from "../memory/memory-manager.js";
import type { AgentName } from "../tools/tool-registry.js";

export const AgentState = Annotation.Root({
  projectId: Annotation<string>({
    reducer: (existing, update) => update,
    default: () => "",
  }),
  clientMessage: Annotation<string>({
    reducer: (existing, update) => update,
    default: () => "",
  }),
  conversationHistory: Annotation<MemoryTurn[]>({
    reducer: (existing, update) => update,
    default: () => [],
  }),
  extractedRequirements: Annotation<Requirement[]>({
    reducer: (existing, update) => update,
    default: () => [],
  }),
  gaps: Annotation<Gap[]>({
    reducer: (existing, update) => update,
    default: () => [],
  }),
  risks: Annotation<Risk[]>({
    reducer: (existing, update) => update,
    default: () => [],
  }),
  currentStage: Annotation<ProjectStatus>({
    reducer: (existing, update) => update,
    default: () => "intake",
  }),
  nextAgent: Annotation<AgentName | "Requirement Extraction" | undefined>({
    reducer: (existing, update) => update,
    default: () => undefined,
  }),
  finalDocuments: Annotation<DocumentArtifact[]>({
    reducer: (existing, update) => update,
    default: () => [],
  }),
  reviewNotes: Annotation<ReviewNote[]>({
    reducer: (existing, update) => update,
    default: () => [],
  }),
  revisionCount: Annotation<number>({
    reducer: (existing, update) => update,
    default: () => 0,
  }),
});

export type AgentStateType = typeof AgentState.State;
