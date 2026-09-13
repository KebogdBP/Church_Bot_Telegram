import type { IncomingMessage, MaxUpdate } from './types.js';

export function normalizeMessage(update: MaxUpdate): IncomingMessage | null {
  if (update.update_type !== 'message_created' || !update.message) {
    return null;
  }

  const { message } = update;
  const chatId = message.recipient?.chat_id ?? message.recipient?.user_id;
  const userId = message.sender?.user_id;
  const text = message.body.text?.trim();

  if (chatId === undefined || userId === undefined || !text) {
    return null;
  }

  return {
    chatId: String(chatId),
    userId: String(userId),
    text,
    ...(message.body.mid ? { messageId: message.body.mid } : {}),
  };
}
