import type { IncomingSermonAudio } from '../telegram/types.js';

export type SermonStatus = 'received' | 'downloading' | 'stored' | 'too_large' | 'failed';

export interface Sermon {
  id: string;
  chatId: string;
  sourceMessageId: string;
  submittedByUserId?: string;
  kind: IncomingSermonAudio['kind'];
  telegramFileId: string;
  telegramFileUniqueId: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  durationSeconds?: number;
  title?: string;
  performer?: string;
  caption?: string;
  status: SermonStatus;
  attempts: number;
  createdAt: Date;
}

export type CreateSermon = Omit<Sermon, 'id' | 'status' | 'attempts' | 'createdAt'>;

export interface SermonRepository {
  createIfNew(input: CreateSermon, timezone: string): Promise<{ sermon: Sermon; created: boolean }>;
  recoverStale(now: Date, staleBefore: Date): Promise<number>;
  claimNext(now: Date): Promise<Sermon | null>;
  markStored(sermonId: string, telegramFilePath: string, storedPath: string): Promise<void>;
  markTooLarge(sermonId: string, actualSize: number): Promise<void>;
  markFailed(sermonId: string, error: string, retryAt: Date): Promise<void>;
}
