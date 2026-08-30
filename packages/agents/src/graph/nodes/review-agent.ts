import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../state.js";
import { getChatModel } from "../../llm/get-chat-model.js";
import { ToolRegistry } from "../../tools/tool-registry.js";
import { invokeWithTools } from "../utils/invoke-with-tools.js";
import type { MemoryManager } from "../../memory/memory-manager.js";
import type { DbClient } from "../../tools/db-query-tool.js";
import prisma from "@ai-business-analyst/db";

export interface ReviewAgentDeps {
  memoryManager?: MemoryManager;
  db?: DbClient;
}

const defaultMemoryManager = await import("../../memory/memory-manager.js").then(
  (m) => new m.MemoryManager(),
);
const toolRegistry = new ToolRegistry();

export function createReviewAgentNode(deps: ReviewAgentDeps = {}) {
  const memoryManager = deps.memoryManager ?? defaultMemoryManager;
  const db = deps.db ?? prisma;

  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { projectId, extractedRequirements, risks, finalDocuments, conversationHistory } = state;

    const model = getChatModel("Review Agent");
    const tools = toolRegistry.getTools("Review Agent");

    const reviewText = await invokeWithTools(
      model,
      tools,
      {
        messages: [
          new HumanMessage(
            `Perform a final consistency check of the documentation against requirements and risks.\n` +
            `Requirements: ${extractedRequirements.map((r) => r.text).join("; ")}\n` +
            `High-risk items: ${risks.filter((r) => r.severity === "high" || r.severity === "critical").map((r) => r.description).join("; ")}\n` +
            `Documents exist: ${finalDocuments.map((d) => d.type).join(", ")}\n\n` +
            `Confirm all requirements and high-risk items are addressed in the documents. This is Stage 4 minimal review (no auto-revision loop yet).`,
          ),
          ...conversationHistory.map((turn) =>
            turn.role === "client"
              ? new HumanMessage(turn.text)
              : new AIMessage(turn.text),
          ),
        ],
      },
    );

    await db.project.update({
      where: { id: projectId },
      data: { status: "completed" },
    });

    return {
      currentStage: "completed",
      nextAgent: undefined,
    };
  };
}
