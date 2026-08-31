# AI Business Analyst - Implementation Status

**Last Updated:** 2026-08-31  
**Current Focus:** Spec 05 - Documentation & Review agents

## Overview

This document tracks the implementation progress across all 8 specification stages of the AI Business Analyst system.

## Stage Completion Matrix

| Stage | Title | Status | Completion | Notes |
|-------|-------|--------|------------|-------|
| 01 | Database schema & CRUD | ✅ Complete | 100% | Prisma schema, migrations, PrismaClient singleton, Zod schemas, CRUD routes |
| 02 | Memory module | ✅ Complete | 100% | Redis short-term, Postgres long-term, ChromaDB semantic search, MemoryManager class |
| 03 | Tools module | ✅ Complete | 100% | dbQueryTool, webSearchTool, fileReaderTool, documentWriterTool, ToolRegistry |
| 04 | Multi-agent LangGraph workflow | ✅ Complete | 100% | All nodes built, graph wired, API route added; LangGraph pinned to 0.2.x (see Stage 04 report) |
| 05 | Documentation & Review agents | ✅ Complete | 100% | BRD/SRS/User Stories prompts, Documentation + Review nodes with 1-auto-revision loop, document API endpoints, tests |
| 06 | Model-agnostic LLM wrapper | ✅ Complete | 100% | OpenAI, Anthropic, Google GenAI, Ollama behind one `getChatModel()`; per-agent overrides; retry/backoff + timeout |
| 07 | Frontend (Next.js) | ⏳ Pending | 0% | Depends on working API from Stage 04 |
| 08 | Production hardening | ⏳ Pending | 0% | Auth, rate limiting, validation, error handling, deployment |

---

## Detailed Stage Reports

### Stage 01: Database Schema & CRUD ✅

**Location:** `packages/db/`

**Completed:**
- Prisma schema with all entities: Project, ConversationTurn, Requirement, Gap, Risk, DocumentArtifact, ReviewNote
- Proper foreign key relationships and cascading deletes
- Indexes on `projectId`, `status`, `severity`, `category`, `resolved`
- PrismaClient singleton in `packages/db/src/client.ts` with dev-mode caching
- Database migrations
- Zod schemas for request/response validation in `packages/shared-types/src/index.ts`
- CRUD routes in `apps/api/src/app.ts`:
  - POST/GET `/api/projects`
  - POST/GET `/api/projects/:projectId/requirements`
  - POST/GET `/api/projects/:projectId/gaps`
  - POST/GET `/api/projects/:projectId/risks`
  - POST/GET `/api/projects/:projectId/documents`
- Vitest tests passing for CRUD routes

**Files:**
- `packages/db/prisma/schema.prisma` — Prisma data model
- `packages/db/src/client.ts` — PrismaClient singleton export
- `packages/shared-types/src/index.ts` — Zod schemas (138 lines, all entities)
- `apps/api/src/app.ts` — CRUD routes (lines 42-171)

---

### Stage 02: Memory Module ✅

**Location:** `packages/agents/src/memory/`

**Completed:**
- `MemoryManager` class with:
  - `addTurn(projectId, role, text, metadata)` — writes to Redis + Postgres + ChromaDB
  - `getRecent(projectId, n)` — short-term buffer via Redis
  - `semanticSearch(projectId, query, k)` — vector similarity via ChromaDB
  - `getFullHistory(projectId)` — Postgres fallback
- Embedding provider factory supporting OpenAI `text-embedding-3-small` (configurable via `MODEL_PROVIDER` env)
- Duck-typed interfaces for Redis, Postgres, ChromaDB to enable test injection without mocking
- Vitest integration test (`packages/agents/test/memory-manager.test.ts`) with fakes, validating:
  - Bounded recency (Redis LTRIM)
  - Project-scoped semantic retrieval
  - Full conversation history via Postgres fallback

