import {
  EventRecurrence,
  PrismaClient,
  ReminderDeliveryStatus,
  type ChurchGroup,
  type Event as PrismaEvent,
} from '@prisma/client';
import type { ChurchEvent } from '../events/event.js';
import type { PlannedReminder } from '../events/reminder-time.js';
import type { ClaimedReminder, ReminderRepository } from './reminder.js';

const MAX_ATTEMPTS = 5;

type EventWithGroup = PrismaEvent & { churchGroup: ChurchGroup };

export class PrismaReminderRepository implements ReminderRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listEventsForPlanning(): Promise<ChurchEvent[]> {
    const events = await this.prisma.event.findMany({
      where: { active: true },
      include: { churchGroup: true },
    });
    return events.map(toDomain);
  }

  public async plan(eventId: string, reminder: PlannedReminder): Promise<boolean> {
    const result = await this.prisma.reminderDelivery.createMany({
      data: [{
        eventId,
        occurrenceAt: reminder.occurrenceAt,
        scheduledFor: reminder.scheduledFor,
        availableAt: reminder.scheduledFor,
      }],
      skipDuplicates: true,
    });
    return result.count > 0;
  }

  public async recoverStale(now: Date, staleBefore: Date): Promise<number> {
    const result = await this.prisma.reminderDelivery.updateMany({
      where: {
        status: ReminderDeliveryStatus.PROCESSING,
        updatedAt: { lte: staleBefore },
      },
      data: {
        status: ReminderDeliveryStatus.FAILED,
        availableAt: now,
        lastError: 'Recovered after an interrupted worker run',
      },
    });
    return result.count;
  }

  public async expirePast(now: Date): Promise<number> {
    const result = await this.prisma.reminderDelivery.updateMany({
      where: {
        status: { in: [ReminderDeliveryStatus.PENDING, ReminderDeliveryStatus.FAILED] },
        occurrenceAt: { lte: now },
      },
      data: {
        status: ReminderDeliveryStatus.FAILED,
        attempts: MAX_ATTEMPTS,
        lastError: 'Reminder expired before it could be delivered',
      },
    });
    return result.count;
  }

  public async claimDue(now: Date, limit: number): Promise<ClaimedReminder[]> {
    const candidates = await this.prisma.reminderDelivery.findMany({
      where: {
        status: { in: [ReminderDeliveryStatus.PENDING, ReminderDeliveryStatus.FAILED] },
        availableAt: { lte: now },
        occurrenceAt: { gt: now },
        attempts: { lt: MAX_ATTEMPTS },
        event: { active: true },
      },
      include: { event: { include: { churchGroup: true } } },
      orderBy: { availableAt: 'asc' },
      take: limit,
    });

    const claimed: ClaimedReminder[] = [];
    for (const candidate of candidates) {
      const result = await this.prisma.reminderDelivery.updateMany({
        where: {
          id: candidate.id,
          status: { in: [ReminderDeliveryStatus.PENDING, ReminderDeliveryStatus.FAILED] },
          attempts: candidate.attempts,
        },
        data: {
          status: ReminderDeliveryStatus.PROCESSING,
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      if (result.count === 1) {
        claimed.push({
          deliveryId: candidate.id,
          event: toDomain(candidate.event),
          occurrenceAt: candidate.occurrenceAt,
          attempt: candidate.attempts + 1,
        });
      }
    }
    return claimed;
  }

  public async markSent(deliveryId: string, sentAt: Date): Promise<void> {
    await this.prisma.reminderDelivery.update({
      where: { id: deliveryId },
      data: { status: ReminderDeliveryStatus.SENT, sentAt, lastError: null },
    });
  }

  public async markFailed(deliveryId: string, error: string, retryAt: Date): Promise<void> {
    await this.prisma.reminderDelivery.update({
      where: { id: deliveryId },
      data: {
        status: ReminderDeliveryStatus.FAILED,
        availableAt: retryAt,
        lastError: error.slice(0, 2_000),
      },
    });
  }
}

function toDomain(event: EventWithGroup): ChurchEvent {
  return {
    id: event.id,
    chatId: event.churchGroup.telegramChatId,
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
    createdByUserId: event.createdByTelegramUserId,
  };
}
