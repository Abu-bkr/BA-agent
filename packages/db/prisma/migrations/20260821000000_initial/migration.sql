-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('intake', 'interviewing', 'requirement_extraction', 'gap_analysis', 'risk_analysis', 'documentation', 'review', 'completed');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('agent', 'client');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('functional', 'non_functional', 'business_rule');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('draft', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('technical', 'business', 'timeline', 'budget');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('BRD', 'SRS', 'user_stories', 'summary');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "businessDomain" TEXT NOT NULL,
    "rawIdeaText" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'intake',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTurn" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "ConversationRole" NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "agentSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "RequirementType" NOT NULL,
    "text" TEXT NOT NULL,
    "sourceTurnId" TEXT,
    "status" "RequirementStatus" NOT NULL DEFAULT 'draft',

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gap" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolutionText" TEXT,

    CONSTRAINT "Gap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "mitigation" TEXT,
    "category" "RiskCategory" NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentArtifact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewNote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "artifactId" TEXT,
    "issue" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");

-- CreateIndex
CREATE INDEX "ConversationTurn_projectId_idx" ON "ConversationTurn"("projectId");

-- CreateIndex
CREATE INDEX "ConversationTurn_createdAt_idx" ON "ConversationTurn"("createdAt");

-- CreateIndex
CREATE INDEX "Requirement_projectId_idx" ON "Requirement"("projectId");

-- CreateIndex
CREATE INDEX "Requirement_sourceTurnId_idx" ON "Requirement"("sourceTurnId");

-- CreateIndex
CREATE INDEX "Requirement_status_idx" ON "Requirement"("status");

-- CreateIndex
CREATE INDEX "Gap_projectId_idx" ON "Gap"("projectId");

-- CreateIndex
CREATE INDEX "Gap_resolved_idx" ON "Gap"("resolved");

-- CreateIndex
CREATE INDEX "Risk_projectId_idx" ON "Risk"("projectId");

-- CreateIndex
CREATE INDEX "Risk_severity_idx" ON "Risk"("severity");

-- CreateIndex
CREATE INDEX "Risk_category_idx" ON "Risk"("category");

-- CreateIndex
CREATE INDEX "DocumentArtifact_projectId_idx" ON "DocumentArtifact"("projectId");

-- CreateIndex
CREATE INDEX "DocumentArtifact_type_idx" ON "DocumentArtifact"("type");

-- CreateIndex
CREATE INDEX "ReviewNote_projectId_idx" ON "ReviewNote"("projectId");

-- CreateIndex
CREATE INDEX "ReviewNote_artifactId_idx" ON "ReviewNote"("artifactId");

-- CreateIndex
CREATE INDEX "ReviewNote_resolved_idx" ON "ReviewNote"("resolved");

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_sourceTurnId_fkey" FOREIGN KEY ("sourceTurnId") REFERENCES "ConversationTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gap" ADD CONSTRAINT "Gap_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "DocumentArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

