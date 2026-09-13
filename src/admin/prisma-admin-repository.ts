import { PrismaClient, SermonPostStatus } from '@prisma/client';
import type { AdminRepository } from './admin-repository.js';

export class PrismaAdminRepository implements AdminRepository {
  public constructor(private readonly prisma: PrismaClient) {}
  public async isAdmin(chatId: string, userId: string): Promise<boolean> {
    return Boolean(await this.prisma.groupAdmin.findFirst({ where: { telegramUserId: userId, churchGroup: { telegramChatId: chatId } }, select: { id: true } }));
  }
  public async add(chatId: string, userId: string, addedByUserId: string, timezone: string): Promise<boolean> {
    const group = await this.prisma.churchGroup.upsert({ where: { telegramChatId: chatId }, update: {}, create: { telegramChatId: chatId, timezone } });
    const result = await this.prisma.groupAdmin.createMany({ data: [{ churchGroupId: group.id, telegramUserId: userId, addedByUserId }], skipDuplicates: true });
    return result.count > 0;
  }
  public async remove(chatId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.groupAdmin.deleteMany({ where: { telegramUserId: userId, churchGroup: { telegramChatId: chatId } } });
    return result.count > 0;
  }
  public async list(chatId: string): Promise<string[]> {
    return (await this.prisma.groupAdmin.findMany({ where: { churchGroup: { telegramChatId: chatId } }, orderBy: { createdAt: 'asc' } })).map((admin) => admin.telegramUserId);
  }
  public async dashboard(chatId: string) {
    const group = await this.prisma.churchGroup.findUnique({ where: { telegramChatId: chatId } });
    if (!group) return { events: 0, sermons: 0, draftPosts: 0, scheduledPosts: 0, admins: 0, contextConfigured: false };
    const [events, sermons, draftPosts, scheduledPosts, admins] = await this.prisma.$transaction([
      this.prisma.event.count({ where: { churchGroupId: group.id, active: true } }),
      this.prisma.sermon.count({ where: { churchGroupId: group.id } }),
      this.prisma.sermonPost.count({ where: { churchGroupId: group.id, status: SermonPostStatus.DRAFT } }),
      this.prisma.sermonPost.count({ where: { churchGroupId: group.id, status: SermonPostStatus.SCHEDULED } }),
      this.prisma.groupAdmin.count({ where: { churchGroupId: group.id } }),
    ]);
    return { events, sermons, draftPosts, scheduledPosts, admins, contextConfigured: Boolean(group.assistantContext) };
  }
}
