# AI Business Analyst - Documentation

Welcome to the AI Business Analyst project documentation. This system uses multi-agent LLM orchestration to conduct business analysis interviews and generate requirements documentation.

## Documentation Hub

### Getting Started
- **[QUICK_START.md](./QUICK_START.md)** — Setup, run the system, API examples, troubleshooting

### Understanding the System
- **[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)** — Detailed progress on all 8 stages, current blockers, next steps
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — System design, data flow, component deep-dives, extensibility patterns

### Original Specifications
See `spec/*.md` in project root for detailed stage specifications:
- `spec/01-initial-agent.md` — Database schema & CRUD
- `spec/02-initial-agent.md` — Memory module (Redis, Postgres, ChromaDB)
- `spec/03-initial-agent.md` — Tools module (database, search, file, document)
- `spec/04-initial-agent.md` — **Multi-agent LangGraph workflow** (current focus)
- `spec/05-initial-agent.md` — Documentation & Review agents
- `spec/06-initial-agent.md` — Model-agnostic LLM wrapper
- `spec/07-initial-agent.md` — Frontend (Next.js)
- `spec/08-initial-agent.md` — Production hardening

---

## Project at a Glance

**What it does:**
1. Client creates a project with a business idea
2. AI agents conduct an iterative interview to understand requirements
3. System extracts requirements, identifies gaps, analyzes risks
4. Generates professional documentation (BRD, SRS, user stories)
5. Reviews for consistency and completeness

**Technology Stack:**
- **Backend:** Fastify (Node.js HTTP server)
- **Agents:** LangGraph (agentic workflow orchestration)
- **LLM:** OpenAI (gpt-4o-mini for interviews, configurable)
- **Memory:** Redis (short-term), Postgres (long-term), ChromaDB (semantic)
- **Database:** Postgres + Prisma ORM
- **Frontend:** Next.js (Stage 07)

**Project Structure:**
```
monorepo (pnpm workspaces)
├── apps/api              (Fastify HTTP server)
├── apps/web              (Next.js frontend)
└── packages/
    ├── agents            (core agent system)
    ├── db                (Prisma schema, PrismaClient)
    └── shared-types      (Zod schemas, TypeScript types)
```

---

## Current Status (2026-08-31)

| Stage | Title | Status | Completion | Notes |
|-------|-------|--------|------------|-------|
| 01 | DB & CRUD | ✅ Complete | 100% | Prisma schema, migrations, routes |
| 02 | Memory | ✅ Complete | 100% | Redis + Postgres + ChromaDB, MemoryManager |
| 03 | Tools | ✅ Complete | 100% | 4 tools, ToolRegistry, dbQueryTool/webSearchTool/fileReaderTool/documentWriterTool |
| 04 | LangGraph Workflow | 🔄 In Progress | 95% | All nodes built; **pending LangGraph version compatibility** |
| 05 | Docs & Review Agents | ⏳ Pending | 0% | Depends on Stage 04 completion |
| 06 | LLM Wrapper | ✅ Complete | 100% | OpenAI-only minimal, extensible interface |
| 07 | Frontend | ⏳ Pending | 0% | Depends on working API |
| 08 | Production Hardening | ⏳ Pending | 0% | Auth, rate limiting, validation, deployment |

**What's Built:**
- ✅ Full database schema with 7 entities and proper relationships
- ✅ MemoryManager with Redis/Postgres/ChromaDB integration
- ✅ 4 LangChain tools with Zod schemas
- ✅ Model-agnostic LLM wrapper (getChatModel)
- ✅ All 8 agent node files + planner
- ✅ LangGraph StateGraph with proper edge routing
- ✅ Turn runner and API integration
- ✅ Comprehensive test scaffolding

**What's Blocking:**
- 🔴 LangGraph/LangChain version compatibility issue
  - `@langchain/langgraph-checkpoint-postgres@1.0.5` requires `@langchain/core@^1.1.44`
  - Currently installed: `@langchain/core@^0.2.0`
  - Causes TypeScript compilation errors (interrupt/resume API, message formats)
  - **Resolution:** Upgrade entire LangChain stack to latest compatible versions (~4-6 hours)

**Next Immediate Action:**
1. Resolve LangGraph version compatibility
2. Run Stage 04 integration test
3. Begin Stage 05 (BRD/SRS prompt templates)

---

## How to Use This Documentation

### For New Contributors
1. Start with **QUICK_START.md** — get the project running locally
2. Read **ARCHITECTURE.md** — understand how components fit together
3. Check **IMPLEMENTATION_STATUS.md** — see what's been built and what's next

### For Continuing Development
1. Check **IMPLEMENTATION_STATUS.md** for current blockers and TODOs
2. Review relevant spec file (`spec/XX-initial-agent.md`)
3. Examine existing code in similar package
4. Run tests: `pnpm test`
5. Make changes and commit

### For Understanding a Specific Component
- **Database:** See ARCHITECTURE.md § Database Layer + spec/01
- **Memory:** See ARCHITECTURE.md § Memory Layer + spec/02
- **Tools:** See ARCHITECTURE.md § Tools Layer + spec/03
- **Graph/Agents:** See ARCHITECTURE.md § Graph & Workflow + spec/04
- **API Routes:** See ARCHITECTURE.md § API Layer
- **LLM Selection:** See ARCHITECTURE.md § LLM Wrapper + spec/06

---

## Key Concepts

