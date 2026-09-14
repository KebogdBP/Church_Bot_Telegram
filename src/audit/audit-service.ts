export interface AuditRecord {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata: Record<string, string | number | boolean>;
  createdAt: Date;
}

export interface AuditRepository {
  record(input: { chatId: string; actorUserId: string; action: string; entityType: string; entityId?: string; metadata?: Record<string, string | number | boolean> }): Promise<void>;
  list(chatId: string, limit: number): Promise<AuditRecord[]>;
  failureSummary(chatId: string): Promise<Record<string, number>>;
}

export class AuditService {
  public constructor(private readonly repository: AuditRepository) {}

  public record(chatId: string, actorUserId: string, action: string, entityType: string, entityId?: string, metadata?: Record<string, string | number | boolean>) {
    return this.repository.record({ chatId, actorUserId, action, entityType, ...(entityId ? { entityId } : {}), ...(metadata ? { metadata } : {}) });
  }

  public list(chatId: string, limit = 20) {
    return this.repository.list(chatId, Math.min(Math.max(limit, 1), 50));
  }

  public failureSummary(chatId: string) { return this.repository.failureSummary(chatId); }
}
