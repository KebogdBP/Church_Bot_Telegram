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

  it('edits a one-time event and keeps it in the same chat', async () => {
    const repository = new InMemoryEventRepository();
    const service = new EventService(repository, () => NOW);
    const event = await service.createOneTime({
      chatId: '100',
      userId: '42',
      date: '2026-09-20',
      time: '10:00',
      title: 'Старое название',
      timezone: 'Europe/Moscow',
      reminderMinutesBefore: 60,
    });

    const updated = await service.edit({
      chatId: '100',
      eventId: event.id,
      schedule: '2026-09-27',
      time: '11:30',
      title: 'Новое название',
      location: 'Большой зал',
      reminderMinutesBefore: 1_440,
    });

    expect(updated?.title).toBe('Новое название');
    expect(updated?.startsAt.toISOString()).toBe('2026-09-27T08:30:00.000Z');
    expect(updated?.location).toBe('Большой зал');
  });

  it('uses a weekday when editing a weekly event', async () => {
    const repository = new InMemoryEventRepository();
    const service = new EventService(repository, () => NOW);
    const event = await service.createWeekly({
      chatId: '100',
      userId: '42',
      weekday: 7,
      time: '10:00',
      title: 'Собрание',
      timezone: 'Europe/Moscow',
      reminderMinutesBefore: 60,
    });

    const updated = await service.edit({
      chatId: '100',
      eventId: event.id,
      schedule: '6',
      time: '18:00',
      title: 'Молодёжное собрание',
      reminderMinutesBefore: 120,
    });

    expect(updated?.weeklyDay).toBe(6);
    expect(updated?.localTime).toBe('18:00');
    expect(updated?.startsAt.toISOString()).toBe('2026-09-19T15:00:00.000Z');
  });
});
