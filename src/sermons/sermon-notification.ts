export interface DueSermonNotification { id: string; targetChatId: string; message: string; attempts: number }
export interface SermonNotificationRepository {
  planMilestones(now: Date): Promise<number>;
  recoverStale(now: Date, staleBefore: Date): Promise<number>;
  claimDue(now: Date, limit: number): Promise<DueSermonNotification[]>;
  markSent(id: string, now: Date): Promise<void>;
  markFailed(id: string, error: string, retryAt: Date): Promise<void>;
}
