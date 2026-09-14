CREATE TYPE "PrayerVisibility" AS ENUM ('LEADERS_ONLY', 'ANONYMOUS_SHARE');
CREATE TYPE "PrayerRequestStatus" AS ENUM ('SUBMITTED', 'ACKNOWLEDGED', 'PUBLIC_SCHEDULED', 'PUBLIC_PROCESSING', 'PUBLISHED', 'FAILED', 'ARCHIVED');
CREATE TABLE "PrayerRequest" (
  "id" TEXT NOT NULL, "churchGroupId" TEXT NOT NULL, "submitterUserId" TEXT NOT NULL, "text" TEXT NOT NULL,
  "visibility" "PrayerVisibility" NOT NULL, "status" "PrayerRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "anonymousPublicDraft" TEXT, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "attempts" INTEGER NOT NULL DEFAULT 0,
  "acknowledgedByUserId" TEXT, "acknowledgedAt" TIMESTAMP(3), "approvedByUserId" TEXT, "approvedAt" TIMESTAMP(3),
  "archivedByUserId" TEXT, "archivedAt" TIMESTAMP(3), "publishedAt" TIMESTAMP(3), "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrayerRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrayerRequest_churchGroupId_status_createdAt_idx" ON "PrayerRequest"("churchGroupId", "status", "createdAt");
CREATE INDEX "PrayerRequest_status_availableAt_idx" ON "PrayerRequest"("status", "availableAt");
ALTER TABLE "PrayerRequest" ADD CONSTRAINT "PrayerRequest_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
