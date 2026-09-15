CREATE TABLE "AssistantConversationTurn" (
    "id" TEXT NOT NULL,
    "churchGroupId" TEXT NOT NULL,
    "userHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contentEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantConversationTurn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssistantConversationTurn_churchGroupId_userHash_createdAt_idx" ON "AssistantConversationTurn"("churchGroupId", "userHash", "createdAt");
CREATE INDEX "AssistantConversationTurn_expiresAt_idx" ON "AssistantConversationTurn"("expiresAt");
ALTER TABLE "AssistantConversationTurn" ADD CONSTRAINT "AssistantConversationTurn_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
