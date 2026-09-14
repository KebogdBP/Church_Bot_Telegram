import type { PrismaClient } from '@prisma/client';
import type { AuditRecord, AuditRepository } from './audit-service.js';

export class PrismaAuditRepository implements AuditRepository {
  public constructor(private readonly prisma: PrismaClient, private readonly timezone: string) {}

  public async record(input: Parameters<AuditRepository['record']>[0]): Promise<void> {
    const group = await this.prisma.churchGroup.upsert({
      where: { telegramChatId: input.chatId },
      update: {},
      create: { telegramChatId: input.chatId, timezone: this.timezone },
      select: { id: true },
    });
    await this.prisma.auditEntry.create({ data: {
      churchGroupId: group.id,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      ...(input.entityId ? { entityId: input.entityId } : {}),
      metadata: input.metadata ?? {},
    } });
  }

  public async list(chatId: string, limit: number): Promise<AuditRecord[]> {
    const rows = await this.prisma.auditEntry.findMany({
      where: { churchGroup: { telegramChatId: chatId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id, actorUserId: row.actorUserId, action: row.action,
      entityType: row.entityType, ...(row.entityId ? { entityId: row.entityId } : {}),
      metadata: row.metadata as Record<string, string | number | boolean>, createdAt: row.createdAt,
    }));
  }

  public async failureSummary(chatId: string): Promise<Record<string, number>> {
    const group = await this.prisma.churchGroup.findUnique({ where: { telegramChatId: chatId }, select: { id: true } });
    if (!group) return {};
    const [reminders, sermons, transcriptions, content, posts, digests, announcements, prayers] = await this.prisma.$transaction([
      this.prisma.reminderDelivery.count({ where: { event: { churchGroupId: group.id }, status: 'FAILED' } }),
      this.prisma.sermon.count({ where: { churchGroupId: group.id, status: 'FAILED' } }),
      this.prisma.sermon.count({ where: { churchGroupId: group.id, transcriptionStatus: 'FAILED' } }),
      this.prisma.sermon.count({ where: { churchGroupId: group.id, contentStatus: 'FAILED' } }),
      this.prisma.sermonPost.count({ where: { churchGroupId: group.id, status: 'FAILED' } }),
      this.prisma.weeklyDigest.count({ where: { churchGroupId: group.id, status: 'FAILED' } }),
      this.prisma.announcement.count({ where: { churchGroupId: group.id, status: 'FAILED' } }),
      this.prisma.prayerRequest.count({ where: { churchGroupId: group.id, status: 'FAILED' } }),
    ]);
    return { reminders, sermons, transcriptions, content, posts, digests, announcements, prayers };
  }
}
