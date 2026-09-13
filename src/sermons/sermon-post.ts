export interface SermonPostDraft {
  id: string;
  sermonId: string;
  sequence: number;
  content: string;
  status: 'draft' | 'scheduled' | 'processing' | 'sent' | 'failed';
  scheduledFor?: Date;
}

export interface ClaimedSermonPost {
  id: string;
  chatId: string;
  content: string;
  attempt: number;
}

export interface SermonPostRepository {
  listDrafts(chatId: string): Promise<SermonPostDraft[]>;
  findForReview(chatId: string, postId: string): Promise<SermonPostDraft | null>;
  approveSeries(chatId: string, postId: string, userId: string, now: Date): Promise<number>;
  recoverStale(now: Date, staleBefore: Date): Promise<number>;
  claimDue(now: Date, limit: number): Promise<ClaimedSermonPost[]>;
  markSent(postId: string, sentAt: Date): Promise<void>;
  markFailed(postId: string, error: string, retryAt: Date): Promise<void>;
}
