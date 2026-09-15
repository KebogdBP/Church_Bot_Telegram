import { randomUUID } from 'node:crypto';
import { createPublicSermonId } from './public-sermon-id.js';
import type { CreateSermon, Sermon, SermonRepository } from './sermon.js';

export class InMemorySermonRepository implements SermonRepository {
  private readonly sermons = new Map<string, Sermon>();

  public async createIfNew(input: CreateSermon): Promise<{ sermon: Sermon; created: boolean }> {
    const key = `${input.chatId}:${input.sourceMessageId}`;
    const existing = this.sermons.get(key);
    if (existing) return { sermon: existing, created: false };

    const sermon: Sermon = {
      id: randomUUID(),
      publicId: createPublicSermonId(),
      ...input,
      status: 'received',
      attempts: 0,
      createdAt: new Date(),
    };
    this.sermons.set(key, sermon);
    return { sermon, created: true };
  }

  public async recoverStale() { return 0; }

  public async claimNext(): Promise<Sermon | null> {
    const sermon = [...this.sermons.values()].find(
      (candidate) => (candidate.status === 'received' || candidate.status === 'failed') && candidate.attempts < 5,
    );
    if (!sermon) return null;
    const claimed = { ...sermon, status: 'downloading' as const, attempts: sermon.attempts + 1 };
    this.replace(claimed);
    return claimed;
  }

  public async markStored(sermonId: string): Promise<void> {
    this.updateStatus(sermonId, 'stored');
  }

  public async markTooLarge(sermonId: string): Promise<void> {
    this.updateStatus(sermonId, 'too_large');
  }

  public async markFailed(sermonId: string): Promise<void> {
    this.updateStatus(sermonId, 'failed');
  }

  private updateStatus(sermonId: string, status: Sermon['status']): void {
    for (const [key, sermon] of this.sermons) {
      if (sermon.id === sermonId) this.sermons.set(key, { ...sermon, status });
    }
  }

  private replace(updated: Sermon): void {
    for (const [key, sermon] of this.sermons) {
      if (sermon.id === updated.id) this.sermons.set(key, updated);
    }
  }
}
