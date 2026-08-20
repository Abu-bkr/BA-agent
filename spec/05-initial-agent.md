Flesh out the Documentation Agent and Review Agent from Stage 4 — these produce what the client actually pays for.

Documentation Agent:
- Given all Requirements, Gaps (resolved), and Risks for a project, generate three DocumentArtifacts: a BRD (Business Requirements Document), an SRS (Software Requirements Specification), and User Stories (standard "As a [role], I want [goal], so that [benefit]" format with acceptance criteria).
- Output well-structured Markdown for each, stored via documentWriterTool.
- Use LangChain's PromptTemplate, defined in packages/agents/src/prompts/documentation-prompts.ts — don't inline giant prompt strings in the node function.

Review Agent:
- Cross-checks the generated documents against the original Requirements/Risks/Gaps for consistency (e.g. does every requirement appear somewhere in the SRS? are high-severity risks called out?).
- Writes ReviewNote entries for anything inconsistent or missing, and flags whether the project can move to `completed` or needs another documentation pass.
- Implement one automatic revision loop: if Review finds issues, route back to Documentation Agent once with the review notes as extra context, then stop (cap at 1 auto-revision — don't loop indefinitely; surface anything still unresolved to a human).

In apps/api, add GET /api/projects/:id/documents (list all artifacts + versions) and GET /api/projects/:id/documents/:docId (fetch one, with content).