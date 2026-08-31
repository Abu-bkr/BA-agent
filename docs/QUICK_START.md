# Quick Start Guide

## Project Setup

### Prerequisites
- Node.js 18+
- pnpm 10+
- PostgreSQL 14+
- Redis 7+
- ChromaDB 0.4+

### Installation

```bash
# Clone and navigate
cd "E:\github repo\Agents\BA-agent"

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build individual packages
pnpm --filter @ai-business-analyst/agents build
pnpm --filter @ai-business-analyst/api build
```

### Environment Setup

Create a `.env.local` file in the project root:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ba_agent

# Redis
REDIS_URL=redis://localhost:6379

# ChromaDB
CHROMA_URL=http://localhost:8000

# OpenAI
OPENAI_API_KEY=sk-...

# LLM Configuration (optional)
MODEL_PROVIDER=openai              # openai|anthropic|google_genai|ollama (aliases: gpt/claude/gemini/llama/qwen)
MODEL_NAME=gpt-4o-mini
MODEL_TIMEOUT_MS=30000
MODEL_MAX_RETRIES=3

# Provider API keys (only the selected provider's key is required)
ANTHROPIC_API_KEY=sk-ant-...       # MODEL_PROVIDER=anthropic
GOOGLE_API_KEY=...                 # MODEL_PROVIDER=google_genai
OLLAMA_BASE_URL=http://localhost:11434  # MODEL_PROVIDER=ollama (local)

# Per-agent overrides (optional)
MODEL_OVERRIDE_DOCUMENTATION_AGENT_PROVIDER=anthropic
MODEL_OVERRIDE_DOCUMENTATION_AGENT_MODEL=claude-3-5-sonnet-20240620
```

### Database Setup

```bash
# Run migrations
pnpm prisma migrate deploy

# (Optional) Seed test data
pnpm prisma db seed
```

### Start Services

In separate terminals:

```bash
# Terminal 1: API server
pnpm --filter @ai-business-analyst/api dev
# Runs on http://localhost:3001

# Terminal 2: Frontend (when ready)
pnpm --filter @ai-business-analyst/web dev
# Runs on http://localhost:3000

# External services (Docker or local)
# PostgreSQL: localhost:5432
# Redis: localhost:6379
# ChromaDB: localhost:8000
```

---

## API Usage Examples

### 1. Create a Project

```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "clientName": "Acme Corp",
    "businessDomain": "E-commerce",
    "rawIdeaText": "We want to build a marketplace platform"
  }'

# Response:
# {
#   "data": {
#     "id": "proj-123abc",
#     "clientName": "Acme Corp",
#     "businessDomain": "E-commerce",
#     "rawIdeaText": "We want to build a marketplace platform",
#     "status": "intake",
#     "createdAt": "2026-08-31T12:00:00Z",
#     "updatedAt": "2026-08-31T12:00:00Z"
#   }
# }
```

### 2. Run Agent Turn (Interview)

```bash
curl -X POST http://localhost:3001/api/projects/proj-123abc/turn \
  -H "Content-Type: application/json" \
  -d '{ "message": "We want a marketplace for handmade goods" }'

# Response (first turn):
# {
#   "data": {
#     "type": "question",
#     "stage": "interviewing",
#     "question": "That sounds great! Can you tell me about your target users?"
#   }
# }

# Response (after multiple turns, when ready to extract):
# {
#   "data": {
#     "type": "completed",
#     "stage": "completed",
#     "finalDocuments": [
#       {
#         "id": "doc-1",
#         "type": "summary",
#         "contentMarkdown": "# Project Summary\n...",
#         "version": 1,
#         "createdAt": "2026-08-31T12:05:00Z"
#       }
#     ]
#   }
# }
```

### 3. Get Project Requirements

```bash
curl http://localhost:3001/api/projects/proj-123abc/requirements

# Response:
# {
#   "data": [
#     {
#       "id": "req-456",
#       "projectId": "proj-123abc",
#       "type": "functional",
#       "text": "User authentication with email/password",
#       "status": "draft",
#       "sourceTurnId": null
#     },
#     {
#       "id": "req-789",
#       "projectId": "proj-123abc",
#       "type": "non_functional",
#       "text": "System must handle 1000 concurrent users",
#       "status": "draft",
#       "sourceTurnId": null
#     }
#   ]
# }
```

### 4. Get Project Gaps

```bash
curl http://localhost:3001/api/projects/proj-123abc/gaps

