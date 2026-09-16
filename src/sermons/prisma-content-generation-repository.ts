import { ContentGenerationStatus, PrismaClient, SermonPurpose, TranscriptionStatus } from '@prisma/client';
import type { SermonContent } from '../ai/sermon-content-provider.js';
import type { ContentGenerationRepository, SermonForContentGeneration } from './content-generation.js';

export class PrismaContentGenerationRepository implements ContentGenerationRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async recoverStale(now: Date, staleBefore: Date): Promise<number> {
    const result = await this.prisma.sermon.updateMany({
      where: { contentStatus: ContentGenerationStatus.PROCESSING, updatedAt: { lte: staleBefore } },
      data: { contentStatus: ContentGenerationStatus.FAILED, contentAvailableAt: now, contentError: 'Recovered after interrupted generation' },
    });
    return result.count;
  }

  public async claimNext(now: Date): Promise<SermonForContentGeneration | null> {
    const candidate = await this.prisma.sermon.findFirst({
      where: {
        transcriptionStatus: TranscriptionStatus.COMPLETED,
        purpose: SermonPurpose.CHURCH_SERMON,
        transcript: { not: null },
        contentStatus: { in: [ContentGenerationStatus.PENDING, ContentGenerationStatus.FAILED] },
        contentAvailableAt: { lte: now },
        contentAttempts: { lt: 5 },
      },
      orderBy: { contentAvailableAt: 'asc' },
    });
    if (!candidate?.transcript) return null;
    const claimed = await this.prisma.sermon.updateMany({
      where: { id: candidate.id, contentStatus: candidate.contentStatus, contentAttempts: candidate.contentAttempts },
      data: { contentStatus: ContentGenerationStatus.PROCESSING, contentAttempts: { increment: 1 }, contentError: null },
    });
    return claimed.count === 1
      ? { id: candidate.id, transcript: candidate.transcript, attempts: candidate.contentAttempts + 1 }
      : null;
  }

  public async markCompleted(sermonId: string, content: SermonContent, model: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const sermon = await tx.sermon.update({
        where: { id: sermonId },
        data: {
        contentStatus: ContentGenerationStatus.COMPLETED,
        summary: content.summary,
        outline: content.outline,
        keyThoughts: content.keyThoughts,
        reflectionQuestions: content.reflectionQuestions,
        followUpPosts: content.followUpPosts,
        contentModel: model,
        contentGeneratedAt: now,
        contentError: null,
        },
      });
      await tx.sermonPost.createMany({
        data: content.followUpPosts.map((post, sequence) => ({
          sermonId,
          churchGroupId: sermon.churchGroupId,
          sequence,
          content: post,
        })),
        skipDuplicates: true,
      });
    });
  }

  public async markFailed(sermonId: string, error: string, retryAt: Date): Promise<void> {
    await this.prisma.sermon.update({
      where: { id: sermonId },
      data: { contentStatus: ContentGenerationStatus.FAILED, contentAvailableAt: retryAt, contentError: error.slice(0, 2_000) },
    });
  }
}
