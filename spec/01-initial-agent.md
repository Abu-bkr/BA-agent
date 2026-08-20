We're building an AI Business Analyst system. A "Project" represents one client engagement that moves through these stages:
intake -> interviewing -> requirement_extraction -> gap_analysis -> risk_analysis -> documentation -> review -> completed

In packages/db/, define the Prisma schema:

- Project (id, clientName, businessDomain, rawIdeaText, status enum, createdAt, updatedAt)
- ConversationTurn (id, projectId, role enum[agent, client], question, answer, agentSource, createdAt)
- Requirement (id, projectId, type enum[functional, non_functional, business_rule], text, sourceTurnId, status)
- Gap (id, projectId, description, resolved boolean, resolutionText)
- Risk (id, projectId, description, severity enum, mitigation, category enum[technical, business, timeline, budget])
- DocumentArtifact (id, projectId, type enum[BRD, SRS, user_stories, summary], contentMarkdown, version, createdAt)
- ReviewNote (id, projectId, artifactId, issue, resolved boolean)

1. Write the Prisma schema with proper relations and indexes (projectId foreign keys everywhere), generate the client, and set up a migration.
2. Export a singleton PrismaClient from packages/db/src/client.ts, consumed by apps/api.
3. In packages/shared-types/, define Zod schemas mirroring each model for request/response validation, plus inferred TS types — these are imported by both apps/api and apps/web so the frontend gets full type safety on API responses.
4. In apps/api, build plain CRUD routes under /api/projects (create project, list/read requirements, gaps, risks, documents) — no agent logic yet, just DB CRUD so we have something to build the agents against. Validate all request bodies with the Zod schemas from packages/shared-types.

Write Vitest tests hitting these CRUD routes against a test database.