# Response:
# {
#   "data": [
#     {
#       "id": "gap-1",
#       "projectId": "proj-123abc",
#       "description": "Need clarification on payment integration strategy",
#       "resolved": false,
#       "resolutionText": null
#     }
#   ]
# }
```

### 5. Get Project Risks

```bash
curl http://localhost:3001/api/projects/proj-123abc/risks

# Response:
# {
#   "data": [
#     {
#       "id": "risk-1",
#       "projectId": "proj-123abc",
#       "description": "Limited team experience with marketplace platforms",
#       "severity": "high",
#       "category": "technical",
#       "mitigation": "Hire experienced marketplace architect for first 6 months"
#     }
#   ]
# }
```

### 6. Get Generated Documents

```bash
curl http://localhost:3001/api/projects/proj-123abc/documents

# Response:
# {
#   "data": [
#     {
#       "id": "doc-1",
#       "projectId": "proj-123abc",
#       "type": "summary",
#       "contentMarkdown": "# Project Summary\n## Business Goals\n...",
#       "version": 1,
#       "createdAt": "2026-08-31T12:05:00Z"
#     }
#   ]
# }
```

---

## Testing

### Run All Tests

```bash
pnpm test
```

### Run Package-Specific Tests

```bash
pnpm --filter @ai-business-analyst/agents test
pnpm --filter @ai-business-analyst/api test
```

### Run with Coverage

```bash
pnpm test -- --coverage
```

### Example Test Run

```bash
# Terminal 1: Start services
pnpm --filter @ai-business-analyst/api dev

# Terminal 2: Run tests
pnpm --filter @ai-business-analyst/agents test

# Terminal 3: Watch tests
pnpm --filter @ai-business-analyst/agents test -- --watch
```

---

## Troubleshooting

### PostgreSQL Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**
1. Ensure PostgreSQL is running: `sudo systemctl start postgresql` (Linux) or Docker
2. Verify `DATABASE_URL` in `.env.local` matches your setup
3. Check credentials: `psql -U user -h localhost -d ba_agent`

### Redis Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution:**
1. Start Redis: `redis-server` or Docker
2. Verify `REDIS_URL` in `.env.local`
3. Test: `redis-cli ping` (should return "PONG")

### ChromaDB Connection Error

```
Error: Failed to connect to ChromaDB at http://localhost:8000
```

**Solution:**
1. Start ChromaDB: `chroma run` or Docker
2. Verify `CHROMA_URL` in `.env.local`
3. Test: `curl http://localhost:8000/api/version`

### LangGraph Version Compatibility Issues

If you encounter type errors during build:

```
error TS2345: Argument of type '"planner"' is not assignable to parameter of type '"__start__"'
error TS2307: Cannot find module '@langchain/core/language_models'
```

This indicates LangGraph/LangChain versions are incompatible. See `docs/IMPLEMENTATION_STATUS.md` for version resolution guidance (Section: "Current Blocker — LangGraph Version Compatibility").

### OpenAI API Errors

**No API key error:**
```bash
Error: OPENAI_API_KEY is not set
```
Solution: Set `OPENAI_API_KEY` in `.env.local`

**Rate limit error:**
```bash
Error: RateLimitError: You exceeded your current quota
```
Solution: Check OpenAI billing, API key quota, or wait for rate limit window to reset

---

## Project Structure

