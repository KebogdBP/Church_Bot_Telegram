CREATE TABLE "GroupAdmin" (
  "id" TEXT NOT NULL,
  "churchGroupId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "addedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupAdmin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroupAdmin_churchGroupId_telegramUserId_key" ON "GroupAdmin"("churchGroupId", "telegramUserId");
ALTER TABLE "GroupAdmin" ADD CONSTRAINT "GroupAdmin_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
