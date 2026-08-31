import { interrupt } from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { AgentStateType } from "../state.js";
import { getChatModel } from "../../llm/get-chat-model.js";
import { getDefaultMemoryManager, type MemoryManager } from "../../memory/memory-manager.js";
import type { DbClient } from "../../tools/db-query-tool.js";
import prisma from "@ai-business-analyst/db";

export interface InterviewAgentDeps {
  memoryManager?: MemoryManager;
  db?: DbClient;
}

export function createInterviewAgentNode(deps: InterviewAgentDeps = {}) {
  const memoryManager = deps.memoryManager ?? getDefaultMemoryManager();
  const db = deps.db ?? prisma;

  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { projectId, clientMessage, conversationHistory } = state;

    if (!clientMessage && conversationHistory.length === 0) {
      const model = getChatModel("Interview Agent");
      const question = await model.invoke([
        new HumanMessage(
          "You are a business analyst conducting an intake interview. Ask the client about their business goals, target users, and main challenges. Ask one focused question.",
        ),
      ]);

      return interrupt({
        question: question.content.toString(),
      });
    }

    if (clientMessage) {
      await memoryManager.addTurn(projectId, "client", clientMessage, {
        agentSource: "interview",
      });

      const model = getChatModel("Interview Agent");
      const response = await model.invoke([
        new HumanMessage(
          "You are a business analyst conducting an intake interview. Respond thoughtfully to the client's input, then ask your next question.",
        ),
        ...conversationHistory.map((turn) =>
          turn.role === "client"
            ? new HumanMessage(turn.text)
            : new AIMessage(turn.text),
        ),
        new HumanMessage(clientMessage),
      ]);

      const responseText = response.content.toString();
      await memoryManager.addTurn(projectId, "agent", responseText, {
        agentSource: "interview",
      });

      const readinessModel = getChatModel("Interview Agent");
      const readinessCheck = await readinessModel.invoke([
        new HumanMessage(
          "Based on the business analysis conversation so far, do you have enough information to extract detailed requirements? Respond only with YES or NO.",
        ),
      ]);

      const isReady = readinessCheck.content.toString().toUpperCase().includes("YES");

      if (isReady) {
        await db.project.update({
          where: { id: projectId },
          data: { status: "requirement_extraction" },
        });

        return {
          nextAgent: "Requirement Extraction",
          currentStage: "requirement_extraction",
        };
      }

      return interrupt({
        question: responseText,
      });
    }

    return {};
  };
}
