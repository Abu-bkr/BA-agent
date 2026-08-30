import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../state.js";
import { getChatModel } from "../../llm/get-chat-model.js";
import { ToolRegistry } from "../../tools/tool-registry.js";
import { invokeWithTools } from "../utils/invoke-with-tools.js";
import type { MemoryManager } from "../../memory/memory-manager.js";
import type { DbClient } from "../../tools/db-query-tool.js";
import prisma from "@ai-business-analyst/db";

export interface DocumentationAgentDeps {
  memoryManager?: MemoryManager;
  db?: DbClient;
}

const defaultMemoryManager = await import("../../memory/memory-manager.js").then(
  (m) => new m.MemoryManager(),
);
const toolRegistry = new ToolRegistry();

export function createDocumentationAgentNode(deps: DocumentationAgentDeps = {}) {
  const memoryManager = deps.memoryManager ?? defaultMemoryManager;
  const db = deps.db ?? prisma;

  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { projectId, extractedRequirements, gaps, risks, conversationHistory } = state;

    const model = getChatModel("Documentation Agent");
    const tools = toolRegistry.getTools("Documentation Agent");

    const summaryText = await invokeWithTools(
      model,
      tools,
      {
        messages: [
          new HumanMessage(
            `Generate a brief executive summary markdown document covering: ` +
            `\nRequirements: ${extractedRequirements.map((r) => r.text).join("; ")}\n` +
            `Gaps: ${gaps.map((g) => g.description).join("; ")}\n` +
            `Risks: ${risks.map((r) => `${r.description} (${r.severity})`).join("; ")}\n\n` +
            `Format as clear markdown with sections. This is Stage 4 (minimal) — full BRD/SRS will be in Stage 5.`,
          ),
          ...conversationHistory.map((turn) =>
            turn.role === "client"
              ? new HumanMessage(turn.text)
              : new AIMessage(turn.text),
          ),
        ],
      },
    );

    const artifact = await db.documentArtifact.create({
      data: {
        projectId,
        type: "summary",
        contentMarkdown: summaryText,
        version: 1,
      },
    });

    await db.project.update({
      where: { id: projectId },
      data: { status: "review" },
    });

    return {
      finalDocuments: [artifact],
      currentStage: "review",
      nextAgent: "Review Agent",
    };
  };
}
