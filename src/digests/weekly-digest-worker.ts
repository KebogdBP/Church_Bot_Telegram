import type { FastifyBaseLogger } from 'fastify';
import type { MessageSender } from '../messaging/message-sender.js';
import type { WeeklyDigestRepository } from './weekly-digest.js';

export class WeeklyDigestWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  public constructor(private readonly options: { repository: WeeklyDigestRepository; sender: MessageSender; logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>; intervalMs: number; now?: () => Date }) {}
  public start(): void { if (this.timer) return; void this.tick(); this.timer = setInterval(() => void this.tick(), this.options.intervalMs); this.timer.unref(); }
  public stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  public async tick(): Promise<void> {
    if (this.running) return; this.running = true; const now = this.options.now?.() ?? new Date();
    try {
      await this.options.repository.recoverStale(now, new Date(now.getTime() - 10 * 60_000));
      await this.options.repository.planAutomaticDrafts(now);
      for (const digest of await this.options.repository.claimDue(now, 10)) {
        try { await this.options.sender.sendMessage({ chatId: digest.chatId, text: digest.content }); await this.options.repository.markSent(digest.id, now); }
        catch (error) { const message = error instanceof Error ? error.message : String(error); const delay = Math.min(2 ** Math.max(0, digest.attempt - 1) * 60_000, 60 * 60_000); await this.options.repository.markFailed(digest.id, message, new Date(now.getTime() + delay)); }
      }
    } catch (error) { this.options.logger.error({ error }, 'Weekly digest worker tick failed'); }
    finally { this.running = false; }
  }
}
