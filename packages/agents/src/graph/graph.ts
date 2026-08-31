import { StateGraph, START, END } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { AgentState, type AgentStateType } from "./state.js";
import { createPlannerNode } from "./nodes/planner.js";
import { createInterviewAgentNode } from "./nodes/interview-agent.js";
import { createDomainAgentNode } from "./nodes/domain-agent.js";
import { createResearchAgentNode } from "./nodes/research-agent.js";
import { createRequirementExtractionAgentNode } from "./nodes/requirement-extraction-agent.js";
import { createGapAnalysisAgentNode } from "./nodes/gap-analysis-agent.js";
import { createRiskAnalysisAgentNode } from "./nodes/risk-analysis-agent.js";
import { createDocumentationAgentNode } from "./nodes/documentation-agent.js";
import { createReviewAgentNode } from "./nodes/review-agent.js";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

export interface GraphDeps {
  checkpointer?: BaseCheckpointSaver;
}

export function buildGraph(deps: GraphDeps = {}) {
  const graph = new StateGraph(AgentState);

  graph.addNode("planner", createPlannerNode());
  graph.addNode("interview_agent", createInterviewAgentNode());
  graph.addNode("domain_agent", createDomainAgentNode());
  graph.addNode("research_agent", createResearchAgentNode());
  graph.addNode("requirement_extraction_agent", createRequirementExtractionAgentNode());
  graph.addNode("gap_analysis_agent", createGapAnalysisAgentNode());
  graph.addNode("risk_analysis_agent", createRiskAnalysisAgentNode());
  graph.addNode("documentation_agent", createDocumentationAgentNode());
  graph.addNode("review_agent", createReviewAgentNode());

  graph.addEdge(START as any, "planner" as any);

  graph.addConditionalEdges(
    "planner" as any,
    (state: AgentStateType) => state.nextAgent || "END",
    {
      "Interview Agent": "interview_agent",
      "Domain Agent": "domain_agent",
      "Research Agent": "research_agent",
      "Requirement Extraction": "requirement_extraction_agent",
      "Gap Analysis Agent": "gap_analysis_agent",
      "Risk Analysis Agent": "risk_analysis_agent",
      "Documentation Agent": "documentation_agent",
      "Review Agent": "review_agent",
      END: END,
    } as any,
  );

  graph.addEdge("interview_agent" as any, "planner" as any);
  graph.addEdge("domain_agent" as any, "planner" as any);
  graph.addEdge("research_agent" as any, "planner" as any);
  graph.addEdge("requirement_extraction_agent" as any, "planner" as any);
  graph.addEdge("gap_analysis_agent" as any, "planner" as any);
  graph.addEdge("risk_analysis_agent" as any, "planner" as any);
  graph.addEdge("documentation_agent" as any, "planner" as any);
  graph.addEdge("review_agent" as any, "planner" as any);

  return graph;
}

export function compileGraph(deps: GraphDeps = {}) {
  const graph = buildGraph();
  const checkpointer = deps.checkpointer || new MemorySaver();

  return graph.compile({ checkpointer } as any);
}

let defaultCompiledGraph: ReturnType<typeof compileGraph> | undefined;

export function getDefaultCompiledGraph() {
  if (!defaultCompiledGraph) {
    const checkpointer = process.env.DATABASE_URL
      ? (PostgresSaver.fromConnString(process.env.DATABASE_URL) as any)
      : new MemorySaver();

    defaultCompiledGraph = compileGraph({ checkpointer });
  }
  return defaultCompiledGraph;
}
