import type { FastifyBaseLogger } from 'fastify';
import type { MessageSender } from '../messaging/message-sender.js';
import { escapeHtml } from '../messaging/html.js';
import type { SermonPostRepository } from './sermon-post.js';

export class SermonPostWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  public constructor(private readonly options: { repository: SermonPostRepository; sender: MessageSender; logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>; intervalMs: number; now?: () => Date }) {}
  public start(): void { if (this.timer) return; void this.tick(); this.timer = setInterval(() => void this.tick(), this.options.intervalMs); this.timer.unref(); }
  public stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  public async tick(): Promise<void> {
    if (this.running) return; this.running = true;
    const now = this.options.now?.() ?? new Date();
    try {
      const recovered = await this.options.repository.recoverStale(now, new Date(now.getTime() - 10 * 60_000));
      if (recovered) this.options.logger.warn({ recovered }, 'Recovered stale sermon posts');
      for (const post of await this.options.repository.claimDue(now, 20)) {
        try {
          await this.options.sender.sendMessage({ chatId: post.chatId, text: escapeHtml(post.content) });
          await this.options.repository.markSent(post.id, now);
          this.options.logger.info({ postId: post.id }, 'Sermon follow-up post sent');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const delay = Math.min(2 ** Math.max(0, post.attempt - 1) * 60_000, 60 * 60_000);
          await this.options.repository.markFailed(post.id, message, new Date(now.getTime() + delay));
          this.options.logger.error({ postId: post.id, error: message }, 'Sermon post delivery failed');
        }
      }
    } catch (error) { this.options.logger.error({ error }, 'Sermon post worker tick failed'); }
    finally { this.running = false; }
  }
}
