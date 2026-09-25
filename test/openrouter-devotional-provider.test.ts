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
});
