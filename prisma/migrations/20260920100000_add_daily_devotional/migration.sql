CREATE TYPE "DailyDevotionalStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'SENT', 'FAILED');

ALTER TABLE "ChurchGroup" ADD COLUMN "devotionalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChurchGroup" ADD COLUMN "devotionalLocalTime" TEXT NOT NULL DEFAULT '08:00';

CREATE TABLE "DailyDevotional" (
  "id" TEXT NOT NULL,
  "churchGroupId" TEXT NOT NULL,
  "localDate" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" "DailyDevotionalStatus" NOT NULL DEFAULT 'SCHEDULED',
  "availableAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyDevotional_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyDevotional_churchGroupId_localDate_key" ON "DailyDevotional"("churchGroupId", "localDate");
CREATE INDEX "DailyDevotional_status_availableAt_idx" ON "DailyDevotional"("status", "availableAt");
ALTER TABLE "DailyDevotional" ADD CONSTRAINT "DailyDevotional_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
