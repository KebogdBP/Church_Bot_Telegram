import type { SermonPostRepository } from './sermon-post.js';

export class SermonPostService {
  public constructor(private readonly repository: SermonPostRepository, private readonly now = () => new Date()) {}
  public list(chatId: string) { return this.repository.listDrafts(chatId); }
  public review(chatId: string, postId: string) { return this.repository.findForReview(chatId, postId); }
  public approve(chatId: string, postId: string, userId: string) { return this.repository.approveSeries(chatId, postId, userId, this.now()); }
  public edit(chatId: string, postId: string, content: string, userId: string) { return this.repository.editDraft(chatId, postId, content, userId, this.now()); }
  public reject(chatId: string, postId: string, userId: string) { return this.repository.rejectDraft(chatId, postId, userId, this.now()); }
  public regenerate(chatId: string, sermonId: string, userId: string) { return this.repository.regenerate(chatId, sermonId, userId, this.now()); }
}
