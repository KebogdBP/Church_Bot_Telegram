import { DateTime } from 'luxon';
import type { ChurchEvent } from './event.js';

export interface PlannedReminder {
  occurrenceAt: Date;
  scheduledFor: Date;
}

export function nextReminder(event: ChurchEvent, after: Date): PlannedReminder | null {
  const occurrence = nextOccurrence(event, after);
  if (!occurrence) return null;

  return {
    occurrenceAt: occurrence,
    scheduledFor: new Date(occurrence.getTime() - event.reminderMinutesBefore * 60_000),
  };
}

export function nextOccurrence(event: ChurchEvent, after: Date): Date | null {
  if (event.recurrence === 'none') {
    return event.startsAt > after ? event.startsAt : null;
  }

  if (!event.weeklyDay || !event.localTime) {
    return null;
  }

  const cursor = DateTime.fromJSDate(after, { zone: event.timezone });
  const [hour, minute] = event.localTime.split(':').map(Number);
  if (hour === undefined || minute === undefined) return null;

  let occurrence = cursor
    .startOf('day')
    .set({ hour, minute })
    .plus({ days: (event.weeklyDay - cursor.weekday + 7) % 7 });
  if (occurrence <= cursor) {
    occurrence = occurrence.plus({ weeks: 1 });
  }

  return occurrence.toUTC().toJSDate();
}
