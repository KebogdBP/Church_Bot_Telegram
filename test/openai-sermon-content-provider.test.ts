import { describe, expect, it, vi } from 'vitest';
import { OpenAISermonContentProvider } from '../src/ai/openai-sermon-content-provider.js';

describe('OpenAISermonContentProvider', () => {
  it('requests and validates structured content', async () => {
    const output = { summary: 'Кратко', keyThoughts: ['1', '2', '3'], reflectionQuestions: ['1?', '2?'], followUpPosts: ['A', 'B'] };
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(output) }), { status: 200 }));
    const provider = new OpenAISermonContentProvider('key', 'model', 'https://api.openai.com/v1', request);

    await expect(provider.generate('транскрипт')).resolves.toEqual({ ...output, model: 'model' });
    const options = request.mock.calls[0]?.[1];
    const body = JSON.parse(String(options?.body));
    expect(body.store).toBe(false);
    expect(body.text.format.type).toBe('json_schema');
    expect(options?.headers).toEqual({ Authorization: 'Bearer key', 'Content-Type': 'application/json' });
  });
});
