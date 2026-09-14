export interface SermonPostDraft {
  id: string;
  sermonId: string;
  sequence: number;
  content: string;
  status: 'draft' | 'rejected' | 'scheduled' | 'processing' | 'sent' | 'failed';
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
  editDraft(chatId: string, postId: string, content: string, userId: string, now: Date): Promise<boolean>;
  rejectDraft(chatId: string, postId: string, userId: string, now: Date): Promise<boolean>;
  regenerate(chatId: string, sermonId: string, userId: string, now: Date): Promise<boolean>;
  recoverStale(now: Date, staleBefore: Date): Promise<number>;
  claimDue(now: Date, limit: number): Promise<ClaimedSermonPost[]>;
  markSent(postId: string, sentAt: Date): Promise<void>;
  markFailed(postId: string, error: string, retryAt: Date): Promise<void>;
}
