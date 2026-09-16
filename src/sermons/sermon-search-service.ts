import { PrismaClient, TranscriptionStatus } from '@prisma/client';

export interface SermonSearchResult { sermonId: string; title: string; date: Date; excerpt: string }
export interface SermonArchiveEntry { sermonId: string; title: string; date: Date; transcript: string; outline: Array<{ title: string; points: string[] }> }

export class SermonSearchService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async search(chatId: string, rawQuery: string, limit = 5): Promise<SermonSearchResult[]> {
    const query = rawQuery.trim().replace(/\s+/g, ' ').slice(0, 100);
    if (query.length < 2) return [];
    const sermons = await this.prisma.sermon.findMany({
      where: { churchGroup: { telegramChatId: chatId }, transcriptionStatus: TranscriptionStatus.COMPLETED, transcript: { contains: query, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 10),
      select: { publicId: true, title: true, fileName: true, createdAt: true, transcript: true },
    });
    return sermons.flatMap((sermon) => sermon.transcript ? [{ sermonId: sermon.publicId, title: sermon.title ?? sermon.fileName ?? 'Проповедь', date: sermon.createdAt, excerpt: excerptAround(sermon.transcript, query) }] : []);
  }

  public async searchContext(chatId: string, question: string, limit = 3): Promise<SermonSearchResult[]> {
    const terms = [...new Set(question.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{4,}/gu) ?? [])].sort((a, b) => b.length - a.length).slice(0, 8);
    if (!terms.length) return [];
    const sermons = await this.prisma.sermon.findMany({
      where: { churchGroup: { telegramChatId: chatId }, transcriptionStatus: TranscriptionStatus.COMPLETED, transcript: { not: null }, OR: terms.map((term) => ({ transcript: { contains: term, mode: 'insensitive' as const } })) },
      orderBy: { createdAt: 'desc' }, take: 20,
      select: { publicId: true, title: true, fileName: true, createdAt: true, transcript: true },
    });
    return sermons.flatMap((sermon) => {
      if (!sermon.transcript) return [];
      const lower = sermon.transcript.toLocaleLowerCase('ru');
      const matched = terms.find((term) => lower.includes(term));
      return matched ? [{ sermonId: sermon.publicId, title: sermon.title ?? sermon.fileName ?? 'Проповедь', date: sermon.createdAt, excerpt: excerptAround(sermon.transcript, matched, 220) }] : [];
    }).slice(0, Math.min(Math.max(limit, 1), 3));
  }

  public async get(chatId: string, sermonId: string, allowAdminArchive = false): Promise<SermonArchiveEntry | null> {
    const sermon = await this.prisma.sermon.findFirst({
      where: { ...(allowAdminArchive ? {} : { churchGroup: { telegramChatId: chatId } }), publicId: sermonId.toUpperCase(), transcriptionStatus: TranscriptionStatus.COMPLETED },
      select: { publicId: true, title: true, fileName: true, createdAt: true, transcript: true, outline: true },
    });
    if (!sermon?.transcript) return null;
    return { sermonId: sermon.publicId, title: sermon.title ?? sermon.fileName ?? 'Проповедь', date: sermon.createdAt, transcript: sermon.transcript, outline: Array.isArray(sermon.outline) ? sermon.outline as Array<{ title: string; points: string[] }> : [] };
  }
}

export function excerptAround(text: string, query: string, radius = 180): string {
  const normalizedText = text.toLocaleLowerCase('ru');
  const index = normalizedText.indexOf(query.toLocaleLowerCase('ru'));
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
