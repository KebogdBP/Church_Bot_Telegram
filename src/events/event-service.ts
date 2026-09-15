import { DateTime } from 'luxon';
import type { ChurchEvent, EventRepository } from './event.js';
import { escapeHtml } from '../messaging/html.js';

export interface CreateOneTimeEventInput {
  chatId: string;
  userId: string;
  date: string;
  time: string;
  title: string;
  timezone: string;
  reminderMinutesBefore: number;
  location?: string;
}

export interface CreateWeeklyEventInput extends Omit<CreateOneTimeEventInput, 'date'> {
  weekday: number;
}

export interface EditEventInput {
  chatId: string;
  eventId: string;
  schedule: string;
  time: string;
  title: string;
  reminderMinutesBefore: number;
  location?: string;
}

export class EventValidationError extends Error {}

export class EventService {
  public constructor(
    private readonly repository: EventRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async createOneTime(input: CreateOneTimeEventInput): Promise<ChurchEvent> {
    validateCommon(input);
    const localStart = DateTime.fromFormat(`${input.date} ${input.time}`, 'yyyy-MM-dd HH:mm', {
      zone: input.timezone,
    });
    if (!localStart.isValid) {
      throw new EventValidationError('Неверная дата, время или часовой пояс.');
    }
    if (localStart.toMillis() <= this.now().getTime()) {
      throw new EventValidationError('Событие должно быть в будущем.');
    }

    return this.repository.create({
      chatId: input.chatId,
      createdByUserId: input.userId,
      title: input.title,
      startsAt: localStart.toUTC().toJSDate(),
      timezone: input.timezone,
      recurrence: 'none',
      reminderMinutesBefore: input.reminderMinutesBefore,
      ...(input.location ? { location: input.location } : {}),
    });
  }

  public async createWeekly(input: CreateWeeklyEventInput): Promise<ChurchEvent> {
    validateCommon(input);
    if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
      throw new EventValidationError('День недели должен быть числом от 1 (понедельник) до 7 (воскресенье).');
    }

    const now = DateTime.fromJSDate(this.now(), { zone: input.timezone });
    let next = DateTime.fromFormat(input.time, 'HH:mm', { zone: input.timezone })
      .set({ year: now.year, month: now.month, day: now.day })
      .plus({ days: (input.weekday - now.weekday + 7) % 7 });
    if (!next.isValid) {
      throw new EventValidationError('Неверное время или часовой пояс.');
    }
    if (next <= now) {
      next = next.plus({ weeks: 1 });
    }

    return this.repository.create({
      chatId: input.chatId,
      createdByUserId: input.userId,
      title: input.title,
      startsAt: next.toUTC().toJSDate(),
      timezone: input.timezone,
      recurrence: 'weekly',
      weeklyDay: input.weekday,
      localTime: input.time,
      reminderMinutesBefore: input.reminderMinutesBefore,
      ...(input.location ? { location: input.location } : {}),
    });
  }

  public list(chatId: string): Promise<ChurchEvent[]> {
    return this.repository.listActive(chatId);
  }

  public async edit(input: EditEventInput): Promise<ChurchEvent | null> {
    validateCommon(input);
    const existing = await this.repository.findActive(input.chatId, input.eventId);
    if (!existing) return null;

    if (existing.recurrence === 'weekly') {
      const weekday = Number(input.schedule);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
        throw new EventValidationError('Для еженедельного события укажите день недели от 1 до 7.');
      }
      const startsAt = nextWeeklyStart(weekday, input.time, existing.timezone, this.now());
      return this.repository.update(input.chatId, input.eventId, {
        title: input.title,
        startsAt,
        weeklyDay: weekday,
        localTime: input.time,
        reminderMinutesBefore: input.reminderMinutesBefore,
        ...(input.location ? { location: input.location } : {}),
      });
    }

    const localStart = parseFutureStart(input.schedule, input.time, existing.timezone, this.now());
    return this.repository.update(input.chatId, input.eventId, {
      title: input.title,
      startsAt: localStart,
      reminderMinutesBefore: input.reminderMinutesBefore,
      ...(input.location ? { location: input.location } : {}),
    });
  }

  public delete(chatId: string, eventId: string): Promise<boolean> {
    return this.repository.delete(chatId, eventId);
  }
}

function parseFutureStart(date: string, time: string, timezone: string, now: Date): Date {
  const localStart = DateTime.fromFormat(`${date} ${time}`, 'yyyy-MM-dd HH:mm', { zone: timezone });
  if (!localStart.isValid) throw new EventValidationError('Неверная дата, время или часовой пояс.');
  if (localStart.toMillis() <= now.getTime()) throw new EventValidationError('Событие должно быть в будущем.');
  return localStart.toUTC().toJSDate();
}

function nextWeeklyStart(weekday: number, time: string, timezone: string, date: Date): Date {
  const now = DateTime.fromJSDate(date, { zone: timezone });
  const parsedTime = DateTime.fromFormat(time, 'HH:mm', { zone: timezone });
  if (!parsedTime.isValid) throw new EventValidationError('Неверное время или часовой пояс.');

  let next = now.startOf('day').set({ hour: parsedTime.hour, minute: parsedTime.minute })
    .plus({ days: (weekday - now.weekday + 7) % 7 });
  if (next <= now) next = next.plus({ weeks: 1 });
  return next.toUTC().toJSDate();
}

function validateCommon(input: Pick<CreateOneTimeEventInput, 'title' | 'reminderMinutesBefore'>): void {
  if (!input.title.trim() || input.title.length > 200) {
    throw new EventValidationError('Название события должно содержать от 1 до 200 символов.');
  }
  if (!Number.isInteger(input.reminderMinutesBefore) || input.reminderMinutesBefore < 1 || input.reminderMinutesBefore > 43_200) {
    throw new EventValidationError('Напоминание можно установить за период от 1 минуты до 30 дней.');
  }
}

export function formatEvent(event: ChurchEvent): string {
  const start = DateTime.fromJSDate(event.startsAt, { zone: event.timezone })
    .setLocale('ru')
    .toFormat('ccc, dd LLL yyyy, HH:mm');
  const recurrence = event.recurrence === 'weekly' ? 'каждую неделю' : 'однократно';
  const reminder = formatReminderOffset(event.reminderMinutesBefore);

  return [
    `<b>${escapeHtml(event.title)}</b>`,
    `${start} (${recurrence})`,
    event.location ? `Место: ${escapeHtml(event.location)}` : null,
    `Напоминание: за ${reminder}`,
    `ID: <code>${escapeHtml(event.id)}</code>`,
  ].filter(Boolean).join('\n');
}

function formatReminderOffset(minutes: number): string {
  if (minutes % 1_440 === 0) return `${minutes / 1_440} дн.`;
  if (minutes % 60 === 0) return `${minutes / 60} ч.`;
  return `${minutes} мин.`;
}
