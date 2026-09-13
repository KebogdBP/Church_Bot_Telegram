export interface SermonForTranscription {
  id: string;
  storedPath: string;
  fileName?: string;
  mimeType?: string;
  attempts: number;
}

export interface TranscriptionRepository {
  recoverStale(now: Date, staleBefore: Date): Promise<number>;
  claimNext(now: Date): Promise<SermonForTranscription | null>;
  markCompleted(sermonId: string, transcript: string, model: string, now: Date): Promise<void>;
  markFailed(sermonId: string, error: string, retryAt: Date): Promise<void>;
}
