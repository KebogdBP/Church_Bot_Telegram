import { PrismaClient } from '@prisma/client';
import { normalizePublicSermonId } from './public-sermon-id.js';

export interface SermonStatusView {
  id: string;
  fileName?: string;
  download: string;
  transcription: string;
  content: string;
  posts: number;
  error?: string;
}

export interface SermonStatusReader {
  get(chatId: string, sermonId: string): Promise<SermonStatusView | null>;
}

export class PrismaSermonStatusReader implements SermonStatusReader {
  public constructor(private readonly prisma: PrismaClient) {}
  public async get(chatId: string, sermonId: string): Promise<SermonStatusView | null> {
    const sermon = await this.prisma.sermon.findFirst({
      where: { churchGroup: { telegramChatId: chatId }, OR: [{ id: sermonId }, { publicId: normalizePublicSermonId(sermonId) }] },
      select: {
        publicId: true, fileName: true, status: true, transcriptionStatus: true, contentStatus: true,
        lastError: true, transcriptionError: true, contentError: true, _count: { select: { posts: true } },
      },
    });
    if (!sermon) return null;
    return {
      id: sermon.publicId,
      ...(sermon.fileName ? { fileName: sermon.fileName } : {}),
      download: sermon.status,
      transcription: sermon.transcriptionStatus,
      content: sermon.contentStatus,
      posts: sermon._count.posts,
      ...((sermon.contentError ?? sermon.transcriptionError ?? sermon.lastError) ? { error: (sermon.contentError ?? sermon.transcriptionError ?? sermon.lastError)! } : {}),
    };
  }
}
