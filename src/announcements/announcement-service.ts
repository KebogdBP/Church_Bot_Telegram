import { DateTime } from 'luxon';
import type { AnnouncementRepository } from './announcement.js';

export class AnnouncementService {
  public constructor(private readonly repository: AnnouncementRepository, private readonly timezone: string, private readonly now = () => new Date()) {}
  public create(chatId: string, userId: string, content: string) { return this.repository.create(chatId, userId, content, this.timezone); }
  public find(chatId: string, id: string) { return this.repository.find(chatId, id); }
  public list(chatId: string) { return this.repository.listDrafts(chatId); }
  public edit(chatId: string, id: string, userId: string, content: string) { return this.repository.edit(chatId, id, userId, content, this.now()); }
  public reject(chatId: string, id: string, userId: string) { return this.repository.reject(chatId, id, userId, this.now()); }
  public approve(chatId: string, id: string, userId: string, localDateTime?: string): Promise<boolean> {
    const now = this.now();
    const scheduledFor = localDateTime ? DateTime.fromFormat(localDateTime, 'yyyy-MM-dd HH:mm', { zone: this.timezone }).toUTC().toJSDate() : now;
    if (Number.isNaN(scheduledFor.getTime()) || scheduledFor < now) return Promise.resolve(false);
    return this.repository.approve(chatId, id, userId, scheduledFor, now);
  }
}
