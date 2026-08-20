Build apps/web (Next.js App Router, TypeScript, Tailwind), consuming the Zod-inferred types from packages/shared-types for full end-to-end type safety on API calls:

1. Project intake page: client enters business name/domain and a free-text description of what they want ("I want an app for my clothing business"). Submits to POST /api/projects.

2. Chat interview page: shows the running conversation (agent question <-> client answer), calls POST /api/projects/:id/turn on each client reply, renders the agent's next question. Show a subtle stage indicator (Interviewing -> Extracting -> Analyzing Gaps -> Analyzing Risks -> Documenting -> Reviewing -> Done) driven by project.status.

3. Dashboard page: once a project reaches `completed`, show tabs for Requirements / Gaps / Risks / Documents. Documents tab renders the Markdown (BRD/SRS/User Stories) with a download-as-.md button per artifact.

4. Project list/history page so a user can resume or revisit past projects.

Use TanStack Query for API calls (with the shared Zod types for response validation), keep state management simple (no Redux). Match a clean, professional B2B-tool aesthetic — this is a business analyst product, not a consumer app.