# AI Business Analyst

A TypeScript Turborepo monorepo for the AI Business Analyst system.

## Structure

- `apps/api` — Fastify API and Prisma-backed project CRUD routes
- `apps/web` — Next.js frontend
- `packages/db` — Prisma schema, migration, and singleton client
- `packages/shared-types` — shared Zod schemas and TypeScript types
- `packages/typescript-config` — shared strict TypeScript configurations
- `packages/eslint-config` — shared ESLint configurations

## Local development

Requirements: Node.js 18+, pnpm, and Docker Desktop.

```bash
pnpm install
docker compose up -d postgres redis
pnpm --filter @ai-business-analyst/db exec prisma migrate deploy
pnpm dev
```

The API is available at `http://localhost:4000`; health check: `GET /health`. The web app is available at `http://localhost:3000`.

Environment variables for the API:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_business_analyst
REDIS_URL=redis://localhost:6379
CHROMA_URL=http://localhost:8000
MODEL_PROVIDER=openai
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

## Tests

Start the isolated test database and apply the migration:

```bash
docker compose up -d postgres-test
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5433/ai_business_analyst_test"
pnpm --filter @ai-business-analyst/db exec prisma migrate deploy
pnpm --filter @ai-business-analyst/api test
```

On macOS/Linux, use:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ai_business_analyst_test pnpm --filter @ai-business-analyst/api test
```

## Validation commands

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```
