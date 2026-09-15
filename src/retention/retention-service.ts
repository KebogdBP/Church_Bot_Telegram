import { rm } from 'node:fs/promises';
import type { PrismaClient } from '@prisma/client';

export type RetentionKind = 'audio' | 'transcripts' | 'prayers';

export interface RetentionPolicy {
  audio: number;
  transcripts: number;
  prayers: number;
}

export interface RetentionPreview {
  audio: number;
  transcripts: number;
  prayers: number;
  pendingAudioFiles: number;
}

export class RetentionService {
  public constructor(private readonly prisma: PrismaClient, private readonly now = () => new Date()) {}

  public async getPolicy(chatId: string): Promise<RetentionPolicy | null> {
    const group = await this.prisma.churchGroup.findUnique({ where: { telegramChatId: chatId }, select: { audioRetentionDays: true, transcriptRetentionDays: true, prayerRetentionDays: true } });
    return group ? { audio: group.audioRetentionDays, transcripts: group.transcriptRetentionDays, prayers: group.prayerRetentionDays } : null;
  }

  public async setPolicy(chatId: string, kind: RetentionKind, days: number): Promise<RetentionPolicy | null> {
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('retention_days_out_of_range');
    const field = kind === 'audio' ? 'audioRetentionDays' : kind === 'transcripts' ? 'transcriptRetentionDays' : 'prayerRetentionDays';
    const group = await this.prisma.churchGroup.update({ where: { telegramChatId: chatId }, data: { [field]: days }, select: { audioRetentionDays: true, transcriptRetentionDays: true, prayerRetentionDays: true } }).catch(() => null);
    return group ? { audio: group.audioRetentionDays, transcripts: group.transcriptRetentionDays, prayers: group.prayerRetentionDays } : null;
  }

  public async preview(chatId: string): Promise<RetentionPreview | null> {
    const context = await this.context(chatId);
    if (!context) return null;
    const [audio, transcripts, prayers, pendingAudioFiles] = await this.prisma.$transaction([
      this.prisma.sermon.count({ where: { churchGroupId: context.id, storedPath: { not: null }, storedAt: { lt: context.audioBefore } } }),
      this.prisma.sermon.count({ where: { churchGroupId: context.id, transcript: { not: null }, transcribedAt: { lt: context.transcriptBefore } } }),
      this.prisma.prayerRequest.count({ where: { churchGroupId: context.id, createdAt: { lt: context.prayerBefore }, status: { not: 'PUBLIC_PROCESSING' } } }),
      this.prisma.retentionFileDeletion.count({ where: { churchGroupId: context.id } }),
    ]);
    return { audio, transcripts, prayers, pendingAudioFiles };
  }

  public async execute(chatId: string): Promise<RetentionPreview | null> {
    const context = await this.context(chatId);
    if (!context) return null;
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${context.id}))`;
      const audioRows = await tx.sermon.findMany({ where: { churchGroupId: context.id, storedPath: { not: null }, storedAt: { lt: context.audioBefore } }, select: { id: true, storedPath: true } });
      await tx.retentionFileDeletion.createMany({ data: audioRows.flatMap((row) => row.storedPath ? [{ churchGroupId: context.id, path: row.storedPath }] : []), skipDuplicates: true });
      const audio = (await tx.sermon.updateMany({ where: { id: { in: audioRows.map((row) => row.id) }, storedPath: { not: null } }, data: { storedPath: null } })).count;
      const transcripts = (await tx.sermon.updateMany({ where: { churchGroupId: context.id, transcript: { not: null }, transcribedAt: { lt: context.transcriptBefore } }, data: { transcript: null } })).count;
      const prayers = (await tx.prayerRequest.deleteMany({ where: { churchGroupId: context.id, createdAt: { lt: context.prayerBefore }, status: { not: 'PUBLIC_PROCESSING' } } })).count;
      return { audio, transcripts, prayers };
    });
    await this.deletePendingFiles(context.id);
    const pendingAudioFiles = await this.prisma.retentionFileDeletion.count({ where: { churchGroupId: context.id } });
    return { ...result, pendingAudioFiles };
  }

  private async deletePendingFiles(churchGroupId: string): Promise<void> {
    const rows = await this.prisma.retentionFileDeletion.findMany({ where: { churchGroupId, attempts: { lt: 10 } }, orderBy: { createdAt: 'asc' }, take: 100 });
    for (const row of rows) {
      try {
        await rm(row.path, { force: true });
        await this.prisma.retentionFileDeletion.deleteMany({ where: { id: row.id } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.retentionFileDeletion.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, lastError: message.slice(0, 2_000) } });
      }
    }
  }

  private async context(chatId: string) {
    const group = await this.prisma.churchGroup.findUnique({ where: { telegramChatId: chatId }, select: { id: true, audioRetentionDays: true, transcriptRetentionDays: true, prayerRetentionDays: true } });
    if (!group) return null;
    const before = (days: number) => new Date(this.now().getTime() - days * 86_400_000);
    return { id: group.id, audioBefore: before(group.audioRetentionDays), transcriptBefore: before(group.transcriptRetentionDays), prayerBefore: before(group.prayerRetentionDays) };
  }
}

export function parseRetentionSetting(text: string): { kind: RetentionKind; days: number } | null {
  const match = /^\/retention_set(?:@\w+)?\s+(audio|transcripts|prayers)\s+(\d+)$/i.exec(text.trim());
  if (!match) return null;
  const days = Number(match[2]);
  return Number.isInteger(days) && days >= 1 && days <= 3650 ? { kind: match[1]!.toLowerCase() as RetentionKind, days } : null;
}
