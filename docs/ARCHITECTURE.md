# AI Business Analyst - Architecture

## System Design

### High-Level Flow

```
User Input
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ apps/web (Next.js)                                      │
│ - Intake form (create project)                          │
│ - Interview chat (iterative Q&A)                        │
│ - Dashboard (view requirements, gaps, risks, docs)      │
└──────────────┬──────────────────────────────────────────┘
               │ HTTP
               ▼
┌─────────────────────────────────────────────────────────┐
│ apps/api (Fastify)                                      │
│ - POST /api/projects (create)                           │
│ - GET /api/projects (list)                              │
│ - GET/POST /api/projects/:id/requirements              │
│ - GET/POST /api/projects/:id/gaps                      │
│ - GET/POST /api/projects/:id/risks                     │
│ - GET/POST /api/projects/:id/documents                 │
│ - POST /api/projects/:id/turn (main agent workflow)    │
└──────────────┬──────────────────────────────────────────┘
               │
               ├────────────────────┬───────────────────────┐
               ▼                    ▼                       ▼
┌─────────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ packages/agents     │  │ packages/db      │  │ packages/shared  │
│ - Graph (04)        │  │ - Prisma Schema  │  │ - Zod Schemas    │
│ - Nodes (04)        │  │ - PrismaClient   │  │ - TypeScript     │
│ - Tools (03)        │  │                  │  │   Types          │
│ - Memory (02)       │  │ PostgreSQL       │  │                  │
│ - LLM Wrapper (06)  │  │                  │  │                  │
└─────────────────────┘  └──────────────────┘  └──────────────────┘
       │
       ├──────────────┬─────────────────┬──────────────────┐
       ▼              ▼                 ▼                  ▼
   OpenAI API    Redis           ChromaDB              PostgreSQL
  (embeddings,   (cache)         (vectors)             (persistence)
   chat models)
```

---

## Detailed Component Architecture

### 1. Database Layer (Stage 01)

**Technology:** Prisma ORM + PostgreSQL

**Core Entities:**
- **Project** — Client engagement, status tracking
  - Statuses: `intake → interviewing → requirement_extraction → gap_analysis → risk_analysis → documentation → review → completed`
  - Fields: `id, clientName, businessDomain, rawIdeaText, status, createdAt, updatedAt`

- **ConversationTurn** — Agent-client exchange (interview history)
  - Fields: `id, projectId, role (agent|client), question, answer, agentSource, createdAt`

- **Requirement** — Extracted business need
  - Types: `functional, non_functional, business_rule`
  - Statuses: `draft, approved, rejected`
  - Fields: `id, projectId, type, text, sourceTurnId, status`

- **Gap** — Identified information gap or ambiguity
  - Fields: `id, projectId, description, resolved, resolutionText`

- **Risk** — Identified project risk
  - Severities: `low, medium, high, critical`
  - Categories: `technical, business, timeline, budget`
  - Fields: `id, projectId, description, severity, mitigation, category`

- **DocumentArtifact** — Generated documentation
  - Types: `BRD, SRS, user_stories, summary`
  - Fields: `id, projectId, type, contentMarkdown, version, createdAt`

- **ReviewNote** — QA findings
  - Fields: `id, projectId, artifactId, issue, resolved`

**Relationships:** All entities have `projectId` FK to Project with cascading deletes.

**Indexes:** `projectId, status, severity, category, resolved, createdAt` for query performance.

---

### 2. Memory Layer (Stage 02)

**Components:**

- **Short-term Memory (Redis)**
  - Stores recent N turns per project (default N=20)
  - FIFO buffer via Redis LPUSH/LTRIM
  - Fast context lookup for ongoing agent conversation
  - Key pattern: `memory:project:{projectId}`
  - Reconstructs full turn objects from JSON stored in list

- **Long-term Memory (PostgreSQL)**
  - Persists all ConversationTurn rows via Prisma
  - Fallback for historical context beyond short-term window
  - Queryable by `projectId, createdAt` for sorting and pagination

- **Semantic Memory (ChromaDB)**
  - Embeds every turn using OpenAI's `text-embedding-3-small`
  - Enables similarity-based retrieval ("Has the client mentioned payments?")
  - Scoped to project via metadata filter `{ projectId }`
  - Distance-ranked results for top-K retrieval

