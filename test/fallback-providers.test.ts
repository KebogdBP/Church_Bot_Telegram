import { describe, expect, it, vi } from 'vitest';
import type { BibleAnswerProvider } from '../src/assistant/bible-answer-provider.js';
import type { SermonContentProvider } from '../src/ai/sermon-content-provider.js';
import { FallbackBibleAnswerProvider, FallbackSermonContentProvider } from '../src/ai/fallback-providers.js';

describe('AI provider fallback', () => {
  it('uses the secondary Bible provider when the primary fails', async () => {
    const primary = { answer: vi.fn().mockRejectedValue(new Error('regional block')) } satisfies BibleAnswerProvider;
    const expected = { answer: 'Ответ', bibleReferences: [], needsPastor: false, category: 'bible', sermonSourceIds: [], model: 'groq' };
    const fallback = { answer: vi.fn().mockResolvedValue(expected) } satisfies BibleAnswerProvider;
    const onFallback = vi.fn();
    await expect(new FallbackBibleAnswerProvider(primary, fallback, onFallback).answer('Вопрос')).resolves.toEqual(expected);
    expect(fallback.answer).toHaveBeenCalledOnce();
    expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({ message: 'regional block' }));
  });

  it('uses the secondary sermon provider when the primary fails', async () => {
    const primary = { generate: vi.fn().mockRejectedValue(new Error('regional block')) } satisfies SermonContentProvider;
    const expected = { summary: 'Итог', keyThoughts: ['1', '2', '3'], reflectionQuestions: ['1', '2'], followUpPosts: ['1', '2'], model: 'groq' };
    const fallback = { generate: vi.fn().mockResolvedValue(expected) } satisfies SermonContentProvider;
    await expect(new FallbackSermonContentProvider(primary, fallback).generate('Транскрипт')).resolves.toEqual(expected);
    expect(fallback.generate).toHaveBeenCalledOnce();
  });
});
