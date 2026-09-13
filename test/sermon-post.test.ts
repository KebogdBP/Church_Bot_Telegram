import { describe, expect, it, vi } from 'vitest';
import type { SermonPostRepository } from '../src/sermons/sermon-post.js';
import { SermonPostService } from '../src/sermons/sermon-post-service.js';
import { SermonPostWorker } from '../src/sermons/sermon-post-worker.js';

function repository(): SermonPostRepository {
  return {
    listDrafts: vi.fn().mockResolvedValue([]), findForReview: vi.fn().mockResolvedValue(null),
    approveSeries: vi.fn().mockResolvedValue(3), recoverStale: vi.fn().mockResolvedValue(0),
    claimDue: vi.fn().mockResolvedValue([]), markSent: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

describe('sermon post review and delivery', () => {
  it('passes administrator approval time to the repository', async () => {
    const repo = repository();
    const now = new Date('2026-09-13T17:00:00Z');
    const service = new SermonPostService(repo, () => now);
    await expect(service.approve('-100', 'post-1', '42')).resolves.toBe(3);
    expect(repo.approveSeries).toHaveBeenCalledWith('-100', 'post-1', '42', now);
  });

  it('escapes and sends an approved due post', async () => {
    const repo = repository();
    vi.mocked(repo.claimDue).mockResolvedValue([{ id: 'p1', chatId: '-100', content: 'Вера < надежды & любви', attempt: 1 }]);
    const sender = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const now = new Date('2026-09-13T17:00:00Z');
    const worker = new SermonPostWorker({ repository: repo, sender, now: () => now, intervalMs: 30_000, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } });

    await worker.tick();

    expect(sender.sendMessage).toHaveBeenCalledWith({ chatId: '-100', text: 'Вера &lt; надежды &amp; любви' });
    expect(repo.markSent).toHaveBeenCalledWith('p1', now);
  });
});
