import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AssistantOutcome, PrismaClient } from '@prisma/client';
import type { AssistantRepository } from './assistant-repository.js';
import type { ConversationTurn } from './bible-answer-provider.js';

const HISTORY_TTL_MS = 30 * 86_400_000;
const MAX_STORED_TURNS = 20;

export class PrismaAssistantRepository implements AssistantRepository {
  private readonly encryptionKey: Buffer;

  public constructor(private readonly prisma: PrismaClient, privacySecret: string) {
    this.encryptionKey = createHash('sha256').update(privacySecret).digest();
  }
  public async getContext(chatId: string): Promise<string | undefined> {
    const group = await this.prisma.churchGroup.findUnique({ where: { telegramChatId: chatId }, select: { assistantContext: true } });
    return group?.assistantContext ?? undefined;
  }
  public async setContext(chatId: string, context: string, timezone: string): Promise<void> {
    await this.prisma.churchGroup.upsert({ where: { telegramChatId: chatId }, update: { assistantContext: context }, create: { telegramChatId: chatId, timezone, assistantContext: context } });
  }
  public async log(input: { chatId: string; userHash: string; outcome: 'answered' | 'escalated' | 'failed'; category: string; model?: string; timezone: string }): Promise<void> {
    const group = await this.prisma.churchGroup.upsert({ where: { telegramChatId: input.chatId }, update: {}, create: { telegramChatId: input.chatId, timezone: input.timezone } });
    await this.prisma.assistantInteraction.create({ data: { churchGroupId: group.id, userHash: input.userHash, outcome: AssistantOutcome[input.outcome.toUpperCase() as keyof typeof AssistantOutcome], category: input.category, model: input.model ?? null } });
  }

  public async getHistory(chatId: string, userHash: string, limit: number): Promise<ConversationTurn[]> {
    const group = await this.prisma.churchGroup.findUnique({ where: { telegramChatId: chatId }, select: { id: true } });
    if (!group) return [];
    const now = new Date();
    await this.prisma.assistantConversationTurn.deleteMany({ where: { expiresAt: { lte: now } } });
    const rows = await this.prisma.assistantConversationTurn.findMany({
      where: { churchGroupId: group.id, userHash, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      take: Math.max(0, Math.min(limit, MAX_STORED_TURNS)),
    });
    return rows.reverse().flatMap((row) => {
      try {
        const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null;
        return role ? [{ role, content: this.decrypt(row.contentEncrypted) }] : [];
      } catch {
        return [];
      }
    });
  }

  public async appendExchange(chatId: string, userHash: string, question: string, answer: string, timezone: string): Promise<void> {
    const group = await this.prisma.churchGroup.upsert({ where: { telegramChatId: chatId }, update: {}, create: { telegramChatId: chatId, timezone } });
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + HISTORY_TTL_MS);
    await this.prisma.$transaction(async (tx) => {
      await tx.assistantConversationTurn.createMany({ data: [
        { churchGroupId: group.id, userHash, role: 'user', contentEncrypted: this.encrypt(question), createdAt, expiresAt },
        { churchGroupId: group.id, userHash, role: 'assistant', contentEncrypted: this.encrypt(answer), createdAt: new Date(createdAt.getTime() + 1), expiresAt },
      ] });
      const stale = await tx.assistantConversationTurn.findMany({
        where: { churchGroupId: group.id, userHash }, orderBy: { createdAt: 'desc' }, skip: MAX_STORED_TURNS, select: { id: true },
      });
      if (stale.length) await tx.assistantConversationTurn.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
    });
  }

  public async clearHistory(chatId: string, userHash: string): Promise<void> {
    const group = await this.prisma.churchGroup.findUnique({ where: { telegramChatId: chatId }, select: { id: true } });
    if (group) await this.prisma.assistantConversationTurn.deleteMany({ where: { churchGroupId: group.id, userHash } });
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  private decrypt(value: string): string {
    const [iv, tag, encrypted] = value.split('.');
    if (!iv || !tag || !encrypted) throw new Error('invalid_conversation_ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  }
}
