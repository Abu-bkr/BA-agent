import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { AgentStateType } from "../state.js";
import { getChatModel } from "../../llm/get-chat-model.js";
import { ToolRegistry } from "../../tools/tool-registry.js";
import { getDefaultMemoryManager, type MemoryManager } from "../../memory/memory-manager.js";
import type { DbClient } from "../../tools/db-query-tool.js";
import prisma from "@ai-business-analyst/db";

export interface GapAnalysisAgentDeps {
  memoryManager?: MemoryManager;
  db?: DbClient;
}

const toolRegistry = new ToolRegistry();

const gapSchema = z.object({
  gaps: z.array(
    z.object({
      description: z.string(),
    }),
  ),
});

export function createGapAnalysisAgentNode(deps: GapAnalysisAgentDeps = {}) {
  const memoryManager = deps.memoryManager ?? getDefaultMemoryManager();
  const db = deps.db ?? prisma;

  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { projectId, extractedRequirements, conversationHistory } = state;

    const model = getChatModel("Gap Analysis Agent");
    const tools = toolRegistry.getTools("Gap Analysis Agent");

    const boundModel = (model as any).bindTools([...tools]).withStructuredOutput(gapSchema);

    const result = await boundModel.invoke({
      messages: [
        new HumanMessage(
          `Analyze these requirements for gaps, ambiguities, and missing areas:\n${extractedRequirements.map((r) => `- ${r.text}`).join("\n")}\n\nIdentify gaps and unclear areas.`,
        ),
        ...conversationHistory.map((turn) =>
          turn.role === "client"
            ? new HumanMessage(turn.text)
            : new AIMessage(turn.text),
        ),
      ],
    });

    const gapList = result.gaps || [];

    const created = await Promise.all(
      gapList.map((gap: any) =>
        db.gap.create({
          data: {
            projectId,
            description: gap.description,
            resolved: false,
          },
        }),
      ),
    );

    await db.project.update({
      where: { id: projectId },
      data: { status: "risk_analysis" },
    });

    return {
      gaps: created,
      currentStage: "risk_analysis",
      nextAgent: "Risk Analysis Agent",
    };
  };
}
