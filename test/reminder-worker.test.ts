import { describe, expect, it, vi } from 'vitest';
import type { ChurchEvent } from '../src/events/event.js';
import type { PlannedReminder } from '../src/events/reminder-time.js';
import type { MaxMessageSender } from '../src/max/max-api-client.js';
import type { ClaimedReminder, ReminderRepository } from '../src/reminders/reminder.js';
import { ReminderWorker } from '../src/reminders/reminder-worker.js';

const EVENT: ChurchEvent = {
  id: 'event-1',
  chatId: 'chat-1',
  title: 'Воскресное собрание',
  startsAt: new Date('2026-09-14T09:00:00.000Z'),
  timezone: 'Europe/Moscow',
  recurrence: 'none',
  reminderMinutesBefore: 1_440,
  location: 'Дом молитвы',
  createdByUserId: 'admin-1',
};

class TestReminderRepository implements ReminderRepository {
  public status: 'missing' | 'pending' | 'processing' | 'sent' | 'failed' = 'missing';
  public availableAt = new Date(0);
  public attempts = 0;
  private planData: PlannedReminder | null = null;

  public async listEventsForPlanning() { return [EVENT]; }

  public async plan(_eventId: string, reminder: PlannedReminder) {
    if (this.status !== 'missing') return false;
    this.planData = reminder;
    this.availableAt = reminder.scheduledFor;
    this.status = 'pending';
    return true;
  }

  public async recoverStale() { return 0; }

  public async expirePast() { return 0; }

  public async claimDue(now: Date): Promise<ClaimedReminder[]> {
    if (!this.planData || !['pending', 'failed'].includes(this.status) || this.availableAt > now || EVENT.startsAt <= now) {
      return [];
    }
    this.status = 'processing';
    this.attempts += 1;
    return [{
      deliveryId: 'delivery-1',
      event: EVENT,
      occurrenceAt: this.planData.occurrenceAt,
      attempt: this.attempts,
    }];
  }

  public async markSent() { this.status = 'sent'; }

  public async markFailed(_deliveryId: string, _error: string, retryAt: Date) {
    this.status = 'failed';
    this.availableAt = retryAt;
  }
}

function createWorker(repository: TestReminderRepository, sender: MaxMessageSender, now: () => Date) {
  return new ReminderWorker({
    repository,
    sender,
    now,
    intervalMs: 30_000,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
  });
}

describe('ReminderWorker', () => {
  it('sends a due reminder only once', async () => {
    const repository = new TestReminderRepository();
    const sendMessage = vi.fn<MaxMessageSender['sendMessage']>().mockResolvedValue(undefined);
    const worker = createWorker(repository, { sendMessage }, () => new Date('2026-09-13T09:00:00.000Z'));

    await worker.tick();
    await worker.tick();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      chatId: 'chat-1',
      text: expect.stringContaining('завтра в 12:00'),
    });
    expect(repository.status).toBe('sent');
  });

  it('retries a failed delivery after backoff', async () => {
    let now = new Date('2026-09-13T09:00:00.000Z');
    const repository = new TestReminderRepository();
    const sendMessage = vi.fn<MaxMessageSender['sendMessage']>()
      .mockRejectedValueOnce(new Error('MAX unavailable'))
      .mockResolvedValueOnce(undefined);
    const worker = createWorker(repository, { sendMessage }, () => now);

    await worker.tick();
    await worker.tick();
    expect(sendMessage).toHaveBeenCalledTimes(1);

    now = new Date('2026-09-13T09:01:01.000Z');
    await worker.tick();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(repository.status).toBe('sent');
  });
});
