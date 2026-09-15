import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { parseRetentionSetting, RetentionService } from '../src/retention/retention-service.js';

describe('retention command parser', () => {
  it('accepts supported categories and safe day limits', () => {
    expect(parseRetentionSetting('/retention_set audio 90')).toEqual({ kind: 'audio', days: 90 });
    expect(parseRetentionSetting('/retention_set@churchbot transcripts 3650')).toEqual({ kind: 'transcripts', days: 3650 });
    expect(parseRetentionSetting('/retention_set prayers 1')).toEqual({ kind: 'prayers', days: 1 });
  });

  it('rejects unsupported categories and unsafe limits', () => {
    expect(parseRetentionSetting('/retention_set messages 30')).toBeNull();
    expect(parseRetentionSetting('/retention_set audio 0')).toBeNull();
    expect(parseRetentionSetting('/retention_set prayers 3651')).toBeNull();
  });
});

describe('retention file deletion queue', () => {
  it('keeps a failed file deletion for a later retry', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'church-bot-retention-'));
    await writeFile(join(directory, 'still-present'), 'audio');
    const deletionUpdate = vi.fn().mockResolvedValue(undefined);
    const deletionDelete = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      churchGroup: {
        findUnique: vi.fn().mockResolvedValue({ id: 'group-1', audioRetentionDays: 30, transcriptRetentionDays: 30, prayerRetentionDays: 30 }),
      },
      sermon: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      prayerRequest: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      retentionFileDeletion: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([{ id: 'deletion-1', path: directory }]),
        deleteMany: deletionDelete,
        update: deletionUpdate,
        count: vi.fn().mockResolvedValue(1),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
      $transaction: vi.fn(async (argument: unknown) => typeof argument === 'function'
        ? argument(prisma)
        : Promise.all(argument as Promise<unknown>[])),
    };

    try {
      await expect(new RetentionService(prisma as unknown as PrismaClient).execute('chat-1'))
        .resolves.toEqual({ audio: 0, transcripts: 0, prayers: 0, pendingAudioFiles: 1 });
      expect(deletionDelete).not.toHaveBeenCalled();
      expect(deletionUpdate).toHaveBeenCalledWith({
        where: { id: 'deletion-1' },
        data: { attempts: { increment: 1 }, lastError: expect.any(String) },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
