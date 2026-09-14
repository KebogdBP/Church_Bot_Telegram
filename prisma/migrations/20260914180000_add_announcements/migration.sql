CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'REJECTED', 'SCHEDULED', 'PROCESSING', 'SENT', 'FAILED');
CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL,
  "churchGroupId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledFor" TIMESTAMP(3),
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" TEXT NOT NULL,
  "editedByUserId" TEXT,
  "editedAt" TIMESTAMP(3),
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedByUserId" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Announcement_status_availableAt_idx" ON "Announcement"("status", "availableAt");
CREATE INDEX "Announcement_churchGroupId_status_idx" ON "Announcement"("churchGroupId", "status");
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
