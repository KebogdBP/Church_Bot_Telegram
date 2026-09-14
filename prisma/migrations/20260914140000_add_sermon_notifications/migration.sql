CREATE TABLE "SermonNotification" (
  "id" TEXT NOT NULL,
  "sermonId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "targetChatId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "ReminderDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SermonNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SermonNotification_sermonId_kind_key" ON "SermonNotification"("sermonId", "kind");
CREATE INDEX "SermonNotification_status_availableAt_idx" ON "SermonNotification"("status", "availableAt");
ALTER TABLE "SermonNotification" ADD CONSTRAINT "SermonNotification_sermonId_fkey" FOREIGN KEY ("sermonId") REFERENCES "Sermon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
