CREATE TYPE "SermonAudioKind" AS ENUM ('AUDIO', 'VOICE', 'DOCUMENT');
CREATE TYPE "SermonStatus" AS ENUM ('RECEIVED', 'DOWNLOADING', 'STORED', 'TOO_LARGE', 'FAILED');

CREATE TABLE "Sermon" (
    "id" TEXT NOT NULL,
    "churchGroupId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "submittedByUserId" TEXT,
    "audioKind" "SermonAudioKind" NOT NULL,
    "telegramFileId" TEXT NOT NULL,
    "telegramFileUniqueId" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" BIGINT,
    "durationSeconds" INTEGER,
    "title" TEXT,
    "performer" TEXT,
    "caption" TEXT,
    "status" "SermonStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "telegramFilePath" TEXT,
    "storedPath" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Sermon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Sermon_churchGroupId_sourceMessageId_key" ON "Sermon"("churchGroupId", "sourceMessageId");
CREATE INDEX "Sermon_status_availableAt_idx" ON "Sermon"("status", "availableAt");
ALTER TABLE "Sermon" ADD CONSTRAINT "Sermon_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
