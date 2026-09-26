import { describe, expect, it, vi } from 'vitest';
import { PrismaSermonStatusReader, renderSermonStatus } from '../src/sermons/sermon-status-service.js';

describe('sermon processing timeline', () => {
  it('renders every pipeline stage in a readable administrator view', () => {
    const text = renderSermonStatus({
      id: 'ABC123',
      fileName: 'служение <вечер>.mp3',
      overall: 'review',
      canRegenerate: true,
      posts: { total: 6, draft: 6, scheduled: 0, processing: 0, sent: 0, failed: 0, rejected: 0 },
      stages: [
        { key: 'received', title: 'Материал принят', state: 'completed', detail: 'Запись сохранена.' },
        { key: 'download', title: 'Загрузка аудио', state: 'completed', detail: 'Файл готов.', durationMinutes: 2 },
        { key: 'conversion', title: 'Подготовка аудио', state: 'completed', detail: 'Аудио подготовлено.' },
        { key: 'transcription', title: 'Полная транскрибация', state: 'completed', detail: 'Текст готов.' },
        { key: 'analysis', title: 'Смысловой анализ', state: 'completed', detail: 'Материалы готовы.' },
        { key: 'moderation', title: 'Проверка служителем', state: 'processing', detail: '6 черн. ожидают просмотра.' },
        { key: 'image', title: 'Изображения публикаций', state: 'pending', detail: 'Ожидает публикации.' },
        { key: 'delivery', title: 'Публикация', state: 'pending', detail: 'Ожидает одобрения.' },
      ],
    });

    expect(text).toContain('Обработка проповеди · <code>ABC123</code>');
    expect(text).toContain('Файл: служение &lt;вечер&gt;.mp3');
    expect(text).toContain('✅ 2. <b>Загрузка аудио</b> · 2 мин');
    expect(text).toContain('⏳ 6. <b>Проверка служителем</b>');
    expect(text).toContain('▫️ 8. <b>Публикация</b>');
  });

  it('turns terminal provider errors into safe actions without exposing raw details', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      publicId: 'FAIL42',
      purpose: 'CHURCH_SERMON',
      fileName: 'sermon.m4a',
      status: 'STORED',
      attempts: 1,
      transcriptionStatus: 'FAILED',
      transcriptionAttempts: 5,
      contentStatus: 'PENDING',
      contentAttempts: 0,
      lastError: null,
      transcriptionError: 'ffmpeg: moov atom not found at /secret/path/token-value',
      contentError: null,
      createdAt: new Date('2026-09-20T09:00:00Z'),
      storedAt: new Date('2026-09-20T09:02:00Z'),
      transcribedAt: null,
      contentGeneratedAt: null,
      posts: [],
    });
    const reader = new PrismaSermonStatusReader({ sermon: { findFirst } } as never);
    const status = await reader.get('-100', 'fail42');

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ churchGroup: { telegramChatId: '-100' } }),
    }));
    expect(status).toMatchObject({
      id: 'FAIL42',
      overall: 'attention',
      diagnostic: {
        summary: 'Файл не удалось распознать как исправную аудиозапись.',
        action: expect.stringContaining('MP3 или M4A'),
      },
    });
    const rendered = renderSermonStatus(status!);
    expect(rendered).not.toContain('/secret/path');
    expect(rendered).not.toContain('token-value');
  });
});
