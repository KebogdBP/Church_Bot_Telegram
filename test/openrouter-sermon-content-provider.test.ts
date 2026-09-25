import { describe, expect, it, vi } from 'vitest';
import { OpenRouterSermonContentProvider } from '../src/ai/openrouter-sermon-content-provider.js';

describe('OpenRouterSermonContentProvider', () => {
  it('asks the model to repair an incomplete draft', async () => {
    const complete = {
      summary: 'Краткое содержание', outline: [{ title: 'Тема', points: ['Тезис'] }],
      keyThoughts: ['Первая мысль', 'Вторая мысль', 'Третья мысль'], reflectionQuestions: ['Первый вопрос?', 'Второй вопрос?'],
      followUpPosts: Array.from({ length: 6 }, (_, index) => ({ thought: `Мысль ${index + 1}. ${'Это законченный абзац, который объясняет смысл проповеди и помогает читателю увидеть её связь с собственной жизнью. '.repeat(2)}`, practice: 'Выберите сегодня один конкретный шаг, запишите его и вечером честно оцените, удалось ли применить услышанное.', imagePrompt: 'Тёплая выразительная сцена надежды в естественном свете, без текста, букв и логотипов.' })),
    };
    const outputs = [{ summary: 'Слишком мало' }, complete];
    const provider = new OpenRouterSermonContentProvider({ apiKey: 'key', baseUrl: 'https://openrouter.test/api/v1', model: 'qwen/test' });
    Object.assign(provider as unknown as { client: { chat: () => Promise<string> } }, { client: { chat: vi.fn().mockImplementation(async () => JSON.stringify(outputs.shift() ?? complete)) } });
    const result = await provider.generate('Транскрипт проповеди');
    expect(result.followUpPosts).toHaveLength(6);
    expect(result.followUpPosts[0]).toContain('Практика на сегодня');
  });
});
