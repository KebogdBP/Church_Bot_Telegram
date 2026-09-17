import { PrismaClient, TranscriptionStatus } from '@prisma/client';

export interface SermonSearchResult { sermonId: string; title: string; date: Date; excerpt: string }
export interface SermonArchiveEntry { sermonId: string; title: string; date: Date; transcript: string; storedPath?: string; summary?: string; outline: Array<{ title: string; points: string[] }>; keyThoughts: string[]; reflectionQuestions: string[] }

export class SermonSearchService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(chatId: string, limit = 8): Promise<SermonSearchResult[]> {
    const sermons = await this.prisma.sermon.findMany({
      where: { churchGroup: { telegramChatId: chatId }, transcriptionStatus: TranscriptionStatus.COMPLETED, transcript: { not: null } },
      orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 20),
      select: { publicId: true, title: true, fileName: true, createdAt: true, transcript: true },
    });
    return sermons.map((sermon) => ({
      sermonId: sermon.publicId,
      title: sermon.title ?? sermon.fileName ?? 'Проповедь',
      date: sermon.createdAt,
      excerpt: sermon.transcript?.slice(0, 180).trim() ?? '',
    }));
  }

  public async search(chatId: string, rawQuery: string, limit = 5): Promise<SermonSearchResult[]> {
    const query = rawQuery.trim().replace(/\s+/g, ' ').slice(0, 100);
    if (query.length < 2) return [];
    const sermons = await this.prisma.sermon.findMany({
      where: { churchGroup: { telegramChatId: chatId }, transcriptionStatus: TranscriptionStatus.COMPLETED, OR: [{ transcript: { contains: query, mode: 'insensitive' } }, { title: { contains: query, mode: 'insensitive' } }, { fileName: { contains: query, mode: 'insensitive' } }] },
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
      select: { publicId: true, title: true, fileName: true, createdAt: true, transcript: true, storedPath: true, summary: true, outline: true, keyThoughts: true, reflectionQuestions: true },
    });
    if (!sermon?.transcript) return null;
    return { sermonId: sermon.publicId, title: sermon.title ?? sermon.fileName ?? 'Проповедь', date: sermon.createdAt, transcript: sermon.transcript, ...(sermon.storedPath ? { storedPath: sermon.storedPath } : {}), ...(sermon.summary ? { summary: sermon.summary } : {}), outline: Array.isArray(sermon.outline) ? sermon.outline as Array<{ title: string; points: string[] }> : [], keyThoughts: Array.isArray(sermon.keyThoughts) ? sermon.keyThoughts.filter((item): item is string => typeof item === 'string') : [], reflectionQuestions: Array.isArray(sermon.reflectionQuestions) ? sermon.reflectionQuestions.filter((item): item is string => typeof item === 'string') : [] };
  }
}

export function excerptAround(text: string, query: string, radius = 180): string {
  const normalizedText = text.toLocaleLowerCase('ru');
  const index = normalizedText.indexOf(query.toLocaleLowerCase('ru'));
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
