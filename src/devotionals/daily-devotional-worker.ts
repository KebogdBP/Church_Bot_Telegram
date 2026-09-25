import { DateTime } from 'luxon';
import type { FastifyBaseLogger } from 'fastify';
import { PrismaClient, DailyDevotionalStatus, ContentGenerationStatus, TranscriptionStatus } from '@prisma/client';
import type { MessageSender } from '../messaging/message-sender.js';
import { escapeHtml } from '../messaging/html.js';
import { OpenRouterDevotionalProvider } from '../ai/openrouter-devotional-provider.js';
import type { ImageProvider } from '../ai/image-provider.js';

export class DailyDevotionalWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  public constructor(private readonly options: { prisma: PrismaClient; provider: OpenRouterDevotionalProvider; sender: MessageSender; imageProvider?: ImageProvider; logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>; intervalMs: number; now?: () => Date }) {}
  public start(): void { if (this.timer) return; void this.tick(); this.timer = setInterval(() => void this.tick(), this.options.intervalMs); this.timer.unref(); }
  public stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  public async tick(): Promise<void> {
    if (this.running) return; this.running = true; const now = this.options.now?.() ?? new Date();
    try {
      const groups = await this.options.prisma.churchGroup.findMany({ where: { devotionalEnabled: true } });
      for (const group of groups) {
        const local = DateTime.fromJSDate(now, { zone: group.timezone });
        const localDate = local.toISODate();
        if (!localDate) continue;
        const [hour, minute] = group.devotionalLocalTime.split(':').map(Number);
        const dueAt = local.set({ hour: hour || 8, minute: minute || 0, second: 0, millisecond: 0 });
        if (local < dueAt) continue;
        const exists = await this.options.prisma.dailyDevotional.findUnique({ where: { churchGroupId_localDate: { churchGroupId: group.id, localDate } }, select: { id: true } });
        if (exists) continue;
        const sermons = await this.options.prisma.sermon.findMany({ where: { churchGroupId: group.id, transcriptionStatus: TranscriptionStatus.COMPLETED, contentStatus: ContentGenerationStatus.COMPLETED, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, orderBy: { createdAt: 'desc' }, take: 3, select: { publicId: true, title: true, summary: true, keyThoughts: true, transcript: true } });
        if (!sermons.length) continue;
        const context = sermons.map((sermon) => `[${sermon.publicId}] ${sermon.title || 'Проповедь'}\n${sermon.summary || ''}\n${JSON.stringify(sermon.keyThoughts || [])}\n${(sermon.transcript || '').slice(0, 3_000)}`).join('\n\n');
        const devotional = await this.options.provider.generate(context);
        await this.options.prisma.dailyDevotional.create({ data: { churchGroupId: group.id, localDate, content: formatDevotional(devotional), imagePrompt: devotional.imagePrompt, availableAt: dueAt.toUTC().toJSDate() } });
      }
      const due = await this.options.prisma.dailyDevotional.findMany({ where: { status: { in: [DailyDevotionalStatus.SCHEDULED, DailyDevotionalStatus.FAILED] }, availableAt: { lte: now }, attempts: { lt: 5 } }, include: { churchGroup: true }, take: 20, orderBy: { availableAt: 'asc' } });
      for (const item of due) {
        const claimed = await this.options.prisma.dailyDevotional.updateMany({ where: { id: item.id, status: item.status, attempts: item.attempts }, data: { status: DailyDevotionalStatus.PROCESSING, attempts: { increment: 1 } } });
        if (!claimed.count) continue;
        try {
          await this.send(item.churchGroup.telegramChatId, item.content, item.imagePrompt);
          await this.options.prisma.dailyDevotional.update({ where: { id: item.id }, data: { status: DailyDevotionalStatus.SENT, sentAt: now, lastError: null } });
        }
        catch (error) { const message = error instanceof Error ? error.message : String(error); await this.options.prisma.dailyDevotional.update({ where: { id: item.id }, data: { status: DailyDevotionalStatus.FAILED, availableAt: new Date(now.getTime() + 60_000), lastError: message.slice(0, 2_000) } }); this.options.logger.error({ devotionalId: item.id, error: message }, 'Daily devotional delivery failed'); }
      }
    } catch (error) { this.options.logger.error({ error }, 'Daily devotional worker tick failed'); }
    finally { this.running = false; }
  }

  private async send(chatId: string, content: string, imagePrompt: string | null): Promise<void> {
    if (imagePrompt && this.options.imageProvider && this.options.sender.sendPhoto) {
      try {
        const image = await this.options.imageProvider.generate(imagePrompt);
        const photo = { chatId, fileName: image.mimeType === 'image/png' ? 'devotional.png' : 'devotional.jpg', bytes: image.bytes };
        if (content.length <= 1_000) await this.options.sender.sendPhoto({ ...photo, caption: content });
        else {
          await this.options.sender.sendPhoto(photo);
          await this.options.sender.sendMessage({ chatId, text: content });
        }
        return;
      } catch (error) {
        this.options.logger.warn({ error }, 'Devotional image generation failed; sending text only');
      }
    }
    await this.options.sender.sendMessage({ chatId, text: content });
  }
}

export function formatDevotional(value: { scriptureReference: string; scriptureText: string; reflection: string; sermonConnection: string; practice: string; prayer: string; question: string }): string {
  return [
    '<b>Утреннее размышление</b>',
    '',
    `📖 <b>${escapeHtml(value.scriptureReference)}</b>`,
    `<i>${escapeHtml(value.scriptureText)}</i>`,
    '',
    `🕯 <b>Размышление</b>\n${escapeHtml(value.reflection)}`,
    '',
    escapeHtml(value.sermonConnection),
    '',
    `▸ <b>Шаг на сегодня</b>\n${escapeHtml(value.practice)}`,
    '',
    `🙏 <b>Молитва</b>\n${escapeHtml(value.prayer)}`,
    '',
    `<b>Вопрос дня</b>\n${escapeHtml(value.question)}`,
  ].join('\n');
}
