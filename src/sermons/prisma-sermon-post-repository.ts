import { Prisma, PrismaClient, SermonPostStatus } from '@prisma/client';
import { DateTime } from 'luxon';
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
    return this.prisma.$transaction(async (tx) => {
      const selected = await tx.sermonPost.findFirst({
        where: { id: postId, churchGroup: { telegramChatId: chatId }, status: SermonPostStatus.DRAFT },
        include: { churchGroup: { select: { timezone: true } } },
      });
      if (!selected) return 0;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${selected.churchGroupId}))`;
      const drafts = await tx.sermonPost.findMany({
        where: { sermonId: selected.sermonId, status: SermonPostStatus.DRAFT }, orderBy: { sequence: 'asc' },
      });
      const occupied = await tx.sermonPost.findMany({
        where: { churchGroupId: selected.churchGroupId, status: SermonPostStatus.SCHEDULED, scheduledFor: { not: null } },
        select: { scheduledFor: true },
      });
      const schedule = followUpSchedule(now, selected.churchGroup.timezone, drafts.length, occupied.flatMap((post) => post.scheduledFor ? [post.scheduledFor] : []));
      for (const [index, post] of drafts.entries()) {
        const scheduledFor = schedule[index]!;
        await tx.sermonPost.update({
          where: { id: post.id },
          data: { status: SermonPostStatus.SCHEDULED, scheduledFor, availableAt: scheduledFor, approvedAt: now, approvedByUserId: userId },
        });
      }
      return drafts.length;
    });
  }

  public async editDraft(chatId: string, postId: string, content: string, userId: string, now: Date): Promise<boolean> {
    const result = await this.prisma.sermonPost.updateMany({
      where: { id: postId, churchGroup: { telegramChatId: chatId }, status: SermonPostStatus.DRAFT },
      data: { content, editedByUserId: userId, editedAt: now },
    });
    return result.count === 1;
  }

  public async rejectDraft(chatId: string, postId: string, userId: string, now: Date): Promise<boolean> {
    const result = await this.prisma.sermonPost.updateMany({
      where: { id: postId, churchGroup: { telegramChatId: chatId }, status: SermonPostStatus.DRAFT },
      data: { status: SermonPostStatus.REJECTED, rejectedByUserId: userId, rejectedAt: now },
    });
    return result.count === 1;
  }

  public async regenerate(chatId: string, sermonId: string, userId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const sermon = await tx.sermon.findFirst({ where: { id: sermonId, churchGroup: { telegramChatId: chatId } }, include: { posts: true } });
      if (!sermon || sermon.transcriptionStatus !== 'COMPLETED' || sermon.posts.some((post) => post.status !== SermonPostStatus.DRAFT && post.status !== SermonPostStatus.REJECTED)) return false;
      await tx.sermonPost.deleteMany({ where: { sermonId, status: { in: [SermonPostStatus.DRAFT, SermonPostStatus.REJECTED] } } });
      await tx.sermonNotification.deleteMany({ where: { sermonId, kind: { in: ['content_ready', 'content_failed'] } } });
      await tx.sermon.update({
        where: { id: sermonId },
        data: {
          contentStatus: 'PENDING', contentAttempts: 0, contentAvailableAt: now, contentModel: null,
          summary: null, keyThoughts: Prisma.DbNull, reflectionQuestions: Prisma.DbNull, followUpPosts: Prisma.DbNull,
          contentError: null, contentGeneratedAt: null, regeneratedByUserId: userId, regeneratedAt: now,
        },
      });
      return true;
    });
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

export function followUpSchedule(now: Date, timezone: string, count: number, occupied: Date[] = []): Date[] {
  const slots = [9, 14, 19];
  const firstDay = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(timezone).plus({ days: 1 }).startOf('day');
  const used = new Set(occupied.map((date) => date.getTime()));
  const result: Date[] = [];
  for (let index = 0; result.length < count; index += 1) {
    const candidate = firstDay.plus({ days: Math.floor(index / slots.length), hours: slots[index % slots.length] }).toUTC().toJSDate();
    if (!used.has(candidate.getTime())) result.push(candidate);
  }
  return result;
}

function toDomain(post: { id: string; sermonId: string; sequence: number; content: string; status: SermonPostStatus; scheduledFor: Date | null }): SermonPostDraft {
  return { id: post.id, sermonId: post.sermonId, sequence: post.sequence, content: post.content, status: post.status.toLowerCase() as SermonPostDraft['status'], ...(post.scheduledFor ? { scheduledFor: post.scheduledFor } : {}) };
}
