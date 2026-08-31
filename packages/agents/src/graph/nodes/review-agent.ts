import { HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import type { DocumentType, ReviewNote } from "@ai-business-analyst/shared-types";
import type { AgentStateType } from "../state.js";
import { getChatModel } from "../../llm/get-chat-model.js";
import type { MemoryManager } from "../../memory/memory-manager.js";
import type { DbClient } from "../../tools/db-query-tool.js";
import prisma from "@ai-business-analyst/db";

export interface ReviewAgentDeps {
  memoryManager?: MemoryManager;
  db?: DbClient;
  /** Injectable chat model. Defaults to getChatModel("Review Agent"). */
  model?: BaseChatModel;
}

/**
 * Cap on automatic documentation passes. Review routes back to the
 * Documentation Agent at most this many times; anything still unresolved
 * afterwards is surfaced to a human via ReviewNote rows.
 */
export const MAX_AUTO_REVISIONS = 1;

const REQUIRED_ARTIFACT_TYPES: readonly DocumentType[] = ["BRD", "SRS", "user_stories"];

const reviewSchema = z.object({
  issues: z.array(
    z.object({
      artifactId: z.string().nullable().optional(),
      issue: z.string(),
    }),
  ),
});

function formatDocuments(artifacts: Array<{ id: string; type: string; version: number; contentMarkdown: string }>): string {
  if (artifacts.length === 0) return "No documents were generated.";
  return artifacts
    .map(
      (a) =>
        `### [${a.type}] (version ${a.version}) id=${a.id}\n${a.contentMarkdown}`,
    )
    .join("\n\n---\n\n");
}

function buildReviewPrompt(
  artifacts: Array<{ id: string; type: string; version: number; contentMarkdown: string }>,
  requirements: Array<{ type: string; text: string }>,
  gaps: Array<{ description: string; resolved: boolean }>,
  risks: Array<{ description: string; severity: string; mitigation: string | null }>,
): string {
  return `You are a QA reviewer for business analysis documentation. Cross-check the generated documents against the source requirements, gaps, and risks for consistency and completeness.

## Documents to review
${formatDocuments(artifacts)}

## Source Requirements
${
  requirements.length
    ? requirements.map((r, i) => `${i + 1}. [${r.type}] ${r.text}`).join("\n")
    : "No requirements were provided."
}

## Gaps
${
  gaps.length
    ? gaps.map((g, i) => `${i + 1}. ${g.description}${g.resolved ? " (resolved)" : ""}`).join("\n")
    : "No gaps were identified."
}

## Risks
${
  risks.length
    ? risks
        .map(
          (r, i) =>
            `${i + 1}. [${r.severity}] ${r.description}${
              r.mitigation ? ` — Mitigation: ${r.mitigation}` : ""
            }`,
        )
        .join("\n")
    : "No risks were identified."
}

## Review checklist
- Does every requirement appear somewhere in the documents (especially the SRS)?
- Are high-severity (high or critical) risks explicitly called out with mitigations?
- Are resolved gaps reflected in the documents and unresolved gaps acknowledged?
- Are the BRD, SRS, and User Stories all present and complete?
- Are the documents internally consistent and free of requirements that were not in the source?

Return ONLY a JSON object with an "issues" array. Each issue is { "artifactId": "<id or null>", "issue": "<specific description>" }. Return an empty array when the documents are consistent and complete. Do not return anything else.`;
}

export function createReviewAgentNode(deps: ReviewAgentDeps = {}) {
  const db = deps.db ?? prisma;

  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { projectId, extractedRequirements, gaps, risks, reviewNotes, revisionCount, finalDocuments } = state;

    const model = deps.model ?? getChatModel("Review Agent");

    const artifacts =
      finalDocuments.length > 0
        ? finalDocuments
        : await db.documentArtifact.findMany({
            where: { projectId },
            orderBy: { version: "desc" },
          });

    // Deterministic structural check that runs regardless of the LLM.
    const presentTypes = new Set(artifacts.map((a) => a.type));
    const structuralIssues = REQUIRED_ARTIFACT_TYPES.filter(
      (type) => !presentTypes.has(type),
    ).map((type) => ({ artifactId: null as string | null, issue: `Missing required artifact: ${type}` }));

    const boundModel = (model as any).withStructuredOutput(reviewSchema);
    const result = await boundModel.invoke({
      messages: [
        new HumanMessage(
          buildReviewPrompt(artifacts, extractedRequirements, gaps, risks),
        ),
      ],
    });

    const llmIssues: Array<{ artifactId?: string | null; issue: string }> =
      result.issues ?? [];

    const allIssues = [...structuralIssues, ...llmIssues];

    const createdNotes: ReviewNote[] = await Promise.all(
      allIssues.map((issue) =>
        db.reviewNote.create({
          data: {
            projectId,
            artifactId: issue.artifactId ?? null,
            issue: issue.issue,
            resolved: false,
          },
        }),
      ),
    );

    const hasIssues = allIssues.length > 0;

    if (hasIssues && revisionCount < MAX_AUTO_REVISIONS) {
      await db.project.update({
        where: { id: projectId },
        data: { status: "documentation" },
      });

      return {
        reviewNotes: createdNotes,
        revisionCount: revisionCount + 1,
        currentStage: "documentation",
        nextAgent: "Documentation Agent",
      };
    }

    // Clean pass, or the auto-revision cap was reached — any remaining issues
    // stay unresolved in ReviewNote rows so a human can review them.
    await db.project.update({
      where: { id: projectId },
      data: { status: "completed" },
    });

    return {
      reviewNotes: createdNotes,
      currentStage: "completed",
      nextAgent: undefined,
    };
  };
}
