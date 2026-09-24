import { describe, expect, it, vi } from 'vitest';
import type { SermonPostRepository } from '../src/sermons/sermon-post.js';
import { SermonPostService } from '../src/sermons/sermon-post-service.js';
import { parseGeneratedPost, SermonPostWorker } from '../src/sermons/sermon-post-worker.js';
import { followUpSchedule } from '../src/sermons/prisma-sermon-post-repository.js';

function repository(): SermonPostRepository {
  return {
    listDrafts: vi.fn().mockResolvedValue([]), findForReview: vi.fn().mockResolvedValue(null),
    approveSeries: vi.fn().mockResolvedValue(3), recoverStale: vi.fn().mockResolvedValue(0),
    editDraft: vi.fn().mockResolvedValue(true), rejectDraft: vi.fn().mockResolvedValue(true),
    regenerate: vi.fn().mockResolvedValue(true),
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

  it('schedules three thoughts per day from the next local day', () => {
    expect(followUpSchedule(new Date('2026-09-20T17:00:00Z'), 'Europe/Moscow', 5)).toEqual([
      new Date('2026-09-21T06:00:00Z'), new Date('2026-09-21T11:00:00Z'), new Date('2026-09-21T16:00:00Z'),
      new Date('2026-09-22T06:00:00Z'), new Date('2026-09-22T11:00:00Z'),
    ]);
  });

  it('does not schedule two sermons into the same group slot', () => {
    expect(followUpSchedule(new Date('2026-09-20T17:00:00Z'), 'Europe/Moscow', 2, [new Date('2026-09-21T06:00:00Z')])).toEqual([
      new Date('2026-09-21T11:00:00Z'), new Date('2026-09-21T16:00:00Z'),
    ]);
  });

  it('records moderation operations through the repository', async () => {
    const repo = repository();
    const now = new Date('2026-09-13T17:00:00Z');
    const service = new SermonPostService(repo, () => now);

    await expect(service.edit('-100', 'post-1', 'Исправленный текст', '42')).resolves.toBe(true);
    await expect(service.reject('-100', 'post-2', '42')).resolves.toBe(true);
    await expect(service.regenerate('-100', 'sermon-1', '42')).resolves.toBe(true);
    expect(repo.editDraft).toHaveBeenCalledWith('-100', 'post-1', 'Исправленный текст', '42', now);
    expect(repo.rejectDraft).toHaveBeenCalledWith('-100', 'post-2', '42', now);
    expect(repo.regenerate).toHaveBeenCalledWith('-100', 'sermon-1', '42', now);
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

  it('separates the hidden image prompt from the public caption', () => {
    expect(parseGeneratedPost('Мысль\n\nПрактика\n\nИзображение: тёплый рассвет без текста')).toEqual({ caption: 'Мысль\n\nПрактика', imagePrompt: 'тёплый рассвет без текста' });
  });

  it('generates and sends a photo above the complete thought', async () => {
    const repo = repository();
    vi.mocked(repo.claimDue).mockResolvedValue([{ id: 'p2', chatId: '-100', content: '<b>Мысль из проповеди</b>\n\nЗаконченная мысль.\n\n<b>Практика на сегодня</b>\nСделать шаг.\n\nИзображение: рассвет без текста', attempt: 1 }]);
    const sendPhoto = vi.fn().mockResolvedValue(undefined);
    const imageProvider = { generate: vi.fn().mockResolvedValue({ bytes: new Uint8Array([1, 2]), mimeType: 'image/jpeg' }) };
    const worker = new SermonPostWorker({ repository: repo, sender: { sendMessage: vi.fn(), sendPhoto }, imageProvider: imageProvider as never, now: () => new Date('2026-09-13T17:00:00Z'), intervalMs: 30_000, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
    await worker.tick();
    expect(imageProvider.generate).toHaveBeenCalledWith('рассвет без текста');
    expect(sendPhoto).toHaveBeenCalledWith(expect.objectContaining({ chatId: '-100', caption: expect.not.stringContaining('Изображение:') }));
  });
});
