FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/typescript-config packages/typescript-config
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/shared-types packages/shared-types

RUN pnpm --filter @ai-business-analyst/db exec prisma generate --schema prisma/schema.prisma
RUN pnpm --filter @ai-business-analyst/api build

EXPOSE 4000

CMD ["pnpm", "--filter", "@ai-business-analyst/api", "start"]