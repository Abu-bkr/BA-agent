In packages/agents/src/graph/, build the multi-agent workflow using LangGraph.js's StateGraph. This is the core of the system.

1. Define a shared AgentState (via Annotation.Root, LangGraph.js's state helper) with: projectId, clientMessage, conversationHistory, extractedRequirements, gaps, risks, currentStage, nextAgent, finalDocuments.

2. Implement each node in its own file (nodes/interview-agent.ts, domain-agent.ts, research-agent.ts, requirement-extraction-agent.ts, gap-analysis-agent.ts, risk-analysis-agent.ts, documentation-agent.ts, review-agent.ts). Each node:
   - Pulls context via MemoryManager (Stage 2)
   - Uses only the tools assigned to it (Stage 3, via ToolRegistry)
   - Calls the LLM through the model-agnostic wrapper (see Stage 6 — don't hardcode a provider SDK here)
   - Writes its output back to state and to the DB (via packages/db)

3. Build a Planner node (nodes/planner.ts) doing workflow orchestration: given the project's current status, decide which of Interview/Domain/Research runs next (they can loop, asking questions until enough info is gathered), then route to Requirement Extraction -> Gap Analysis -> Risk Analysis -> Documentation -> Review, matching this exact flow:

   User -> Planner -> {Interview, Domain, Research} (loop as needed)
        -> Requirement Extraction -> Gap Analysis -> Risk Analysis -> Documentation -> Review -> Final Document

4. Wire it together in graph.ts with StateGraph, conditional edges driven by the Planner's routing decision, and a checkpointer (LangGraph.js's Postgres checkpointer, backed by packages/db's connection) so a project's graph state survives across separate API calls — a real client conversation happens over many HTTP requests, not one long-running process.

5. In apps/api, expose POST /api/projects/:id/turn — takes the client's latest message, resumes the graph from checkpoint (thread_id = projectId), runs until the graph pauses (waiting for the next client answer) or completes a stage, and returns the agent's next question or the stage-completion result.

Write a Vitest integration test simulating a short back-and-forth (3-4 turns) and asserting the graph correctly progresses from interviewing into requirement_extraction.