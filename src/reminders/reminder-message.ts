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
    '<b>Напоминание</b>',
    '',
    `Друзья, ${when.toLowerCase()} состоится «${escapeHtml(event.title)}». Будем рады видеть каждого!`,
    event.location ? `Место: ${escapeHtml(event.location)}` : null,
    event.topic ? `Тема: ${escapeHtml(event.topic)}` : null,
    event.biblePassage ? `Место Писания: ${escapeHtml(event.biblePassage)}` : null,
  ].filter((line) => line !== null).join('\n');
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
