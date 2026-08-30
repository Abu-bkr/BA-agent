import Fastify, {
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import prisma from "@ai-business-analyst/db";
import {
  documentArtifactCreateSchema,
  gapCreateSchema,
  projectCreateSchema,
  requirementCreateSchema,
  riskCreateSchema,
} from "@ai-business-analyst/shared-types";
import { runTurn } from "@ai-business-analyst/agents";
import { loadConfig } from "./config.js";

const projectParamsSchema = {
  type: "object",
  required: ["projectId"],
  properties: { projectId: { type: "string", minLength: 1 } },
} as const;

function parseBody<T>(
  schema: { parse: (value: unknown) => T },
  request: FastifyRequest,
  reply: FastifyReply,
): T | undefined {
  try {
    return schema.parse(request.body);
  } catch {
    void reply.code(400).send({ error: "Invalid request body" });
    return undefined;
  }
}

export async function buildApp(options: { logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/api/projects", async (request, reply) => {
    const body = parseBody(projectCreateSchema, request, reply);
    if (!body) return;

    const project = await prisma.project.create({ data: body });
    return reply.code(201).send({ data: project });
  });

  app.get("/api/projects", async () => ({
    data: await prisma.project.findMany({ orderBy: { createdAt: "desc" } }),
  }));

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId",
    { schema: { params: projectParamsSchema } },
    async (request, reply) => {
      const project = await prisma.project.findUnique({
        where: { id: request.params.projectId },
      });

      if (!project) return reply.code(404).send({ error: "Project not found" });
      return { data: project };
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/requirements",
    { schema: { params: projectParamsSchema } },
    async (request) => ({
      data: await prisma.requirement.findMany({
        where: { projectId: request.params.projectId },
      }),
    }),
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/requirements",
    { schema: { params: projectParamsSchema } },
    async (request, reply) => {
      const body = parseBody(
        requirementCreateSchema.omit({ projectId: true }),
        request,
        reply,
      );
      if (!body) return;

      const requirement = await prisma.requirement.create({
        data: { ...body, projectId: request.params.projectId },
      });
      return reply.code(201).send({ data: requirement });
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/gaps",
    { schema: { params: projectParamsSchema } },
    async (request) => ({
      data: await prisma.gap.findMany({
        where: { projectId: request.params.projectId },
      }),
    }),
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/gaps",
    { schema: { params: projectParamsSchema } },
    async (request, reply) => {
      const body = parseBody(gapCreateSchema.omit({ projectId: true }), request, reply);
      if (!body) return;

      const gap = await prisma.gap.create({
        data: { ...body, projectId: request.params.projectId },
      });
      return reply.code(201).send({ data: gap });
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/risks",
    { schema: { params: projectParamsSchema } },
    async (request) => ({
      data: await prisma.risk.findMany({
        where: { projectId: request.params.projectId },
      }),
    }),
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/risks",
    { schema: { params: projectParamsSchema } },
    async (request, reply) => {
      const body = parseBody(riskCreateSchema.omit({ projectId: true }), request, reply);
      if (!body) return;

      const risk = await prisma.risk.create({
        data: { ...body, projectId: request.params.projectId },
      });
      return reply.code(201).send({ data: risk });
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/documents",
    { schema: { params: projectParamsSchema } },
    async (request) => ({
      data: await prisma.documentArtifact.findMany({
        where: { projectId: request.params.projectId },
        orderBy: { createdAt: "desc" },
      }),
    }),
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/documents",
    { schema: { params: projectParamsSchema } },
    async (request, reply) => {
      const body = parseBody(
        documentArtifactCreateSchema.omit({ projectId: true }),
        request,
        reply,
      );
      if (!body) return;

      const document = await prisma.documentArtifact.create({
        data: { ...body, projectId: request.params.projectId },
      });
      return reply.code(201).send({ data: document });
    },
  );

  const turnBodySchema = z.object({
    message: z.string().min(1),
  });

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/turn",
    { schema: { params: projectParamsSchema } },
    async (request, reply) => {
      const projectExists = await prisma.project.findUnique({
        where: { id: request.params.projectId },
      });

      if (!projectExists) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const body = parseBody(turnBodySchema, request, reply);
      if (!body) return;

      const result = await runTurn(request.params.projectId, body.message);
      return reply.send({ data: result });
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  });

  return app;
}

export async function startServer() {
  const config = loadConfig();
  const app = await buildApp({ logger: true });
  await app.listen({ port: config.PORT, host: config.HOST });
  return app;
}