**MemoryManager Class:**
```typescript
class MemoryManager {
  // Write path
  async addTurn(projectId, role, text, metadata) 
    → writes to Redis + Postgres + ChromaDB

  // Read paths
  async getRecent(projectId, n): MemoryTurn[]
    → recent N turns from Redis (fast, bounded)
  
  async semanticSearch(projectId, query, k): SemanticResult[]
    → similarity search via ChromaDB (contextual)
  
  async getFullHistory(projectId): MemoryTurn[]
    → all turns from Postgres (slow, complete)
}
```

**Design Principle:** Duck-typed interfaces (RedisLike, DatabaseLike, ChromaLike) allow test injection without mocking frameworks.

---

### 3. Tools Layer (Stage 03)

**Tool Abstraction:** All tools are LangChain.js `DynamicStructuredTool` with Zod input schemas.

**Available Tools:**

1. **dbQueryTool** — Safe database read-only queries
   - Agent can query: project, requirements, gaps, risks
   - Safe filters: `status, severity, category, resolved` (enum validation)
   - Returns: JSON with `{ entity, records }`
   - Security: No raw SQL, parameterized queries via Prisma

2. **webSearchTool** — Web search (abstract provider)
   - Input: `{ query: string, limit: number }`
   - Returns: `[{ title, url, snippet }, ...]`
   - Provider: Currently mocked, wired for Tavily/Google at runtime
   - Use cases: Domain research (domain agent), risk research (risk agent)

3. **fileReaderTool** — Extract text from documents
   - Input: `{ fileName, filePath OR contentBase64 }`
   - Supports: PDF (via pdf-parse), TXT, CSV
   - Output: `{ fileName, text }`
   - Use cases: Read uploaded requirements doc (research agent)

4. **documentWriterTool** — Create/update documentation
   - Input: `{ projectId, type, contentMarkdown, artifactId? }`
   - Creates new DocumentArtifact or updates existing (increments version)
   - Output: artifact record with `{ id, version, createdAt }`
   - Use cases: BRD/SRS/user stories generation (documentation agent)

**Tool Registry Mapping:**
```typescript
{
  "Interview Agent": [],
  "Domain Agent": [webSearchTool],
  "Research Agent": [webSearchTool, fileReaderTool],
  "Requirement Extraction": [dbQueryTool],
  "Gap Analysis Agent": [dbQueryTool],
  "Risk Analysis Agent": [dbQueryTool, webSearchTool],
  "Documentation Agent": [dbQueryTool, documentWriterTool],
  "Review Agent": [dbQueryTool, documentWriterTool],
}
```

---

### 4. LLM Wrapper (Stage 06)

**Purpose:** Model-agnostic interface so agents never hardcode provider SDKs.

**getChatModel(agentName?, options?) → BaseChatModel**

Returns a LangChain.js-compatible chat model (`ChatOpenAI`, `ChatAnthropic`,
`ChatGoogleGenerativeAI`, or `ChatOllama`) selected purely from configuration.
Every agent node calls this one interface; none imports a provider SDK.

**Configuration Resolution:**

```
Global Defaults:
  MODEL_PROVIDER=openai              (env)
  MODEL_NAME=gpt-4o-mini             (env)
  MODEL_TIMEOUT_MS=30000             (env)
  MODEL_MAX_RETRIES=3                (env)

Per-Agent Override (example):
  MODEL_OVERRIDE_DOCUMENTATION_AGENT_MODEL=gpt-4-turbo
  → Documentation Agent gets gpt-4-turbo instead of global model

Result: Config { provider, model, timeout, maxRetries }
```

**Supported providers** (`MODEL_PROVIDER`, aliases accepted):

| Provider value                | Class                     | Package                              | API key env         |
|-------------------------------|---------------------------|--------------------------------------|---------------------|
| `openai` / `gpt`              | `ChatOpenAI`              | `@langchain/openai`                  | `OPENAI_API_KEY`    |
| `anthropic` / `claude`        | `ChatAnthropic`           | `@langchain/anthropic`               | `ANTHROPIC_API_KEY` |
| `google_genai` / `gemini`     | `ChatGoogleGenerativeAI`  | `@langchain/google-genai`            | `GOOGLE_API_KEY`    |
| `ollama` / `llama` / `qwen`   | `ChatOllama`              | `@langchain/community` (Ollama)      | none (local)        |

