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
  } satisfies AssistantRepository;
  const provider = {
    answer: vi.fn().mockResolvedValue({ answer: 'Ответ', bibleReferences: ['Ин. 3:16'], needsPastor: false, category: 'bible', model: 'model' }),
  } satisfies BibleAnswerProvider;
  return { repository, provider, service: new BibleAssistantService(repository, provider, 'privacy-secret-long', 'Europe/Moscow') };
}

describe('BibleAssistantService', () => {
  it('answers ordinary questions with references and no raw conversation log', async () => {
    const { repository, provider, service } = setup();
    await expect(service.ask('chat', '42', 'Что такое благодать?')).resolves.toMatchObject({ text: 'Ответ\n\nБиблейские места: Ин. 3:16' });
    expect(provider.answer).toHaveBeenCalledWith('Что такое благодать?', 'Евангельская община');
    expect(repository.log).toHaveBeenCalledWith(expect.not.objectContaining({ question: expect.anything(), answer: expect.anything() }));
    expect(repository.log).toHaveBeenCalledWith(expect.objectContaining({ userHash: expect.stringMatching(/^[a-f0-9]{64}$/), outcome: 'answered' }));
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
    const answer = { answer: 'Ответ', bibleReferences: [], needsPastor: true, category: 'pastoral' };
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200 }));
    const provider = new GeminiBibleAnswerProvider({ apiKey: 'key', model: 'model', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', request });
    await expect(provider.answer('Вопрос')).resolves.toEqual({ ...answer, model: 'model' });
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.type).toBe('OBJECT');
  });

  it('rejects an answer too long for one Telegram message', async () => {
    const answer = { answer: 'A'.repeat(3201), bibleReferences: [], needsPastor: false, category: 'bible' };
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200 }));
    await expect(new GeminiBibleAnswerProvider({ apiKey: 'key', model: 'model', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', request }).answer('Вопрос')).rejects.toThrow();
  });
});
