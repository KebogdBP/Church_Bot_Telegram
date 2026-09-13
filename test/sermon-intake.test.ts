import { describe, expect, it } from 'vitest';
import { InMemorySermonRepository } from '../src/sermons/in-memory-sermon-repository.js';
import { SermonIntakeService } from '../src/sermons/sermon-intake-service.js';
import type { IncomingSermonAudio } from '../src/telegram/types.js';

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
});
