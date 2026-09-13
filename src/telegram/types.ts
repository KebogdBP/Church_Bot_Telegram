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

const telegramAudioSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  duration: z.number().int().nonnegative(),
  performer: z.string().optional(),
  title: z.string().optional(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  file_size: z.number().int().nonnegative().optional(),
}).passthrough();

const telegramVoiceSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  duration: z.number().int().nonnegative(),
  mime_type: z.string().optional(),
  file_size: z.number().int().nonnegative().optional(),
}).passthrough();

const telegramDocumentSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  file_size: z.number().int().nonnegative().optional(),
}).passthrough();

const telegramMessageSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  chat: telegramChatSchema,
  from: telegramUserSchema.optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  audio: telegramAudioSchema.optional(),
  voice: telegramVoiceSchema.optional(),
  document: telegramDocumentSchema.optional(),
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

export interface IncomingSermonAudio {
  chatId: string;
  chatType: 'private' | 'group' | 'supergroup' | 'channel';
  messageId: string;
  userId?: string;
  kind: 'audio' | 'voice' | 'document';
  fileId: string;
  fileUniqueId: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  durationSeconds?: number;
  title?: string;
  performer?: string;
  caption?: string;
}
