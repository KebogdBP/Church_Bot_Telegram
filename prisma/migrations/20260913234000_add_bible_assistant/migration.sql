CREATE TYPE "AssistantOutcome" AS ENUM ('ANSWERED', 'ESCALATED', 'FAILED');
ALTER TABLE "ChurchGroup" ADD COLUMN "assistantContext" TEXT;
CREATE TABLE "AssistantInteraction" (
  "id" TEXT NOT NULL,
  "churchGroupId" TEXT NOT NULL,
  "userHash" TEXT NOT NULL,
  "outcome" "AssistantOutcome" NOT NULL,
  "category" TEXT NOT NULL,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantInteraction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantInteraction_churchGroupId_createdAt_idx" ON "AssistantInteraction"("churchGroupId", "createdAt");
ALTER TABLE "AssistantInteraction" ADD CONSTRAINT "AssistantInteraction_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
