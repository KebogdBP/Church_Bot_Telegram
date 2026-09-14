CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "churchGroupId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEntry_churchGroupId_createdAt_idx" ON "AuditEntry"("churchGroupId", "createdAt");
CREATE INDEX "AuditEntry_churchGroupId_action_idx" ON "AuditEntry"("churchGroupId", "action");
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_churchGroupId_fkey" FOREIGN KEY ("churchGroupId") REFERENCES "ChurchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
