import type { FastifyBaseLogger } from 'fastify';
import type { TelegramPollingClient } from './telegram-api-client.js';
import type { TelegramUpdate } from './types.js';

export interface TelegramPollingWorkerOptions {
  client: TelegramPollingClient;
  handleUpdate: (update: TelegramUpdate) => Promise<void>;
  logger: Pick<FastifyBaseLogger, 'info' | 'error'>;
  intervalMs: number;
}

export class TelegramPollingWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private starting = false;
  private generation = 0;
  private offset: number | undefined;

  public constructor(private readonly options: TelegramPollingWorkerOptions) {}

  public start(): void {
    if (this.timer || this.starting) return;
    this.starting = true;
    const generation = ++this.generation;
    void this.initialize(generation);
  }

  private async initialize(generation: number): Promise<void> {
    try {
      await this.options.client.deleteWebhook();
    } catch (error) {
      // A local Bot API server may close this cleanup request while still serving polling.
      this.options.logger.error({ error }, 'Telegram webhook cleanup failed; continuing with polling');
    }
    this.starting = false;
    if (generation !== this.generation) return;
    this.options.logger.info('Telegram polling started');
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    this.generation += 1;
    this.starting = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  public async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const updates = await this.options.client.getUpdates(this.offset);
      for (const update of updates) {
        await this.options.handleUpdate(update);
        this.offset = update.update_id + 1;
      }
    } catch (error) {
      this.options.logger.error({ error }, 'Telegram polling failed');
    } finally {
      this.running = false;
    }
  }
}