Ollama base URL is configurable via `OLLAMA_BASE_URL` (default `http://localhost:11434`).

**Resilience (all providers):**
- `maxRetries` — exponential-backoff retry on transient API errors, applied
  uniformly via LangChain's `AsyncCaller`.
- `timeout` — per-request timeout for OpenAI (`timeout`) and Anthropic
  (`clientOptions.timeout`). The Google GenAI and Ollama bindings do not expose
  a request timeout; those calls are bounded by `maxRetries`.

```typescript
// Resolved per agent, then dispatched on config.provider:
new ChatOpenAI({ model, apiKey, temperature: 0.7, maxRetries, timeout });
new ChatAnthropic({ model, apiKey, temperature: 0.7, maxRetries, clientOptions: { timeout } });
new ChatGoogleGenerativeAI({ model, apiKey, temperature: 0.7, maxRetries });
new ChatOllama({ model, baseUrl, temperature: 0.7, maxRetries });
```

**Extensibility:** Adding a provider is one branch in `getChatModel()` plus its
`@langchain/*` dependency — agent nodes never change.

---

### 5. Graph & Workflow (Stage 04)

**Architecture:** LangGraph StateGraph with 9 nodes (8 agents + 1 planner).

**Agent Flow:**

```
START
  │
  ▼
┌──────────────────────────────────────────────────────┐
│ PLANNER                                              │
│ - Reads currentStage, routes to next agent           │
│ - Pulls recent turns into conversationHistory        │
└──────────────┬───────────────────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
   ┌────▼─────┐  ┌────▼──────────┐
   │ Intake   │  │ Interviewing  │
   └──────────┘  │ Loop          │
                 │               │
                 │ ┌─────────────┴────────────┐
                 │ ▼                        │ ▼
                 │ Interview Agent          Loop back
                 │ (ask question,           if need
                 │  write turn,             more info
                 │  check readiness)        or
                 │ │ │                    advance
                 │ ▼ └──────────────────┐
                 │    Domain Agent       │
                 │    (web search)       │
                 │                       │
                 │    Research Agent     │
                 │    (file + web)       │
                 │                       │
                 └───────────┬───────────┘
                             │
                        Ready to
                      extract reqs?
                             │
                 ┌───────────▼───────────┐
                 │ Non-looping pipeline  │
                 │ (straight chain)      │
                 │                       │
                 ▼                       
          Requirement Extraction ──→ Gap Analysis
                                         │
                                         ▼
                                   Risk Analysis
                                         │
                                         ▼
                                   Documentation
                                         │
                                         ▼
                                      Review
                                         │
                                         ▼
                                      END
```

**State Definition (AgentState):**

```typescript
{
  projectId: string,
  clientMessage: string,              // latest user input
  conversationHistory: MemoryTurn[],   // recent turns for context
  extractedRequirements: Requirement[], // accumulated
  gaps: Gap[],                        // accumulated
  risks: Risk[],                      // accumulated
  currentStage: ProjectStatus,        // intake → ... → completed
  nextAgent: AgentName | undefined,   // routing decision
  finalDocuments: DocumentArtifact[], // BRD/SRS/etc
}
```

**Node Behaviors:**

- **Interview Agent** — No tools
  - Pulls memory context, asks next question
  - Uses `interrupt()` to pause and wait for client answer
  - On resume, checks readiness to move to Requirement Extraction
  - Routes to Domain/Research if more domain/external info needed

- **Domain Agent** — webSearchTool
  - Researches the business domain via web search
  - Routes back to Interview for loop

- **Research Agent** — webSearchTool + fileReaderTool
  - External research (file uploads + web)
  - Routes back to Interview

- **Requirement Extraction** — dbQueryTool
  - `model.withStructuredOutput(schema)` to extract structured list of requirements
  - Writes Requirement rows, persists stage, advances

- **Gap Analysis** — dbQueryTool
  - Identifies gaps and ambiguities
  - Writes Gap rows, advances

- **Risk Analysis** — dbQueryTool + webSearchTool
  - Identifies risks with severity/category/mitigation
  - Writes Risk rows, advances

