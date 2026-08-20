import { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma as defaultPrisma } from "@ai-business-analyst/db";
import { z } from "zod";

const inputSchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(["BRD", "SRS", "user_stories", "summary"]),
  contentMarkdown: z.string().min(1),
  artifactId: z.string().min(1).optional(),
});

export type DocumentWriterInput = z.infer<typeof inputSchema>;
export type DocumentWriterDb = typeof defaultPrisma;

export function createDocumentWriterTool(db: DocumentWriterDb = defaultPrisma) {
  return new DynamicStructuredTool({
    name: "document_writer",
    description: "Create or update a Markdown document artifact belonging to a project.",
    schema: inputSchema,
    func: async (input) => {
      if (input.artifactId) {
        const existing = await db.documentArtifact.findUnique({
          where: { id: input.artifactId },
          select: { projectId: true },
        });

        if (!existing || existing.projectId !== input.projectId) {
          throw new Error("Document artifact was not found for this project");
        }

        const artifact = await db.documentArtifact.update({
          where: { id: input.artifactId },
          data: {
            type: input.type,
            contentMarkdown: input.contentMarkdown,
            version: { increment: 1 },
          },
        });

        return JSON.stringify(artifact);
      }

      const latest = await db.documentArtifact.findFirst({
        where: { projectId: input.projectId, type: input.type },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      const artifact = await db.documentArtifact.create({
        data: {
          projectId: input.projectId,
          type: input.type,
          contentMarkdown: input.contentMarkdown,
          version: (latest?.version ?? 0) + 1,
        },
      });

      return JSON.stringify(artifact);
    },
  });
}

export const documentWriterTool = createDocumentWriterTool();