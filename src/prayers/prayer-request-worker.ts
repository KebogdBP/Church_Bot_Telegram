import { PrayerRequestStatus, PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { MessageSender } from '../messaging/message-sender.js';
import { escapeHtml } from '../messaging/html.js';

export class PrayerRequestWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  public constructor(private readonly options: { prisma: PrismaClient; sender: MessageSender; logger: Pick<FastifyBaseLogger, 'error' | 'warn'>; intervalMs: number; now?: () => Date }) {}
  public start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
    this.timer.unref();
  }
  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  public async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const now = this.options.now?.() ?? new Date();
    try {
      const recovered = await this.options.prisma.prayerRequest.updateMany({ where: { status: PrayerRequestStatus.PUBLIC_PROCESSING, updatedAt: { lte: new Date(now.getTime() - 10 * 60_000) } }, data: { status: PrayerRequestStatus.FAILED, availableAt: now, lastError: 'Recovered after interrupted delivery' } });
      if (recovered.count) this.options.logger.warn({ recovered: recovered.count }, 'Recovered stale prayer request publications');
      const rows = await this.options.prisma.prayerRequest.findMany({ where: { status: { in: [PrayerRequestStatus.PUBLIC_SCHEDULED, PrayerRequestStatus.FAILED] }, availableAt: { lte: now }, attempts: { lt: 5 }, anonymousPublicDraft: { not: null } }, include: { churchGroup: true }, take: 10 });
      for (const row of rows) {
        const claim = await this.options.prisma.prayerRequest.updateMany({ where: { id: row.id, status: row.status, attempts: row.attempts }, data: { status: PrayerRequestStatus.PUBLIC_PROCESSING, attempts: { increment: 1 }, lastError: null } });
        if (!claim.count || !row.anonymousPublicDraft) continue;
        try {
          await this.options.sender.sendMessage({ chatId: row.churchGroup.telegramChatId, text: `<b>Молитвенная просьба</b>\n\n${escapeHtml(row.anonymousPublicDraft)}` });
          await this.options.prisma.prayerRequest.update({ where: { id: row.id }, data: { status: PrayerRequestStatus.PUBLISHED, publishedAt: now, lastError: null } });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.options.prisma.prayerRequest.update({ where: { id: row.id }, data: { status: PrayerRequestStatus.FAILED, availableAt: new Date(now.getTime() + retryDelayMs(row.attempts + 1)), lastError: message.slice(0, 2_000) } });
        }
      }
    } catch (error) {
      this.options.logger.error({ error }, 'Prayer request worker tick failed');
    } finally {
      this.running = false;
    }
  }
}

export function retryDelayMs(attempt: number): number {
  return Math.min(2 ** Math.max(0, attempt - 1) * 60_000, 60 * 60_000);
}