- **Documentation** — dbQueryTool + documentWriterTool
  - Generates BRD/SRS/User Stories (full implementation in Stage 05)
  - For Stage 04: minimal summary markdown
  - Advances to review

- **Review** — dbQueryTool + documentWriterTool
  - Consistency check (full auto-revision loop in Stage 05)
  - For Stage 04: simple pass-through
  - Marks project completed

- **Planner** — No tools
  - Stateless routing based on `currentStage`
  - For interviewing phase: passes through `nextAgent` from prior node
  - For pipeline phase: deterministic mapping (stage→agent)
  - Pulls fresh memory context each turn
  - Returns state with updated `nextAgent` for conditional edges

**Checkpointing:**
- **Development:** MemorySaver (in-memory, lost on restart)
- **Production:** PostgresSaver (persists to Postgres, survives restarts)
- Thread ID = projectId (one thread per project conversation)

**Turn Execution (runTurn):**
```
Input: projectId, clientMessage
│
├─ Load project from DB (get current status)
├─ Invoke graph.invoke() or graph.resume()
│  │
│  └─ Graph runs until:
│     - interrupt() is called (agent waiting for user)
│     - node returns with nextAgent: undefined (done)
│
└─ Return TurnResult {
     type: "question" | "stage_complete" | "completed",
     stage: ProjectStatus,
     question?: string,
     finalDocuments?: DocumentArtifact[],
   }
```

---

### 6. API Layer (Stage 04 Integration)

**Framework:** Fastify (lightweight, TypeScript-friendly, performant)

**Routes:**

| Method | Path | Purpose | Handler |
|--------|------|---------|---------|
| POST | `/api/projects` | Create project | Prisma create |
| GET | `/api/projects` | List all | Prisma findMany |
| GET | `/api/projects/:id` | Get one | Prisma findUnique |
| GET | `/api/projects/:id/requirements` | List reqs | Prisma findMany (where: projectId) |
| POST | `/api/projects/:id/requirements` | Add req | Prisma create |
| GET | `/api/projects/:id/gaps` | List gaps | Prisma findMany |
| POST | `/api/projects/:id/gaps` | Add gap | Prisma create |
| GET | `/api/projects/:id/risks` | List risks | Prisma findMany |
| POST | `/api/projects/:id/risks` | Add risk | Prisma create |
| GET | `/api/projects/:id/documents` | List docs | Prisma findMany (orderBy: createdAt desc) |
| POST | `/api/projects/:id/documents` | Create doc | Prisma create |
| **POST** | **`/api/projects/:id/turn`** | **Run agent turn** | **runTurn(projectId, msg)** |

**Key Route: POST /api/projects/:id/turn**
```
Request: { message: string }
Response: {
  data: {
    type: "question" | "stage_complete" | "completed",
    stage: ProjectStatus,
    question?: string,
    finalDocuments?: DocumentArtifact[],
  }
}
```

**Error Handling:**
- Global `setErrorHandler()` logs errors, returns `{ error: "Internal server error" }`
- 404 if project not found
- 400 if request body invalid (Zod parse failure)

---

## Data Flow Examples

### Example 1: Interview Flow (Stage 04)

```
1. Client creates project:
   POST /api/projects
   Body: { clientName, businessDomain, rawIdeaText }
   Response: { data: { id: "proj-123", status: "intake", ... } }

2. Client sends first turn:
   POST /api/projects/proj-123/turn
   Body: { message: "We want a marketplace for handmade goods" }
   
   Graph execution:
   - Planner: intake → conversationHistory = [], nextAgent = "Interview Agent"
   - Interview Agent:
     * Pulls memory (empty)
     * Calls LLM: "Ask about business goals"
     * interrupt() → returns question
   
   Response: {
     data: {
       type: "question",
       stage: "interviewing",
       question: "That sounds great! Can you tell me about your target users?"
     }
   }

3. Client responds:
   POST /api/projects/proj-123/turn
   Body: { message: "Artists and craft makers worldwide, age 20-55" }
   
   Graph execution:
   - Resume from Interview Agent interrupt
   - Write turn to memory (MemoryManager.addTurn)
   - LLM readiness check: "Do we have enough info?" → "Not yet, ask about timeline"
   - interrupt() → returns next question
   
   Response: {
     data: {
       type: "question",
       stage: "interviewing",
       question: "Perfect! When are you planning to launch?"
     }
   }

4. After N turns, readiness check passes:
   POST /api/projects/proj-123/turn
   Body: { message: "We want to launch in Q1 next year" }
   
   Graph execution:
   - Resume from Interview Agent
   - Write turn, check readiness → "YES, ready for extraction"
   - Update Project.status = "requirement_extraction"
   - Return nextAgent = "Requirement Extraction"
   - Planner routes to Requirement Extraction
   - Requirement Extraction node runs (deterministic, no interrupt)
   - Extracts reqs, writes to DB, advances status → "gap_analysis"
   - Planner routes to Gap Analysis
   - ... (pipeline continues through Risk → Doc → Review)
   - Review node marks status = "completed"
   - Return
   
   Response: {
     data: {
       type: "completed",
       stage: "completed",
       finalDocuments: [
         { id: "doc-1", type: "summary", contentMarkdown: "...", ... }
       ]
     }
   }
```

