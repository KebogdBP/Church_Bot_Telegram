import { PrismaClient, SermonAudioKind, SermonPurpose, SermonStatus, TranscriptionStatus } from '@prisma/client';

export class DevotionalAdminService {
  public constructor(private readonly prisma: PrismaClient) {}
  public async configure(chatId: string, enabled: boolean, localTime = '08:00'): Promise<void> {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw new Error('Время должно быть в формате HH:MM');
    await this.prisma.churchGroup.upsert({ where: { telegramChatId: chatId }, create: { telegramChatId: chatId, devotionalEnabled: enabled, devotionalLocalTime: localTime }, update: { devotionalEnabled: enabled, devotionalLocalTime: localTime } });
  }
  public async status(chatId: string): Promise<{ enabled: boolean; localTime: string } | null> {
    const group = await this.prisma.churchGroup.findUnique({ where: { telegramChatId: chatId }, select: { devotionalEnabled: true, devotionalLocalTime: true } });
    return group ? { enabled: group.devotionalEnabled, localTime: group.devotionalLocalTime } : null;
  }
  public async addText(chatId: string, userId: string, title: string, text: string): Promise<string> {
    const group = await this.prisma.churchGroup.upsert({ where: { telegramChatId: chatId }, create: { telegramChatId: chatId }, update: {} });
    const sermon = await this.prisma.sermon.create({ data: { churchGroupId: group.id, purpose: SermonPurpose.CHURCH_SERMON, sourceMessageId: `manual:${userId}:${Date.now()}`, submittedByUserId: userId, audioKind: SermonAudioKind.DOCUMENT, fileName: `${title.slice(0, 80)}.txt`, mimeType: 'text/plain', status: SermonStatus.STORED, transcriptionStatus: TranscriptionStatus.COMPLETED, transcript: text, transcribedAt: new Date() }, select: { publicId: true } });
    return sermon.publicId;
  }
}
