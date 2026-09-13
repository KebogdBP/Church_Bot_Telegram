ALTER TABLE "Sermon"
  ALTER COLUMN "audioKind" DROP NOT NULL,
  ALTER COLUMN "telegramFileId" DROP NOT NULL,
  ALTER COLUMN "telegramFileUniqueId" DROP NOT NULL,
  ADD COLUMN "sourceUrl" TEXT;
