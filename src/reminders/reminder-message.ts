import { DateTime } from 'luxon';
import type { ChurchEvent } from '../events/event.js';

export function renderReminderMessage(event: ChurchEvent, occurrenceAt: Date, now: Date): string {
  const occurrence = DateTime.fromJSDate(occurrenceAt, { zone: event.timezone }).setLocale('ru');
  const current = DateTime.fromJSDate(now, { zone: event.timezone });
  const dayDifference = Math.round(occurrence.startOf('day').diff(current.startOf('day'), 'days').days);

  const when = dayDifference === 0
    ? 'Сегодня'
    : dayDifference === 1
      ? 'Завтра'
      : occurrence.toFormat('cccc, d LLLL');

  return [
    '<b>Предстоящее событие</b>',
    '',
    `<b>${escapeHtml(event.title)}</b>`,
    '',
    `📅 ${capitalize(when)}`,
    `🕙 ${occurrence.toFormat('HH:mm')}`,
    event.location ? `📍 ${escapeHtml(event.location)}` : null,
    event.description ? '' : null,
    event.description ? escapeHtml(event.description) : null,
    event.topic ? `\n<b>Тема:</b> ${escapeHtml(event.topic)}` : null,
    event.biblePassage ? `<b>Место Писания:</b> ${escapeHtml(event.biblePassage)}` : null,
    '',
    'Будем рады видеть вас!',
  ].filter((line) => line !== null).join('\n');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
