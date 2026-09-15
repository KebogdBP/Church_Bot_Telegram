import { describe, expect, it } from 'vitest';
import { InMemorySermonRepository } from '../src/sermons/in-memory-sermon-repository.js';
import { SermonIntakeService } from '../src/sermons/sermon-intake-service.js';
import { standaloneHttpsUrl } from '../src/bot/command-router.js';
import type { IncomingSermonAudio } from '../src/telegram/types.js';
import { createPublicSermonId } from '../src/sermons/public-sermon-id.js';

const AUDIO: IncomingSermonAudio = {
  chatId: '-100500',
  chatType: 'supergroup',
  messageId: '77',
  userId: '42',
  kind: 'audio',
  fileId: 'telegram-file-id',
  fileUniqueId: 'stable-file-id',
  fileName: 'sermon.mp3',
  mimeType: 'audio/mpeg',
  fileSize: 1_024,
  durationSeconds: 1_800,
  title: 'О надежде',
};

describe('SermonIntakeService', () => {
  it('creates a compact unambiguous public ID', () => {
    expect(createPublicSermonId()).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
  });
  it('recognizes a standalone shared HTTPS link', () => {
    expect(standaloneHttpsUrl(' https://youtu.be/abc ')).toBe('https://youtu.be/abc');
    expect(standaloneHttpsUrl('Посмотрите https://youtu.be/abc')).toBeNull();
  });
  it('accepts an audio file from an administrator only once', async () => {
    const service = new SermonIntakeService(
      new InMemorySermonRepository(),
      async (_chatId, userId) => userId === '42',
      'Europe/Moscow',
    );

    const first = await service.receive(AUDIO);
    const duplicate = await service.receive(AUDIO);

    expect(first.status).toBe('accepted');
    expect(duplicate.status).toBe('duplicate');
    if (first.status === 'accepted') {
      expect(first.sermon.publicId).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
      expect(first.sermon.status).toBe('received');
      expect(first.sermon.fileName).toBe('sermon.mp3');
    }
  });

  it('rejects a group upload from a regular member', async () => {
    const service = new SermonIntakeService(
      new InMemorySermonRepository(),
      async (_chatId, userId) => userId === '99',
      'Europe/Moscow',
    );
    expect(await service.receive(AUDIO)).toEqual({ status: 'forbidden' });
  });

  it('accepts private audio from a regular member as personal transcription', async () => {
    const service = new SermonIntakeService(new InMemorySermonRepository(), async () => false, 'Europe/Moscow');
    const result = await service.receive({ ...AUDIO, chatId: '77', chatType: 'private', userId: '77' });
    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') expect(result.sermon.purpose).toBe('personal_transcription');
  });

  it('accepts a channel post without a user', async () => {
    const service = new SermonIntakeService(
      new InMemorySermonRepository(),
      async () => false,
      'Europe/Moscow',
    );
    const channelAudio: IncomingSermonAudio = { ...AUDIO, chatType: 'channel' };
    delete channelAudio.userId;

    const result = await service.receive(channelAudio);
    expect(result.status).toBe('accepted');
  });

  it('accepts a public HTTPS sermon link from an administrator', async () => {
    const service = new SermonIntakeService(new InMemorySermonRepository(), async () => true, 'Europe/Moscow');
    const result = await service.receiveLink({ chatId: '-100500', messageId: '78', userId: '42', url: 'https://media.example.org/sermon.mp3' });
    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') expect(result.sermon.sourceUrl).toBe('https://media.example.org/sermon.mp3');
  });

  it('rejects non-HTTPS sermon links', async () => {
    const service = new SermonIntakeService(new InMemorySermonRepository(), async () => true, 'Europe/Moscow');
    await expect(service.receiveLink({ chatId: '-100500', messageId: '79', userId: '42', url: 'http://example.org/sermon.mp3' })).rejects.toThrow('HTTPS');
  });
});
