import { describe, expect, it, vi } from 'vitest';
import { OpenRouterDevotionalProvider } from '../src/ai/openrouter-devotional-provider.js';

describe('OpenRouterDevotionalProvider', () => {
  it('returns all devotional sections from structured model output', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ scriptureReference: 'Псалом 22', scriptureText: 'Краткий пересказ', reflection: 'Размышление', sermonConnection: 'Связь', practice: 'Практика', prayer: 'Молитва', question: 'Вопрос?', imagePrompt: 'A quiet path in warm morning light, no text' }) } }] }) });
    const provider = new OpenRouterDevotionalProvider({ apiKey: 'test', baseUrl: 'https://example.test', model: 'qwen/test', request });
    const result = await provider.generate('Последняя проповедь о надежде');
    expect(result.practice).toBe('Практика');
    expect(result.model).toBe('qwen/test');
    expect(result.imagePrompt).toContain('morning light');
  });

  it('rewrites English reader content before returning a devotional', async () => {
    const english = { scriptureReference: 'Psalm 23', scriptureText: 'The Lord is my shepherd.', reflection: 'God guides us through uncertain days and remains close.', sermonConnection: 'This continues the sermon theme of trust.', practice: 'Entrust one concern to God today.', prayer: 'Lord, teach me to trust You.', question: 'Where do I need trust today?', imagePrompt: 'A quiet path in warm morning light, no text' };
    const russian = { scriptureReference: 'Псалом 22', scriptureText: 'Господь — Пастырь мой.', reflection: 'Бог ведёт нас через дни неопределённости и остаётся рядом.', sermonConnection: 'Это продолжает мысль проповеди о доверии.', practice: 'Сегодня доверьте Богу одну свою заботу.', prayer: 'Господи, научи меня доверять Тебе.', question: 'Где сегодня мне особенно нужно доверие?', imagePrompt: english.imagePrompt };
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(english) } }] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(russian) } }] }) });
    const provider = new OpenRouterDevotionalProvider({ apiKey: 'test', baseUrl: 'https://example.test', model: 'qwen/test', request });

    const result = await provider.generate('Проповедь о доверии');

    expect(request).toHaveBeenCalledTimes(2);
    expect(result.reflection).toContain('Бог ведёт нас');
    expect(result.imagePrompt).toBe(english.imagePrompt);
  });
});
