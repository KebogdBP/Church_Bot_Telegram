import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { EventService, EventValidationError } from '../src/events/event-service.js';
import { InMemoryEventRepository } from '../src/events/in-memory-event-repository.js';
import { nextReminder } from '../src/events/reminder-time.js';

const NOW = new Date('2026-09-13T09:00:00.000Z');

describe('EventService', () => {
  it('creates a one-time event in the configured timezone', async () => {
    const service = new EventService(new InMemoryEventRepository(), () => NOW);
    const event = await service.createOneTime({
      chatId: '100',
      userId: '42',
      date: '2026-09-20',
      time: '10:00',
      title: 'Воскресное собрание',
      timezone: 'Europe/Moscow',
      reminderMinutesBefore: 1_020,
    });

    expect(event.startsAt.toISOString()).toBe('2026-09-20T07:00:00.000Z');
    expect(event.recurrence).toBe('none');
  });

  it('rejects an event in the past', async () => {
    const service = new EventService(new InMemoryEventRepository(), () => NOW);
    await expect(service.createOneTime({
      chatId: '100',
      userId: '42',
      date: '2026-09-01',
      time: '10:00',
      title: 'Старое событие',
      timezone: 'Europe/Moscow',
      reminderMinutesBefore: 60,
    })).rejects.toBeInstanceOf(EventValidationError);
  });

  it('plans a weekly reminder using local church time', async () => {
    const service = new EventService(new InMemoryEventRepository(), () => NOW);
    const event = await service.createWeekly({
      chatId: '100',
      userId: '42',
      weekday: 7,
      time: '10:00',
      title: 'Воскресное собрание',
      timezone: 'Europe/Moscow',
      reminderMinutesBefore: 1_020,
    });
    const reminder = nextReminder(event, NOW);

    expect(DateTime.fromJSDate(reminder!.occurrenceAt).toUTC().toISO()).toBe('2026-09-20T07:00:00.000Z');
    expect(DateTime.fromJSDate(reminder!.scheduledFor).toUTC().toISO()).toBe('2026-09-19T14:00:00.000Z');
  });
});
