import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { AgentStateType } from "../state.js";
import { getChatModel } from "../../llm/get-chat-model.js";
import { ToolRegistry } from "../../tools/tool-registry.js";
import { invokeWithTools } from "../utils/invoke-with-tools.js";
import { getDefaultMemoryManager, type MemoryManager } from "../../memory/memory-manager.js";
import type { DbClient } from "../../tools/db-query-tool.js";
import prisma from "@ai-business-analyst/db";

export interface RequirementExtractionAgentDeps {
  memoryManager?: MemoryManager;
  db?: DbClient;
}

const toolRegistry = new ToolRegistry();

const requirementSchema = z.object({
  type: z.enum(["functional", "non_functional", "business_rule"]),
  text: z.string(),
});

export function createRequirementExtractionAgentNode(
  deps: RequirementExtractionAgentDeps = {},
) {
  const memoryManager = deps.memoryManager ?? getDefaultMemoryManager();
  const db = deps.db ?? prisma;

  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { projectId, conversationHistory } = state;

    const model = getChatModel("Requirement Extraction");
    const tools = toolRegistry.getTools("Requirement Extraction");

    const boundModel = (model as any)
      .bindTools([...tools])
      .withStructuredOutput(z.object({
        requirements: z.array(requirementSchema),
      }));

    const result = await boundModel.invoke({
      messages: [
        new HumanMessage(
          "Extract all functional, non-functional, and business rule requirements from the conversation. Return a structured list.",
        ),
        ...conversationHistory.map((turn) =>
          turn.role === "client"
            ? new HumanMessage(turn.text)
            : new AIMessage(turn.text),
        ),
      ],
    });

    const extracted = result.requirements || [];

    const created = await Promise.all(
      extracted.map((req: any) =>
        db.requirement.create({
          data: {
            projectId,
            type: req.type,
            text: req.text,
            status: "draft",
          },
        }),
      ),
    );

    await db.project.update({
      where: { id: projectId },
      data: { status: "gap_analysis" },
    });

    return {
      extractedRequirements: created,
      currentStage: "gap_analysis",
      nextAgent: "Gap Analysis Agent",
    };
  };
}
