import type { IncomingCallback, IncomingMessage, IncomingSermonAudio, TelegramUpdate } from './types.js';

export function normalizeCallback(update: TelegramUpdate): IncomingCallback | null {
  const callback = update.callback_query;
  if (!callback?.message || !callback.data) return null;
  return { id: callback.id, chatId: String(callback.message.chat.id), userId: String(callback.from.id), messageId: String(callback.message.message_id), data: callback.data };
}

export function normalizeMessage(update: TelegramUpdate): IncomingMessage | null {
  const message = update.message ?? update.channel_post;
  const text = message?.text?.trim() ?? message?.caption?.trim();

  if (!message || !message.from || !text) {
    return null;
  }

  return {
    chatId: String(message.chat.id),
    userId: String(message.from.id),
    text,
    messageId: String(message.message_id),
    chatType: message.chat.type,
  };
}

export function normalizeSermonAudio(update: TelegramUpdate): IncomingSermonAudio | null {
  const message = update.message ?? update.channel_post;
  if (!message) return null;

  const common = {
    chatId: String(message.chat.id),
    chatType: message.chat.type,
    messageId: String(message.message_id),
    ...(message.from ? { userId: String(message.from.id) } : {}),
    ...(message.caption ? { caption: message.caption } : {}),
  };

  if (message.audio) {
    return {
      ...common,
      kind: 'audio',
      fileId: message.audio.file_id,
      fileUniqueId: message.audio.file_unique_id,
      durationSeconds: message.audio.duration,
      ...(message.audio.file_name ? { fileName: message.audio.file_name } : {}),
      ...(message.audio.mime_type ? { mimeType: message.audio.mime_type } : {}),
      ...(message.audio.file_size === undefined ? {} : { fileSize: message.audio.file_size }),
      ...(message.audio.title ? { title: message.audio.title } : {}),
      ...(message.audio.performer ? { performer: message.audio.performer } : {}),
    };
  }

  if (message.voice) {
    return {
      ...common,
      kind: 'voice',
      fileId: message.voice.file_id,
      fileUniqueId: message.voice.file_unique_id,
      durationSeconds: message.voice.duration,
      ...(message.voice.mime_type ? { mimeType: message.voice.mime_type } : {}),
      ...(message.voice.file_size === undefined ? {} : { fileSize: message.voice.file_size }),
    };
  }

  const document = message.document;
  if (!document?.mime_type?.startsWith('audio/')) return null;
  return {
    ...common,
    kind: 'document',
    fileId: document.file_id,
    fileUniqueId: document.file_unique_id,
    mimeType: document.mime_type,
    ...(document.file_name ? { fileName: document.file_name } : {}),
    ...(document.file_size === undefined ? {} : { fileSize: document.file_size }),
  };
}
