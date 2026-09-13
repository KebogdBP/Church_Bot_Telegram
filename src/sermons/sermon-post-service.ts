import type { SermonPostRepository } from './sermon-post.js';

export class SermonPostService {
  public constructor(private readonly repository: SermonPostRepository, private readonly now = () => new Date()) {}
  public list(chatId: string) { return this.repository.listDrafts(chatId); }
  public review(chatId: string, postId: string) { return this.repository.findForReview(chatId, postId); }
  public approve(chatId: string, postId: string, userId: string) { return this.repository.approveSeries(chatId, postId, userId, this.now()); }
}
