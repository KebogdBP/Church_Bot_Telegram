import { describe, expect, it, vi } from 'vitest';
import { OpenAITranscriptionProvider } from '../src/ai/openai-transcription-provider.js';

describe('OpenAITranscriptionProvider', () => {
  it('sends audio as multipart form data and returns trimmed text', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ text: '  Текст проповеди.  ' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const provider = new OpenAITranscriptionProvider(
      'test-key',
      'gpt-4o-mini-transcribe',
      'ru',
      'https://api.openai.com/v1',
      request,
    );

    const result = await provider.transcribe({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'sermon.mp3',
      mimeType: 'audio/mpeg',
    });

    expect(result).toEqual({ text: 'Текст проповеди.', model: 'gpt-4o-mini-transcribe' });
    const [url, options] = request.mock.calls[0] ?? [];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(options?.headers).toEqual({ Authorization: 'Bearer test-key' });
    const form = options?.body as FormData;
    expect(form.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(form.get('language')).toBe('ru');
    expect(form.get('response_format')).toBe('json');
    expect((form.get('file') as File).name).toBe('sermon.mp3');
  });

  it('surfaces an API error without exposing the key', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'invalid audio' } }),
      { status: 400 },
    ));
    const provider = new OpenAITranscriptionProvider(
      'private-key', 'gpt-4o-mini-transcribe', 'ru', 'https://api.openai.com/v1', request,
    );

    await expect(provider.transcribe({ bytes: new Uint8Array([1]), fileName: 'bad.mp3' }))
      .rejects.toThrow('OpenAI transcription returned 400: invalid audio');
  });
});
