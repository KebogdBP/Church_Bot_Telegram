import { ContentGenerationStatus, PrismaClient, ReminderDeliveryStatus, SermonPurpose, SermonStatus, TranscriptionStatus } from '@prisma/client';
import { escapeHtml } from '../messaging/html.js';
import type { DueSermonNotification, SermonNotificationRepository } from './sermon-notification.js';

export class PrismaSermonNotificationRepository implements SermonNotificationRepository {
  public constructor(private readonly prisma: PrismaClient) {}
  public async planMilestones(now: Date): Promise<number> {
    const sermons = await this.prisma.sermon.findMany({
      where: { OR: [
        { status: SermonStatus.STORED }, { status: SermonStatus.TOO_LARGE }, { status: SermonStatus.FAILED, attempts: { gte: 5 } },
        { transcriptionStatus: TranscriptionStatus.COMPLETED }, { transcriptionStatus: TranscriptionStatus.FAILED, transcriptionAttempts: { gte: 5 } },
        { contentStatus: ContentGenerationStatus.COMPLETED }, { contentStatus: ContentGenerationStatus.FAILED, contentAttempts: { gte: 5 } },
      ] },
      include: { churchGroup: true, notifications: { select: { kind: true } } },
    });
    const rows: Array<{ sermonId: string; kind: string; targetChatId: string; message: string; availableAt: Date }> = [];
    for (const sermon of sermons) {
      const existing = new Set(sermon.notifications.map((item) => item.kind));
      const targetChatId = sermon.submittedByUserId ?? sermon.churchGroup.telegramChatId;
      const add = (kind: string, message: string, availableAt = now) => { if (!existing.has(kind)) rows.push({ sermonId: sermon.id, kind, targetChatId, message, availableAt }); };
      const personal = sermon.purpose === SermonPurpose.PERSONAL_TRANSCRIPTION;
      if (sermon.status === SermonStatus.STORED) add('stored', personal ? `Аудио ${sermon.id}: файл подготовлен, начинается транскрибация.` : `Проповедь ${sermon.id}: файл загружен и подготовлен.`);
      if (sermon.status === SermonStatus.TOO_LARGE || (sermon.status === SermonStatus.FAILED && sermon.attempts >= 5)) add('download_failed', `Проповедь ${sermon.id}: не удалось загрузить файл. Проверьте /sermon_status ${sermon.id}`);
      if (sermon.transcriptionStatus === TranscriptionStatus.COMPLETED && !personal) add('transcribed', `Проповедь ${sermon.id}: транскрибация завершена.`);
      if (sermon.transcriptionStatus === TranscriptionStatus.COMPLETED && personal && sermon.transcript) {
        const chunks = splitTelegramText(sermon.transcript);
        chunks.forEach((chunk, index) => add(`transcript_${String(index).padStart(4, '0')}`, `${index === 0 ? `<b>Транскрибация готова</b>\nID: <code>${sermon.id}</code>\n\n` : ''}${chunk}${chunks.length > 1 ? `\n\nЧасть ${index + 1}/${chunks.length}` : ''}`, new Date(now.getTime() + index)));
      }
      if (sermon.transcriptionStatus === TranscriptionStatus.FAILED && sermon.transcriptionAttempts >= 5) add('transcription_failed', `Проповедь ${sermon.id}: транскрибация не завершена. Проверьте /sermon_status ${sermon.id}`);
      if (!personal && sermon.contentStatus === ContentGenerationStatus.COMPLETED) add('content_ready', `Материалы проповеди ${sermon.id} готовы к проверке: /sermons`);
      if (!personal && sermon.contentStatus === ContentGenerationStatus.FAILED && sermon.contentAttempts >= 5) add('content_failed', `Проповедь ${sermon.id}: Gemini не подготовил материалы. Проверьте /sermon_status ${sermon.id}`);
    }
    if (!rows.length) return 0;
    return (await this.prisma.sermonNotification.createMany({ data: rows, skipDuplicates: true })).count;
  }
  public async recoverStale(now: Date, staleBefore: Date): Promise<number> {
    return (await this.prisma.sermonNotification.updateMany({ where: { status: ReminderDeliveryStatus.PROCESSING, updatedAt: { lte: staleBefore } }, data: { status: ReminderDeliveryStatus.FAILED, availableAt: now, lastError: 'Recovered after interrupted delivery' } })).count;
  }
  public async claimDue(now: Date, limit: number): Promise<DueSermonNotification[]> {
    const candidates = await this.prisma.sermonNotification.findMany({ where: { status: { in: [ReminderDeliveryStatus.PENDING, ReminderDeliveryStatus.FAILED] }, availableAt: { lte: now }, attempts: { lt: 8 } }, orderBy: { availableAt: 'asc' }, take: limit });
    const claimed: DueSermonNotification[] = [];
    for (const candidate of candidates) {
      const result = await this.prisma.sermonNotification.updateMany({ where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts }, data: { status: ReminderDeliveryStatus.PROCESSING, attempts: { increment: 1 }, lastError: null } });
      if (result.count) claimed.push({ id: candidate.id, targetChatId: candidate.targetChatId, message: candidate.message, attempts: candidate.attempts + 1 });
    }
    return claimed;
  }
  public async markSent(id: string, now: Date): Promise<void> { await this.prisma.sermonNotification.update({ where: { id }, data: { status: ReminderDeliveryStatus.SENT, sentAt: now, lastError: null } }); }
  public async markFailed(id: string, error: string, retryAt: Date): Promise<void> { await this.prisma.sermonNotification.update({ where: { id }, data: { status: ReminderDeliveryStatus.FAILED, availableAt: retryAt, lastError: error.slice(0, 2_000) } }); }
}

function splitTelegramText(text: string): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const character of text) {
    const escaped = escapeHtml(character);
    if (chunk.length + escaped.length > 3_200) { chunks.push(chunk); chunk = ''; }
    chunk += escaped;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
