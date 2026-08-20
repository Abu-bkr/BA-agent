import { beforeAll, afterAll, beforeEach } from "vitest";
import prisma from "@ai-business-analyst/db";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5433/ai_business_analyst_test";

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.reviewNote.deleteMany();
  await prisma.documentArtifact.deleteMany();
  await prisma.risk.deleteMany();
  await prisma.gap.deleteMany();
  await prisma.requirement.deleteMany();
  await prisma.conversationTurn.deleteMany();
  await prisma.project.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});