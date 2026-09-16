import { describe, expect, it, vi } from 'vitest';
import type { SermonContentProvider } from '../src/ai/sermon-content-provider.js';
import type { ContentGenerationRepository } from '../src/sermons/content-generation.js';
import { SermonContentWorker } from '../src/sermons/sermon-content-worker.js';

describe('SermonContentWorker', () => {
  it('generates and stores structured sermon content', async () => {
    const repository = {
      recoverStale: vi.fn().mockResolvedValue(0),
      claimNext: vi.fn().mockResolvedValue({ id: 's1', transcript: 'Проповедь', attempts: 1 }),
      markCompleted: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    } satisfies ContentGenerationRepository;
    const generated = {
      summary: 'Кратко',
      outline: [{ title: 'Пункт', points: ['Тезис'] }],
      keyThoughts: ['Один', 'Два', 'Три'],
      reflectionQuestions: ['Вопрос 1', 'Вопрос 2'],
      followUpPosts: ['Пост 1', 'Пост 2'],
      model: 'test-model',
    };
    const provider = { generate: vi.fn().mockResolvedValue(generated) } satisfies SermonContentProvider;
    const now = new Date('2026-09-13T12:00:00Z');
    const worker = new SermonContentWorker({
      repository, provider, now: () => now, intervalMs: 30_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await worker.tick();

    expect(provider.generate).toHaveBeenCalledWith('Проповедь');
    expect(repository.markCompleted).toHaveBeenCalledWith('s1', generated, 'test-model', now);
  });
});