**Files:**
- `packages/agents/src/memory/memory-manager.ts` — Core MemoryManager (276 lines)
- `packages/agents/src/memory/embeddings.ts` — Embedding provider factory (43 lines)
- `packages/agents/src/memory/index.ts` — Barrel export
- `packages/agents/test/memory-manager.test.ts` — Integration test

**Dependencies:**
- `ioredis` ^5.6.1 — Redis client
- `chromadb` ^3.1.6 — Vector store client
- `openai` ^5.12.2 — Embeddings (currently for text-embedding-3-small)

---

### Stage 03: Tools Module ✅

**Location:** `packages/agents/src/tools/`

**Completed:**
- Four LangChain.js `DynamicStructuredTool` implementations with Zod schemas:
  - **dbQueryTool** — Read-only parameterized queries (project, requirement, gap, risk)
  - **webSearchTool** — Swappable search provider (mock stub for now, real provider TBD)
  - **fileReaderTool** — Extract text from PDF/TXT/CSV (or base64-encoded content)
  - **documentWriterTool** — Create/update DocumentArtifact rows with versioning
- **ToolRegistry** class mapping `AgentName` → assigned tools:
  - Interview Agent: none
  - Domain Agent: webSearchTool
  - Research Agent: webSearchTool, fileReaderTool
  - Requirement Extraction: dbQueryTool
  - Gap Analysis Agent: dbQueryTool
  - Risk Analysis Agent: dbQueryTool, webSearchTool
  - Documentation Agent: dbQueryTool, documentWriterTool
  - Review Agent: dbQueryTool, documentWriterTool

**Files:**
- `packages/agents/src/tools/db-query-tool.ts` — Read-only DB queries (82 lines)
- `packages/agents/src/tools/document-writer-tool.ts` — Document artifact CRUD (60 lines)
- `packages/agents/src/tools/file-reader-tool.ts` — PDF/TXT/CSV text extraction (69 lines)
- `packages/agents/src/tools/web-search-tool.ts` — Search abstraction with mock provider (46 lines)
- `packages/agents/src/tools/tool-registry.ts` — Per-agent tool mapping (38 lines)
- `packages/agents/src/tools/index.ts` — Barrel export

**Dependencies:**
- `@langchain/core` ^1.2.9 (to be updated for Stage 04 compatibility)
- `pdf-parse` ^2.4.5 — PDF text extraction
- `zod` ^3.25.76 — Tool input validation

---

### Stage 06: Model-Agnostic LLM Wrapper ✅

**Location:** `packages/agents/src/llm/`

**Completed:**
- **config.ts** (51 lines):
  - `resolveConfig(agentName?: AgentName): LlmConfig`
  - Reads `MODEL_PROVIDER` (default `"openai"`) and `MODEL_NAME` (default `"gpt-4o-mini"`) from env
  - Per-agent override via `MODEL_OVERRIDE_{AGENT_NAME}_PROVIDER` and `MODEL_OVERRIDE_{AGENT_NAME}_MODEL` env vars
  - Configurable timeout and max retries
- **get-chat-model.ts**:
  - `getChatModel(agentName?: AgentName, options?: { timeoutMs?, temperature? }): BaseChatModel`
  - Dispatches on the resolved provider to one of four LangChain bindings:
    - `openai` / `gpt` → `ChatOpenAI` (`@langchain/openai`, `OPENAI_API_KEY`)
    - `anthropic` / `claude` → `ChatAnthropic` (`@langchain/anthropic`, `ANTHROPIC_API_KEY`)
    - `google_genai` / `gemini` → `ChatGoogleGenerativeAI` (`@langchain/google-genai`, `GOOGLE_API_KEY`)
    - `ollama` / `llama` / `qwen` → `ChatOllama` (`@langchain/community`, local; `OLLAMA_BASE_URL`)
  - `canonicalizeProvider()` maps case/whitespace and model-family aliases to canonical keys
  - Every provider gets `maxRetries` (uniform exponential-backoff retry on transient errors); OpenAI + Anthropic also get a per-request `timeout`
  - Throws a clear error listing supported providers for anything unrecognized
