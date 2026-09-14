import { describe, expect, it, vi } from 'vitest';
import { generateGroqJson } from '../src/ai/groq-json-client.js';

describe('Groq JSON client', () => {
  it('requests and parses a JSON object', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"ok"}' } }] }), { status: 200 }));
    await expect(generateGroqJson({ apiKey: 'key', model: 'model', baseUrl: 'https://api.groq.com/openai/v1', request }, 'system', 'input')).resolves.toEqual({ answer: 'ok' });
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('does not include the API key in provider errors', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 }));
    await expect(generateGroqJson({ apiKey: 'secret', model: 'model', baseUrl: 'https://api.groq.com/openai/v1', request }, 'system', 'input')).rejects.toThrow('Groq returned 400: bad request');
  });
});
