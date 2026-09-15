import { describe, expect, it, vi } from 'vitest';
import type { AssistantRepository } from '../src/assistant/assistant-repository.js';
import type { BibleAnswerProvider } from '../src/assistant/bible-answer-provider.js';
import { BibleAssistantService } from '../src/assistant/bible-assistant-service.js';
import { GeminiBibleAnswerProvider } from '../src/assistant/gemini-bible-answer-provider.js';

function setup() {
  const repository = {
    getContext: vi.fn().mockResolvedValue('Евангельская община'),
    setContext: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    getHistory: vi.fn().mockResolvedValue([]),
    appendExchange: vi.fn().mockResolvedValue(undefined),
    clearHistory: vi.fn().mockResolvedValue(undefined),
  } satisfies AssistantRepository;
  const provider = {
    answer: vi.fn().mockResolvedValue({ answer: 'Ответ', bibleReferences: ['Ин. 3:16'], needsPastor: false, category: 'bible', sermonSourceIds: [], model: 'model' }),
  } satisfies BibleAnswerProvider;
  return { repository, provider, service: new BibleAssistantService(repository, provider, 'privacy-secret-long', 'Europe/Moscow') };
}

describe('BibleAssistantService', () => {
  it('answers ordinary questions with references and no raw conversation log', async () => {
    const { repository, provider, service } = setup();
    await expect(service.ask('chat', '42', 'Что такое благодать?')).resolves.toMatchObject({ text: 'Ответ\n\nБиблейские места: Ин. 3:16' });
    expect(provider.answer).toHaveBeenCalledWith('Что такое благодать?', 'Евангельская община', [], []);
    expect(repository.appendExchange).toHaveBeenCalledWith('chat', expect.stringMatching(/^[a-f0-9]{64}$/), 'Что такое благодать?', 'Ответ', 'Europe/Moscow');
    expect(repository.log).toHaveBeenCalledWith(expect.not.objectContaining({ question: expect.anything(), answer: expect.anything() }));
    expect(repository.log).toHaveBeenCalledWith(expect.objectContaining({ userHash: expect.stringMatching(/^[a-f0-9]{64}$/), outcome: 'answered' }));
  });

  it('uses previous turns and can clear them', async () => {
    const { repository, provider, service } = setup();
    vi.mocked(repository.getHistory).mockResolvedValue([
      { role: 'user', content: 'Кто такой Павел?' },
      { role: 'assistant', content: 'Апостол.' },
    ]);

    await service.ask('chat', '42', 'А где он родился?');
    expect(provider.answer).toHaveBeenCalledWith('А где он родился?', 'Евангельская община', [], [
      { role: 'user', content: 'Кто такой Павел?' },
      { role: 'assistant', content: 'Апостол.' },
    ]);
    await service.clearHistory('chat', '42');
    expect(repository.clearHistory).toHaveBeenCalledWith('chat', expect.stringMatching(/^[a-f0-9]{64}$/));
  });

  it('uses only retrieved sermon IDs in a grounded answer', async () => {
    const { repository, provider } = setup();
    vi.mocked(provider.answer).mockResolvedValue({ answer: 'Ответ из архива', bibleReferences: [], needsPastor: false, category: 'sermon_archive', sermonSourceIds: ['sermon-1', 'invented'], model: 'model' });
    const archive = { searchContext: vi.fn().mockResolvedValue([{ sermonId: 'sermon-1', title: 'О надежде', date: new Date(), excerpt: 'Надежда укрепляет.' }]) };
    const service = new BibleAssistantService(repository, provider, 'privacy-secret-long', 'Europe/Moscow', archive);

    const result = await service.askWithSermons('chat', '42', 'Что говорили о надежде?');

    expect(archive.searchContext).toHaveBeenCalledWith('chat', 'Что говорили о надежде?', 3);
    expect(result.text).toContain('Источники архива: [sermon-1]');
    expect(result.text).not.toContain('invented');
  });

  it('escalates a self-harm message without sending it to AI', async () => {
    const { repository, provider, service } = setup();
    const result = await service.ask('chat', '42', 'Я не хочу жить');
    expect(result.escalated).toBe(true);
    expect(result.text).toContain('экстренную службу');
    expect(provider.answer).not.toHaveBeenCalled();
    expect(repository.log).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'escalated', category: 'urgent_safety' }));
  });

  it('does not provide medical or legal advice', async () => {
    const { provider, service } = setup();
    const result = await service.ask('chat', '42', 'Какое лекарство мне принимать?');
    expect(result.text).toContain('профильного специалиста');
    expect(provider.answer).not.toHaveBeenCalled();
  });
});

describe('GeminiBibleAnswerProvider', () => {
  it('uses strict structured output and disables response storage', async () => {
    const answer = { answer: 'Ответ', bibleReferences: [], needsPastor: true, category: 'pastoral', sermonSourceIds: [] };
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200 }));
    const provider = new GeminiBibleAnswerProvider({ apiKey: 'key', model: 'model', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', request });
    await expect(provider.answer('Новый вопрос', undefined, [], [{ role: 'user', content: 'Прошлый вопрос' }])).resolves.toEqual({ ...answer, model: 'model' });
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.type).toBe('OBJECT');
    expect(body.contents[0].parts[0].text).toContain('Прошлый вопрос');
    expect(body.contents[0].parts[0].text).toContain('Новый вопрос');
  });

  it('rejects an answer too long for one Telegram message', async () => {
    const answer = { answer: 'A'.repeat(3201), bibleReferences: [], needsPastor: false, category: 'bible', sermonSourceIds: [] };
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200 }));
    await expect(new GeminiBibleAnswerProvider({ apiKey: 'key', model: 'model', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', request }).answer('Вопрос')).rejects.toThrow();
  });
});