- **index.ts** — Barrel export (`getChatModel`, `GetChatModelOptions`, `ChatProvider`, `resolveConfig`, `LlmConfig`)

**Design:**
- All agent nodes import `getChatModel` from here; never instantiate provider SDKs directly
- Return type is `BaseChatModel`, so nodes are provider-agnostic (`invoke`, `bindTools`, `withStructuredOutput`)
- `graph/utils/invoke-with-tools.ts` accepts `BaseChatModel` (widened from `ChatOpenAI`)
- Supports per-agent model overrides (e.g., Interview Agent uses cheaper gpt-4o-mini, Documentation Agent uses a stronger model)

**Files:**
- `packages/agents/src/llm/config.ts` — Configuration resolution (51 lines)
- `packages/agents/src/llm/get-chat-model.ts` — Multi-provider chat model factory
- `packages/agents/src/llm/index.ts` — Barrel export
- `packages/agents/test/get-chat-model.test.ts` — Provider selection, aliases, per-agent override, retry/timeout wiring, unknown-provider error

**Dependencies:**
- `@langchain/openai` ^0.3.0 — `ChatOpenAI`
- `@langchain/anthropic` ^0.3.0 — `ChatAnthropic`
- `@langchain/google-genai` ^0.1.0 — `ChatGoogleGenerativeAI`
- `@langchain/community` ^0.3.0 — `ChatOllama` (`@langchain/community/chat_models/ollama`)

---

### Stage 04: Multi-agent LangGraph Workflow ✅ (100% Complete)

**Location:** `packages/agents/src/graph/`

**Completed:**
- **state.ts** (42 lines):
  - `AgentState` via `Annotation.Root` with all spec'd fields:
    - `projectId`, `clientMessage`, `conversationHistory`
    - `extractedRequirements`, `gaps`, `risks`, `finalDocuments`
    - `currentStage`, `nextAgent`
  - Export `AgentStateType = typeof AgentState.State`

- **All 8 agent node factories** (in `packages/agents/src/graph/nodes/`):
  - **interview-agent.ts** (75 lines) — No tools; pulls memory context, calls LLM for next question, uses `interrupt()` for client answer pause, routes to Domain/Research/Requirement Extraction based on model readiness check
  - **domain-agent.ts** (65 lines) — webSearchTool; domain research via web search, routes back to Interview for loop
  - **research-agent.ts** (65 lines) — webSearchTool + fileReaderTool; external research, routes back to Interview
  - **requirement-extraction-agent.ts** (70 lines) — dbQueryTool; structured output extraction via `withStructuredOutput()`, writes Requirement rows, advances to gap_analysis
  - **gap-analysis-agent.ts** (66 lines) — dbQueryTool; identifies gaps, writes Gap rows, advances to risk_analysis
  - **risk-analysis-agent.ts** (70 lines) — dbQueryTool + webSearchTool; identifies risks with severity/category, writes Risk rows, advances to documentation
  - **documentation-agent.ts** — dbQueryTool + documentWriterTool; generates BRD/SRS/User Stories, creates DocumentArtifact, advances to review *(fully implemented in Stage 05)*
  - **review-agent.ts** — consistency check against source requirements/risks/gaps, writes ReviewNote rows, auto-revision loop, sets status to completed *(fully implemented in Stage 05)*

- **Planner node** (planner.ts, 68 lines):
  - Routes based on `currentStage`:
    - `intake` → start interviewing
    - `interviewing` → pass through routing (Interview/Domain/Research loop)
    - `requirement_extraction` through `review` → deterministic pipeline (straight chain, no branching)
    - `completed` → terminate
  - Pulls `MemoryManager.getRecent()` to populate `conversationHistory` each turn

