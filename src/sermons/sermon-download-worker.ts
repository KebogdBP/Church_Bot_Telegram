import type { FastifyBaseLogger } from 'fastify';
import type { TelegramFileClient } from '../telegram/telegram-api-client.js';
import type { AudioStorage } from './audio-storage.js';
import type { SermonRepository } from './sermon.js';

const STALE_AFTER_MS = 10 * 60_000;

export interface SermonDownloadWorkerOptions {
  repository: SermonRepository;
  telegram: TelegramFileClient;
  storage: AudioStorage;
  logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  intervalMs: number;
  maxFileSizeBytes: number;
  now?: () => Date;
}

export class SermonDownloadWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(private readonly options: SermonDownloadWorkerOptions) {}

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
      const recovered = await this.options.repository.recoverStale(
        now,
        new Date(now.getTime() - STALE_AFTER_MS),
      );
      if (recovered > 0) this.options.logger.warn({ recovered }, 'Recovered stale sermon downloads');

      const sermon = await this.options.repository.claimNext(now);
      if (!sermon) return;
      if (sermon.fileSize !== undefined && sermon.fileSize > this.options.maxFileSizeBytes) {
        await this.options.repository.markTooLarge(sermon.id, sermon.fileSize);
        return;
      }

      try {
        const file = await this.options.telegram.getFile(sermon.telegramFileId);
        const actualSize = file.fileSize ?? sermon.fileSize;
        if (actualSize !== undefined && actualSize > this.options.maxFileSizeBytes) {
          await this.options.repository.markTooLarge(sermon.id, actualSize);
          return;
        }
        const bytes = await this.options.telegram.downloadFile(file.filePath);
        if (bytes.byteLength > this.options.maxFileSizeBytes) {
          await this.options.repository.markTooLarge(sermon.id, bytes.byteLength);
          return;
        }
        const storedPath = await this.options.storage.save(
          sermon.id,
          sermon.fileName ?? file.filePath,
          bytes,
        );
        await this.options.repository.markStored(sermon.id, file.filePath, storedPath);
        this.options.logger.info({ sermonId: sermon.id, storedPath }, 'Sermon audio stored');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryDelayMs = Math.min(2 ** Math.max(0, sermon.attempts - 1) * 60_000, 30 * 60_000);
        const retryAt = new Date(now.getTime() + retryDelayMs);
        await this.options.repository.markFailed(sermon.id, message, retryAt);
        this.options.logger.error({ sermonId: sermon.id, error: message }, 'Sermon download failed');
      }
    } catch (error) {
      this.options.logger.error({ error }, 'Sermon download worker tick failed');
    } finally {
      this.running = false;
    }
  }
}
