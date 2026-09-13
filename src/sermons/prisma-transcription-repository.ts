import { PrismaClient, SermonStatus, TranscriptionStatus } from '@prisma/client';
import type { SermonForTranscription, TranscriptionRepository } from './transcription.js';

export class PrismaTranscriptionRepository implements TranscriptionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async recoverStale(now: Date, staleBefore: Date): Promise<number> {
    const result = await this.prisma.sermon.updateMany({
      where: {
        status: SermonStatus.STORED,
        transcriptionStatus: TranscriptionStatus.PROCESSING,
        updatedAt: { lte: staleBefore },
      },
      data: {
        transcriptionStatus: TranscriptionStatus.FAILED,
        transcriptionAvailableAt: now,
        transcriptionError: 'Recovered after an interrupted transcription',
      },
    });
    return result.count;
  }

  public async claimNext(now: Date): Promise<SermonForTranscription | null> {
    const candidate = await this.prisma.sermon.findFirst({
      where: {
        status: SermonStatus.STORED,
        storedPath: { not: null },
        transcriptionStatus: { in: [TranscriptionStatus.PENDING, TranscriptionStatus.FAILED] },
        transcriptionAvailableAt: { lte: now },
        transcriptionAttempts: { lt: 5 },
      },
      orderBy: { transcriptionAvailableAt: 'asc' },
    });
    if (!candidate?.storedPath) return null;

    const claimed = await this.prisma.sermon.updateMany({
      where: {
        id: candidate.id,
        transcriptionStatus: candidate.transcriptionStatus,
        transcriptionAttempts: candidate.transcriptionAttempts,
      },
      data: {
        transcriptionStatus: TranscriptionStatus.PROCESSING,
        transcriptionAttempts: { increment: 1 },
        transcriptionError: null,
      },
    });
    if (claimed.count !== 1) return null;
    return {
      id: candidate.id,
      storedPath: candidate.storedPath,
      ...(candidate.fileName === null ? {} : { fileName: candidate.fileName }),
      ...(candidate.mimeType === null ? {} : { mimeType: candidate.mimeType }),
      attempts: candidate.transcriptionAttempts + 1,
    };
  }

  public async markCompleted(sermonId: string, transcript: string, model: string, now: Date): Promise<void> {
    await this.prisma.sermon.update({
      where: { id: sermonId },
      data: {
        transcriptionStatus: TranscriptionStatus.COMPLETED,
        transcript,
        transcriptionModel: model,
        transcribedAt: now,
        transcriptionError: null,
      },
    });
  }

  public async markFailed(sermonId: string, error: string, retryAt: Date): Promise<void> {
    await this.prisma.sermon.update({
      where: { id: sermonId },
      data: {
        transcriptionStatus: TranscriptionStatus.FAILED,
        transcriptionAvailableAt: retryAt,
        transcriptionError: error.slice(0, 2_000),
      },
    });
  }
}