- **StateGraph wiring** (graph.ts, 85 lines):
  - 9 nodes (planner + 8 agents)
  - START → planner
  - Conditional edges from planner to agents or END
  - All agent nodes → planner (loopback for interview phase, then chain for pipeline)
  - Checkpointer support (MemorySaver for tests, PostgresSaver for production)
  - `buildGraph()`, `compileGraph()`, `getDefaultCompiledGraph()` factory functions

- **Turn runner** (run-turn.ts, 57 lines):
  - `runTurn(projectId: string, clientMessage: string, graphDeps?): Promise<TurnResult>`
  - Loads graph state from checkpoint, resumes if interrupted or invokes fresh
  - Returns `{ type: "question" | "stage_complete" | "completed", stage, question?, finalDocuments? }`
  - Loads final documents from DB on completion

- **Shared utilities**:
  - `graph/utils/invoke-with-tools.ts` — One-shot tool-calling loop (bind tools, invoke, execute tool_calls, re-invoke with ToolMessages, return content)

- **Graph barrel export** (graph/index.ts):
  - Exports AgentState, buildGraph, compileGraph, runTurn, all node factories

- **Main agents index** (packages/agents/src/index.ts):
  - Re-exports graph, llm, memory, tools modules

- **API integration** (apps/api/src/app.ts):
  - POST `/api/projects/:projectId/turn` — takes `{ message: string }`, calls `runTurn()`, returns `{ data: TurnResult }`
  - 404 if project not found
  - Added dependency: `@ai-business-analyst/agents` to apps/api

- **Integration test scaffold** (packages/agents/test/graph.test.ts):
  - Follows fakes-first pattern (FakeMemoryManager, FakeDatabase, FakeChatModel, MemorySaver checkpointer)
  - Test structure ready; mock model returns scripted responses per call count

**Files:**
- `packages/agents/src/graph/state.ts` — AgentState definition (42 lines)
- `packages/agents/src/graph/nodes/interview-agent.ts` — Interview node (75 lines)
- `packages/agents/src/graph/nodes/domain-agent.ts` — Domain node (65 lines)
- `packages/agents/src/graph/nodes/research-agent.ts` — Research node (65 lines)
- `packages/agents/src/graph/nodes/requirement-extraction-agent.ts` — Requirement extraction node (70 lines)
- `packages/agents/src/graph/nodes/gap-analysis-agent.ts` — Gap analysis node (66 lines)
- `packages/agents/src/graph/nodes/risk-analysis-agent.ts` — Risk analysis node (70 lines)
- `packages/agents/src/graph/nodes/documentation-agent.ts` — Documentation node (68 lines)
- `packages/agents/src/graph/nodes/review-agent.ts` — Review node (64 lines)
- `packages/agents/src/graph/nodes/planner.ts` — Planner node (68 lines)
- `packages/agents/src/graph/utils/invoke-with-tools.ts` — Tool invocation helper (39 lines)
- `packages/agents/src/graph/graph.ts` — StateGraph wiring (85 lines)
- `packages/agents/src/graph/run-turn.ts` — Turn runner (57 lines)
- `packages/agents/src/graph/index.ts` — Barrel export

**Version compatibility — resolved:**

The original blocker was peer-dependency conflicts between `@langchain/langgraph@0.1.x` and `@langchain/langgraph-checkpoint-postgres@1.0.x`. Instead of the documented 4–6 hour upgrade to the LangGraph v1.x stack, the stack was pinned to a compatible set:

- `@langchain/langgraph` → `^0.2.0` (resolves 0.2.74) — provides `interrupt()`, `MemorySaver`, and the typed `StateGraph`/`addEdge` API
- `@langchain/langgraph-checkpoint-postgres` → `^0.1.0` (resolves 0.1.3)
- `@langchain/core` → `^0.3.0` (resolves 0.3.80) — **required**: langgraph 0.2.74's `pregel/messages` imports `isToolMessage` at runtime, which only exists in core ≥0.3 (core 0.2.36 loads but crashes with "does not provide an export named 'isToolMessage'")
- `@langchain/openai` → `^0.3.0` — paired with core 0.3.x (0.1.3 pins core `<0.3.0` and would create a dual-core split)

