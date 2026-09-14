CREATE TABLE "AdminFlow" (
  "id" TEXT NOT NULL,
  "churchGroupId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminFlow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminFlow_churchGroupId_telegramUserId_key" ON "AdminFlow"("churchGroupId", "telegramUserId");
CREATE INDEX "AdminFlow_expiresAt_idx" ON "AdminFlow"("expiresAt");
ALTER TABLE "AdminFlow" ADD CONSTRAINT "AdminFlow_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