### Agent Workflow (Multi-Stage Pipeline)
```
Interview Loop (repeating)
├── Interview Agent (asks questions, checks readiness)
├── Domain Agent (researches business domain via web)
└── Research Agent (reads uploaded files, web research)

Once ready → Deterministic Pipeline (runs straight through)
├── Requirement Extraction (LLM extracts structured reqs)
├── Gap Analysis (identifies ambiguities/gaps)
├── Risk Analysis (identifies risks with severity)
├── Documentation (generates BRD/SRS/user stories)
└── Review (consistency check, final approval)
```

### State Management
- **AgentState** (LangGraph): `projectId, clientMessage, conversationHistory, extractedRequirements, gaps, risks, currentStage, nextAgent, finalDocuments`
- **Checkpointing:** Postgres (prod) or MemorySaver (dev) — saves graph state per turn so projects survive API restarts
- **Thread ID:** projectId — one conversation thread per project

### Memory System (3 Tiers)
1. **Redis (short-term):** Last N turns, fast context lookup during interview
2. **Postgres (long-term):** Full conversation history, durable across restarts
3. **ChromaDB (semantic):** Embedded turns, enables "has client mentioned payments?" queries

### Tools (per-agent assignment)
- **dbQueryTool:** Read-only safe queries for requirements/gaps/risks
- **webSearchTool:** Web search via configurable provider (stub now, Tavily/Google later)
- **fileReaderTool:** Extract text from PDF/TXT/CSV uploads
- **documentWriterTool:** Create/version DocumentArtifact rows

---

## Quick Reference

### Build & Run
```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm --filter @ai-business-analyst/api dev     # Start API
pnpm --filter @ai-business-analyst/agents test # Run tests
```

### API Endpoints (Stage 04 onwards)
- POST `/api/projects` — Create project
- POST `/api/projects/:id/turn` — Run agent turn (main entry point)
- GET `/api/projects/:id/requirements` — List requirements
- GET `/api/projects/:id/gaps` — List gaps
- GET `/api/projects/:id/risks` — List risks
- GET `/api/projects/:id/documents` — List generated documents

### Environment Variables
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
CHROMA_URL=http://localhost:8000
OPENAI_API_KEY=sk-...
MODEL_PROVIDER=openai
MODEL_NAME=gpt-4o-mini
```

### Key Files
- **Graph orchestration:** `packages/agents/src/graph/graph.ts`
- **Agent nodes:** `packages/agents/src/graph/nodes/*.ts`
- **API routes:** `apps/api/src/app.ts`
- **Tools:** `packages/agents/src/tools/*.ts`
- **Memory:** `packages/agents/src/memory/memory-manager.ts`
- **Database schema:** `packages/db/prisma/schema.prisma`

---

## Common Tasks

### Adding a New Agent
1. Create `packages/agents/src/graph/nodes/new-agent.ts`
2. Implement `createNewAgentNode()` factory
3. Add to ToolRegistry
4. Add to StateGraph in `graph.ts`
5. Wire edges to/from planner

### Changing the LLM Provider
1. Edit `packages/agents/src/llm/get-chat-model.ts`
2. Add provider branch (e.g., for Anthropic)
3. Install dependency (`@langchain/anthropic`)
4. Update env vars
5. **No agent code changes needed!** (gets getChatModel() automatically)

### Adding a New Tool
1. Create `packages/agents/src/tools/new-tool.ts` as DynamicStructuredTool
2. Export singleton
3. Add to ToolRegistry
4. Import in agent nodes that need it

### Debugging Agent Flow
```bash
# Check memory for a project
pnpm --filter @ai-business-analyst/agents test -- --reporter=verbose

# Watch API requests
curl -v http://localhost:3001/api/projects/proj-123/turn

# Check database state
psql ba_agent -c "SELECT * FROM projects WHERE id = 'proj-123';"

# View Redis cache
redis-cli LRANGE memory:project:proj-123 0 -1
```

---

## Useful Commands

```bash
# Development
pnpm dev                          # Start all dev servers
pnpm build                        # Build all packages
pnpm test                         # Run all tests
pnpm typecheck                    # Check TypeScript

# Format
pnpm format                       # Format with Prettier
pnpm lint                         # Lint code

# Database
pnpm prisma studio               # Open Prisma Studio (visual DB)
pnpm prisma migrate dev          # Create migration
pnpm prisma db push              # Sync schema to DB

# Git
git status                        # See changes
git log --oneline -10             # Recent commits
git diff packages/agents/src      # See diffs in a package
```

---

## Troubleshooting

### Build Errors
- See **QUICK_START.md** § Troubleshooting for common issues
- Check `docs/IMPLEMENTATION_STATUS.md` § Known Issues for stage-specific blockers

### Tests Fail
1. Verify services are running (Postgres, Redis, ChromaDB)
2. Check `.env.local` is configured
3. Run migrations: `pnpm prisma migrate deploy`
4. Try: `pnpm test -- --reporter=verbose` for details

### API Requests Fail
1. Verify API is running: `pnpm --filter @ai-business-analyst/api dev`
2. Check request payload matches schema (see `packages/shared-types/src/index.ts`)
3. Check environment variables are set
4. Look at API logs for error details

### Agent Not Responding
1. Verify OpenAI API key and rate limits
2. Check agent logs in terminal
3. Look at graph state via `pnpm prisma studio` (check Project.status)
4. Run integration test to isolate issue

---

## Contact & References

- **Repository:** GitHub (see git history)
- **Specs:** `spec/*.md`
- **Issues:** See IMPLEMENTATION_STATUS.md § Known Issues
- **Docs:** This directory (docs/)

---

**Last Updated:** 2026-08-31  
**Status:** 5/8 stages complete, Stage 04 in progress (95% done, version issue blocking)  
**Next:** LangGraph compatibility pass, then Stage 05 documentation agents
