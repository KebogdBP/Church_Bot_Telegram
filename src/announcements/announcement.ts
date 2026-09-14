export interface AnnouncementDraft { id: string; content: string; status: string; scheduledFor?: Date }
export interface DueAnnouncement { id: string; chatId: string; content: string; attempt: number }
export interface AnnouncementRepository {
  create(chatId: string, userId: string, content: string, timezone: string): Promise<AnnouncementDraft>;
  find(chatId: string, id: string): Promise<AnnouncementDraft | null>;
  listDrafts(chatId: string): Promise<AnnouncementDraft[]>;
  edit(chatId: string, id: string, userId: string, content: string, now: Date): Promise<boolean>;
  reject(chatId: string, id: string, userId: string, now: Date): Promise<boolean>;
  approve(chatId: string, id: string, userId: string, scheduledFor: Date, now: Date): Promise<boolean>;
  recoverStale(now: Date, staleBefore: Date): Promise<number>;
  claimDue(now: Date, limit: number): Promise<DueAnnouncement[]>;
  markSent(id: string, now: Date): Promise<void>;
  markFailed(id: string, error: string, retryAt: Date): Promise<void>;
}
