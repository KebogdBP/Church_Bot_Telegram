import type { FastifyBaseLogger } from 'fastify';
import { nextReminder } from '../events/reminder-time.js';
import type { MaxMessageSender } from '../max/max-api-client.js';
import type { ReminderRepository } from './reminder.js';
import { renderReminderMessage } from './reminder-message.js';

const CLAIM_LIMIT = 20;
const STALE_AFTER_MS = 10 * 60_000;

export interface ReminderWorkerOptions {
  repository: ReminderRepository;
  sender: MaxMessageSender;
  logger: Pick<FastifyBaseLogger, 'info' | 'error' | 'warn'>;
  intervalMs: number;
  now?: () => Date;
}

export class ReminderWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(private readonly options: ReminderWorkerOptions) {}

  public start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  public async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const now = this.options.now?.() ?? new Date();

    try {
      const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
      const recovered = await this.options.repository.recoverStale(now, staleBefore);
      if (recovered > 0) this.options.logger.warn({ recovered }, 'Recovered stale reminder deliveries');
      const expired = await this.options.repository.expirePast(now);
      if (expired > 0) this.options.logger.warn({ expired }, 'Expired past reminder deliveries');

      const events = await this.options.repository.listEventsForPlanning();
      for (const event of events) {
        const reminder = nextReminder(event, now);
        if (reminder) await this.options.repository.plan(event.id, reminder);
      }

      const due = await this.options.repository.claimDue(now, CLAIM_LIMIT);
      for (const reminder of due) {
        try {
          const text = renderReminderMessage(reminder.event, reminder.occurrenceAt, now);
          await this.options.sender.sendMessage({ chatId: reminder.event.chatId, text });
          await this.options.repository.markSent(reminder.deliveryId, now);
          this.options.logger.info({ deliveryId: reminder.deliveryId }, 'Reminder sent');
        } catch (error) {
          const retryAt = new Date(now.getTime() + retryDelayMs(reminder.attempt));
          const message = error instanceof Error ? error.message : String(error);
          await this.options.repository.markFailed(reminder.deliveryId, message, retryAt);
          this.options.logger.error({ deliveryId: reminder.deliveryId, error: message, retryAt }, 'Reminder delivery failed');
        }
      }
    } catch (error) {
      this.options.logger.error({ error }, 'Reminder worker tick failed');
    } finally {
      this.running = false;
    }
  }
}

function retryDelayMs(attempt: number): number {
  return Math.min(60 * 2 ** Math.max(0, attempt - 1), 3_600) * 1_000;
}
