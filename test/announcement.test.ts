import { describe, expect, it, vi } from 'vitest';
import type { MessageSender } from '../src/messaging/message-sender.js';
import type { AnnouncementRepository } from '../src/announcements/announcement.js';
import { AnnouncementService } from '../src/announcements/announcement-service.js';
import { AnnouncementWorker } from '../src/announcements/announcement-worker.js';

function repository(): AnnouncementRepository {
  return { create: vi.fn(), find: vi.fn(), listDrafts: vi.fn(), edit: vi.fn(), reject: vi.fn(), approve: vi.fn().mockResolvedValue(true), recoverStale: vi.fn().mockResolvedValue(0), claimDue: vi.fn().mockResolvedValue([]), markSent: vi.fn(), markFailed: vi.fn() };
}

describe('announcements', () => {
  it('converts a local approval schedule to UTC', async () => {
    const repo = repository();
    const now = new Date('2026-09-14T12:00:00Z');
    const service = new AnnouncementService(repo, 'Europe/Moscow', () => now);
    await expect(service.approve('-100', 'a1', '42', '2026-09-15 18:00')).resolves.toBe(true);
    expect(repo.approve).toHaveBeenCalledWith('-100', 'a1', '42', new Date('2026-09-15T15:00:00Z'), now);
    await expect(service.approve('-100', 'a1', '42', '2020-01-01 10:00')).resolves.toBe(false);
  });

  it('escapes and delivers only a claimed approved announcement', async () => {
    const repo = repository();
    vi.mocked(repo.claimDue).mockResolvedValue([{ id: 'a1', chatId: '-100', content: 'Служение <вместе>', attempt: 1 }]);
    const sender = { sendMessage: vi.fn<MessageSender['sendMessage']>().mockResolvedValue(undefined) };
    const now = new Date('2026-09-14T12:00:00Z');
    await new AnnouncementWorker({ repository: repo, sender, now: () => now, intervalMs: 15_000, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }).tick();
    expect(sender.sendMessage).toHaveBeenCalledWith({ chatId: '-100', text: 'Служение &lt;вместе&gt;' });
    expect(repo.markSent).toHaveBeenCalledWith('a1', now);
  });
});