Surgical code fixes applied (all typecheck clean):
- `graph.addEdge(START as any, "planner" as any)` — v0.2 type mismatch on START/END constants
- `(model as any).bindTools([...tools]).withStructuredOutput(schema)` — `bindTools` returns a `Runnable` lacking `withStructuredOutput`
- `model.invoke([...messages])` array form — object `{ messages }` is not a valid `BaseLanguageModelInput`
- `file-reader-tool.ts` — replaced a `.refine()` ZodEffects schema (typing broke `DynamicStructuredTool.func`) with a plain `z.object` + explicit runtime check
- `documentation-agent.ts` — `StructuredToolInterface.invoke` is a union of call signatures in core 0.3.x; narrowed via a whole-object cast to the `DocumentWriterInput` type (cast the object, not the method, so `this` stays bound)

Additionally, all agent nodes previously constructed a `MemoryManager` at module scope (`const defaultMemoryManager = await import(...).then(m => new m.MemoryManager())`), which throws without `OPENAI_API_KEY` at *import* time. This is replaced with a lazy, cached `getDefaultMemoryManager()` in `memory/memory-manager.ts` so importing the graph (and the API's `runTurn`) no longer needs a key until a node actually runs.

**Result:** `pnpm --filter @ai-business-analyst/agents typecheck` and `build` pass.

**Dependency snapshot** (current package.json):
```json
{
  "@langchain/core": "^0.3.0",
  "@langchain/langgraph": "^0.2.0",
  "@langchain/langgraph-checkpoint-postgres": "^0.1.0",
  "@langchain/openai": "^0.3.0"
}
```

---

### Stage 05: Documentation & Review Agents ✅ (100% Complete)

**Location:** `packages/agents/src/prompts/`, `packages/agents/src/graph/nodes/`, `apps/api/src/app.ts`

**Completed:**
- **Prompts module** (`packages/agents/src/prompts/documentation-prompts.ts`):
  - `brdPromptTemplate`, `srsPromptTemplate`, `userStoriesPromptTemplate` — LangChain `PromptTemplate`s (no inline prompt strings in node code)
  - `documentationPromptTemplates: Record<"BRD" | "SRS" | "user_stories", PromptTemplate>` and `DocumentationPromptInput`
  - Shared `SOURCE_DATA_BLOCK` with variables `{projectContext, requirements, gaps, risks, reviewNotes, revisionGuidance}`
  - BRD (12 sections), SRS (10 sections + mandatory Traceability Matrix), User Stories ("As a [role], I want [goal], so that [benefit]" + Acceptance Criteria)
  - Barrel export via `packages/agents/src/prompts/index.ts` (re-exported from `packages/agents/src/index.ts`)

- **Documentation Agent** (`documentation-agent.ts`):
  - Generates all three artifacts (BRD, SRS, user_stories) from Requirements + resolved Gaps + Risks
  - Uses `PromptTemplate.format()` to render prompts, invokes the model, persists each artifact through `documentWriterTool` (injectable)
  - On a revision pass (`revisionCount > 0`) incorporates prior `reviewNotes` as `revisionGuidance` and updates existing artifacts (version bump via the writer tool)
  - Falls back to the database for requirements/gaps/risks if the pipeline did not carry them in state
  - Sets project status to `review` and routes to Review Agent

- **Review Agent** (`review-agent.ts`):
  - Deterministic structural check (all of BRD/SRS/user_stories present) that runs regardless of the LLM
  - LLM cross-check via `withStructuredOutput` against the review checklist (every requirement in the SRS? high-severity risks called out? resolved gaps reflected?)
  - Writes every issue as a `ReviewNote` row (`resolved: false`)
  - **Auto-revision loop:** if issues found and `revisionCount < MAX_AUTO_REVISIONS (=1)`, routes back to Documentation Agent with `revisionCount + 1`; otherwise (clean or cap reached) sets status to `completed` and surfaces any unresolved issues as `ReviewNote` rows for a human
  - No planner/graph changes required — `review`→`documentation`→`review` routing already exists via the planner

- **State additions** (`graph/state.ts`): `reviewNotes: Annotation<ReviewNote[]>`, `revisionCount: Annotation<number>`; `run-turn.ts` initializes both and returns `reviewNotes` on completion

- **API** (`apps/api/src/app.ts`):
  - `GET /api/projects/:projectId/documents` — list all artifacts + versions (ordered by type asc, version desc)
  - `GET /api/projects/:projectId/documents/:docId` — fetch one artifact with content (404 when missing or not in this project)
  - `GET /api/projects/:projectId/review-notes` — list ReviewNote rows
  - `documentArtifactCreateSchema` now defaults `version` to 1, matching the Prisma `@default(1)` (previously clients were required to send it)

- **Tests**:
  - `packages/agents/test/documentation-review.test.ts` — fakes-first node tests covering: 3 artifacts generated, review routing back with `revisionCount: 1`, full clean-loop with version bump to 2, revision cap surfacing unresolved notes, prompt template rendering
  - `apps/api/test/documents.test.ts` — list/fetch/404/cross-project-scope/versions/review-notes for the document endpoints

**Files:**
- `packages/agents/src/prompts/documentation-prompts.ts` — Prompt templates (new)
- `packages/agents/src/prompts/index.ts` — Barrel (new)
- `packages/agents/src/graph/nodes/documentation-agent.ts` — Documentation node (rewritten)
- `packages/agents/src/graph/nodes/review-agent.ts` — Review node with revision loop (rewritten)
- `packages/agents/src/graph/state.ts` — reviewNotes + revisionCount annotations
- `packages/agents/src/graph/run-turn.ts` — init + return review notes
- `packages/agents/src/index.ts` — export prompts
- `apps/api/src/app.ts` — document GET endpoints + review-notes
- `packages/shared-types/src/index.ts` — version default in create schema

---

## Dependency Summary

### Production Dependencies

| Package | Version | Used In | Purpose |
|---------|---------|---------|---------|
| `@langchain/core` | ^0.3.0 | agents | Core LangChain abstractions (resolves 0.3.80; required for `isToolMessage`) |
| `@langchain/langgraph` | ^0.2.0 | agents | StateGraph, workflow orchestration (resolves 0.2.74) |
| `@langchain/langgraph-checkpoint-postgres` | ^0.1.0 | agents | Postgres checkpointer (resolves 0.1.3) |
| `@langchain/openai` | ^0.3.0 | agents | `ChatOpenAI` binding |
| `@langchain/anthropic` | ^0.3.0 | agents | `ChatAnthropic` binding (Stage 06) |
| `@langchain/google-genai` | ^0.1.0 | agents | `ChatGoogleGenerativeAI` binding (Stage 06) |
| `@langchain/community` | ^0.3.0 | agents | `ChatOllama` binding for local llama/qwen (Stage 06) |
| `chromadb` | ^3.1.6 | agents | Vector database for semantic search |
| `ioredis` | ^5.6.1 | agents | Redis client for short-term memory |
| `openai` | ^5.12.2 | agents | Embeddings API |
| `pdf-parse` | ^2.4.5 | agents | PDF text extraction |
| `zod` | ^3.25.76 | shared, agents | Schema validation |
| `fastify` | ^5.2.1 | api | HTTP server |
| `@fastify/cors` | ^11.0.1 | api | CORS middleware |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      apps/web (Next.js)                         │
│              [Stage 07 - Frontend] ⏳ Pending                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       apps/api (Fastify)                        │
│  POST /api/projects/:id/turn ──────► runTurn(projectId, msg)   │
│                                      [Stage 04] 🔄 95% Complete │
└────┬───────────────────────────────────────────────────────────┘
     │
     ├──────────────────────────────────────────┐
     │                                          │
     ▼                                          ▼
┌──────────────────────────┐         ┌─────────────────────────┐
│  packages/agents         │         │ packages/db             │
│                          │         │                         │
│ ┌──────────────────────┐ │         │ Prisma ORM              │
│ │ src/graph/ [04] 🔄  │ │         │ - Project               │
│ │ - StateGraph         │ │         │ - ConversationTurn      │
│ │ - 8 Agent Nodes      │ │────────►│ - Requirement           │
│ │ - Planner            │ │         │ - Gap                   │
│ │ - runTurn()          │ │         │ - Risk                  │
│ └──────────────────────┘ │         │ - DocumentArtifact      │
│                          │         │ - ReviewNote            │
│ ┌──────────────────────┐ │         └─────────────────────────┘
│ │ src/llm/ [06] ✅    │ │
│ │ - getChatModel()     │ │         ┌─────────────────────────┐
│ │ - resolveConfig()    │ │         │ Redis                   │
│ └──────────────────────┘ │         │ (short-term memory)     │
│                          │         └─────────────────────────┘
│ ┌──────────────────────┐ │
│ │ src/memory/ [02] ✅ │ │         ┌─────────────────────────┐
│ │ - MemoryManager      │ │         │ ChromaDB                │
│ │ - getRecent()        │ │────────►│ (semantic search)       │
│ │ - semanticSearch()   │ │         └─────────────────────────┘
│ └──────────────────────┘ │
│                          │
│ ┌──────────────────────┐ │
│ │ src/tools/ [03] ✅  │ │
│ │ - dbQueryTool        │ │
│ │ - webSearchTool      │ │
│ │ - fileReaderTool     │ │
│ │ - documentWriterTool │ │
│ │ - ToolRegistry       │ │
│ └──────────────────────┘ │
└──────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│            packages/shared-types [01] ✅                         │
│   - Zod schemas for all entities                                 │
│   - TypeScript type exports                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Known Issues & Next Steps

### Post-Stage 05 Work

1. **Stage 07 — Frontend (Next.js)**
   - Depends on working Stage 04 API `/turn` endpoint
   - Pages: intake, interview chat, dashboard, project history
   - Use TanStack Query + Zod types from shared-types
   - Estimated effort: 8-10 hours (design system + full UI)

2. **Stage 08 — Production Hardening**
   - JWT auth, rate limiting, input validation, error handling
   - Docker Compose, deployment docs
   - Depends on all prior stages working
   - Estimated effort: 4-5 hours

### Known Limitations

- `packages/agents/test/graph.test.ts` is a pre-existing scaffold that stubs `getChatModel` globally, which does not affect module imports; `GraphDeps` only carries a checkpointer, so node-level deps cannot be injected through the graph. It is documented here and not part of the Stage 05 test suite. Stage 05 tests exercise the documentation/review nodes directly with injected fakes.
- The API test suites (`apps/api/test/*.test.ts`, including the 5 Stage 05 document routes) require a running Postgres at `localhost:5433` and skip otherwise. Start it with `docker compose up -d postgres-test` and apply the schema with `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/ai_business_analyst_test pnpm --filter @ai-business-analyst/db exec prisma migrate deploy` before running `pnpm --filter @ai-business-analyst/api test`.
- Web search tool is a mock stub; real provider integration needed for domain/research agents
- File uploader for Research Agent file-reader tool not yet implemented in API
- No async file upload endpoint for PDFs/CSVs

---

## Code Statistics

| Package | Files | Lines | Status |
|---------|-------|-------|--------|
| packages/db | schema.prisma + client.ts | 300+ | ✅ Complete |
| packages/shared-types | index.ts | 138 | ✅ Complete |
| packages/agents (memory) | 3 files | 400+ | ✅ Complete |
| packages/agents (tools) | 5 files | 350+ | ✅ Complete |
| packages/agents (llm) | 3 files | 130+ | ✅ Complete |
| packages/agents (graph) | 14 files | 1000+ | ✅ Complete |
| packages/agents (prompts) | 2 files | 120+ | ✅ Complete (Stage 05) |
| apps/api | app.ts (modified) | 200+ | ✅ Documents + review-notes routes added |

**Total:** ~2500+ lines of production code written

---

## Testing

- ✅ Memory module: integration test with fakes (memory-manager.test.ts)
- ✅ CRUD routes: Vitest tests (apps/api/test/projects.test.ts)
- ✅ Stage 05 documentation & review: node tests with injected fakes (documentation-review.test.ts)
- ✅ Stage 05 documents API: route tests (apps/api/test/documents.test.ts)
- ⚠️ Graph workflow integration (graph.test.ts): pre-existing scaffold, does not inject node deps (see Known Limitations)

---

## Environment & Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ba_agent

# Redis
REDIS_URL=redis://localhost:6379

# ChromaDB
CHROMA_URL=http://localhost:8000

# OpenAI (for embeddings and LLM)
OPENAI_API_KEY=sk-...

# LLM Configuration (Stage 06)
MODEL_PROVIDER=openai              # openai|anthropic|google_genai|ollama (aliases: gpt/claude/gemini/llama/qwen)
MODEL_NAME=gpt-4o-mini             # default: "gpt-4o-mini"
MODEL_TIMEOUT_MS=30000             # default: 30000 (OpenAI + Anthropic)
MODEL_MAX_RETRIES=3                # default: 3 (all providers)

# Provider API keys (only the selected provider's key is required)
ANTHROPIC_API_KEY=sk-ant-...       # for MODEL_PROVIDER=anthropic
GOOGLE_API_KEY=...                 # for MODEL_PROVIDER=google_genai
OLLAMA_BASE_URL=http://localhost:11434  # for MODEL_PROVIDER=ollama (local llama/qwen)

# Per-agent overrides (optional)
MODEL_OVERRIDE_INTERVIEW_AGENT_MODEL=gpt-4o-mini
MODEL_OVERRIDE_DOCUMENTATION_AGENT_PROVIDER=anthropic
MODEL_OVERRIDE_DOCUMENTATION_AGENT_MODEL=claude-3-5-sonnet-20240620
```

### Local Development Stack

Required services (docker-compose or local):
- PostgreSQL 14+
- Redis 7+
- ChromaDB 0.4+
- Node.js 18+, pnpm 10+

---

## References

- Spec files: `spec/01-initial-agent.md` through `spec/08-initial-agent.md`
- Plan: `C:\Users\abuba\.claude\plans\enumerated-imagining-dragonfly.md`
- Git history: `git log --oneline` (check previous commits for Stages 01-03)

---

## Recommendations for Next Session

1. **Stage 07 skeleton** — set up Next.js app structure, basic pages
2. **Stage 08 hardening** — auth, rate limiting, validation, deployment
3. **Wire graph.test.ts deps** — extend `GraphDeps` to inject node dependencies so the integration test can run with fakes
4. **Real web search provider** — replace the mock stub for domain/research agents
5. **File upload endpoint** — async upload for PDFs/CSVs for the Research Agent file-reader tool

---

**Status:** 6 of 8 stages complete (01–06). Stage 04 fully typechecks with the LangGraph 0.2.x pin; Stage 05 documentation & review agents, prompts, API endpoints, and tests are complete. Stages 07 (frontend) and 08 (production hardening) remain.
