CREATE TYPE "SermonPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "SermonPost" (
  "id" TEXT NOT NULL,
  "sermonId" TEXT NOT NULL,
  "churchGroupId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "status" "SermonPostStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledFor" TIMESTAMP(3),
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "telegramMessageId" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SermonPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SermonPost_sermonId_sequence_key" ON "SermonPost"("sermonId", "sequence");
CREATE INDEX "SermonPost_status_availableAt_idx" ON "SermonPost"("status", "availableAt");
CREATE INDEX "SermonPost_churchGroupId_status_idx" ON "SermonPost"("churchGroupId", "status");
ALTER TABLE "SermonPost" ADD CONSTRAINT "SermonPost_sermonId_fkey" FOREIGN KEY ("sermonId") REFERENCES "Sermon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SermonPost" ADD CONSTRAINT "SermonPost_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
