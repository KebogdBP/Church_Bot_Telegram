import { Prisma, PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import type { InlineButton } from '../messaging/message-sender.js';
import { EventService, EventValidationError } from '../events/event-service.js';
import { escapeHtml } from '../messaging/html.js';

interface FlowData { date?: string; time?: string; title?: string; location?: string; reminderMinutesBefore?: number }
export interface FlowReply { text: string; keyboard?: InlineButton[][] }

export class GuidedEventService {
  public constructor(private readonly prisma: PrismaClient, private readonly events: EventService, private readonly timezone: string, private readonly now = () => new Date()) {}

  public async start(chatId: string, userId: string): Promise<FlowReply> {
    const group = await this.prisma.churchGroup.upsert({ where: { telegramChatId: chatId }, update: {}, create: { telegramChatId: chatId, timezone: this.timezone } });
    await this.prisma.adminFlow.upsert({
      where: { churchGroupId_telegramUserId: { churchGroupId: group.id, telegramUserId: userId } },
      update: { kind: 'event_create', step: 'date', data: {}, expiresAt: new Date(this.now().getTime() + 60 * 60_000) },
      create: { churchGroupId: group.id, telegramUserId: userId, kind: 'event_create', step: 'date', data: {}, expiresAt: new Date(this.now().getTime() + 60 * 60_000) },
    });
    return { text: 'Введите дату события в формате <code>ГГГГ-ММ-ДД</code>.', keyboard: [[{ text: 'Отменить', callbackData: 'flow:cancel' }]] };
  }

  public async cancel(chatId: string, userId: string): Promise<boolean> {
    const deleted = await this.prisma.adminFlow.deleteMany({ where: { telegramUserId: userId, churchGroup: { telegramChatId: chatId } } });
    return deleted.count > 0;
  }

  public async consume(chatId: string, userId: string, text: string): Promise<FlowReply | null> {
    const flow = await this.prisma.adminFlow.findFirst({ where: { telegramUserId: userId, churchGroup: { telegramChatId: chatId }, expiresAt: { gt: this.now() } } });
    if (!flow || flow.kind !== 'event_create') return null;
    const data = flow.data as FlowData;
    if (flow.step === 'date') {
      const date = DateTime.fromFormat(text, 'yyyy-MM-dd', { zone: this.timezone });
      if (!date.isValid || date.endOf('day').toMillis() <= this.now().getTime()) return { text: 'Нужна сегодняшняя или будущая дата в формате <code>ГГГГ-ММ-ДД</code>.' };
      return this.advance(flow.id, 'time', { ...data, date: text }, 'Введите время в формате <code>ЧЧ:ММ</code>.');
    }
    if (flow.step === 'time') {
      if (!DateTime.fromFormat(text, 'HH:mm', { zone: this.timezone }).isValid) return { text: 'Неверное время. Используйте формат <code>ЧЧ:ММ</code>.' };
      return this.advance(flow.id, 'title', { ...data, time: text }, 'Введите название события.');
    }
    if (flow.step === 'title') {
      if (!text.trim() || text.length > 200) return { text: 'Название должно содержать от 1 до 200 символов.' };
      return this.advance(flow.id, 'location', { ...data, title: text.trim() }, 'Введите место проведения или отправьте <code>-</code>.');
    }
    if (flow.step === 'location') return this.advance(flow.id, 'reminder', { ...data, ...(text === '-' ? {} : { location: text.trim() }) }, 'За сколько минут напомнить? Например: <code>1020</code> для 17 часов.');
    if (flow.step === 'reminder') {
      const minutes = Number(text);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 43_200) return { text: 'Введите целое число минут от 1 до 43200.' };
      const complete = { ...data, reminderMinutesBefore: minutes };
      await this.prisma.adminFlow.update({ where: { id: flow.id }, data: { step: 'confirm', data: toJson(complete) } });
      return { text: [`<b>Проверьте событие</b>`, `${complete.date} ${complete.time}`, escapeHtml(complete.title ?? ''), complete.location ? `Место: ${escapeHtml(complete.location)}` : 'Место не указано', `Напоминание: за ${minutes} мин.`].join('\n'), keyboard: [[{ text: 'Создать', callbackData: 'flow:confirm' }, { text: 'Отменить', callbackData: 'flow:cancel' }]] };
    }
    return { text: 'Подтвердите создание события кнопкой ниже.', keyboard: [[{ text: 'Создать', callbackData: 'flow:confirm' }, { text: 'Отменить', callbackData: 'flow:cancel' }]] };
  }

  public async confirm(chatId: string, userId: string): Promise<FlowReply> {
    const flow = await this.prisma.adminFlow.findFirst({ where: { telegramUserId: userId, step: 'confirm', churchGroup: { telegramChatId: chatId }, expiresAt: { gt: this.now() } } });
    if (!flow) return { text: 'Сценарий истёк или уже завершён.' };
    const data = flow.data as FlowData;
    if (!data.date || !data.time || !data.title || !data.reminderMinutesBefore) return { text: 'Данные сценария повреждены. Начните заново.' };
    try {
      const event = await this.events.createOneTime({ chatId, userId, date: data.date, time: data.time, title: data.title, timezone: this.timezone, reminderMinutesBefore: data.reminderMinutesBefore, ...(data.location ? { location: data.location } : {}) });
      await this.prisma.adminFlow.delete({ where: { id: flow.id } });
      return { text: `Событие «${escapeHtml(event.title)}» создано.`, keyboard: [[{ text: 'Все события', callbackData: 'admin:events' }, { text: 'Панель', callbackData: 'admin:home' }]] };
    } catch (error) {
      return { text: error instanceof EventValidationError ? error.message : 'Не удалось создать событие.' };
    }
  }

  private async advance(id: string, step: string, data: FlowData, text: string): Promise<FlowReply> {
    await this.prisma.adminFlow.update({ where: { id }, data: { step, data: toJson(data) } });
    return { text, keyboard: [[{ text: 'Отменить', callbackData: 'flow:cancel' }]] };
  }
}

function toJson(data: FlowData): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
}
