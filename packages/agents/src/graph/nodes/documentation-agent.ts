import { HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { DocumentArtifact } from "@ai-business-analyst/shared-types";
import type { AgentStateType } from "../state.js";
import { getChatModel } from "../../llm/get-chat-model.js";
import { documentationPromptTemplates, type DocumentationPromptInput } from "../../prompts/documentation-prompts.js";
import { documentWriterTool, type DocumentWriterInput } from "../../tools/document-writer-tool.js";
import type { MemoryManager } from "../../memory/memory-manager.js";
import type { DbClient } from "../../tools/db-query-tool.js";
import prisma from "@ai-business-analyst/db";

export interface DocumentationAgentDeps {
  memoryManager?: MemoryManager;
  db?: DbClient;
  /** Injectable chat model. Defaults to getChatModel("Documentation Agent"). */
  model?: BaseChatModel;
  /** Injectable document writer tool. Defaults to documentWriterTool. */
  documentWriter?: StructuredToolInterface;
}

const DOCUMENT_TYPES: readonly ("BRD" | "SRS" | "user_stories")[] = [
  "BRD",
  "SRS",
  "user_stories",
];

function formatRequirements(requirements: Array<{ type: string; text: string }>): string {
  if (requirements.length === 0) return "No requirements were provided.";
  return requirements
    .map((r, i) => `${i + 1}. [${r.type}] ${r.text}`)
    .join("\n");
}

function formatGaps(gaps: Array<{ description: string; resolved: boolean }>): string {
  if (gaps.length === 0) return "No gaps were identified.";
  return gaps
    .map((g, i) => `${i + 1}. ${g.description}${g.resolved ? " (resolved)" : ""}`)
    .join("\n");
}

function formatRisks(
  risks: Array<{ description: string; severity: string; mitigation: string | null }>,
): string {
  if (risks.length === 0) return "No risks were identified.";
  return risks
    .map(
      (r, i) =>
        `${i + 1}. [${r.severity}] ${r.description}${
          r.mitigation ? ` — Mitigation: ${r.mitigation}` : ""
        }`,
    )
    .join("\n");
}

export function createDocumentationAgentNode(deps: DocumentationAgentDeps = {}) {
  const db = deps.db ?? prisma;
  const documentWriter = deps.documentWriter ?? documentWriterTool;

  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { projectId, extractedRequirements, gaps, risks, reviewNotes, revisionCount } = state;
    const isRevision = revisionCount > 0;

    const model = deps.model ?? getChatModel("Documentation Agent");

    const project = await db.project.findUnique({ where: { id: projectId } });

    // Fall back to the database if the pipeline did not carry the data in state.
    const requirements =
      extractedRequirements.length > 0
        ? extractedRequirements
        : await db.requirement.findMany({ where: { projectId } });
    const gapRecords = gaps.length > 0 ? gaps : await db.gap.findMany({ where: { projectId } });
    const riskRecords = risks.length > 0 ? risks : await db.risk.findMany({ where: { projectId } });

    const reviewNotesText = reviewNotes.length
      ? reviewNotes.map((n) => `- ${n.issue}`).join("\n")
      : "No previous review feedback.";

    const revisionGuidance = isRevision
      ? "REVISION PASS: You are improving documents that already exist. Fully incorporate the review feedback above and raise quality. Do not duplicate or start from scratch."
      : "FIRST DRAFT: Create a complete, professional document from scratch.";

    const artifacts: DocumentArtifact[] = [];

    for (const type of DOCUMENT_TYPES) {
      const existing = await db.documentArtifact.findFirst({
        where: { projectId, type },
        orderBy: { version: "desc" },
      });

      const input: DocumentationPromptInput = {
        projectContext: [
          `Client name: ${project?.clientName ?? "Unknown"}`,
          `Business domain: ${project?.businessDomain ?? "Unknown"}`,
          `Original idea: ${project?.rawIdeaText ?? "N/A"}`,
        ].join("\n"),
        requirements: formatRequirements(requirements),
        gaps: formatGaps(gapRecords),
        risks: formatRisks(riskRecords),
        reviewNotes: reviewNotesText,
        revisionGuidance,
      };

      const prompt = await documentationPromptTemplates[type].format(input);

      const response = await model.invoke([new HumanMessage(prompt)]);
      const contentMarkdown = response.content.toString();

      // StructuredToolInterface.invoke is a union of call signatures in core
      // 0.3.x; narrow it to the document-writer input type. Cast the whole
      // object (not the method) so `this` stays bound to the tool.
      const writer = documentWriter as unknown as {
        invoke(input: DocumentWriterInput): Promise<string>;
      };
      const result = await writer.invoke({
        projectId,
        type,
        contentMarkdown,
        ...(existing ? { artifactId: existing.id } : {}),
      });

      const artifact = JSON.parse(result.toString()) as DocumentArtifact;
      artifacts.push(artifact);
    }

    await db.project.update({
      where: { id: projectId },
      data: { status: "review" },
    });

    return {
      finalDocuments: artifacts,
      currentStage: "review",
      nextAgent: "Review Agent",
    };
  };
}
