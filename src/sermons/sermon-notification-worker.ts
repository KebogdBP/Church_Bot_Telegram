import type { FastifyBaseLogger } from 'fastify';
import type { MessageSender } from '../messaging/message-sender.js';
import type { SermonNotificationRepository } from './sermon-notification.js';

export class SermonNotificationWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  public constructor(private readonly options: { repository: SermonNotificationRepository; sender: MessageSender; logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>; intervalMs: number; now?: () => Date }) {}
  public start(): void { if (this.timer) return; void this.tick(); this.timer = setInterval(() => void this.tick(), this.options.intervalMs); this.timer.unref(); }
  public stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  public async tick(): Promise<void> {
    if (this.running) return; this.running = true; const now = this.options.now?.() ?? new Date();
    try {
      await this.options.repository.recoverStale(now, new Date(now.getTime() - 10 * 60_000));
      await this.options.repository.planMilestones(now);
      for (const item of await this.options.repository.claimDue(now, 20)) {
        try { await this.options.sender.sendMessage({ chatId: item.targetChatId, text: item.message, notify: false }); await this.options.repository.markSent(item.id, now); }
        catch (error) { const message = error instanceof Error ? error.message : String(error); const delay = Math.min(2 ** Math.max(0, item.attempts - 1) * 60_000, 60 * 60_000); await this.options.repository.markFailed(item.id, message, new Date(now.getTime() + delay)); }
      }
    } catch (error) { this.options.logger.error({ error }, 'Sermon notification worker tick failed'); }
    finally { this.running = false; }
  }
}
