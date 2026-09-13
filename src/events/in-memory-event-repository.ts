import { randomUUID } from 'node:crypto';
import type { ChurchEvent, CreateChurchEvent, EventRepository, UpdateChurchEvent } from './event.js';

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

  public async findActive(chatId: string, eventId: string): Promise<ChurchEvent | null> {
    const event = this.events.get(eventId);
    return event?.chatId === chatId ? event : null;
  }

  public async update(chatId: string, eventId: string, input: UpdateChurchEvent): Promise<ChurchEvent | null> {
    const event = await this.findActive(chatId, eventId);
    if (!event) return null;

    const updated = {
      ...event,
      ...input,
      ...(input.location ? { location: input.location } : {}),
    };
    if (!input.location) delete updated.location;
    this.events.set(eventId, updated);
    return updated;
  }

  public async delete(chatId: string, eventId: string): Promise<boolean> {
    const event = this.events.get(eventId);
    if (!event || event.chatId !== chatId) {
      return false;
    }

    return this.events.delete(eventId);
  }
}
