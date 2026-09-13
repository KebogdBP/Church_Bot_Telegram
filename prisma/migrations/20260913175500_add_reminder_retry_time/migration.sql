ALTER TABLE "ReminderDelivery" ADD COLUMN "availableAt" TIMESTAMP(3);
UPDATE "ReminderDelivery" SET "availableAt" = "scheduledFor" WHERE "availableAt" IS NULL;
ALTER TABLE "ReminderDelivery" ALTER COLUMN "availableAt" SET NOT NULL;

DROP INDEX "ReminderDelivery_status_scheduledFor_idx";
CREATE INDEX "ReminderDelivery_status_availableAt_idx" ON "ReminderDelivery"("status", "availableAt");
