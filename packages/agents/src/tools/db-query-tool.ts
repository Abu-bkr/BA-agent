import { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma as defaultPrisma } from "@ai-business-analyst/db";
import { z } from "zod";

const entitySchema = z.enum(["project", "requirement", "gap", "risk"]);

const inputSchema = z.object({
  projectId: z.string().min(1),
  entity: entitySchema,
  status: z.string().optional(),
  severity: z.string().optional(),
  category: z.string().optional(),
  resolved: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

export type DbQueryInput = z.input<typeof inputSchema>;
export type DbClient = typeof defaultPrisma;

function buildWhere(input: DbQueryInput): Record<string, unknown> {
  const where: Record<string, unknown> = { projectId: input.projectId };

  if (input.entity === "requirement" && input.status) {
    where.status = input.status;
  }
  if (input.entity === "risk") {
    if (input.severity) where.severity = input.severity;
    if (input.category) where.category = input.category;
  }
  if (input.entity === "gap" && input.resolved !== undefined) {
    where.resolved = input.resolved;
  }

  return where;
}

export function createDbQueryTool(db: DbClient = defaultPrisma) {
  return new DynamicStructuredTool({
    name: "db_query",
    description:
      "Read project-scoped business analysis data. Select one allowlisted entity and optional safe filters.",
    schema: inputSchema,
    func: async (input) => {
      const where = buildWhere(input);
      const args = {
        where,
        take: input.limit,
        orderBy: { id: "asc" as const },
      };

      let records: unknown;
      switch (input.entity) {
        case "project":
          records = await db.project.findMany({
            where: { id: input.projectId },
            take: input.limit,
            orderBy: args.orderBy,
          });
          break;
        case "requirement":
          records = await db.requirement.findMany(args);
          break;
        case "gap":
          records = await db.gap.findMany(args);
          break;
        case "risk":
          records = await db.risk.findMany(args);
          break;
      }

      return JSON.stringify({ entity: input.entity, records });
    },
  });
}

export const dbQueryTool = createDbQueryTool();