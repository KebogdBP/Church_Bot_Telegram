import { describe, expect, it, vi } from 'vitest';
import type { AudioStorage } from '../src/sermons/audio-storage.js';
import { SermonDownloadWorker } from '../src/sermons/sermon-download-worker.js';
import type { Sermon, SermonRepository } from '../src/sermons/sermon.js';
import type { TelegramFileClient } from '../src/telegram/telegram-api-client.js';

const sermon: Sermon = {
  id: 'sermon-1',
  chatId: '-100123',
  sourceMessageId: '10',
  kind: 'audio',
  telegramFileId: 'telegram-file',
  telegramFileUniqueId: 'unique-file',
  fileName: 'sermon.mp3',
  fileSize: 3,
  status: 'downloading',
  attempts: 1,
  createdAt: new Date('2026-09-13T10:00:00Z'),
};

function setup(overrides: { claimed?: Sermon; getFileError?: Error } = {}) {
  const repository = {
    createIfNew: vi.fn(),
    recoverStale: vi.fn().mockResolvedValue(0),
    claimNext: vi.fn().mockResolvedValue(overrides.claimed ?? sermon),
    markStored: vi.fn().mockResolvedValue(undefined),
    markTooLarge: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  } satisfies SermonRepository;
  const telegram = {
    getFile: overrides.getFileError
      ? vi.fn().mockRejectedValue(overrides.getFileError)
      : vi.fn().mockResolvedValue({ filePath: 'audio/sermon.mp3', fileSize: 3 }),
    downloadFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  } satisfies TelegramFileClient;
  const storage = {
    save: vi.fn().mockResolvedValue('/data/sermons/sermon-1.mp3'),
  } satisfies AudioStorage;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const worker = new SermonDownloadWorker({
    repository,
    telegram,
    storage,
    logger,
    intervalMs: 30_000,
    maxFileSizeBytes: 20 * 1024 * 1024,
    maxLinkFileSizeBytes: 500 * 1024 * 1024,
    now: () => new Date('2026-09-13T12:00:00Z'),
  });
  return { worker, repository, telegram, storage };
}

describe('SermonDownloadWorker', () => {
  it('downloads and stores the next accepted sermon', async () => {
    const { worker, repository, telegram, storage } = setup();

    await worker.tick();

    expect(telegram.getFile).toHaveBeenCalledWith('telegram-file');
    expect(telegram.downloadFile).toHaveBeenCalledWith('audio/sermon.mp3');
    expect(storage.save).toHaveBeenCalledWith('sermon-1', 'sermon.mp3', new Uint8Array([1, 2, 3]));
    expect(repository.markStored).toHaveBeenCalledWith(
      'sermon-1',
      'audio/sermon.mp3',
      '/data/sermons/sermon-1.mp3',
    );
  });

  it('rejects a file known to exceed the configured limit before downloading it', async () => {
    const oversized = { ...sermon, fileSize: 20 * 1024 * 1024 + 1 };
    const { worker, repository, telegram } = setup({ claimed: oversized });

    await worker.tick();

    expect(repository.markTooLarge).toHaveBeenCalledWith('sermon-1', oversized.fileSize);
    expect(telegram.getFile).not.toHaveBeenCalled();
    expect(telegram.downloadFile).not.toHaveBeenCalled();
  });

  it('schedules an exponential retry after a Telegram error', async () => {
    const secondAttempt = { ...sermon, attempts: 2 };
    const { worker, repository } = setup({
      claimed: secondAttempt,
      getFileError: new Error('temporary Telegram failure'),
    });

    await worker.tick();

    expect(repository.markFailed).toHaveBeenCalledWith(
      'sermon-1',
      'temporary Telegram failure',
      new Date('2026-09-13T12:02:00Z'),
    );
  });

  it('downloads a linked sermon without calling Telegram file methods', async () => {
    const linked: Sermon = { ...sermon, sourceUrl: 'https://media.example.org/sermon.mp3' };
    delete linked.telegramFileId;
    delete linked.telegramFileUniqueId;
    const { repository, telegram, storage } = setup({ claimed: linked });
    const publicAudio = { download: vi.fn().mockResolvedValue({ bytes: new Uint8Array([4, 5]), fileName: 'sermon.mp3' }) };
    const worker = new SermonDownloadWorker({ repository, telegram, storage, publicAudio, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, intervalMs: 30_000, maxFileSizeBytes: 20 * 1024 * 1024, maxLinkFileSizeBytes: 500 * 1024 * 1024 });

    await worker.tick();

    expect(publicAudio.download).toHaveBeenCalledWith(linked.sourceUrl, 500 * 1024 * 1024);
    expect(telegram.getFile).not.toHaveBeenCalled();
    expect(repository.markStored).toHaveBeenCalledWith('sermon-1', linked.sourceUrl, '/data/sermons/sermon-1.mp3');
  });
});
