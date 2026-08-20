In packages/agents/src/tools/, implement the Tools module. Per our architecture, NOT every agent gets every tool — tools are assigned per-agent based on their task.

Build these as LangChain.js-compatible DynamicStructuredTool instances, each with a Zod input schema:
1. dbQueryTool — read-only, parameterized query against Project/Requirement/Gap/Risk via packages/db (no raw SQL from the LLM — build a small safe query interface instead).
2. webSearchTool — wraps a search API; make the provider swappable via an interface, stub with a mock implementation for now, real provider wired later.
3. fileReaderTool — extracts text from an uploaded PDF/TXT/CSV so the client can upload existing docs (e.g. an old requirements doc) for the agents to reference.
4. documentWriterTool — writes/updates a DocumentArtifact row for a project.

Add a ToolRegistry (tool-registry.ts) mapping agentName -> allowed tools:
- Interview Agent: none (pure conversation)
- Domain Agent: webSearchTool
- Research Agent: webSearchTool, fileReaderTool
- Requirement Extraction: dbQueryTool
- Gap Analysis Agent: dbQueryTool
- Risk Analysis Agent: dbQueryTool, webSearchTool
- Documentation Agent: dbQueryTool, documentWriterTool
- Review Agent: dbQueryTool, documentWriterTool