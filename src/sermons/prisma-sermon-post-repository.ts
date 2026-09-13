import { PrismaClient, SermonPostStatus } from '@prisma/client';
import type { ClaimedSermonPost, SermonPostDraft, SermonPostRepository } from './sermon-post.js';

export class PrismaSermonPostRepository implements SermonPostRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listDrafts(chatId: string): Promise<SermonPostDraft[]> {
    const posts = await this.prisma.sermonPost.findMany({
      where: { churchGroup: { telegramChatId: chatId }, status: SermonPostStatus.DRAFT },
      orderBy: [{ createdAt: 'desc' }, { sequence: 'asc' }], take: 20,
    });
    return posts.map(toDomain);
  }

  public async findForReview(chatId: string, postId: string): Promise<SermonPostDraft | null> {
    const post = await this.prisma.sermonPost.findFirst({ where: { id: postId, churchGroup: { telegramChatId: chatId } } });
    return post ? toDomain(post) : null;
  }

  public async approveSeries(chatId: string, postId: string, userId: string, now: Date): Promise<number> {
    const selected = await this.prisma.sermonPost.findFirst({
      where: { id: postId, churchGroup: { telegramChatId: chatId }, status: SermonPostStatus.DRAFT },
    });
    if (!selected) return 0;
    const drafts = await this.prisma.sermonPost.findMany({
      where: { sermonId: selected.sermonId, status: SermonPostStatus.DRAFT }, orderBy: { sequence: 'asc' },
    });
    await this.prisma.$transaction(drafts.map((post, index) => {
      const scheduledFor = new Date(now.getTime() + (index + 1) * 24 * 60 * 60_000);
      return this.prisma.sermonPost.update({
        where: { id: post.id },
        data: { status: SermonPostStatus.SCHEDULED, scheduledFor, availableAt: scheduledFor, approvedAt: now, approvedByUserId: userId },
      });
    }));
    return drafts.length;
  }

  public async recoverStale(now: Date, staleBefore: Date): Promise<number> {
    const result = await this.prisma.sermonPost.updateMany({
      where: { status: SermonPostStatus.PROCESSING, updatedAt: { lte: staleBefore } },
      data: { status: SermonPostStatus.FAILED, availableAt: now, lastError: 'Recovered after interrupted delivery' },
    });
    return result.count;
  }

  public async claimDue(now: Date, limit: number): Promise<ClaimedSermonPost[]> {
    const candidates = await this.prisma.sermonPost.findMany({
      where: { status: { in: [SermonPostStatus.SCHEDULED, SermonPostStatus.FAILED] }, availableAt: { lte: now }, attempts: { lt: 5 } },
      include: { churchGroup: true }, orderBy: { availableAt: 'asc' }, take: limit,
    });
    const claimed: ClaimedSermonPost[] = [];
    for (const post of candidates) {
      const result = await this.prisma.sermonPost.updateMany({
        where: { id: post.id, status: post.status, attempts: post.attempts },
        data: { status: SermonPostStatus.PROCESSING, attempts: { increment: 1 }, lastError: null },
      });
      if (result.count) claimed.push({ id: post.id, chatId: post.churchGroup.telegramChatId, content: post.content, attempt: post.attempts + 1 });
    }
    return claimed;
  }

  public async markSent(postId: string, sentAt: Date): Promise<void> {
    await this.prisma.sermonPost.update({ where: { id: postId }, data: { status: SermonPostStatus.SENT, sentAt, lastError: null } });
  }
  public async markFailed(postId: string, error: string, retryAt: Date): Promise<void> {
    await this.prisma.sermonPost.update({ where: { id: postId }, data: { status: SermonPostStatus.FAILED, availableAt: retryAt, lastError: error.slice(0, 2_000) } });
  }
}

function toDomain(post: { id: string; sermonId: string; sequence: number; content: string; status: SermonPostStatus; scheduledFor: Date | null }): SermonPostDraft {
  return { id: post.id, sermonId: post.sermonId, sequence: post.sequence, content: post.content, status: post.status.toLowerCase() as SermonPostDraft['status'], ...(post.scheduledFor ? { scheduledFor: post.scheduledFor } : {}) };
}
