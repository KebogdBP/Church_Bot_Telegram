ALTER TABLE "Sermon" ADD COLUMN "storedAt" TIMESTAMP(3);

UPDATE "Sermon"
SET "storedAt" = "updatedAt"
WHERE "storedPath" IS NOT NULL;

CREATE INDEX "Sermon_churchGroupId_storedAt_idx" ON "Sermon"("churchGroupId", "storedAt");
