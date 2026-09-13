import type { AdminRepository } from './admin-repository.js';

export class AdminService {
  public constructor(private readonly repository: AdminRepository | undefined, private readonly bootstrapIds: ReadonlySet<string>, private readonly timezone: string) {}
  public async isAdmin(chatId: string, userId: string) { return this.bootstrapIds.has(userId) || Boolean(await this.repository?.isAdmin(chatId, userId)); }
  public add(chatId: string, userId: string, actorId: string) { return this.repository?.add(chatId, userId, actorId, this.timezone) ?? Promise.resolve(false); }
  public remove(chatId: string, userId: string) { if (this.bootstrapIds.has(userId)) return Promise.resolve(false); return this.repository?.remove(chatId, userId) ?? Promise.resolve(false); }
  public async list(chatId: string) { return [...new Set([...this.bootstrapIds, ...(await this.repository?.list(chatId) ?? [])])]; }
  public dashboard(chatId: string) { return this.repository?.dashboard(chatId) ?? Promise.resolve({ events: 0, sermons: 0, draftPosts: 0, scheduledPosts: 0, admins: this.bootstrapIds.size, contextConfigured: false }); }
}
