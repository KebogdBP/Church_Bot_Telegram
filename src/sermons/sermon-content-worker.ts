import type { FastifyBaseLogger } from 'fastify';
import type { SermonContentProvider } from '../ai/sermon-content-provider.js';
import type { ContentGenerationRepository } from './content-generation.js';

export class SermonContentWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  public constructor(private readonly options: { repository: ContentGenerationRepository; provider: SermonContentProvider; logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>; intervalMs: number; now?: () => Date }) {}
  public start(): void { if (this.timer) return; void this.tick(); this.timer = setInterval(() => void this.tick(), this.options.intervalMs); this.timer.unref(); }
  public stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  public async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const now = this.options.now?.() ?? new Date();
    try {
      const recovered = await this.options.repository.recoverStale(now, new Date(now.getTime() - 30 * 60_000));
      if (recovered) this.options.logger.warn({ recovered }, 'Recovered stale sermon content jobs');
      const sermon = await this.options.repository.claimNext(now);
      if (!sermon) return;
      try {
        const content = await this.options.provider.generate(sermon.transcript);
        await this.options.repository.markCompleted(sermon.id, content, content.model, now);
        this.options.logger.info({ sermonId: sermon.id, model: content.model }, 'Sermon content generated');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const delay = Math.min(2 ** Math.max(0, sermon.attempts - 1) * 60_000, 30 * 60_000);
        await this.options.repository.markFailed(sermon.id, message, new Date(now.getTime() + delay));
        this.options.logger.error({ sermonId: sermon.id, error: message }, 'Sermon content generation failed');
      }
    } catch (error) { this.options.logger.error({ error }, 'Sermon content worker tick failed'); }
    finally { this.running = false; }
  }
}
