import type { IncomingSermonAudio } from '../telegram/types.js';
import type { Sermon, SermonRepository } from './sermon.js';

export type SermonIntakeResult =
  | { status: 'accepted'; sermon: Sermon }
  | { status: 'duplicate'; sermon: Sermon }
  | { status: 'forbidden' };

export class SermonIntakeService {
  public constructor(
    private readonly repository: SermonRepository,
    private readonly isAdmin: (chatId: string, userId: string) => Promise<boolean>,
    private readonly timezone: string,
  ) {}

  public async receive(audio: IncomingSermonAudio): Promise<SermonIntakeResult> {
    const trustedChannelPost = audio.chatType === 'channel';
    const personalTranscription = audio.chatType === 'private' && audio.userId !== undefined;
    const trustedAdmin = audio.userId !== undefined && await this.isAdmin(audio.chatId, audio.userId);
    if (!trustedChannelPost && !trustedAdmin && !personalTranscription) return { status: 'forbidden' };

    const result = await this.repository.createIfNew({
      chatId: audio.chatId,
      sourceMessageId: audio.messageId,
      purpose: personalTranscription ? 'personal_transcription' : 'church_sermon',
      ...(audio.userId ? { submittedByUserId: audio.userId } : {}),
      kind: audio.kind,
      telegramFileId: audio.fileId,
      telegramFileUniqueId: audio.fileUniqueId,
      ...(audio.fileName ? { fileName: audio.fileName } : {}),
      ...(audio.mimeType ? { mimeType: audio.mimeType } : {}),
      ...(audio.fileSize === undefined ? {} : { fileSize: audio.fileSize }),
      ...(audio.durationSeconds === undefined ? {} : { durationSeconds: audio.durationSeconds }),
      ...(audio.title ? { title: audio.title } : {}),
      ...(audio.performer ? { performer: audio.performer } : {}),
      ...(audio.caption ? { caption: audio.caption } : {}),
    }, this.timezone);

    return { status: result.created ? 'accepted' : 'duplicate', sermon: result.sermon };
  }

  public async receiveLink(input: { chatId: string; messageId: string; userId: string; url: string }): Promise<SermonIntakeResult> {
    if (!(await this.isAdmin(input.chatId, input.userId))) return { status: 'forbidden' };
    const url = new URL(input.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only public HTTPS links are accepted');
    const result = await this.repository.createIfNew({
      chatId: input.chatId,
      sourceMessageId: input.messageId,
      submittedByUserId: input.userId,
      sourceUrl: url.toString(),
      fileName: url.pathname.split('/').pop() || 'sermon.audio',
    }, this.timezone);
    return { status: result.created ? 'accepted' : 'duplicate', sermon: result.sermon };
  }
}
