import { describe, expect, it, vi } from 'vitest';
import type { MessageSender } from '../src/messaging/message-sender.js';
import type { DueSermonNotification, SermonNotificationRepository } from '../src/sermons/sermon-notification.js';
import { SermonNotificationWorker } from '../src/sermons/sermon-notification-worker.js';

class TestRepository implements SermonNotificationRepository {
  public due: DueSermonNotification[] = [{ id: 'notification-1', targetChatId: 'admin-1', message: 'Готово', attempts: 1 }];
  public sent: string[] = [];
  public failure: { id: string; error: string; retryAt: Date } | null = null;
  public planMilestones = vi.fn(async () => 1);
  public recoverStale = vi.fn(async () => 0);
  public async claimDue() { const due = this.due; this.due = []; return due; }
  public async markSent(id: string) { this.sent.push(id); }
  public async markFailed(id: string, error: string, retryAt: Date) { this.failure = { id, error, retryAt }; }
}

function createWorker(repository: TestRepository, sender: MessageSender, now: Date) {
  return new SermonNotificationWorker({
    repository,
    sender,
    now: () => now,
    intervalMs: 15_000,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
  });
}

describe('SermonNotificationWorker', () => {
  it('plans and delivers a milestone notification', async () => {
    const repository = new TestRepository();
    const sendMessage = vi.fn<MessageSender['sendMessage']>().mockResolvedValue(undefined);

    await createWorker(repository, { sendMessage }, new Date('2026-09-14T12:00:00Z')).tick();

    expect(repository.planMilestones).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({ chatId: 'admin-1', text: 'Готово', notify: false });
    expect(repository.sent).toEqual(['notification-1']);
  });

  it('schedules a retry when Telegram delivery fails', async () => {
    const now = new Date('2026-09-14T12:00:00Z');
    const repository = new TestRepository();
    const sendMessage = vi.fn<MessageSender['sendMessage']>().mockRejectedValue(new Error('Telegram unavailable'));

    await createWorker(repository, { sendMessage }, now).tick();

    expect(repository.failure).toEqual({
      id: 'notification-1',
      error: 'Telegram unavailable',
      retryAt: new Date('2026-09-14T12:01:00Z'),
    });
  });
});
