import type { WeeklyDigestRepository } from './weekly-digest.js';

export class WeeklyDigestService {
  public constructor(private readonly repository: WeeklyDigestRepository, private readonly now = () => new Date()) {}
  public configure(chatId: string, weekday: number, localTime: string) { return this.repository.configure(chatId, true, weekday, localTime); }
  public disable(chatId: string) { return this.repository.configure(chatId, false, 5, '18:00'); }
  public preview(chatId: string) { return this.repository.createOrRefreshDraft(chatId, this.now()); }
  public approve(chatId: string, digestId: string, userId: string) { return this.repository.approve(chatId, digestId, userId, this.now()); }
}
