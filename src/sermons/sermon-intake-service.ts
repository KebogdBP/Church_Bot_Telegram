import type { IncomingSermonAudio } from '../telegram/types.js';
import type { Sermon, SermonRepository } from './sermon.js';

export type SermonIntakeResult =
  | { status: 'accepted'; sermon: Sermon }
  | { status: 'duplicate'; sermon: Sermon }
  | { status: 'forbidden' };

export class SermonIntakeService {
  public constructor(
    private readonly repository: SermonRepository,
    private readonly adminUserIds: ReadonlySet<string>,
    private readonly timezone: string,
  ) {}

  public async receive(audio: IncomingSermonAudio): Promise<SermonIntakeResult> {
    const trustedChannelPost = audio.chatType === 'channel';
    const trustedAdmin = audio.userId !== undefined && this.adminUserIds.has(audio.userId);
    if (!trustedChannelPost && !trustedAdmin) return { status: 'forbidden' };

    const result = await this.repository.createIfNew({
      chatId: audio.chatId,
      sourceMessageId: audio.messageId,
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
}