### Example 2: Semantic Memory Search

```
Scene: Gap Analysis Agent needs context on prior client statements about scalability.

Code in gap-analysis-agent.ts:
const relevantTurns = await memoryManager.semanticSearch(
  projectId,
  "scalability requirements performance",
  k: 3
);

MemoryManager flow:
1. Embed query: OpenAI text-embedding-3-small("scalability requirements...")
2. Query ChromaDB: { queryEmbeddings: [embedding], nResults: 3, where: { projectId } }
3. ChromaDB returns top-3 similar turns by cosine distance
4. Reconstruct MemoryTurn objects with metadata

Result:
[
  { id: "turn-5", text: "We need the system to handle 1000 concurrent users", role: "client", ... },
  { id: "turn-12", text: "Scalability is critical for our global audience", role: "client", ... },
  { id: "turn-8", text: "Performance is key since our users are on mobile", role: "client", ... },
]

Agent uses these for context when writing gaps: "The client emphasized 1000 concurrent users..."
```

---

## Extensibility Patterns

### Adding a New Agent

1. Create `packages/agents/src/graph/nodes/my-agent.ts`
2. Implement `createMyAgentNode(deps?: { memoryManager?, db? })`
3. Export factory function
4. Add to ToolRegistry mapping
5. Add node to StateGraph in `graph.ts`
6. Wire edges (to planner and back)
7. Update `AgentName` type in tool-registry.ts

### Adding a New Tool

1. Create `packages/agents/src/tools/my-tool.ts`
2. Implement as `DynamicStructuredTool` with Zod schema
3. Export singleton instance
4. Add to ToolRegistry mapping
5. Import in agent nodes that need it

### Adding a New LLM Provider

OpenAI, Anthropic, Google Generative AI, and Ollama are already wired. To add
another (e.g. Mistral):

1. Update `packages/agents/src/llm/get-chat-model.ts`
2. Add the provider's canonical key + aliases in `canonicalizeProvider()`, then a `case` in `getChatModel()`:
   ```typescript
   case "mistral":
     return new ChatMistralAI({ model: config.model, apiKey: process.env.MISTRAL_API_KEY, temperature, maxRetries });
   ```
3. Add dependency: `@langchain/mistralai`
4. Update env var documentation
5. No agent code changes needed!

---

## Security Considerations

- **Database:** Prisma prevents SQL injection via parameterized queries
- **Tools:** dbQueryTool uses only allowlisted entity/field combinations
- **API:** Zod validation on all request bodies
- **LLM:** Model temperature fixed at 0.7 (deterministic enough, not too rigid)
- **Secrets:** API keys in environment, never committed
- **Stage 08:** Will add rate limiting, input sanitization, auth

---

## Performance Notes

- Redis for hot path (recent turns) → O(1) access
- ChromaDB for semantic search → O(log n) approximate nearest neighbors
- Postgres indexes on projectId, status → fast query filtering
- Checkpointer saves graph state per turn → resumable if process dies
- No in-memory caching of full projects (stateless API)

---

## References

- LangGraph Docs: https://langchain-ai.github.io/langgraph/
- LangChain.js: https://js.langchain.com/
- Prisma: https://www.prisma.io/
- Fastify: https://www.fastify.io/
