import type { SermonContent } from '../ai/sermon-content-provider.js';

export interface SermonForContentGeneration { id: string; transcript: string; attempts: number }

export interface ContentGenerationRepository {
  recoverStale(now: Date, staleBefore: Date): Promise<number>;
  claimNext(now: Date): Promise<SermonForContentGeneration | null>;
  markCompleted(sermonId: string, content: SermonContent, model: string, now: Date): Promise<void>;
  markFailed(sermonId: string, error: string, retryAt: Date): Promise<void>;
}
