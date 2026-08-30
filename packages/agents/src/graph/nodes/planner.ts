import type { AgentStateType } from "../state.js";
import type { MemoryManager } from "../../memory/memory-manager.js";
import type { DbClient } from "../../tools/db-query-tool.js";
import prisma from "@ai-business-analyst/db";

export interface PlannerDeps {
  memoryManager?: MemoryManager;
  db?: DbClient;
}

const defaultMemoryManager = await import("../../memory/memory-manager.js").then(
  (m) => new m.MemoryManager(),
);

export function createPlannerNode(deps: PlannerDeps = {}) {
  const memoryManager = deps.memoryManager ?? defaultMemoryManager;
  const db = deps.db ?? prisma;

  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { projectId, currentStage } = state;

    const recentTurns = await memoryManager.getRecent(projectId, 10);

    switch (currentStage) {
      case "intake":
        return {
          currentStage: "interviewing",
          nextAgent: "Interview Agent",
          conversationHistory: recentTurns,
        };

      case "interviewing":
        return {
          nextAgent: state.nextAgent || "Interview Agent",
          conversationHistory: recentTurns,
        };

      case "requirement_extraction":
        return {
          nextAgent: "Requirement Extraction",
          conversationHistory: recentTurns,
        };

      case "gap_analysis":
        return {
          nextAgent: "Gap Analysis Agent",
          conversationHistory: recentTurns,
        };

      case "risk_analysis":
        return {
          nextAgent: "Risk Analysis Agent",
          conversationHistory: recentTurns,
        };

      case "documentation":
        return {
          nextAgent: "Documentation Agent",
          conversationHistory: recentTurns,
        };

      case "review":
        return {
          nextAgent: "Review Agent",
          conversationHistory: recentTurns,
        };

      case "completed":
        return {
          nextAgent: undefined,
          conversationHistory: recentTurns,
        };

      default:
        return {
          conversationHistory: recentTurns,
        };
    }
  };
}
