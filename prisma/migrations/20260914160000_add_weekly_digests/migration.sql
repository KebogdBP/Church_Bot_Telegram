CREATE TYPE "WeeklyDigestStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PROCESSING', 'SENT', 'FAILED');

ALTER TABLE "ChurchGroup"
ADD COLUMN "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "digestWeekday" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "digestLocalTime" TEXT NOT NULL DEFAULT '18:00';

CREATE TABLE "WeeklyDigest" (
  "id" TEXT NOT NULL,
  "churchGroupId" TEXT NOT NULL,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "content" TEXT NOT NULL,
  "status" "WeeklyDigestStatus" NOT NULL DEFAULT 'DRAFT',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyDigest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WeeklyDigest_churchGroupId_weekStart_key" ON "WeeklyDigest"("churchGroupId", "weekStart");
CREATE INDEX "WeeklyDigest_status_availableAt_idx" ON "WeeklyDigest"("status", "availableAt");
ALTER TABLE "WeeklyDigest" ADD CONSTRAINT "WeeklyDigest_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