```
.
├── apps/
│   ├── api/                          # Fastify server
│   │   ├── src/app.ts               # Routes
│   │   ├── src/server.ts            # Server startup
│   │   └── test/                    # API tests
│   └── web/                          # Next.js app (Stage 07)
│
├── packages/
│   ├── agents/                       # Core agent system
│   │   ├── src/
│   │   │   ├── graph/               # StateGraph, nodes, planner [Stage 04]
│   │   │   ├── llm/                 # getChatModel() wrapper [Stage 06]
│   │   │   ├── memory/              # MemoryManager [Stage 02]
│   │   │   ├── tools/               # Tool implementations [Stage 03]
│   │   │   └── index.ts             # Barrel export
│   │   ├── test/                    # Agent tests
│   │   └── package.json
│   │
│   ├── db/                           # Prisma & database [Stage 01]
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # Data model
│   │   │   └── migrations/          # DB migrations
│   │   ├── src/client.ts            # PrismaClient singleton
│   │   └── package.json
│   │
│   └── shared-types/                 # Zod schemas & types [Stage 01]
│       ├── src/index.ts             # All schemas
│       └── package.json
│
├── docs/
│   ├── IMPLEMENTATION_STATUS.md      # This document
│   ├── ARCHITECTURE.md               # System design
│   ├── QUICK_START.md                # You are here
│   └── DEVELOPMENT.md                # Dev guide (TBD)
│
├── spec/
│   ├── 01-initial-agent.md           # Stage 01 spec
│   ├── 02-initial-agent.md           # Stage 02 spec
│   ├── 03-initial-agent.md           # Stage 03 spec
│   ├── 04-initial-agent.md           # Stage 04 spec (current work)
│   ├── 05-initial-agent.md           # Stage 05 spec (pending)
│   ├── 06-initial-agent.md           # Stage 06 spec (built early)
│   ├── 07-initial-agent.md           # Stage 07 spec (frontend)
│   └── 08-initial-agent.md           # Stage 08 spec (hardening)
│
├── .env.local                         # Local env vars (create this)
├── pnpm-workspace.yaml                # Monorepo config
├── pnpm-lock.yaml                     # Dependency lock
├── package.json                       # Root package
├── tsconfig.json                      # Root TS config
└── README.md                          # Project overview
```

---

## Git Workflow

### Checking Status

```bash
# See what's changed
git status

# View recent commits
git log --oneline -10

# See changes in a file
git diff packages/agents/src/graph/graph.ts
```

### Making Commits

```bash
# Stage specific files
git add packages/agents/src/graph/state.ts packages/agents/src/llm/get-chat-model.ts

# Review before committing
git diff --cached

# Commit with message
git commit -m "Stage 04: Build agent state and LLM wrapper"

# Push to remote
git push origin main
```

### Creating a Feature Branch

```bash
# Create and switch to new branch
git checkout -b stage-05-documentation

# Make changes, commit, push
git push -u origin stage-05-documentation

# Open PR on GitHub
```

---

## Next Steps

### Immediate (Stage 04 Completion)

1. **Resolve LangGraph version compatibility**
   - Upgrade `@langchain/core`, `@langchain/langgraph` to compatible versions
   - Adapt code to new APIs (interrupt/Command, message formats)
   - Estimated: 4-6 hours

2. **Run integration test**
   - Execute `pnpm --filter @ai-business-analyst/agents test`
   - Verify graph flow end-to-end
   - Mock AI responses for deterministic testing

### Short-term (Stage 05)

3. **Documentation & Review agents**
   - Add BRD/SRS/User Stories prompt templates
   - Implement auto-revision loop
   - Estimated: 2-3 hours

4. **Testing**
   - Full integration test with real (or stubbed) OpenAI calls
   - End-to-end test: create project → run interview → extract requirements → complete

### Medium-term (Stages 07-08)

5. **Frontend (Next.js)**
   - Project creation form
   - Interview chat interface
   - Dashboard with requirements/gaps/risks/documents views
   - Estimated: 8-10 hours

6. **Production hardening**
   - JWT authentication
   - Rate limiting
   - Input validation & sanitization
   - Error handling & logging
   - Docker Compose setup
   - Estimated: 4-5 hours

---

## Resources

- **LangChain.js Docs:** https://js.langchain.com/
- **LangGraph Docs:** https://langchain-ai.github.io/langgraph/
- **Prisma Docs:** https://www.prisma.io/docs/
- **OpenAI API:** https://platform.openai.com/docs/
- **Fastify Docs:** https://www.fastify.io/docs/latest/
- **Spec Files:** `spec/*.md` in project root

---

## Getting Help

### Check the Docs

1. `docs/IMPLEMENTATION_STATUS.md` — What's been done, what's pending
2. `docs/ARCHITECTURE.md` — How components work together
3. `spec/*.md` — Original requirements for each stage

### Check the Code

- Agent nodes: `packages/agents/src/graph/nodes/`
- Tools: `packages/agents/src/tools/`
- Memory: `packages/agents/src/memory/`
- Routes: `apps/api/src/app.ts`

### Run Tests

```bash
pnpm test -- --reporter=verbose
```

### Check Git History

```bash
git log --oneline --all --graph
git show <commit> # View a specific commit
git blame <file>  # See who changed what
```

---

**Status:** 5 of 8 stages complete. Stage 04 ready for version compatibility pass. Good momentum for reaching MVP (all agents working end-to-end) within next 1-2 sessions.
