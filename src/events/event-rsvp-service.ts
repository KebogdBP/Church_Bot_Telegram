import { EventRsvpResponse, PrismaClient } from '@prisma/client';

export type RsvpChoice = 'going' | 'maybe' | 'not_going';
export interface RsvpCounts { going: number; maybe: number; notGoing: number }

export class EventRsvpService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async respond(chatId: string, eventId: string, userId: string, choice: RsvpChoice): Promise<RsvpCounts | null> {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, churchGroup: { telegramChatId: chatId }, active: true, OR: [{ recurrence: 'WEEKLY' }, { startsAt: { gt: new Date() } }] }, select: { id: true } });
    if (!event) return null;
    await this.prisma.eventRsvp.upsert({
      where: { eventId_telegramUserId: { eventId, telegramUserId: userId } },
      create: { eventId, telegramUserId: userId, response: toDatabase(choice) },
      update: { response: toDatabase(choice) },
    });
    return this.counts(eventId);
  }

  public async counts(eventId: string): Promise<RsvpCounts> {
    const grouped = await this.prisma.eventRsvp.groupBy({ by: ['response'], where: { eventId }, _count: { _all: true } });
    const count = (response: EventRsvpResponse) => grouped.find((row) => row.response === response)?._count._all ?? 0;
    return { going: count(EventRsvpResponse.GOING), maybe: count(EventRsvpResponse.MAYBE), notGoing: count(EventRsvpResponse.NOT_GOING) };
  }
}

function toDatabase(choice: RsvpChoice): EventRsvpResponse {
  if (choice === 'going') return EventRsvpResponse.GOING;
  if (choice === 'maybe') return EventRsvpResponse.MAYBE;
  return EventRsvpResponse.NOT_GOING;
}
