import { describe, expect, it, vi } from 'vitest';
import { DailyDevotionalWorker, formatDevotional } from '../src/devotionals/daily-devotional-worker.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function fakePrisma(imagePrompt = 'A quiet path at sunrise, no text') {
  return {
    churchGroup: { findMany: vi.fn().mockResolvedValue([]) },
    dailyDevotional: {
      findMany: vi.fn().mockResolvedValue([{ id: 'd1', status: 'SCHEDULED', attempts: 0, content: '<b>Размышление</b>', imagePrompt, churchGroup: { telegramChatId: '-100' } }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('DailyDevotionalWorker', () => {
  it('formats a readable mobile devotional with restrained visual markers', () => {
    const text = formatDevotional({
      scriptureReference: 'Римлянам 12:5', scriptureText: 'Мы — одно тело во Христе.',
      reflection: 'Бог соединяет нас не сходством, а Христом.', sermonConnection: 'Эта мысль продолжает воскресную проповедь о единстве.',
      practice: 'Поддержите сегодня одного человека.', prayer: 'Господи, научи меня хранить единство.', question: 'Кого я могу сегодня укрепить?',
    });
    expect(text).toContain('📖 <b>Римлянам 12:5</b>');
    expect(text).toContain('🕯 <b>Размышление</b>');
    expect(text).toContain('🙏 <b>Молитва</b>');
    expect(text).toContain('\n\n');
    expect(text.length).toBeLessThan(1_000);
  });

  it('sends a generated image with the devotional caption', async () => {
    const prisma = fakePrisma();
    const sendPhoto = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const worker = new DailyDevotionalWorker({
      prisma: prisma as never, provider: {} as never, sender: { sendPhoto, sendMessage }, logger,
      imageProvider: { generate: vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), mimeType: 'image/jpeg' }) },
      intervalMs: 60_000, now: () => new Date('2026-09-25T08:00:00Z'),
    });
    await worker.tick();
    expect(sendPhoto).toHaveBeenCalledWith(expect.objectContaining({ chatId: '-100', fileName: 'devotional.jpg', caption: '<b>Размышление</b>' }));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('still sends text when image generation fails', async () => {
    const prisma = fakePrisma();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const worker = new DailyDevotionalWorker({
      prisma: prisma as never, provider: {} as never, sender: { sendMessage, sendPhoto: vi.fn() }, logger,
      imageProvider: { generate: vi.fn().mockRejectedValue(new Error('image unavailable')) },
      intervalMs: 60_000, now: () => new Date('2026-09-25T08:00:00Z'),
    });
    await worker.tick();
    expect(sendMessage).toHaveBeenCalledWith({ chatId: '-100', text: '<b>Размышление</b>' });
  });
});
