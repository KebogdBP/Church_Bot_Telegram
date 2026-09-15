import { describe, expect, it, vi } from 'vitest';
import { GeminiSermonContentProvider } from '../src/ai/gemini-sermon-content-provider.js';

describe('GeminiSermonContentProvider', () => {
  it('requests and validates structured content', async () => {
    const output = { summary: 'Кратко', keyThoughts: ['1', '2', '3'], reflectionQuestions: ['1?', '2?'], followUpPosts: ['A', 'B'] };
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }), { status: 200 }));
    const provider = new GeminiSermonContentProvider({ apiKey: 'key', model: 'model', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', request });

    await expect(provider.generate('транскрипт')).resolves.toEqual({ ...output, model: 'model' });
    const options = request.mock.calls[0]?.[1];
    const body = JSON.parse(String(options?.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.type).toBe('OBJECT');
    expect(options?.headers).toEqual({ 'x-goog-api-key': 'key', 'Content-Type': 'application/json' });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects a post too long for Telegram', async () => {
    const output = { summary: 'Кратко', keyThoughts: ['1', '2', '3'], reflectionQuestions: ['1?', '2?'], followUpPosts: ['A'.repeat(3501), 'B'] };
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }), { status: 200 }));
    await expect(new GeminiSermonContentProvider({ apiKey: 'key', model: 'model', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', request }).generate('текст')).rejects.toThrow();
  });
});
