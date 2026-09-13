CREATE TYPE "ContentGenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "Sermon"
ADD COLUMN "contentStatus" "ContentGenerationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "contentAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "contentAvailableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "contentModel" TEXT,
ADD COLUMN "summary" TEXT,
ADD COLUMN "keyThoughts" JSONB,
ADD COLUMN "reflectionQuestions" JSONB,
ADD COLUMN "followUpPosts" JSONB,
ADD COLUMN "contentError" TEXT,
ADD COLUMN "contentGeneratedAt" TIMESTAMP(3);

CREATE INDEX "Sermon_transcriptionStatus_contentStatus_contentAvailableAt_idx"
ON "Sermon"("transcriptionStatus", "contentStatus", "contentAvailableAt");
