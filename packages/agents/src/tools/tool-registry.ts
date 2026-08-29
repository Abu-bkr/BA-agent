import type { StructuredToolInterface } from "@langchain/core/tools";
import { dbQueryTool } from "./db-query-tool.js";
import { documentWriterTool } from "./document-writer-tool.js";
import { fileReaderTool } from "./file-reader-tool.js";
import { webSearchTool } from "./web-search-tool.js";

export type AgentName =
  | "Interview Agent"
  | "Domain Agent"
  | "Research Agent"
  | "Requirement Extraction"
  | "Gap Analysis Agent"
  | "Risk Analysis Agent"
  | "Documentation Agent"
  | "Review Agent";

export const toolRegistry: Readonly<Record<AgentName, readonly StructuredToolInterface[]>> = {
  "Interview Agent": [],
  "Domain Agent": [webSearchTool],
  "Research Agent": [webSearchTool, fileReaderTool],
  "Requirement Extraction": [dbQueryTool],
  "Gap Analysis Agent": [dbQueryTool],
  "Risk Analysis Agent": [dbQueryTool, webSearchTool],
  "Documentation Agent": [dbQueryTool, documentWriterTool],
  "Review Agent": [dbQueryTool, documentWriterTool],
};

export class ToolRegistry {
  constructor(
    private readonly toolsByAgent: Readonly<
      Record<AgentName, readonly StructuredToolInterface[]>
    > = toolRegistry,
  ) {}

  getTools(agentName: string): readonly StructuredToolInterface[] {
    return this.toolsByAgent[agentName as AgentName] ?? [];
  }
}