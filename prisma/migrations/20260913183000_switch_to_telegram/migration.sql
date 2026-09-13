ALTER TABLE "ChurchGroup" RENAME COLUMN "maxChatId" TO "telegramChatId";
ALTER INDEX "ChurchGroup_maxChatId_key" RENAME TO "ChurchGroup_telegramChatId_key";
ALTER TABLE "Event" RENAME COLUMN "createdByMaxUserId" TO "createdByTelegramUserId";
