export interface WeeklyDigestDraft { id: string; content: string; status: 'draft' | 'scheduled' | 'processing' | 'sent' | 'failed' }
export interface DueWeeklyDigest { id: string; chatId: string; content: string; attempt: number }

export interface WeeklyDigestRepository {
  configure(chatId: string, enabled: boolean, weekday: number, localTime: string): Promise<void>;
  createOrRefreshDraft(chatId: string, now: Date): Promise<WeeklyDigestDraft>;
  findCurrent(chatId: string, now: Date): Promise<WeeklyDigestDraft | null>;
  approve(chatId: string, digestId: string, userId: string, now: Date): Promise<boolean>;
  planAutomaticDrafts(now: Date): Promise<number>;
  recoverStale(now: Date, staleBefore: Date): Promise<number>;
  claimDue(now: Date, limit: number): Promise<DueWeeklyDigest[]>;
  markSent(id: string, now: Date): Promise<void>;
  markFailed(id: string, error: string, retryAt: Date): Promise<void>;
}
