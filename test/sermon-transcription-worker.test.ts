import { describe, expect, it, vi } from 'vitest';
import type { TranscriptionProvider } from '../src/ai/transcription-provider.js';
import { SermonTranscriptionWorker } from '../src/sermons/sermon-transcription-worker.js';
import type { TranscriptionRepository } from '../src/sermons/transcription.js';

function setup(providerError?: Error) {
  const repository = {
    recoverStale: vi.fn().mockResolvedValue(0),
    claimNext: vi.fn().mockResolvedValue({
      id: 'sermon-1',
      storedPath: '/data/sermon-1.mp3',
      fileName: 'Sunday.mp3',
      mimeType: 'audio/mpeg',
      attempts: 2,
    }),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  } satisfies TranscriptionRepository;
  const provider = {
    transcribe: providerError
      ? vi.fn().mockRejectedValue(providerError)
      : vi.fn().mockResolvedValue({ text: 'Полный текст', model: 'gpt-4o-mini-transcribe' }),
  } satisfies TranscriptionProvider;
  const worker = new SermonTranscriptionWorker({
    repository,
    provider,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    intervalMs: 30_000,
    now: () => new Date('2026-09-13T12:00:00Z'),
    readAudio: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  });
  return { repository, provider, worker };
}

describe('SermonTranscriptionWorker', () => {
  it('transcribes stored audio and saves the result', async () => {
    const { repository, provider, worker } = setup();

    await worker.tick();

    expect(provider.transcribe).toHaveBeenCalledWith({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'Sunday.mp3',
      mimeType: 'audio/mpeg',
    });
    expect(repository.markCompleted).toHaveBeenCalledWith(
      'sermon-1',
      'Полный текст',
      'gpt-4o-mini-transcribe',
      new Date('2026-09-13T12:00:00Z'),
    );
  });

  it('schedules a retry when transcription fails', async () => {
    const { repository, worker } = setup(new Error('provider unavailable'));

    await worker.tick();

    expect(repository.markFailed).toHaveBeenCalledWith(
      'sermon-1',
      'provider unavailable',
      new Date('2026-09-13T12:02:00Z'),
    );
  });
});
