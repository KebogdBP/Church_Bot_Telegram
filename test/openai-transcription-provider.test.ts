import { describe, expect, it, vi } from 'vitest';
import { GroqTranscriptionProvider } from '../src/ai/groq-transcription-provider.js';

describe('GroqTranscriptionProvider', () => {
  it('sends audio as multipart form data and returns trimmed text', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ text: '  Текст проповеди.  ' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const provider = new GroqTranscriptionProvider(
      'test-key',
      'whisper-large-v3-turbo',
      'ru',
      'https://api.groq.com/openai/v1',
      request,
    );

    const result = await provider.transcribe({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'sermon.mp3',
      mimeType: 'audio/mpeg',
    });

    expect(result).toEqual({ text: 'Текст проповеди.', model: 'whisper-large-v3-turbo' });
    const [url, options] = request.mock.calls[0] ?? [];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(options?.headers).toEqual({ Authorization: 'Bearer test-key' });
    const form = options?.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('language')).toBe('ru');
    expect(form.get('response_format')).toBe('json');
    expect((form.get('file') as File).name).toBe('sermon.mp3');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('surfaces an API error without exposing the key', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'invalid audio' } }),
      { status: 400 },
    ));
    const provider = new GroqTranscriptionProvider(
      'private-key', 'whisper-large-v3-turbo', 'ru', 'https://api.groq.com/openai/v1', request,
    );

    await expect(provider.transcribe({ bytes: new Uint8Array([1]), fileName: 'bad.mp3' }))
      .rejects.toThrow('Groq transcription returned 400: invalid audio');
  });
});
