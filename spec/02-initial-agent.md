In packages/agents/src/memory/, implement the Memory module:
- Short-term memory: per-project conversation buffer, backed by Redis (ioredis client), holding the last N turns for a project (used for immediate agent context).
- Long-term memory: persisted to Postgres (ConversationTurn, via packages/db) plus a vector store (ChromaDB, via the chromadb JS client) for semantic retrieval — e.g. "has the client already answered anything about payments?" should be answerable via similarity search, not just recency.

Build:
- memory-manager.ts — a MemoryManager class with:
    - addTurn(projectId, role, text, metadata) -> writes to Redis buffer + Postgres + embeds into Chroma
    - getRecent(projectId, n) -> reads Redis buffer
    - semanticSearch(projectId, query, k) -> queries Chroma scoped to that projectId
    - getFullHistory(projectId) -> Postgres fallback
- embeddings.ts — wraps an embedding call (OpenAI text-embedding-3-small, provider configurable via MODEL_PROVIDER) used to embed turns into Chroma.

Every agent node built later calls MemoryManager instead of touching Redis/Chroma/Postgres directly — this is the "every agent has access to memory" layer from our architecture diagram.

Write a Vitest test that adds several turns for a fake project, then confirms both recency retrieval and semantic retrieval work.