import type { IncomingMessage, TelegramUpdate } from './types.js';

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
