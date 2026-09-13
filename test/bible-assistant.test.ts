import { describe, expect, it, vi } from 'vitest';
import type { AssistantRepository } from '../src/assistant/assistant-repository.js';
import type { BibleAnswerProvider } from '../src/assistant/bible-answer-provider.js';
import { BibleAssistantService } from '../src/assistant/bible-assistant-service.js';
import { OpenAIBibleAnswerProvider } from '../src/assistant/openai-bible-answer-provider.js';

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

describe('OpenAIBibleAnswerProvider', () => {
  it('uses strict structured output and disables response storage', async () => {
    const answer = { answer: 'Ответ', bibleReferences: [], needsPastor: true, category: 'pastoral' };
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(answer) }), { status: 200 }));
    const provider = new OpenAIBibleAnswerProvider('key', 'model', 'https://api.openai.com/v1', request);
    await expect(provider.answer('Вопрос')).resolves.toEqual({ ...answer, model: 'model' });
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
  });
});
