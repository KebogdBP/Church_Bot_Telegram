import { z } from 'zod';

const telegramUserSchema = z.object({
  id: z.number(),
  is_bot: z.boolean(),
  first_name: z.string(),
  username: z.string().optional(),
}).passthrough();

const telegramChatSchema = z.object({
  id: z.number(),
  type: z.enum(['private', 'group', 'supergroup', 'channel']),
  title: z.string().optional(),
  username: z.string().optional(),
}).passthrough();

const telegramMessageSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  chat: telegramChatSchema,
  from: telegramUserSchema.optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  audio: z.unknown().optional(),
  voice: z.unknown().optional(),
  document: z.unknown().optional(),
}).passthrough();

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: telegramMessageSchema.optional(),
  channel_post: telegramMessageSchema.optional(),
}).passthrough();

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export interface IncomingMessage {
  chatId: string;
  userId: string;
  text: string;
  messageId: string;
  chatType: 'private' | 'group' | 'supergroup' | 'channel';
}
