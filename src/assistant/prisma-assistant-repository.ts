import { AssistantOutcome, PrismaClient } from '@prisma/client';
import type { AssistantRepository } from './assistant-repository.js';

export class PrismaAssistantRepository implements AssistantRepository {
  public constructor(private readonly prisma: PrismaClient) {}
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
}
