import { z } from 'zod';

const userSchema = z.object({
  user_id: z.union([z.number(), z.string()]),
  name: z.string().optional(),
  username: z.string().optional(),
}).passthrough();

const recipientSchema = z.object({
  chat_id: z.union([z.number(), z.string()]).optional(),
  user_id: z.union([z.number(), z.string()]).optional(),
}).passthrough();

const messageSchema = z.object({
  sender: userSchema.optional(),
  recipient: recipientSchema.optional(),
  body: z.object({
    mid: z.string().optional(),
    text: z.string().nullable().optional(),
    attachments: z.array(z.unknown()).optional(),
  }).passthrough(),
}).passthrough();

export const maxUpdateSchema = z.object({
  update_type: z.string(),
  timestamp: z.number(),
  message: messageSchema.optional(),
  chat_id: z.union([z.number(), z.string()]).optional(),
  user: userSchema.optional(),
}).passthrough();

export type MaxUpdate = z.infer<typeof maxUpdateSchema>;

export interface IncomingMessage {
  chatId: string;
  userId: string;
  text: string;
  messageId?: string;
}
