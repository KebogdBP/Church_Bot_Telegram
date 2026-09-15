import { PrismaClient, SermonPostStatus, WeeklyDigestStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import type { DueWeeklyDigest, WeeklyDigestDraft, WeeklyDigestRepository } from './weekly-digest.js';
import { escapeHtml, escapeHtmlWithin } from '../messaging/html.js';

export class PrismaWeeklyDigestRepository implements WeeklyDigestRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async configure(chatId: string, enabled: boolean, weekday: number, localTime: string): Promise<void> {
    await this.prisma.churchGroup.upsert({ where: { telegramChatId: chatId }, create: { telegramChatId: chatId, digestEnabled: enabled, digestWeekday: weekday, digestLocalTime: localTime }, update: { digestEnabled: enabled, digestWeekday: weekday, digestLocalTime: localTime } });
  }

  public async createOrRefreshDraft(chatId: string, now: Date): Promise<WeeklyDigestDraft> {
    const group = await this.prisma.churchGroup.upsert({ where: { telegramChatId: chatId }, create: { telegramChatId: chatId }, update: {} });
    const weekStart = startOfWeek(now, group.timezone);
    const existing = await this.prisma.weeklyDigest.findUnique({ where: { churchGroupId_weekStart: { churchGroupId: group.id, weekStart } } });
    if (existing && existing.status !== WeeklyDigestStatus.DRAFT) return toDomain(existing);
    const content = await this.compose(group.id, group.timezone, now);
    const digest = await this.prisma.weeklyDigest.upsert({
      where: { churchGroupId_weekStart: { churchGroupId: group.id, weekStart } },
      create: { churchGroupId: group.id, weekStart, content },
      update: { content },
    });
    return toDomain(digest);
  }

  public async findCurrent(chatId: string, now: Date): Promise<WeeklyDigestDraft | null> {
    const group = await this.prisma.churchGroup.findUnique({ where: { telegramChatId: chatId } });
    if (!group) return null;
    const digest = await this.prisma.weeklyDigest.findUnique({ where: { churchGroupId_weekStart: { churchGroupId: group.id, weekStart: startOfWeek(now, group.timezone) } } });
    return digest ? toDomain(digest) : null;
  }

  public async approve(chatId: string, digestId: string, userId: string, now: Date): Promise<boolean> {
    const result = await this.prisma.weeklyDigest.updateMany({ where: { id: digestId, churchGroup: { telegramChatId: chatId }, status: WeeklyDigestStatus.DRAFT }, data: { status: WeeklyDigestStatus.SCHEDULED, availableAt: now, approvedByUserId: userId, approvedAt: now } });
    return result.count === 1;
  }

  public async planAutomaticDrafts(now: Date): Promise<number> {
    const groups = await this.prisma.churchGroup.findMany({ where: { digestEnabled: true } });
    let planned = 0;
    for (const group of groups) {
      const local = DateTime.fromJSDate(now, { zone: group.timezone });
      const [hour, minute] = group.digestLocalTime.split(':').map(Number);
      if (local.weekday < group.digestWeekday || (local.weekday === group.digestWeekday && (local.hour < (hour ?? 0) || (local.hour === hour && local.minute < (minute ?? 0))))) continue;
      const weekStart = startOfWeek(now, group.timezone);
      const exists = await this.prisma.weeklyDigest.findUnique({ where: { churchGroupId_weekStart: { churchGroupId: group.id, weekStart } }, select: { id: true } });
      if (!exists) { await this.createOrRefreshDraft(group.telegramChatId, now); planned += 1; }
    }
    return planned;
  }

  public async recoverStale(now: Date, staleBefore: Date): Promise<number> { return (await this.prisma.weeklyDigest.updateMany({ where: { status: WeeklyDigestStatus.PROCESSING, updatedAt: { lte: staleBefore } }, data: { status: WeeklyDigestStatus.FAILED, availableAt: now, lastError: 'Recovered after interrupted delivery' } })).count; }
  public async claimDue(now: Date, limit: number): Promise<DueWeeklyDigest[]> {
    const rows = await this.prisma.weeklyDigest.findMany({ where: { status: { in: [WeeklyDigestStatus.SCHEDULED, WeeklyDigestStatus.FAILED] }, availableAt: { lte: now }, attempts: { lt: 5 } }, include: { churchGroup: true }, orderBy: { availableAt: 'asc' }, take: limit });
    const claimed: DueWeeklyDigest[] = [];
    for (const row of rows) {
      const result = await this.prisma.weeklyDigest.updateMany({ where: { id: row.id, status: row.status, attempts: row.attempts }, data: { status: WeeklyDigestStatus.PROCESSING, attempts: { increment: 1 }, lastError: null } });
      if (result.count) claimed.push({ id: row.id, chatId: row.churchGroup.telegramChatId, content: row.content, attempt: row.attempts + 1 });
    }
    return claimed;
  }
  public async markSent(id: string, now: Date): Promise<void> { await this.prisma.weeklyDigest.update({ where: { id }, data: { status: WeeklyDigestStatus.SENT, sentAt: now, lastError: null } }); }
  public async markFailed(id: string, error: string, retryAt: Date): Promise<void> { await this.prisma.weeklyDigest.update({ where: { id }, data: { status: WeeklyDigestStatus.FAILED, availableAt: retryAt, lastError: error.slice(0, 2_000) } }); }

  private async compose(groupId: string, timezone: string, now: Date): Promise<string> {
    const [events, latestPost] = await Promise.all([
      this.prisma.event.findMany({ where: { churchGroupId: groupId, active: true, OR: [{ recurrence: 'WEEKLY' }, { startsAt: { gte: now } }] }, orderBy: { startsAt: 'asc' }, take: 5 }),
      this.prisma.sermonPost.findFirst({ where: { churchGroupId: groupId, status: { in: [SermonPostStatus.SCHEDULED, SermonPostStatus.PROCESSING, SermonPostStatus.SENT] } }, orderBy: { approvedAt: 'desc' }, include: { sermon: true } }),
    ]);
    const lines = ['<b>Дайджест общины на неделю</b>', ''];
    if (events.length) {
      lines.push('<b>События</b>');
      for (const event of events) lines.push(`• ${event.recurrence === 'WEEKLY' ? 'Еженедельно' : DateTime.fromJSDate(event.startsAt, { zone: timezone }).toFormat('dd.LL HH:mm')} — ${escapeHtml(event.title)}${event.location ? `, ${escapeHtml(event.location)}` : ''}`);
      lines.push('');
    }
    if (latestPost) lines.push('<b>Из последней проповеди</b>', escapeHtmlWithin(latestPost.content, 2_400));
    if (!events.length && !latestPost) lines.push('На этой неделе пока нет новых событий и одобренных материалов.');
    lines.push('', `Подготовлено ${DateTime.fromJSDate(now, { zone: timezone }).toFormat('dd.LL.yyyy')}`);
    return lines.join('\n');
  }
}

function startOfWeek(now: Date, timezone: string): Date { return DateTime.fromJSDate(now, { zone: timezone }).startOf('week').toUTC().toJSDate(); }
function toDomain(row: { id: string; content: string; status: WeeklyDigestStatus }): WeeklyDigestDraft { return { id: row.id, content: row.content, status: row.status.toLowerCase() as WeeklyDigestDraft['status'] }; }
