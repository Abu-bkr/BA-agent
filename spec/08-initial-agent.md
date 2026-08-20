Add production-readiness on top of the working system:

1. Basic auth: JWT-based login/signup on apps/api (users table via Prisma, hashed passwords via argon2 or bcrypt), protect all /api/projects routes, scope projects to the logged-in user. Use httpOnly cookies for the session token, consumed by apps/web via Next.js middleware for route protection.
2. Rate limiting on the /turn endpoint (it's the expensive LLM-calling one) — @fastify/rate-limit backed by Redis.
3. Input validation/guardrails: sanitize free-text client input (Zod + a length/charset check) before it reaches any tool that touches the DB or filesystem; cap conversation length per project to prevent runaway loops.
4. Error handling: agent/LLM failures should degrade gracefully (return a clear "please rephrase" rather than a 500) and never leave the LangGraph checkpoint in a broken state.
5. docker-compose.prod.yml with proper env separation, and a short deployment README (required env vars, how to run Prisma migrations on deploy, how Turborepo's remote caching can speed up CI).

Don't add new features here — only harden what already exists from Stages 0-7.