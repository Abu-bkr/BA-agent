import { ChatOpenAI } from "@langchain/openai";
import type { AgentName } from "../tools/tool-registry.js";
import { resolveConfig } from "./config.js";

export interface GetChatModelOptions {
  timeoutMs?: number;
}

export function getChatModel(
  agentName?: AgentName,
  options: GetChatModelOptions = {},
): ChatOpenAI {
  const config = resolveConfig(agentName);
  const finalTimeoutMs = options.timeoutMs ?? config.timeoutMs ?? 30000;

  if (config.provider === "openai") {
    return new ChatOpenAI({
      modelName: config.model,
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0.7,
      maxRetries: config.maxRetries ?? 3,
      timeout: finalTimeoutMs,
    });
  }

  throw new Error(
    `Unsupported MODEL_PROVIDER: "${config.provider}". Currently only "openai" is implemented. ` +
    `Other providers (anthropic, google_genai, ollama) will be added in Stage 6.`,
  );
}
