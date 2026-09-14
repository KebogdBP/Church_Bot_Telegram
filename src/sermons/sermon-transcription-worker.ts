import type { FastifyBaseLogger } from 'fastify';
import type { TranscriptionProvider } from '../ai/transcription-provider.js';
import type { TranscriptionRepository } from './transcription.js';
import type { AudioSegmenter } from './audio-segmenter.js';

const STALE_AFTER_MS = 30 * 60_000;

export interface SermonTranscriptionWorkerOptions {
  repository: TranscriptionRepository;
  provider: TranscriptionProvider;
  logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  intervalMs: number;
  now?: () => Date;
  segmenter: AudioSegmenter;
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
        const segments = await this.options.segmenter.segment(sermon.storedPath);
        const results = [];
        for (const segment of segments) results.push(await this.options.provider.transcribe(segment));
        const transcript = results.map((result) => result.text.trim()).filter(Boolean).join('\n\n');
        if (!transcript) throw new Error('Transcription produced no text');
        const model = results[0]?.model ?? 'unknown';
        await this.options.repository.markCompleted(sermon.id, transcript, model, now);
        this.options.logger.info({ sermonId: sermon.id, model, segments: segments.length }, 'Sermon transcribed');
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
