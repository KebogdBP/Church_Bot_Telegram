CREATE TABLE "RetentionFileDeletion" (
    "id" TEXT NOT NULL,
    "churchGroupId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RetentionFileDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetentionFileDeletion_path_key" ON "RetentionFileDeletion"("path");
CREATE INDEX "RetentionFileDeletion_churchGroupId_createdAt_idx" ON "RetentionFileDeletion"("churchGroupId", "createdAt");
ALTER TABLE "RetentionFileDeletion" ADD CONSTRAINT "RetentionFileDeletion_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
