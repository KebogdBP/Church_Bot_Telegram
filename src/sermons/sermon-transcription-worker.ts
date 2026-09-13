import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { TranscriptionProvider } from '../ai/transcription-provider.js';
import type { TranscriptionRepository } from './transcription.js';

const STALE_AFTER_MS = 30 * 60_000;

export interface SermonTranscriptionWorkerOptions {
  repository: TranscriptionRepository;
  provider: TranscriptionProvider;
  logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  intervalMs: number;
  now?: () => Date;
  readAudio?: (path: string) => Promise<Uint8Array>;
}

export class SermonTranscriptionWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(private readonly options: SermonTranscriptionWorkerOptions) {}

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
      if (recovered > 0) this.options.logger.warn({ recovered }, 'Recovered stale transcriptions');

      const sermon = await this.options.repository.claimNext(now);
      if (!sermon) return;
      try {
        const bytes = await (this.options.readAudio ?? readFile)(sermon.storedPath);
        const result = await this.options.provider.transcribe({
          bytes,
          fileName: sermon.fileName ?? basename(sermon.storedPath),
          ...(sermon.mimeType === undefined ? {} : { mimeType: sermon.mimeType }),
        });
        await this.options.repository.markCompleted(sermon.id, result.text, result.model, now);
        this.options.logger.info({ sermonId: sermon.id, model: result.model }, 'Sermon transcribed');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const delayMs = Math.min(2 ** Math.max(0, sermon.attempts - 1) * 60_000, 30 * 60_000);
        await this.options.repository.markFailed(sermon.id, message, new Date(now.getTime() + delayMs));
        this.options.logger.error({ sermonId: sermon.id, error: message }, 'Sermon transcription failed');
      }
    } catch (error) {
      this.options.logger.error({ error }, 'Sermon transcription worker tick failed');
    } finally {
      this.running = false;
    }
  }
}
