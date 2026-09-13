import { DateTime } from 'luxon';
import type { ChurchEvent } from '../events/event.js';

export function renderReminderMessage(event: ChurchEvent, occurrenceAt: Date, now: Date): string {
  const occurrence = DateTime.fromJSDate(occurrenceAt, { zone: event.timezone }).setLocale('ru');
  const current = DateTime.fromJSDate(now, { zone: event.timezone });
  const dayDifference = Math.round(occurrence.startOf('day').diff(current.startOf('day'), 'days').days);

  const when = dayDifference === 0
    ? `Сегодня в ${occurrence.toFormat('HH:mm')}`
    : dayDifference === 1
      ? `Завтра в ${occurrence.toFormat('HH:mm')}`
      : occurrence.toFormat("cccc, d LLLL 'в' HH:mm");

  return [
    '**Напоминание**',
    '',
    `Друзья, ${when.toLowerCase()} состоится «${event.title}». Будем рады видеть каждого!`,
    event.location ? `Место: ${event.location}` : null,
    event.topic ? `Тема: ${event.topic}` : null,
    event.biblePassage ? `Место Писания: ${event.biblePassage}` : null,
  ].filter((line) => line !== null).join('\n');
}
