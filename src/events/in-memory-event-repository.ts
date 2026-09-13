import { randomUUID } from 'node:crypto';
import type { ChurchEvent, CreateChurchEvent, EventRepository } from './event.js';

export class InMemoryEventRepository implements EventRepository {
  private readonly events = new Map<string, ChurchEvent>();

  public async create(input: CreateChurchEvent): Promise<ChurchEvent> {
    const event = { id: randomUUID(), ...input };
    this.events.set(event.id, event);
    return event;
  }

  public async listActive(chatId: string): Promise<ChurchEvent[]> {
    return [...this.events.values()]
      .filter((event) => event.chatId === chatId)
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  }

  public async delete(chatId: string, eventId: string): Promise<boolean> {
    const event = this.events.get(eventId);
    if (!event || event.chatId !== chatId) {
      return false;
    }

    return this.events.delete(eventId);
  }
}
