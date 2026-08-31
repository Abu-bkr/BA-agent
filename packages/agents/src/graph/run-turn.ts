import type { DocumentArtifact, ProjectStatus, ReviewNote } from "@ai-business-analyst/shared-types";
import { getDefaultCompiledGraph, compileGraph } from "./graph.js";
import type { GraphDeps } from "./graph.js";
import prisma from "@ai-business-analyst/db";

export interface TurnResult {
  type: "question" | "stage_complete" | "completed";
  question?: string;
  stage: ProjectStatus;
  finalDocuments?: DocumentArtifact[];
  /** Review notes written during the documentation/review pass (e.g. unresolved issues). */
  reviewNotes?: ReviewNote[];
}

export async function runTurn(
  projectId: string,
  clientMessage: string,
  graphDeps?: GraphDeps,
): Promise<TurnResult> {
  const graph = graphDeps ? compileGraph(graphDeps) : getDefaultCompiledGraph();

  const config = { configurable: { thread_id: projectId } };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const result: any = await graph.invoke(
    {
      projectId,
      clientMessage,
      currentStage: project.status as ProjectStatus,
      conversationHistory: [],
      extractedRequirements: [],
      gaps: [],
      risks: [],
      finalDocuments: [],
      reviewNotes: [],
      revisionCount: 0,
      nextAgent: undefined,
    },
    config,
  );

  const stage = (result.currentStage ?? project.status) as ProjectStatus;

  if (stage === "completed") {
    const documents = await prisma.documentArtifact.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    const reviewNotes = await prisma.reviewNote.findMany({
      where: { projectId },
      orderBy: { id: "asc" },
    });

    return {
      type: "completed",
      stage,
      finalDocuments: documents,
      reviewNotes,
    };
  }

  return {
    type: "stage_complete",
    stage,
  };
}
