import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import type { AgentName } from "../tools/tool-registry.js";
import { resolveConfig } from "./config.js";

export interface GetChatModelOptions {
  /** Override the resolved per-request timeout, in milliseconds. */
  timeoutMs?: number;
  /** Override the resolved sampling temperature. */
  temperature?: number;
}

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

/** Canonical provider keys the wrapper knows how to construct. */
export type ChatProvider = "openai" | "anthropic" | "google_genai" | "ollama";

/**
 * Map a raw MODEL_PROVIDER value — including friendly aliases and model-family
 * names (gpt, claude, gemini, llama, qwen) — to a canonical provider key.
 * Returns null for anything unrecognized so the caller can raise a clear error.
 */
function canonicalizeProvider(raw: string): ChatProvider | null {
  switch (raw.trim().toLowerCase()) {
    case "openai":
    case "gpt":
    case "azure_openai":
      return "openai";
    case "anthropic":
    case "claude":
      return "anthropic";
    case "google":
    case "google_genai":
    case "googlegenai":
    case "gemini":
      return "google_genai";
    case "ollama":
    case "llama":
    case "qwen":
    case "local":
      return "ollama";
    default:
      return null;
  }
}

/**
 * Return a LangChain.js-compatible chat model for the given agent, resolved
 * from MODEL_PROVIDER / MODEL_NAME (with optional per-agent overrides — see
 * {@link resolveConfig}). This is the single interface every agent node uses;
 * nodes must never instantiate a provider SDK directly.
 *
 * Every provider is configured with:
 * - `maxRetries` — exponential backoff retry on transient API errors, handled
 *   uniformly by LangChain's AsyncCaller.
 * - a per-request `timeout` where the provider binding exposes one (OpenAI and
 *   Anthropic). Google Generative AI and Ollama bindings do not accept a
 *   request timeout; those calls are still bounded by `maxRetries`.
 */
export function getChatModel(
  agentName?: AgentName,
  options: GetChatModelOptions = {},
): BaseChatModel {
  const config = resolveConfig(agentName);
  const timeout = options.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;

  const provider = canonicalizeProvider(config.provider);

  switch (provider) {
    case "openai":
      return new ChatOpenAI({
        model: config.model,
        apiKey: process.env.OPENAI_API_KEY,
        temperature,
        maxRetries,
        timeout,
      });

    case "anthropic":
      return new ChatAnthropic({
        model: config.model,
        apiKey: process.env.ANTHROPIC_API_KEY,
        temperature,
        maxRetries,
        // ChatAnthropic has no top-level `timeout`; the underlying Anthropic
        // SDK client enforces the per-request timeout via clientOptions.
        clientOptions: { timeout },
      });

    case "google_genai":
      return new ChatGoogleGenerativeAI({
        model: config.model,
        apiKey: process.env.GOOGLE_API_KEY,
        temperature,
        maxRetries,
      });

    case "ollama":
      return new ChatOllama({
        model: config.model,
        baseUrl: process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
        temperature,
        maxRetries,
      });

    default:
      throw new Error(
        `Unsupported MODEL_PROVIDER: "${config.provider}". Supported providers: ` +
          `openai (gpt), anthropic (claude), google_genai (gemini), ollama (llama/qwen).`,
      );
  }
}
