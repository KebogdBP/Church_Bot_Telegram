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
  private offset: number | undefined;

  public constructor(private readonly options: TelegramPollingWorkerOptions) {}

  public async start(): Promise<void> {
    if (this.timer) return;
    await this.options.client.deleteWebhook();
    this.options.logger.info('Telegram polling started');
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
