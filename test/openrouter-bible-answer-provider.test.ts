import { describe, expect, it, vi } from 'vitest';
import { OpenRouterBibleAnswerProvider } from '../src/assistant/openrouter-bible-answer-provider.js';

describe('OpenRouterBibleAnswerProvider', () => {
  it('keeps conversation history and parses structured answer', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: 'Ответ', bibleReferences: ['Римлянам 8:28'], needsPastor: false, category: 'вера', sermonSourceIds: ['12345'] }) } }] }),
    });
    const provider = new OpenRouterBibleAnswerProvider({ apiKey: 'test', baseUrl: 'https://example.test', model: 'deepseek/test', request });
    const result = await provider.answer('Что такое надежда?', 'община', [{ sermonId: '12345', title: 'Надежда', excerpt: 'фрагмент' }], [{ role: 'user', content: 'Привет' }, { role: 'assistant', content: 'Здравствуйте' }]);
    expect(result.answer).toBe('Ответ');
    expect(result.model).toBe('deepseek/test');
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/chat/completions'), expect.objectContaining({ body: expect.stringContaining('Привет') }));
  });
});
