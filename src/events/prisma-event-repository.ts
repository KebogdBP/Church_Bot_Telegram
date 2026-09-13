import { EventRecurrence, PrismaClient, type Event as PrismaEvent } from '@prisma/client';
import type { ChurchEvent, CreateChurchEvent, EventRepository } from './event.js';

export class PrismaEventRepository implements EventRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(input: CreateChurchEvent): Promise<ChurchEvent> {
    const group = await this.prisma.churchGroup.upsert({
      where: { maxChatId: input.chatId },
      update: { timezone: input.timezone },
      create: { maxChatId: input.chatId, timezone: input.timezone },
    });
    const event = await this.prisma.event.create({
      data: {
        churchGroupId: group.id,
        title: input.title,
        startsAt: input.startsAt,
        timezone: input.timezone,
        recurrence: input.recurrence === 'weekly' ? EventRecurrence.WEEKLY : EventRecurrence.NONE,
        weeklyDay: input.weeklyDay ?? null,
        localTime: input.localTime ?? null,
        reminderMinutesBefore: input.reminderMinutesBefore,
        location: input.location ?? null,
        topic: input.topic ?? null,
        biblePassage: input.biblePassage ?? null,
        createdByMaxUserId: input.createdByUserId,
      },
      include: { churchGroup: true },
    });

    return toDomain(event, input.chatId);
  }

  public async listActive(chatId: string): Promise<ChurchEvent[]> {
    const events = await this.prisma.event.findMany({
      where: { churchGroup: { maxChatId: chatId }, active: true },
      orderBy: { startsAt: 'asc' },
    });
    return events.map((event) => toDomain(event, chatId));
  }

  public async delete(chatId: string, eventId: string): Promise<boolean> {
    const result = await this.prisma.event.updateMany({
      where: { id: eventId, churchGroup: { maxChatId: chatId }, active: true },
      data: { active: false },
    });
    return result.count > 0;
  }
}

function toDomain(event: PrismaEvent, chatId: string): ChurchEvent {
  return {
    id: event.id,
    chatId,
    title: event.title,
    startsAt: event.startsAt,
    timezone: event.timezone,
    recurrence: event.recurrence === EventRecurrence.WEEKLY ? 'weekly' : 'none',
    ...(event.weeklyDay === null ? {} : { weeklyDay: event.weeklyDay }),
    ...(event.localTime === null ? {} : { localTime: event.localTime }),
    reminderMinutesBefore: event.reminderMinutesBefore,
    ...(event.location === null ? {} : { location: event.location }),
    ...(event.topic === null ? {} : { topic: event.topic }),
    ...(event.biblePassage === null ? {} : { biblePassage: event.biblePassage }),
    createdByUserId: event.createdByMaxUserId,
  };
}
