import { interrupt } from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../state.js";
import { getChatModel } from "../../llm/get-chat-model.js";
import { ToolRegistry } from "../../tools/tool-registry.js";
import { invokeWithTools } from "../utils/invoke-with-tools.js";
import { getDefaultMemoryManager, type MemoryManager } from "../../memory/memory-manager.js";
import type { DbClient } from "../../tools/db-query-tool.js";
import prisma from "@ai-business-analyst/db";

export interface ResearchAgentDeps {
  memoryManager?: MemoryManager;
  db?: DbClient;
}

const toolRegistry = new ToolRegistry();

export function createResearchAgentNode(deps: ResearchAgentDeps = {}) {
  const memoryManager = deps.memoryManager ?? getDefaultMemoryManager();
  const db = deps.db ?? prisma;

  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { projectId, clientMessage, conversationHistory } = state;

    if (clientMessage) {
      await memoryManager.addTurn(projectId, "client", clientMessage, {
        agentSource: "research",
      });

      const model = getChatModel("Research Agent");
      const tools = toolRegistry.getTools("Research Agent");

      const responseText = await invokeWithTools(
        model,
        tools,
        {
          messages: [
            new HumanMessage(
              "You are a research analyst. Use web search and file reading to gather relevant information. Analyze documents and external sources to inform requirements. Ask if more research is needed.",
            ),
            ...conversationHistory.map((turn) =>
              turn.role === "client"
                ? new HumanMessage(turn.text)
                : new AIMessage(turn.text),
            ),
            new HumanMessage(clientMessage),
          ],
        },
      );

      await memoryManager.addTurn(projectId, "agent", responseText, {
        agentSource: "research",
      });
    }

    return {
      nextAgent: "Interview Agent",
    };
  };
}
