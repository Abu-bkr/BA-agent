import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { AgentStateType } from "../state.js";
import { getChatModel } from "../../llm/get-chat-model.js";
import { ToolRegistry } from "../../tools/tool-registry.js";
import { invokeWithTools } from "../utils/invoke-with-tools.js";
import type { MemoryManager } from "../../memory/memory-manager.js";
import type { DbClient } from "../../tools/db-query-tool.js";
import prisma from "@ai-business-analyst/db";

export interface RiskAnalysisAgentDeps {
  memoryManager?: MemoryManager;
  db?: DbClient;
}

const defaultMemoryManager = await import("../../memory/memory-manager.js").then(
  (m) => new m.MemoryManager(),
);
const toolRegistry = new ToolRegistry();

const riskSchema = z.object({
  risks: z.array(
    z.object({
      description: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      category: z.enum(["technical", "business", "timeline", "budget"]),
      mitigation: z.string().optional(),
    }),
  ),
});

export function createRiskAnalysisAgentNode(deps: RiskAnalysisAgentDeps = {}) {
  const memoryManager = deps.memoryManager ?? defaultMemoryManager;
  const db = deps.db ?? prisma;

  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { projectId, extractedRequirements, gaps, conversationHistory } = state;

    const model = getChatModel("Risk Analysis Agent");
    const tools = toolRegistry.getTools("Risk Analysis Agent");

    const boundModel = model.bindTools(tools).withStructuredOutput(riskSchema);

    const result = await boundModel.invoke({
      messages: [
        new HumanMessage(
          `Analyze project risks given these requirements and gaps:\n` +
          `Requirements: ${extractedRequirements.map((r) => r.text).join("; ")}\n` +
          `Gaps: ${gaps.map((g) => g.description).join("; ")}\n\n` +
          `Identify technical, business, timeline, and budget risks with severity levels.`,
        ),
        ...conversationHistory.map((turn) =>
          turn.role === "client"
            ? new HumanMessage(turn.text)
            : new AIMessage(turn.text),
        ),
      ],
    });

    const riskList = result.risks || [];

    const created = await Promise.all(
      riskList.map((risk: any) =>
        db.risk.create({
          data: {
            projectId,
            description: risk.description,
            severity: risk.severity,
            category: risk.category,
            mitigation: risk.mitigation,
          },
        }),
      ),
    );

    await db.project.update({
      where: { id: projectId },
      data: { status: "documentation" },
    });

    return {
      risks: created,
      currentStage: "documentation",
      nextAgent: "Documentation Agent",
    };
  };
}
