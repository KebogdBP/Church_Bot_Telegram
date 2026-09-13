import {
  Prisma,
  PrismaClient,
  SermonAudioKind,
  SermonStatus as PrismaSermonStatus,
  type Sermon as PrismaSermon,
} from '@prisma/client';
import type { CreateSermon, Sermon, SermonRepository } from './sermon.js';

export class PrismaSermonRepository implements SermonRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createIfNew(input: CreateSermon, timezone: string): Promise<{ sermon: Sermon; created: boolean }> {
    const group = await this.prisma.churchGroup.upsert({
      where: { telegramChatId: input.chatId },
      update: {},
      create: { telegramChatId: input.chatId, timezone },
    });

    try {
      const sermon = await this.prisma.sermon.create({
        data: {
          churchGroupId: group.id,
          sourceMessageId: input.sourceMessageId,
          submittedByUserId: input.submittedByUserId ?? null,
          audioKind: toPrismaKind(input.kind),
          telegramFileId: input.telegramFileId,
          telegramFileUniqueId: input.telegramFileUniqueId,
          fileName: input.fileName ?? null,
          mimeType: input.mimeType ?? null,
          fileSize: input.fileSize === undefined ? null : BigInt(input.fileSize),
          durationSeconds: input.durationSeconds ?? null,
          title: input.title ?? null,
          performer: input.performer ?? null,
          caption: input.caption ?? null,
        },
      });
      return { sermon: toDomain(sermon, input.chatId), created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.sermon.findUniqueOrThrow({
        where: {
          churchGroupId_sourceMessageId: {
            churchGroupId: group.id,
            sourceMessageId: input.sourceMessageId,
          },
        },
      });
      return { sermon: toDomain(existing, input.chatId), created: false };
    }
  }

  public async recoverStale(now: Date, staleBefore: Date): Promise<number> {
    const result = await this.prisma.sermon.updateMany({
      where: { status: PrismaSermonStatus.DOWNLOADING, updatedAt: { lte: staleBefore } },
      data: {
        status: PrismaSermonStatus.FAILED,
        availableAt: now,
        lastError: 'Recovered after an interrupted download',
      },
    });
    return result.count;
  }

  public async claimNext(now: Date): Promise<Sermon | null> {
    const candidate = await this.prisma.sermon.findFirst({
      where: {
        status: { in: [PrismaSermonStatus.RECEIVED, PrismaSermonStatus.FAILED] },
        availableAt: { lte: now },
        attempts: { lt: 5 },
      },
      include: { churchGroup: true },
      orderBy: { availableAt: 'asc' },
    });
    if (!candidate) return null;

    const claimed = await this.prisma.sermon.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        attempts: candidate.attempts,
      },
      data: {
        status: PrismaSermonStatus.DOWNLOADING,
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    return claimed.count === 1
      ? { ...toDomain(candidate, candidate.churchGroup.telegramChatId), attempts: candidate.attempts + 1 }
      : null;
  }

  public async markStored(sermonId: string, telegramFilePath: string, storedPath: string): Promise<void> {
    await this.prisma.sermon.update({
      where: { id: sermonId },
      data: {
        status: PrismaSermonStatus.STORED,
        telegramFilePath,
        storedPath,
        lastError: null,
      },
    });
  }

  public async markTooLarge(sermonId: string, actualSize: number): Promise<void> {
    await this.prisma.sermon.update({
      where: { id: sermonId },
      data: {
        status: PrismaSermonStatus.TOO_LARGE,
        fileSize: BigInt(actualSize),
        lastError: 'File exceeds the configured Telegram download limit',
      },
    });
  }

  public async markFailed(sermonId: string, error: string, retryAt: Date): Promise<void> {
    await this.prisma.sermon.update({
      where: { id: sermonId },
      data: {
        status: PrismaSermonStatus.FAILED,
        availableAt: retryAt,
        lastError: error.slice(0, 2_000),
      },
    });
  }
}

function toPrismaKind(kind: CreateSermon['kind']): SermonAudioKind {
  if (kind === 'voice') return SermonAudioKind.VOICE;
  if (kind === 'document') return SermonAudioKind.DOCUMENT;
  return SermonAudioKind.AUDIO;
}

function toDomain(sermon: PrismaSermon, chatId: string): Sermon {
  return {
    id: sermon.id,
    chatId,
    sourceMessageId: sermon.sourceMessageId,
    ...(sermon.submittedByUserId === null ? {} : { submittedByUserId: sermon.submittedByUserId }),
    kind: sermon.audioKind === SermonAudioKind.VOICE
      ? 'voice'
      : sermon.audioKind === SermonAudioKind.DOCUMENT ? 'document' : 'audio',
    telegramFileId: sermon.telegramFileId,
    telegramFileUniqueId: sermon.telegramFileUniqueId,
    ...(sermon.fileName === null ? {} : { fileName: sermon.fileName }),
    ...(sermon.mimeType === null ? {} : { mimeType: sermon.mimeType }),
    ...(sermon.fileSize === null ? {} : { fileSize: Number(sermon.fileSize) }),
    ...(sermon.durationSeconds === null ? {} : { durationSeconds: sermon.durationSeconds }),
    ...(sermon.title === null ? {} : { title: sermon.title }),
    ...(sermon.performer === null ? {} : { performer: sermon.performer }),
    ...(sermon.caption === null ? {} : { caption: sermon.caption }),
    status: toDomainStatus(sermon.status),
    attempts: sermon.attempts,
    createdAt: sermon.createdAt,
  };
}

function toDomainStatus(status: PrismaSermonStatus): Sermon['status'] {
  return status.toLowerCase() as Sermon['status'];
}
