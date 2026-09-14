import { describe, expect, it, vi } from 'vitest';
import { AuditService, type AuditRepository } from '../src/audit/audit-service.js';

describe('AuditService', () => {
  it('records only explicit safe metadata and caps activity queries', async () => {
    const repository: AuditRepository = { record: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue([]), failureSummary: vi.fn().mockResolvedValue({ reminders: 2 }) };
    const service = new AuditService(repository);

    await service.record('group-1', 'admin-1', 'announcement.approved', 'announcement', 'item-1', { scheduled: true });
    await service.list('group-1', 500);

    expect(repository.record).toHaveBeenCalledWith({ chatId: 'group-1', actorUserId: 'admin-1', action: 'announcement.approved', entityType: 'announcement', entityId: 'item-1', metadata: { scheduled: true } });
    expect(repository.list).toHaveBeenCalledWith('group-1', 50);
    await expect(service.failureSummary('group-1')).resolves.toEqual({ reminders: 2 });
  });
});
