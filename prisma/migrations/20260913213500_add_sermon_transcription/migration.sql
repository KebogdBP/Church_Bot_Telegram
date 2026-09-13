CREATE TYPE "TranscriptionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "Sermon"
ADD COLUMN "transcriptionStatus" "TranscriptionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "transcriptionAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "transcriptionAvailableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "transcriptionModel" TEXT,
ADD COLUMN "transcript" TEXT,
ADD COLUMN "transcriptionError" TEXT,
ADD COLUMN "transcribedAt" TIMESTAMP(3);

CREATE INDEX "Sermon_status_transcriptionStatus_transcriptionAvailableAt_idx"
ON "Sermon"("status", "transcriptionStatus", "transcriptionAvailableAt");
