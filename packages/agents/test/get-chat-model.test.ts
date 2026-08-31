import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { getChatModel } from "../src/llm/get-chat-model.js";
import { resolveConfig } from "../src/llm/config.js";

/**
 * These tests only construct model instances (no network calls), so dummy API
 * keys are enough. Ollama is local and needs no key.
 */
describe("getChatModel — model-agnostic wrapper", () => {
  beforeEach(() => {
    // Known-clean baseline; individual tests override MODEL_PROVIDER etc.
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubEnv("GOOGLE_API_KEY", "test-google-key");
    vi.stubEnv("MODEL_PROVIDER", undefined);
    vi.stubEnv("MODEL_NAME", undefined);
    vi.stubEnv("MODEL_TIMEOUT_MS", undefined);
    vi.stubEnv("MODEL_MAX_RETRIES", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to an OpenAI chat model when MODEL_PROVIDER is unset", () => {
    const model = getChatModel();
    expect(model).toBeInstanceOf(ChatOpenAI);
    expect((model as ChatOpenAI).model).toBe("gpt-4o-mini");
  });

  it("selects each provider by its canonical MODEL_PROVIDER value", () => {
    vi.stubEnv("MODEL_PROVIDER", "openai");
    expect(getChatModel()).toBeInstanceOf(ChatOpenAI);

    vi.stubEnv("MODEL_PROVIDER", "anthropic");
    expect(getChatModel()).toBeInstanceOf(ChatAnthropic);

    vi.stubEnv("MODEL_PROVIDER", "google_genai");
    expect(getChatModel()).toBeInstanceOf(ChatGoogleGenerativeAI);

    vi.stubEnv("MODEL_PROVIDER", "ollama");
    expect(getChatModel()).toBeInstanceOf(ChatOllama);
  });

  it("accepts model-family aliases (gpt/claude/gemini/llama/qwen)", () => {
    vi.stubEnv("MODEL_PROVIDER", "gpt");
    expect(getChatModel()).toBeInstanceOf(ChatOpenAI);

    vi.stubEnv("MODEL_PROVIDER", "claude");
    expect(getChatModel()).toBeInstanceOf(ChatAnthropic);

    vi.stubEnv("MODEL_PROVIDER", "gemini");
    expect(getChatModel()).toBeInstanceOf(ChatGoogleGenerativeAI);

    vi.stubEnv("MODEL_PROVIDER", "llama");
    expect(getChatModel()).toBeInstanceOf(ChatOllama);

    vi.stubEnv("MODEL_PROVIDER", "qwen");
    expect(getChatModel()).toBeInstanceOf(ChatOllama);
  });

  it("is case- and whitespace-insensitive for the provider value", () => {
    vi.stubEnv("MODEL_PROVIDER", "  Anthropic ");
    expect(getChatModel()).toBeInstanceOf(ChatAnthropic);
  });

  it("throws a clear error for an unsupported provider", () => {
    vi.stubEnv("MODEL_PROVIDER", "cohere");
    expect(() => getChatModel()).toThrowError(/Unsupported MODEL_PROVIDER: "cohere"/);
  });

  it("applies the global MODEL_NAME to the constructed model", () => {
    vi.stubEnv("MODEL_PROVIDER", "openai");
    vi.stubEnv("MODEL_NAME", "gpt-4o");
    expect((getChatModel() as ChatOpenAI).model).toBe("gpt-4o");
  });

  it("wires retry/backoff (maxRetries) and a request timeout", () => {
    vi.stubEnv("MODEL_PROVIDER", "openai");
    vi.stubEnv("MODEL_MAX_RETRIES", "5");
    const model = getChatModel(undefined, { timeoutMs: 1234 }) as ChatOpenAI;
    expect(model.maxRetries).toBe(5);
    expect(model.timeout).toBe(1234);
  });

  describe("per-agent overrides", () => {
    it("uses an agent-specific provider/model while others fall back to the global default", () => {
      vi.stubEnv("MODEL_PROVIDER", "openai");
      vi.stubEnv("MODEL_NAME", "gpt-4o-mini");
      // A stronger model for Documentation, still the cheap default elsewhere.
      vi.stubEnv("MODEL_OVERRIDE_DOCUMENTATION_AGENT_PROVIDER", "anthropic");
      vi.stubEnv("MODEL_OVERRIDE_DOCUMENTATION_AGENT_MODEL", "claude-3-5-sonnet-20240620");

      const docModel = getChatModel("Documentation Agent");
      const interviewModel = getChatModel("Interview Agent");

      expect(docModel).toBeInstanceOf(ChatAnthropic);
      expect(interviewModel).toBeInstanceOf(ChatOpenAI);
      expect((interviewModel as ChatOpenAI).model).toBe("gpt-4o-mini");
    });

    it("resolveConfig reflects the override for the named agent only", () => {
      vi.stubEnv("MODEL_PROVIDER", "openai");
      vi.stubEnv("MODEL_NAME", "gpt-4o-mini");
      vi.stubEnv("MODEL_OVERRIDE_INTERVIEW_AGENT_MODEL", "gpt-4o-mini");
      vi.stubEnv("MODEL_OVERRIDE_DOCUMENTATION_AGENT_MODEL", "gpt-4-turbo");

      expect(resolveConfig("Documentation Agent").model).toBe("gpt-4-turbo");
      expect(resolveConfig("Interview Agent").model).toBe("gpt-4o-mini");
      expect(resolveConfig().model).toBe("gpt-4o-mini");
    });
  });
});
