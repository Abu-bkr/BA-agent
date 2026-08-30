import type { AgentName } from "../tools/tool-registry.js";

export interface LlmConfig {
  provider: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
}

const AGENT_NAME_NORMALIZED: Record<AgentName, string> = {
  "Interview Agent": "INTERVIEW_AGENT",
  "Domain Agent": "DOMAIN_AGENT",
  "Research Agent": "RESEARCH_AGENT",
  "Requirement Extraction": "REQUIREMENT_EXTRACTION",
  "Gap Analysis Agent": "GAP_ANALYSIS_AGENT",
  "Risk Analysis Agent": "RISK_ANALYSIS_AGENT",
  "Documentation Agent": "DOCUMENTATION_AGENT",
  "Review Agent": "REVIEW_AGENT",
};

export function resolveConfig(agentName?: AgentName): LlmConfig {
  const globalProvider = process.env.MODEL_PROVIDER ?? "openai";
  const globalModel = process.env.MODEL_NAME ?? "gpt-4o-mini";
  const timeoutMs = process.env.MODEL_TIMEOUT_MS
    ? parseInt(process.env.MODEL_TIMEOUT_MS, 10)
    : 30000;
  const maxRetries = process.env.MODEL_MAX_RETRIES
    ? parseInt(process.env.MODEL_MAX_RETRIES, 10)
    : 3;

  if (!agentName) {
    return { provider: globalProvider, model: globalModel, timeoutMs, maxRetries };
  }

  const normalized = AGENT_NAME_NORMALIZED[agentName];
  if (!normalized) {
    return { provider: globalProvider, model: globalModel, timeoutMs, maxRetries };
  }

  const agentProvider = process.env[`MODEL_OVERRIDE_${normalized}_PROVIDER`];
  const agentModel = process.env[`MODEL_OVERRIDE_${normalized}_MODEL`];

  return {
    provider: agentProvider ?? globalProvider,
    model: agentModel ?? globalModel,
    timeoutMs,
    maxRetries,
  };
}
