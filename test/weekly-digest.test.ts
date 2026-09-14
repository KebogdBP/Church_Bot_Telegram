import { describe, expect, it, vi } from 'vitest';
import type { MessageSender } from '../src/messaging/message-sender.js';
import type { DueWeeklyDigest, WeeklyDigestRepository } from '../src/digests/weekly-digest.js';
import { WeeklyDigestService } from '../src/digests/weekly-digest-service.js';
import { WeeklyDigestWorker } from '../src/digests/weekly-digest-worker.js';

function repository(): WeeklyDigestRepository {
  return {
    configure: vi.fn().mockResolvedValue(undefined),
    createOrRefreshDraft: vi.fn().mockResolvedValue({ id: 'digest-1', content: 'Дайджест', status: 'draft' }),
    findCurrent: vi.fn().mockResolvedValue(null), approve: vi.fn().mockResolvedValue(true),
    planAutomaticDrafts: vi.fn().mockResolvedValue(1), recoverStale: vi.fn().mockResolvedValue(0),
    claimDue: vi.fn().mockResolvedValue([]), markSent: vi.fn().mockResolvedValue(undefined), markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

describe('weekly digest', () => {
  it('requires an explicit service approval', async () => {
    const repo = repository();
    const now = new Date('2026-09-14T12:00:00Z');
    const service = new WeeklyDigestService(repo, () => now);
    await expect(service.preview('-100')).resolves.toMatchObject({ status: 'draft' });
    await expect(service.approve('-100', 'digest-1', '42')).resolves.toBe(true);
    expect(repo.approve).toHaveBeenCalledWith('-100', 'digest-1', '42', now);
  });

  it('delivers only scheduled digests and records completion', async () => {
    const repo = repository();
    const due: DueWeeklyDigest = { id: 'digest-1', chatId: '-100', content: '<b>Дайджест</b>', attempt: 1 };
    vi.mocked(repo.claimDue).mockResolvedValue([due]);
    const sender = { sendMessage: vi.fn<MessageSender['sendMessage']>().mockResolvedValue(undefined) };
    const now = new Date('2026-09-14T12:00:00Z');
    const worker = new WeeklyDigestWorker({ repository: repo, sender, now: () => now, intervalMs: 60_000, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } });

    await worker.tick();

    expect(sender.sendMessage).toHaveBeenCalledWith({ chatId: '-100', text: '<b>Дайджест</b>' });
    expect(repo.markSent).toHaveBeenCalledWith('digest-1', now);
  });
});
