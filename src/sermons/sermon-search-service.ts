import { PrismaClient, TranscriptionStatus } from '@prisma/client';

export interface SermonSearchResult { sermonId: string; title: string; date: Date; excerpt: string }

export class SermonSearchService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async search(chatId: string, rawQuery: string, limit = 5): Promise<SermonSearchResult[]> {
    const query = rawQuery.trim().replace(/\s+/g, ' ').slice(0, 100);
    if (query.length < 2) return [];
    const sermons = await this.prisma.sermon.findMany({
      where: { churchGroup: { telegramChatId: chatId }, transcriptionStatus: TranscriptionStatus.COMPLETED, transcript: { contains: query, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 10),
      select: { id: true, title: true, fileName: true, createdAt: true, transcript: true },
    });
    return sermons.flatMap((sermon) => sermon.transcript ? [{ sermonId: sermon.id, title: sermon.title ?? sermon.fileName ?? 'Проповедь', date: sermon.createdAt, excerpt: excerptAround(sermon.transcript, query) }] : []);
  }
}

export function excerptAround(text: string, query: string, radius = 180): string {
  const normalizedText = text.toLocaleLowerCase('ru');
  const index = normalizedText.indexOf(query.toLocaleLowerCase('ru'));
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
