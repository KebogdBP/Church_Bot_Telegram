import { AnnouncementStatus, PrismaClient } from '@prisma/client';
import type { AnnouncementDraft, AnnouncementRepository, DueAnnouncement } from './announcement.js';

export class PrismaAnnouncementRepository implements AnnouncementRepository {
  public constructor(private readonly prisma: PrismaClient) {}
  public async create(chatId: string, userId: string, content: string, timezone: string): Promise<AnnouncementDraft> {
    const group = await this.prisma.churchGroup.upsert({ where: { telegramChatId: chatId }, create: { telegramChatId: chatId, timezone }, update: {} });
    return toDomain(await this.prisma.announcement.create({ data: { churchGroupId: group.id, createdByUserId: userId, content } }));
  }
  public async find(chatId: string, id: string): Promise<AnnouncementDraft | null> { const row = await this.prisma.announcement.findFirst({ where: { id, churchGroup: { telegramChatId: chatId } } }); return row ? toDomain(row) : null; }
  public async listDrafts(chatId: string): Promise<AnnouncementDraft[]> { return (await this.prisma.announcement.findMany({ where: { churchGroup: { telegramChatId: chatId }, status: AnnouncementStatus.DRAFT }, orderBy: { createdAt: 'desc' }, take: 20 })).map(toDomain); }
  public async edit(chatId: string, id: string, userId: string, content: string, now: Date): Promise<boolean> { return (await this.prisma.announcement.updateMany({ where: { id, churchGroup: { telegramChatId: chatId }, status: AnnouncementStatus.DRAFT }, data: { content, editedByUserId: userId, editedAt: now } })).count === 1; }
  public async reject(chatId: string, id: string, userId: string, now: Date): Promise<boolean> { return (await this.prisma.announcement.updateMany({ where: { id, churchGroup: { telegramChatId: chatId }, status: AnnouncementStatus.DRAFT }, data: { status: AnnouncementStatus.REJECTED, rejectedByUserId: userId, rejectedAt: now } })).count === 1; }
  public async approve(chatId: string, id: string, userId: string, scheduledFor: Date, now: Date): Promise<boolean> { return (await this.prisma.announcement.updateMany({ where: { id, churchGroup: { telegramChatId: chatId }, status: AnnouncementStatus.DRAFT }, data: { status: AnnouncementStatus.SCHEDULED, scheduledFor, availableAt: scheduledFor, approvedByUserId: userId, approvedAt: now } })).count === 1; }
  public async recoverStale(now: Date, staleBefore: Date): Promise<number> { return (await this.prisma.announcement.updateMany({ where: { status: AnnouncementStatus.PROCESSING, updatedAt: { lte: staleBefore } }, data: { status: AnnouncementStatus.FAILED, availableAt: now, lastError: 'Recovered after interrupted delivery' } })).count; }
  public async claimDue(now: Date, limit: number): Promise<DueAnnouncement[]> {
    const rows = await this.prisma.announcement.findMany({ where: { status: { in: [AnnouncementStatus.SCHEDULED, AnnouncementStatus.FAILED] }, availableAt: { lte: now }, attempts: { lt: 5 } }, include: { churchGroup: true }, orderBy: { availableAt: 'asc' }, take: limit });
    const claimed: DueAnnouncement[] = [];
    for (const row of rows) { const updated = await this.prisma.announcement.updateMany({ where: { id: row.id, status: row.status, attempts: row.attempts }, data: { status: AnnouncementStatus.PROCESSING, attempts: { increment: 1 }, lastError: null } }); if (updated.count) claimed.push({ id: row.id, chatId: row.churchGroup.telegramChatId, content: row.content, attempt: row.attempts + 1 }); }
    return claimed;
  }
  public async markSent(id: string, now: Date): Promise<void> { await this.prisma.announcement.update({ where: { id }, data: { status: AnnouncementStatus.SENT, sentAt: now, lastError: null } }); }
  public async markFailed(id: string, error: string, retryAt: Date): Promise<void> { await this.prisma.announcement.update({ where: { id }, data: { status: AnnouncementStatus.FAILED, availableAt: retryAt, lastError: error.slice(0, 2_000) } }); }
}
function toDomain(row: { id: string; content: string; status: AnnouncementStatus; scheduledFor: Date | null }): AnnouncementDraft { return { id: row.id, content: row.content, status: row.status.toLowerCase(), ...(row.scheduledFor ? { scheduledFor: row.scheduledFor } : {}) }; }
