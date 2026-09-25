import {
  Prisma,
  PrismaClient,
  RegistrationEntryStatus,
  RegistrationFieldKind,
  RegistrationFormStatus,
} from '@prisma/client';
import type { InlineButton } from '../messaging/message-sender.js';
import { escapeHtml } from '../messaging/html.js';
import { FieldEncryption } from '../security/field-encryption.js';

const FLOW_TTL_MS = 2 * 60 * 60 * 1_000;
const DEFAULT_AGE_REJECTION = 'Спасибо за интерес к мероприятию. К сожалению, эта регистрация открыта для другой возрастной группы. Если возраст был указан ошибочно, отправьте правильное число ещё раз.';
const DEFAULT_NUMBER_REJECTION = 'Спасибо за ответ. К сожалению, указанное значение не подходит под условия этой регистрации. Если вы допустили ошибку, отправьте правильное число ещё раз.';

export interface RegistrationReply {
  text: string;
  keyboard?: InlineButton[][];
  targetChatId?: string;
}

export type RegistrationCapacityIssue = 'full' | 'city_full' | null;

export function registrationCapacityIssue(input: { total: number; totalLimit: number; cityTotal: number; cityQuota: number }): RegistrationCapacityIssue {
  if (input.total >= input.totalLimit) return 'full';
  if (input.cityTotal >= input.cityQuota) return 'city_full';
  return null;
}

export function numericRangeIssue(value: number, min: number | null | undefined, max: number | null | undefined): boolean {
  return (min !== null && min !== undefined && value < min)
    || (max !== null && max !== undefined && value > max);
}

interface FlowData {
  title?: string;
  formPublicId?: string;
  cityName?: string;
  fieldLabel?: string;
  fieldKind?: 'TEXT' | 'NUMBER' | 'CHOICE';
  minValue?: number;
  maxValue?: number;
  firstName?: string;
  lastName?: string;
  age?: number;
  cityId?: string;
  answers?: Record<string, string>;
  fieldIndex?: number;
}

export class RegistrationService {
  private readonly encryption: FieldEncryption;

  public constructor(
    private readonly prisma: PrismaClient,
    privacySecret: string,
    private readonly timezone: string,
    private readonly botUsername?: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.encryption = new FieldEncryption(privacySecret);
  }

  public async adminHome(chatId: string): Promise<RegistrationReply> {
    const group = await this.prisma.churchGroup.findUnique({ where: { telegramChatId: chatId }, select: { id: true } });
    const forms = group ? await this.prisma.registrationForm.findMany({
      where: { churchGroupId: group.id }, orderBy: { createdAt: 'desc' }, take: 12,
      include: { _count: { select: { entries: { where: { status: RegistrationEntryStatus.CONFIRMED } } } } },
    }) : [];
    return {
      text: forms.length
        ? ['<b>📝 Регистрации</b>', 'Создавайте анкеты, лимиты мест и квоты городов.', '', ...forms.map((form) => `${statusIcon(form.status)} <b>${escapeHtml(form.title)}</b> · <code>${form.publicId}</code>\n${form._count.entries}/${form.totalLimit} мест`)].join('\n\n')
        : '<b>📝 Регистрации</b>\n\nПока нет ни одной формы. Создайте первую регистрацию — бот проведёт по шагам.',
      keyboard: [
        [{ text: '➕ Новая регистрация', callbackData: 'regadmin:new' }],
        ...forms.map((form) => [{ text: `${statusIcon(form.status)} ${form.title.slice(0, 28)}`, callbackData: `regadmin:view:${form.publicId}` }]),
        [{ text: '◀ Панель', callbackData: 'admin:home' }],
      ],
    };
  }

  public async startAdminCreate(chatId: string, userId: string): Promise<RegistrationReply> {
    await this.saveFlow(chatId, userId, null, 'ADMIN', 'TITLE', {});
    return cancelReply('<b>Новая регистрация</b>\n\nКак она называется?\nНапример: <i>Молодёжная конференция 2026</i>');
  }

  public async cancelFlow(chatId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.registrationFlow.deleteMany({ where: { chatId, telegramUserId: userId } });
    return result.count > 0;
  }

  public async consumeText(chatId: string, userId: string, text: string): Promise<RegistrationReply | null> {
    const flow = await this.activeFlow(chatId, userId);
    if (!flow) return null;
    const value = text.trim();
    const data = this.readData(flow.dataEncrypted);
    if (!value) return { text: 'Сообщение пустое. Попробуйте ещё раз.' };

    if (flow.mode === 'ADMIN') return this.consumeAdminText(flow.id, flow.formId, flow.step, data, chatId, userId, value);
    if (flow.mode === 'PARTICIPANT') return this.consumeParticipantText(flow.id, flow.formId, flow.step, data, value);
    return null;
  }

  public async handleAdminCallback(chatId: string, userId: string, data: string): Promise<RegistrationReply | null> {
    if (data === 'admin:registrations') return this.adminHome(chatId);
    if (data === 'regadmin:new') return this.startAdminCreate(chatId, userId);
    if (data === 'regadmin:cancel') { await this.deleteFlow(chatId, userId); return { text: 'Действие отменено.', keyboard: [[{ text: '◀ К регистрациям', callbackData: 'admin:registrations' }]] }; }

    const limit = /^regadmin:limit:(30|60|100|custom)$/.exec(data);
    if (limit) {
      const flow = await this.activeFlow(chatId, userId);
      if (!flow || flow.mode !== 'ADMIN' || flow.step !== 'LIMIT') return expiredReply();
      if (limit[1] === 'custom') return this.updateFlow(flow.id, 'LIMIT_CUSTOM', this.readData(flow.dataEncrypted), 'Введите число мест от 1 до 10 000.');
      return this.finishFormCreation(flow.id, chatId, userId, this.readData(flow.dataEncrypted), Number(limit[1]));
    }

    const view = /^regadmin:view:([A-Z0-9]{6})$/.exec(data);
    if (view) return this.formDashboard(chatId, view[1]!);
    const cities = /^regadmin:cities:([A-Z0-9]{6})$/.exec(data);
    if (cities) return this.citiesDashboard(chatId, cities[1]!);
    const addCity = /^regadmin:cityadd:([A-Z0-9]{6})$/.exec(data);
    if (addCity) {
      const form = await this.ownedForm(chatId, addCity[1]!); if (!form) return notFoundReply();
      await this.saveFlow(chatId, userId, form.id, 'ADMIN', 'CITY_NAME', { formPublicId: form.publicId });
      return cancelReply('Введите название города. Например: <i>Тимашевск</i>', `regadmin:view:${form.publicId}`);
    }
    const cityQuota = /^regadmin:cityquota:([^:]+)$/.exec(data);
    if (cityQuota) {
      const city = await this.prisma.registrationCity.findFirst({ where: { id: cityQuota[1]!, form: { churchGroup: { telegramChatId: chatId } } }, include: { form: true } });
      if (!city) return notFoundReply();
      await this.saveFlow(chatId, userId, city.formId, 'ADMIN', `CITY_QUOTA_EDIT:${city.id}`, { formPublicId: city.form.publicId });
      return cancelReply(`Новая квота для города «${escapeHtml(city.name)}» (сейчас ${city.quota}):`, `regadmin:cities:${city.form.publicId}`);
    }
    const cityDelete = /^regadmin:citydel:([^:]+)$/.exec(data);
    if (cityDelete) return this.deleteCity(chatId, cityDelete[1]!);

    const fields = /^regadmin:fields:([A-Z0-9]{6})$/.exec(data);
    if (fields) return this.fieldsDashboard(chatId, fields[1]!);
    const addField = /^regadmin:fieldadd:([A-Z0-9]{6})$/.exec(data);
    if (addField) {
      const form = await this.ownedForm(chatId, addField[1]!); if (!form) return notFoundReply();
      await this.saveFlow(chatId, userId, form.id, 'ADMIN', 'FIELD_LABEL', { formPublicId: form.publicId });
      return cancelReply('Напишите вопрос для нового поля.\nНапример: <i>Название вашей церкви</i>', `regadmin:fields:${form.publicId}`);
    }
    const fieldKind = /^regadmin:fieldkind:(text|number|choice)$/.exec(data);
    if (fieldKind) return this.chooseFieldKind(chatId, userId, fieldKind[1]!);
    const numberLimit = /^regadmin:numlimit:(yes|no)$/.exec(data);
    if (numberLimit) return this.chooseNumberLimit(chatId, userId, numberLimit[1] === 'yes');
    if (data === 'regadmin:nummsg:default') return this.finishNumberField(chatId, userId, DEFAULT_NUMBER_REJECTION);
    const fieldDelete = /^regadmin:fielddel:([^:]+)$/.exec(data);
    if (fieldDelete) return this.deleteField(chatId, fieldDelete[1]!);

    const setLimit = /^regadmin:setlimit:([A-Z0-9]{6})$/.exec(data);
    if (setLimit) {
      const form = await this.ownedForm(chatId, setLimit[1]!); if (!form) return notFoundReply();
      await this.saveFlow(chatId, userId, form.id, 'ADMIN', 'LIMIT_EDIT', { formPublicId: form.publicId });
      return cancelReply(`Введите новый общий лимит. Сейчас: ${form.totalLimit}.`, `regadmin:view:${form.publicId}`);
    }
    const description = /^regadmin:description:([A-Z0-9]{6})$/.exec(data);
    if (description) {
      const form = await this.ownedForm(chatId, description[1]!); if (!form) return notFoundReply();
      await this.saveFlow(chatId, userId, form.id, 'ADMIN', 'DESCRIPTION', { formPublicId: form.publicId });
      return cancelReply('Напишите короткое описание, которое увидят участники.', `regadmin:view:${form.publicId}`);
    }
    const age = /^regadmin:age:([A-Z0-9]{6})$/.exec(data);
    if (age) return this.ageDashboard(chatId, age[1]!);
    const ageSet = /^regadmin:ageset:([A-Z0-9]{6})$/.exec(data);
    if (ageSet) {
      const form = await this.ownedForm(chatId, ageSet[1]!); if (!form) return notFoundReply();
      await this.saveFlow(chatId, userId, form.id, 'ADMIN', 'AGE_MIN', { formPublicId: form.publicId });
      return cancelReply('Введите минимальный возраст от 1 до 120.', `regadmin:age:${form.publicId}`);
    }
    const ageOff = /^regadmin:ageoff:([A-Z0-9]{6})$/.exec(data);
    if (ageOff) {
      const form = await this.ownedForm(chatId, ageOff[1]!); if (!form) return notFoundReply();
      await this.prisma.registrationForm.update({ where: { id: form.id }, data: { ageMin: null, ageMax: null } });
      return this.ageDashboard(chatId, form.publicId);
    }
    const ageMessage = /^regadmin:agemsg:([A-Z0-9]{6})$/.exec(data);
    if (ageMessage) {
      const form = await this.ownedForm(chatId, ageMessage[1]!); if (!form) return notFoundReply();
      await this.saveFlow(chatId, userId, form.id, 'ADMIN', 'AGE_MESSAGE_EDIT', { formPublicId: form.publicId });
      return cancelReply('Напишите вежливое сообщение для участника, чей возраст не входит в рамки.', `regadmin:age:${form.publicId}`);
    }
    if (data === 'regadmin:agemsg:default') return this.finishAgeSettings(chatId, userId, DEFAULT_AGE_REJECTION);
    const toggle = /^regadmin:toggle:([A-Z0-9]{6})$/.exec(data);
    if (toggle) return this.toggleForm(chatId, toggle[1]!);
    const publish = /^regadmin:publish:([A-Z0-9]{6})$/.exec(data);
    if (publish) return this.publicAnnouncement(chatId, publish[1]!);
    const people = /^regadmin:people:([A-Z0-9]{6})$/.exec(data);
    if (people) return { ...(await this.peopleDashboard(chatId, people[1]!)), targetChatId: userId };
    return null;
  }

  public async startParticipant(publicId: string, chatId: string, userId: string, isPrivate: boolean): Promise<RegistrationReply> {
    if (!isPrivate) return { text: 'Регистрация проходит в личном чате с ботом.', keyboard: this.registrationLink(publicId) };
    const form = await this.prisma.registrationForm.findUnique({ where: { publicId }, include: { cities: true, entries: { where: { telegramUserId: userId, status: RegistrationEntryStatus.CONFIRMED }, take: 1 } } });
    if (!form || form.status !== RegistrationFormStatus.OPEN) return { text: 'Эта регистрация закрыта или не найдена.' };
    if (form.entries.length) return { text: `Вы уже зарегистрированы на «${escapeHtml(form.title)}».`, keyboard: [[{ text: 'Отменить мою регистрацию', callbackData: `reg:cancel:${publicId}` }], [{ text: '🏠 Главное меню', callbackData: 'menu:home' }]] };
    await this.saveFlow(chatId, userId, form.id, 'PARTICIPANT', 'FIRST_NAME', { formPublicId: publicId, answers: {}, fieldIndex: 0 });
    return cancelReply(`<b>${escapeHtml(form.title)}</b>\n\nШаг 1. Напишите ваше имя.`, 'menu:home');
  }

  public async handleParticipantCallback(chatId: string, userId: string, data: string, isPrivate: boolean): Promise<RegistrationReply | null> {
    const cityMatch = /^reg:city:([^:]+)$/.exec(data);
    if (cityMatch) {
      if (!isPrivate) return { text: 'Продолжите регистрацию в личном чате с ботом.' };
      const flow = await this.activeFlow(chatId, userId);
      if (!flow || flow.mode !== 'PARTICIPANT' || flow.step !== 'CITY' || !flow.formId) return expiredReply();
      const city = await this.prisma.registrationCity.findFirst({ where: { id: cityMatch[1]!, formId: flow.formId } });
      if (!city) return { text: 'Город больше недоступен. Начните регистрацию заново.' };
      const form = await this.prisma.registrationForm.findUnique({ where: { id: flow.formId }, include: { fields: { orderBy: { sequence: 'asc' } } } });
      if (!form) return notFoundReply();
      const flowData = { ...this.readData(flow.dataEncrypted), cityId: city.id, fieldIndex: 0 };
      if (!form.fields.length) return this.showParticipantReview(flow.id, form, flowData);
      return this.askField(flow.id, form, form.fields[0]!, flowData);
    }
    const optionMatch = /^reg:opt:([^:]+):(\d+)$/.exec(data);
    if (optionMatch) return this.chooseParticipantOption(chatId, userId, optionMatch[1]!, Number(optionMatch[2]));
    const confirm = /^reg:confirm:([A-Z0-9]{6})$/.exec(data);
    if (confirm) return this.confirmRegistration(chatId, userId, confirm[1]!);
    const cancel = /^reg:cancel:([A-Z0-9]{6})$/.exec(data);
    if (cancel) return this.cancelRegistration(userId, cancel[1]!);
    return null;
  }

  public async activeForChat(chatId: string): Promise<RegistrationReply> {
    const forms = await this.prisma.registrationForm.findMany({ where: { churchGroup: { telegramChatId: chatId }, status: RegistrationFormStatus.OPEN }, orderBy: { createdAt: 'desc' }, take: 10, include: { _count: { select: { entries: { where: { status: RegistrationEntryStatus.CONFIRMED } } } } } });
    return {
      text: forms.length ? '<b>📝 Открытые регистрации</b>\n\nВыберите мероприятие. Анкета откроется в личном чате.' : '<b>📝 Регистрация</b>\n\nСейчас открытых регистраций нет.',
      keyboard: [...forms.map((form) => [{ text: `${form.title} · ${form._count.entries}/${form.totalLimit}`, url: this.deepLink(form.publicId) }]), [{ text: '◀ Главное меню', callbackData: 'menu:home' }]],
    };
  }

  public async menu(chatId: string, userId: string, isPrivate: boolean): Promise<RegistrationReply> {
    if (!isPrivate) return this.activeForChat(chatId);
    const entries = await this.prisma.registrationEntry.findMany({
      where: { telegramUserId: userId, status: RegistrationEntryStatus.CONFIRMED },
      include: { form: true, city: true }, orderBy: { createdAt: 'desc' }, take: 10,
    });
    return {
      text: entries.length
        ? ['<b>📝 Мои регистрации</b>', '', ...entries.map((entry) => `<b>${escapeHtml(entry.form.title)}</b>\n${escapeHtml(entry.city.name)} · подтверждена`)].join('\n\n')
        : '<b>📝 Регистрация</b>\n\nАктивных регистраций пока нет. Откройте регистрационную ссылку из церковной группы или объявления.',
      keyboard: [...entries.map((entry) => [{ text: `Отменить: ${entry.form.title.slice(0, 24)}`, callbackData: `reg:cancel:${entry.form.publicId}` }]), [{ text: '◀ Главное меню', callbackData: 'menu:home' }]],
    };
  }

  public async exportCsv(chatId: string, publicId: string): Promise<{ fileName: string; bytes: Uint8Array; caption: string } | null> {
    const form = await this.prisma.registrationForm.findFirst({
      where: { publicId, churchGroup: { telegramChatId: chatId } },
      include: { fields: { orderBy: { sequence: 'asc' } }, entries: { where: { status: RegistrationEntryStatus.CONFIRMED }, include: { city: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!form) return null;
    const header = ['Имя', 'Фамилия', 'Возраст', 'Город', ...form.fields.map((field) => field.label), 'Дата регистрации'];
    const rows = form.entries.map((entry) => {
      let answers: Record<string, string> = {};
      let firstName = 'Ошибка расшифровки';
      let lastName = '';
      try {
        firstName = this.encryption.decrypt(entry.firstNameEncrypted);
        lastName = this.encryption.decrypt(entry.lastNameEncrypted);
        answers = JSON.parse(this.encryption.decrypt(entry.answersEncrypted)) as Record<string, string>;
      } catch { /* Keep a visible error in the export without exposing ciphertext. */ }
      return [firstName, lastName, String(entry.age), entry.city.name, ...form.fields.map((field) => answers[field.id] ?? ''), entry.createdAt.toISOString()];
    });
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    return { fileName: `registration-${form.publicId}.csv`, bytes: new TextEncoder().encode(csv), caption: `Участники: ${form.title}` };
  }

  private async consumeAdminText(flowId: string, formId: string | null, step: string, data: FlowData, chatId: string, userId: string, value: string): Promise<RegistrationReply> {
    if (step === 'TITLE') {
      if (value.length > 120) return { text: 'Название должно быть короче 120 символов.' };
      return this.updateFlow(flowId, 'LIMIT', { ...data, title: value }, 'Сколько всего мест доступно?', [[{ text: '30', callbackData: 'regadmin:limit:30' }, { text: '60', callbackData: 'regadmin:limit:60' }, { text: '100', callbackData: 'regadmin:limit:100' }], [{ text: 'Другое число', callbackData: 'regadmin:limit:custom' }], [{ text: 'Отмена', callbackData: 'regadmin:cancel' }]]);
    }
    if (step === 'LIMIT' || step === 'LIMIT_CUSTOM') {
      const limit = parseLimit(value); if (!limit) return { text: 'Введите целое число от 1 до 10 000.' };
      return this.finishFormCreation(flowId, chatId, userId, data, limit);
    }
    if (!formId) return expiredReply();
    const form = await this.prisma.registrationForm.findUnique({ where: { id: formId } });
    if (!form) return notFoundReply();
    if (step === 'CITY_NAME') {
      if (value.length > 80) return { text: 'Название города должно быть короче 80 символов.' };
      return this.updateFlow(flowId, 'CITY_QUOTA_NEW', { ...data, cityName: value }, `Сколько мест выделить для города «${escapeHtml(value)}»?`);
    }
    if (step === 'CITY_QUOTA_NEW') {
      const quota = parseLimit(value); if (!quota) return { text: 'Введите целое число от 1 до 10 000.' };
      try { await this.prisma.registrationCity.create({ data: { formId, name: data.cityName!, quota } }); }
      catch (error) { if (isUniqueError(error)) return { text: 'Такой город уже добавлен.' }; throw error; }
      await this.prisma.registrationFlow.delete({ where: { id: flowId } });
      return this.citiesDashboard(chatId, form.publicId);
    }
    if (step.startsWith('CITY_QUOTA_EDIT:')) {
      const quota = parseLimit(value); if (!quota) return { text: 'Введите целое число от 1 до 10 000.' };
      const cityId = step.split(':')[1]!;
      const occupied = await this.prisma.registrationEntry.count({ where: { cityId, status: RegistrationEntryStatus.CONFIRMED } });
      if (quota < occupied) return { text: `Нельзя поставить меньше ${occupied}: столько мест уже занято.` };
      await this.prisma.registrationCity.update({ where: { id: cityId }, data: { quota } });
      await this.prisma.registrationFlow.delete({ where: { id: flowId } });
      return this.citiesDashboard(chatId, form.publicId);
    }
    if (step === 'FIELD_LABEL') {
      if (value.length > 120) return { text: 'Вопрос должен быть короче 120 символов.' };
      return this.updateFlow(flowId, 'FIELD_KIND', { ...data, fieldLabel: value }, 'Как участник должен отвечать?', [[{ text: 'Текст', callbackData: 'regadmin:fieldkind:text' }, { text: 'Число', callbackData: 'regadmin:fieldkind:number' }], [{ text: 'Выбор кнопкой', callbackData: 'regadmin:fieldkind:choice' }], [{ text: 'Отмена', callbackData: 'regadmin:cancel' }]]);
    }
    if (step === 'FIELD_OPTIONS') {
      const options = value.split(',').map((item) => item.trim()).filter(Boolean);
      if (options.length < 2 || options.length > 10 || options.some((item) => item.length > 40)) return { text: 'Укажите от 2 до 10 вариантов через запятую. Каждый — до 40 символов.' };
      await this.createField(formId, data.fieldLabel!, RegistrationFieldKind.CHOICE, options);
      await this.prisma.registrationFlow.delete({ where: { id: flowId } });
      return this.fieldsDashboard(chatId, form.publicId);
    }
    if (step === 'FIELD_MIN') {
      const minValue = parseNumber(value); if (minValue === null) return { text: 'Введите корректное число.' };
      return this.updateFlow(flowId, 'FIELD_MAX', { ...data, minValue }, `Введите верхнюю границу. Она должна быть не меньше ${minValue}.`);
    }
    if (step === 'FIELD_MAX') {
      const maxValue = parseNumber(value); if (maxValue === null || data.minValue === undefined || maxValue < data.minValue) return { text: `Введите число не меньше ${data.minValue ?? 'нижней границы'}.` };
      return this.updateFlow(flowId, 'FIELD_MESSAGE', { ...data, maxValue }, 'Какое сообщение показать, если число не входит в диапазон?', [[{ text: 'Использовать вежливый текст', callbackData: 'regadmin:nummsg:default' }], [{ text: 'Отмена', callbackData: 'regadmin:cancel' }]]);
    }
    if (step === 'FIELD_MESSAGE') return this.finishNumberField(chatId, userId, value.slice(0, 500));
    if (step === 'LIMIT_EDIT') {
      const limit = parseLimit(value); if (!limit) return { text: 'Введите целое число от 1 до 10 000.' };
      const occupied = await this.prisma.registrationEntry.count({ where: { formId, status: RegistrationEntryStatus.CONFIRMED } });
      if (limit < occupied) return { text: `Нельзя поставить меньше ${occupied}: столько участников уже зарегистрировано.` };
      await this.prisma.registrationForm.update({ where: { id: formId }, data: { totalLimit: limit } });
      await this.prisma.registrationFlow.delete({ where: { id: flowId } });
      return this.formDashboard(chatId, form.publicId);
    }
    if (step === 'DESCRIPTION') {
      await this.prisma.registrationForm.update({ where: { id: formId }, data: { description: value.slice(0, 1_000) } });
      await this.prisma.registrationFlow.delete({ where: { id: flowId } });
      return this.formDashboard(chatId, form.publicId);
    }
    if (step === 'AGE_MIN') {
      const age = parseAge(value); if (age === null) return { text: 'Введите целое число от 1 до 120.' };
      return this.updateFlow(flowId, 'AGE_MAX', { ...data, minValue: age }, `Введите максимальный возраст. Он должен быть не меньше ${age}.`);
    }
    if (step === 'AGE_MAX') {
      const age = parseAge(value); if (age === null || data.minValue === undefined || age < data.minValue) return { text: `Введите целое число от ${data.minValue ?? 1} до 120.` };
      return this.updateFlow(flowId, 'AGE_MESSAGE', { ...data, maxValue: age }, 'Теперь напишите вежливое сообщение для тех, чей возраст не подходит.', [[{ text: 'Использовать готовый текст', callbackData: 'regadmin:agemsg:default' }], [{ text: 'Отмена', callbackData: 'regadmin:cancel' }]]);
    }
    if (step === 'AGE_MESSAGE') return this.finishAgeSettings(chatId, userId, value.slice(0, 500));
    if (step === 'AGE_MESSAGE_EDIT') {
      await this.prisma.registrationForm.update({ where: { id: formId }, data: { ageRejectionMessage: value.slice(0, 500) } });
      await this.prisma.registrationFlow.delete({ where: { id: flowId } });
      return this.ageDashboard(chatId, form.publicId);
    }
    return expiredReply();
  }

  private async consumeParticipantText(flowId: string, formId: string | null, step: string, data: FlowData, value: string): Promise<RegistrationReply> {
    if (!formId) return expiredReply();
    if (step === 'FIRST_NAME') {
      if (!validName(value)) return { text: 'Введите имя от 2 до 60 символов.' };
      return this.updateFlow(flowId, 'LAST_NAME', { ...data, firstName: value }, 'Шаг 2. Напишите вашу фамилию.');
    }
    if (step === 'LAST_NAME') {
      if (!validName(value)) return { text: 'Введите фамилию от 2 до 60 символов.' };
      return this.updateFlow(flowId, 'AGE', { ...data, lastName: value }, 'Шаг 3. Сколько вам полных лет?');
    }
    if (step === 'AGE') {
      const age = Number(value); if (!Number.isInteger(age) || age < 1 || age > 120) return { text: 'Введите возраст целым числом от 1 до 120.' };
      const form = await this.prisma.registrationForm.findUnique({ where: { id: formId }, include: { cities: { orderBy: { name: 'asc' }, include: { _count: { select: { entries: { where: { status: RegistrationEntryStatus.CONFIRMED } } } } } } } });
      if (!form || form.status !== RegistrationFormStatus.OPEN) return { text: 'Регистрация уже закрыта.' };
      if (numericRangeIssue(age, form.ageMin, form.ageMax)) return { text: escapeHtml(form.ageRejectionMessage) };
      const nextData = { ...data, age };
      const availableCities = form.cities.filter((city) => city._count.entries < city.quota);
      if (!availableCities.length) return { text: 'К сожалению, квоты всех городов уже заполнены.' };
      return this.updateFlow(flowId, 'CITY', nextData, 'Шаг 4. Выберите ваш город:', cityKeyboard(availableCities));
    }
    if (step.startsWith('FIELD_TEXT:')) {
      const fieldId = step.split(':')[1]!;
      const field = await this.prisma.registrationField.findFirst({ where: { id: fieldId, formId } });
      if (!field) return expiredReply();
      if (field.kind === RegistrationFieldKind.NUMBER) {
        const number = parseNumber(value);
        if (number === null) return { text: 'Введите корректное число.' };
        if (numericRangeIssue(number, field.minValue, field.maxValue)) return { text: escapeHtml(field.rejectionMessage ?? DEFAULT_NUMBER_REJECTION) };
      }
      if (value.length > 500) return { text: 'Ответ должен быть короче 500 символов.' };
      const form = await this.prisma.registrationForm.findUnique({ where: { id: formId }, include: { fields: { orderBy: { sequence: 'asc' } } } });
      if (!form) return notFoundReply();
      const nextData = { ...data, answers: { ...(data.answers ?? {}), [fieldId]: value }, fieldIndex: (data.fieldIndex ?? 0) + 1 };
      const next = form.fields[nextData.fieldIndex!];
      return next ? this.askField(flowId, form, next, nextData) : this.showParticipantReview(flowId, form, nextData);
    }
    return expiredReply();
  }

  private async finishFormCreation(flowId: string, chatId: string, userId: string, data: FlowData, totalLimit: number): Promise<RegistrationReply> {
    if (!data.title) return expiredReply();
    const group = await this.prisma.churchGroup.upsert({ where: { telegramChatId: chatId }, update: {}, create: { telegramChatId: chatId, timezone: this.timezone } });
    const form = await this.prisma.registrationForm.create({ data: { churchGroupId: group.id, title: data.title, totalLimit, createdByUserId: userId } });
    await this.prisma.registrationFlow.delete({ where: { id: flowId } });
    return this.formDashboard(chatId, form.publicId);
  }

  private async formDashboard(chatId: string, publicId: string): Promise<RegistrationReply> {
    const form = await this.prisma.registrationForm.findFirst({ where: { publicId, churchGroup: { telegramChatId: chatId } }, include: { cities: true, fields: true, _count: { select: { entries: { where: { status: RegistrationEntryStatus.CONFIRMED } } } } } });
    if (!form) return notFoundReply();
    const cityCapacity = form.cities.reduce((sum, city) => sum + city.quota, 0);
    return {
      text: [`<b>${escapeHtml(form.title)}</b> · <code>${form.publicId}</code>`, form.description ? escapeHtml(form.description) : '<i>Описание не добавлено</i>', '', `Статус: ${statusLabel(form.status)}`, `Зарегистрировано: <b>${form._count.entries}/${form.totalLimit}</b>`, `Города: ${form.cities.length} · сумма квот: ${cityCapacity}`, `Дополнительные поля: ${form.fields.length}`].join('\n'),
      keyboard: [
        [{ text: '🏙 Города и квоты', callbackData: `regadmin:cities:${publicId}` }, { text: '➕ Поля анкеты', callbackData: `regadmin:fields:${publicId}` }],
        [{ text: '👥 Участники', callbackData: `regadmin:people:${publicId}` }, { text: '🔢 Общий лимит', callbackData: `regadmin:setlimit:${publicId}` }],
        [{ text: '📥 Скачать список участников', callbackData: `regadmin:export:${publicId}` }],
        [{ text: '✏️ Описание', callbackData: `regadmin:description:${publicId}` }],
        [{ text: '🎂 Возрастные рамки', callbackData: `regadmin:age:${publicId}` }],
        [{ text: form.status === RegistrationFormStatus.OPEN ? '⏸ Закрыть регистрацию' : '▶ Открыть регистрацию', callbackData: `regadmin:toggle:${publicId}` }],
        ...(form.status === RegistrationFormStatus.OPEN ? [[{ text: '📣 Опубликовать в чате', callbackData: `regadmin:publish:${publicId}` }]] : []),
        [{ text: '◀ Все регистрации', callbackData: 'admin:registrations' }],
      ],
    };
  }

  private async citiesDashboard(chatId: string, publicId: string): Promise<RegistrationReply> {
    const form = await this.prisma.registrationForm.findFirst({ where: { publicId, churchGroup: { telegramChatId: chatId } }, include: { cities: { orderBy: { name: 'asc' }, include: { _count: { select: { entries: { where: { status: RegistrationEntryStatus.CONFIRMED } } } } } } } });
    if (!form) return notFoundReply();
    return {
      text: form.cities.length ? [`<b>Города и квоты</b>`, ...form.cities.map((city) => `${escapeHtml(city.name)}: <b>${city._count.entries}/${city.quota}</b>`)].join('\n\n') : '<b>Города и квоты</b>\n\nДобавьте хотя бы один город, прежде чем открывать регистрацию.',
      keyboard: [
        [{ text: '➕ Добавить город', callbackData: `regadmin:cityadd:${publicId}` }],
        ...form.cities.flatMap((city) => [[{ text: `🔢 ${city.name}`, callbackData: `regadmin:cityquota:${city.id}` }, { text: 'Удалить', callbackData: `regadmin:citydel:${city.id}` }]]),
        [{ text: '◀ К регистрации', callbackData: `regadmin:view:${publicId}` }],
      ],
    };
  }

  private async fieldsDashboard(chatId: string, publicId: string): Promise<RegistrationReply> {
    const form = await this.prisma.registrationForm.findFirst({ where: { publicId, churchGroup: { telegramChatId: chatId } }, include: { fields: { orderBy: { sequence: 'asc' } } } });
    if (!form) return notFoundReply();
    return {
      text: ['<b>Поля анкеты</b>', 'Имя, фамилия, возраст и город уже включены.', ...(form.fields.length ? ['', ...form.fields.map((field, index) => `${index + 1}. ${escapeHtml(field.label)} · ${fieldKindLabel(field.kind)}${field.kind === RegistrationFieldKind.NUMBER && (field.minValue !== null || field.maxValue !== null) ? ` · ${field.minValue ?? '−∞'}…${field.maxValue ?? '+∞'}` : ''}`)] : ['', '<i>Дополнительных полей пока нет.</i>'])].join('\n'),
      keyboard: [[{ text: '➕ Добавить вопрос', callbackData: `regadmin:fieldadd:${publicId}` }], ...form.fields.map((field) => [{ text: `Удалить: ${field.label.slice(0, 24)}`, callbackData: `regadmin:fielddel:${field.id}` }]), [{ text: '◀ К регистрации', callbackData: `regadmin:view:${publicId}` }]],
    };
  }

  private async chooseFieldKind(chatId: string, userId: string, kind: string): Promise<RegistrationReply> {
    const flow = await this.activeFlow(chatId, userId);
    if (!flow || flow.mode !== 'ADMIN' || flow.step !== 'FIELD_KIND' || !flow.formId) return expiredReply();
    const data = this.readData(flow.dataEncrypted);
    if (kind === 'choice') return this.updateFlow(flow.id, 'FIELD_OPTIONS', { ...data, fieldKind: 'CHOICE' }, 'Перечислите варианты через запятую.\nНапример: <i>Да, Нет, Пока не знаю</i>');
    if (kind === 'number') return this.updateFlow(flow.id, 'FIELD_LIMIT_DECISION', { ...data, fieldKind: 'NUMBER' }, 'Нужно ограничить допустимое число нижней и верхней границей?', [[{ text: 'Да, установить границы', callbackData: 'regadmin:numlimit:yes' }], [{ text: 'Нет, принимать любое число', callbackData: 'regadmin:numlimit:no' }], [{ text: 'Отмена', callbackData: 'regadmin:cancel' }]]);
    const form = await this.prisma.registrationForm.findUnique({ where: { id: flow.formId } }); if (!form) return notFoundReply();
    await this.createField(flow.formId, data.fieldLabel!, RegistrationFieldKind.TEXT, []);
    await this.prisma.registrationFlow.delete({ where: { id: flow.id } });
    return this.fieldsDashboard(chatId, form.publicId);
  }

  private async chooseNumberLimit(chatId: string, userId: string, limited: boolean): Promise<RegistrationReply> {
    const flow = await this.activeFlow(chatId, userId);
    if (!flow || flow.mode !== 'ADMIN' || flow.step !== 'FIELD_LIMIT_DECISION' || !flow.formId) return expiredReply();
    const data = this.readData(flow.dataEncrypted);
    if (limited) return this.updateFlow(flow.id, 'FIELD_MIN', data, 'Введите нижнюю границу допустимого значения.');
    const form = await this.prisma.registrationForm.findUnique({ where: { id: flow.formId } }); if (!form) return notFoundReply();
    await this.createField(flow.formId, data.fieldLabel!, RegistrationFieldKind.NUMBER, []);
    await this.prisma.registrationFlow.delete({ where: { id: flow.id } });
    return this.fieldsDashboard(chatId, form.publicId);
  }

  private async finishNumberField(chatId: string, userId: string, rejectionMessage: string): Promise<RegistrationReply> {
    const flow = await this.activeFlow(chatId, userId);
    if (!flow || flow.mode !== 'ADMIN' || flow.step !== 'FIELD_MESSAGE' || !flow.formId) return expiredReply();
    const data = this.readData(flow.dataEncrypted);
    if (data.minValue === undefined || data.maxValue === undefined || !data.fieldLabel) return expiredReply();
    const form = await this.prisma.registrationForm.findUnique({ where: { id: flow.formId } }); if (!form) return notFoundReply();
    await this.createField(flow.formId, data.fieldLabel, RegistrationFieldKind.NUMBER, [], { minValue: data.minValue, maxValue: data.maxValue, rejectionMessage });
    await this.prisma.registrationFlow.delete({ where: { id: flow.id } });
    return this.fieldsDashboard(chatId, form.publicId);
  }

  private async createField(formId: string, label: string, kind: RegistrationFieldKind, options: string[], limits?: { minValue: number; maxValue: number; rejectionMessage: string }): Promise<void> {
    const aggregate = await this.prisma.registrationField.aggregate({ where: { formId }, _max: { sequence: true } });
    await this.prisma.registrationField.create({ data: { formId, label, kind, options, sequence: (aggregate._max.sequence ?? -1) + 1, ...(limits ?? {}) } });
  }

  private async ageDashboard(chatId: string, publicId: string): Promise<RegistrationReply> {
    const form = await this.ownedForm(chatId, publicId); if (!form) return notFoundReply();
    const range = form.ageMin === null && form.ageMax === null ? 'не установлены' : `${form.ageMin ?? 1}–${form.ageMax ?? 120} лет`;
    return {
      text: [`<b>🎂 Возрастные рамки</b>`, `Допустимый возраст: <b>${range}</b>`, '', '<b>Сообщение при несовпадении</b>', escapeHtml(form.ageRejectionMessage)].join('\n'),
      keyboard: [[{ text: form.ageMin === null && form.ageMax === null ? 'Установить рамки' : 'Изменить рамки', callbackData: `regadmin:ageset:${publicId}` }], [{ text: '✏️ Изменить сообщение', callbackData: `regadmin:agemsg:${publicId}` }], ...(form.ageMin !== null || form.ageMax !== null ? [[{ text: 'Убрать ограничения', callbackData: `regadmin:ageoff:${publicId}` }]] : []), [{ text: '◀ К регистрации', callbackData: `regadmin:view:${publicId}` }]],
    };
  }

  private async finishAgeSettings(chatId: string, userId: string, rejectionMessage: string): Promise<RegistrationReply> {
    const flow = await this.activeFlow(chatId, userId);
    if (!flow || flow.mode !== 'ADMIN' || flow.step !== 'AGE_MESSAGE' || !flow.formId) return expiredReply();
    const data = this.readData(flow.dataEncrypted);
    if (data.minValue === undefined || data.maxValue === undefined) return expiredReply();
    const form = await this.prisma.registrationForm.update({ where: { id: flow.formId }, data: { ageMin: data.minValue, ageMax: data.maxValue, ageRejectionMessage: rejectionMessage } });
    await this.prisma.registrationFlow.delete({ where: { id: flow.id } });
    return this.ageDashboard(chatId, form.publicId);
  }

  private async toggleForm(chatId: string, publicId: string): Promise<RegistrationReply> {
    const form = await this.ownedForm(chatId, publicId); if (!form) return notFoundReply();
    if (form.status === RegistrationFormStatus.OPEN) await this.prisma.registrationForm.update({ where: { id: form.id }, data: { status: RegistrationFormStatus.CLOSED } });
    else {
      const cities = await this.prisma.registrationCity.count({ where: { formId: form.id } });
      if (!cities) return { text: 'Сначала добавьте хотя бы один город и его квоту.', keyboard: [[{ text: '🏙 Добавить город', callbackData: `regadmin:cities:${publicId}` }]] };
      await this.prisma.registrationForm.update({ where: { id: form.id }, data: { status: RegistrationFormStatus.OPEN } });
    }
    return this.formDashboard(chatId, publicId);
  }

  private async publicAnnouncement(chatId: string, publicId: string): Promise<RegistrationReply> {
    const form = await this.prisma.registrationForm.findFirst({ where: { publicId, status: RegistrationFormStatus.OPEN, churchGroup: { telegramChatId: chatId } }, include: { _count: { select: { entries: { where: { status: RegistrationEntryStatus.CONFIRMED } } } } } });
    if (!form) return { text: 'Сначала откройте регистрацию.' };
    return { text: [`<b>📝 Открыта регистрация</b>`, '', `<b>${escapeHtml(form.title)}</b>`, form.description ? escapeHtml(form.description) : '', '', `Свободно мест: <b>${Math.max(0, form.totalLimit - form._count.entries)}</b>`, 'Нажмите кнопку ниже — анкета откроется в личном чате с ботом.'].filter(Boolean).join('\n'), keyboard: this.registrationLink(publicId) };
  }

  private async peopleDashboard(chatId: string, publicId: string): Promise<RegistrationReply> {
    const form = await this.prisma.registrationForm.findFirst({ where: { publicId, churchGroup: { telegramChatId: chatId } }, include: { entries: { where: { status: RegistrationEntryStatus.CONFIRMED }, include: { city: true }, orderBy: { createdAt: 'asc' }, take: 50 }, _count: { select: { entries: { where: { status: RegistrationEntryStatus.CONFIRMED } } } } } });
    if (!form) return notFoundReply();
    const rows = form.entries.map((entry, index) => {
      try { return `${index + 1}. ${escapeHtml(this.encryption.decrypt(entry.firstNameEncrypted))} ${escapeHtml(this.encryption.decrypt(entry.lastNameEncrypted))}, ${entry.age} · ${escapeHtml(entry.city.name)}`; }
      catch { return `${index + 1}. <i>Не удалось прочитать данные</i>`; }
    });
    return { text: [`<b>Участники: ${form._count.entries}/${form.totalLimit}</b>`, '', ...(rows.length ? rows : ['Пока никто не зарегистрирован.']), ...(form._count.entries > 50 ? ['', `Показаны первые 50 из ${form._count.entries}.`] : []), '', '<i>Этот список отправлен вам лично и не опубликован в группе.</i>'].join('\n') };
  }

  private async deleteCity(chatId: string, cityId: string): Promise<RegistrationReply> {
    const city = await this.prisma.registrationCity.findFirst({ where: { id: cityId, form: { churchGroup: { telegramChatId: chatId } } }, include: { form: true, _count: { select: { entries: true } } } });
    if (!city) return notFoundReply();
    if (city._count.entries) return { text: 'Нельзя удалить город, по которому уже были регистрации. Измените его квоту.' };
    await this.prisma.registrationCity.delete({ where: { id: city.id } });
    return this.citiesDashboard(chatId, city.form.publicId);
  }

  private async deleteField(chatId: string, fieldId: string): Promise<RegistrationReply> {
    const field = await this.prisma.registrationField.findFirst({ where: { id: fieldId, form: { churchGroup: { telegramChatId: chatId } } }, include: { form: true } });
    if (!field) return notFoundReply();
    await this.prisma.registrationField.delete({ where: { id: field.id } });
    return this.fieldsDashboard(chatId, field.form.publicId);
  }

  private async askField(flowId: string, form: { fields: Array<{ id: string; label: string; kind: RegistrationFieldKind; options: Prisma.JsonValue }> }, field: { id: string; label: string; kind: RegistrationFieldKind; options: Prisma.JsonValue }, data: FlowData): Promise<RegistrationReply> {
    const number = (data.fieldIndex ?? 0) + 5;
    if (field.kind === RegistrationFieldKind.CHOICE) {
      const options = stringArray(field.options);
      return this.updateFlow(flowId, `FIELD_CHOICE:${field.id}`, data, `Шаг ${number}. ${escapeHtml(field.label)}`, options.map((option, index) => [{ text: option, callbackData: `reg:opt:${field.id}:${index}` }]));
    }
    return this.updateFlow(flowId, `FIELD_TEXT:${field.id}`, data, `Шаг ${number}. ${escapeHtml(field.label)}${field.kind === RegistrationFieldKind.NUMBER ? '\nВведите число.' : ''}`);
  }

  private async chooseParticipantOption(chatId: string, userId: string, fieldId: string, optionIndex: number): Promise<RegistrationReply> {
    const flow = await this.activeFlow(chatId, userId);
    if (!flow || flow.mode !== 'PARTICIPANT' || flow.step !== `FIELD_CHOICE:${fieldId}` || !flow.formId) return expiredReply();
    const form = await this.prisma.registrationForm.findUnique({ where: { id: flow.formId }, include: { fields: { orderBy: { sequence: 'asc' } } } });
    const field = form?.fields.find((item) => item.id === fieldId); if (!form || !field) return notFoundReply();
    const option = stringArray(field.options)[optionIndex]; if (!option) return { text: 'Вариант больше недоступен.' };
    const data = this.readData(flow.dataEncrypted);
    const nextData = { ...data, answers: { ...(data.answers ?? {}), [fieldId]: option }, fieldIndex: (data.fieldIndex ?? 0) + 1 };
    const next = form.fields[nextData.fieldIndex!];
    return next ? this.askField(flow.id, form, next, nextData) : this.showParticipantReview(flow.id, form, nextData);
  }

  private async showParticipantReview(flowId: string, form: { publicId: string; title: string; fields: Array<{ id: string; label: string }> }, data: FlowData): Promise<RegistrationReply> {
    const city = await this.prisma.registrationCity.findUnique({ where: { id: data.cityId! } });
    await this.prisma.registrationFlow.update({ where: { id: flowId }, data: { step: 'CONFIRM', dataEncrypted: this.writeData(data) } });
    const extras = form.fields.map((field) => `${escapeHtml(field.label)}: ${escapeHtml(data.answers?.[field.id] ?? '—')}`);
    return { text: [`<b>Проверьте анкету</b>`, '', `Мероприятие: ${escapeHtml(form.title)}`, `Имя: ${escapeHtml(data.firstName ?? '')}`, `Фамилия: ${escapeHtml(data.lastName ?? '')}`, `Возраст: ${data.age}`, `Город: ${escapeHtml(city?.name ?? '')}`, ...extras, '', 'Нажмите «Подтвердить», чтобы занять место.'].join('\n'), keyboard: [[{ text: '✅ Подтвердить', callbackData: `reg:confirm:${form.publicId}` }], [{ text: 'Отменить', callbackData: 'menu:home' }]] };
  }

  private async confirmRegistration(chatId: string, userId: string, publicId: string): Promise<RegistrationReply> {
    const flow = await this.activeFlow(chatId, userId);
    if (!flow || flow.mode !== 'PARTICIPANT' || flow.step !== 'CONFIRM' || !flow.formId) return expiredReply();
    const data = this.readData(flow.dataEncrypted);
    if (!data.cityId || !data.firstName || !data.lastName || !data.age) return expiredReply();
    const cityId = data.cityId;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${flow.formId!}))`;
        const form = await tx.registrationForm.findUnique({ where: { id: flow.formId! }, include: { fields: true } });
        if (!form || form.publicId !== publicId || form.status !== RegistrationFormStatus.OPEN) throw new RegistrationCapacityError('closed');
        if (numericRangeIssue(data.age!, form.ageMin, form.ageMax)) {
          throw new RegistrationCapacityError('constraint', form.ageRejectionMessage);
        }
        for (const field of form.fields) {
          if (field.kind !== RegistrationFieldKind.NUMBER || (field.minValue === null && field.maxValue === null)) continue;
          const answer = parseNumber(data.answers?.[field.id] ?? '');
          if (answer === null || numericRangeIssue(answer, field.minValue, field.maxValue)) {
            throw new RegistrationCapacityError('constraint', field.rejectionMessage ?? DEFAULT_NUMBER_REJECTION);
          }
        }
        const total = await tx.registrationEntry.count({ where: { formId: form.id, status: RegistrationEntryStatus.CONFIRMED } });
        const city = await tx.registrationCity.findFirst({ where: { id: cityId, formId: form.id } });
        if (!city) throw new RegistrationCapacityError('city_missing');
        const cityTotal = await tx.registrationEntry.count({ where: { cityId: city.id, status: RegistrationEntryStatus.CONFIRMED } });
        const capacityIssue = registrationCapacityIssue({ total, totalLimit: form.totalLimit, cityTotal, cityQuota: city.quota });
        if (capacityIssue) throw new RegistrationCapacityError(capacityIssue);
        await tx.registrationEntry.upsert({
          where: { formId_telegramUserId: { formId: form.id, telegramUserId: userId } },
          create: { formId: form.id, cityId: city.id, telegramUserId: userId, firstNameEncrypted: this.encryption.encrypt(data.firstName!), lastNameEncrypted: this.encryption.encrypt(data.lastName!), age: data.age!, answersEncrypted: this.encryption.encrypt(JSON.stringify(data.answers ?? {})) },
          update: { cityId: city.id, firstNameEncrypted: this.encryption.encrypt(data.firstName!), lastNameEncrypted: this.encryption.encrypt(data.lastName!), age: data.age!, answersEncrypted: this.encryption.encrypt(JSON.stringify(data.answers ?? {})), status: RegistrationEntryStatus.CONFIRMED, cancelledAt: null },
        });
        await tx.registrationFlow.delete({ where: { id: flow.id } });
        return { title: form.title, remaining: form.totalLimit - total - 1 };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { text: `<b>✅ Регистрация подтверждена</b>\n\nВы зарегистрированы на «${escapeHtml(result.title)}».\nОсталось мест: ${result.remaining}.`, keyboard: [[{ text: '🏠 Главное меню', callbackData: 'menu:home' }], [{ text: 'Отменить регистрацию', callbackData: `reg:cancel:${publicId}` }]] };
    } catch (error) {
      if (error instanceof RegistrationCapacityError) return { text: error.userMessage ? escapeHtml(error.userMessage) : error.code === 'city_full' ? 'К сожалению, квота для выбранного города уже заполнена. Начните снова и выберите другой город.' : error.code === 'full' ? 'К сожалению, все места уже заняты.' : 'Регистрация уже закрыта или изменилась.' };
      throw error;
    }
  }

  private async cancelRegistration(userId: string, publicId: string): Promise<RegistrationReply> {
    const entry = await this.prisma.registrationEntry.findFirst({ where: { telegramUserId: userId, status: RegistrationEntryStatus.CONFIRMED, form: { publicId } }, include: { form: true } });
    if (!entry) return { text: 'Активная регистрация не найдена.' };
    await this.prisma.registrationEntry.update({ where: { id: entry.id }, data: { status: RegistrationEntryStatus.CANCELLED, cancelledAt: this.now() } });
    return { text: `Регистрация на «${escapeHtml(entry.form.title)}» отменена. Место снова доступно.`, keyboard: [[{ text: 'Зарегистрироваться снова', url: this.deepLink(publicId) }], [{ text: '🏠 Главное меню', callbackData: 'menu:home' }]] };
  }

  private async saveFlow(chatId: string, userId: string, formId: string | null, mode: string, step: string, data: FlowData): Promise<void> {
    await this.prisma.registrationFlow.upsert({ where: { chatId_telegramUserId: { chatId, telegramUserId: userId } }, create: { chatId, telegramUserId: userId, formId, mode, step, dataEncrypted: this.writeData(data), expiresAt: new Date(this.now().getTime() + FLOW_TTL_MS) }, update: { formId, mode, step, dataEncrypted: this.writeData(data), expiresAt: new Date(this.now().getTime() + FLOW_TTL_MS) } });
  }

  private async updateFlow(id: string, step: string, data: FlowData, text: string, keyboard?: InlineButton[][]): Promise<RegistrationReply> {
    await this.prisma.registrationFlow.update({ where: { id }, data: { step, dataEncrypted: this.writeData(data), expiresAt: new Date(this.now().getTime() + FLOW_TTL_MS) } });
    return { text, ...(keyboard ? { keyboard } : { keyboard: [[{ text: 'Отменить', callbackData: 'regadmin:cancel' }]] }) };
  }

  private async activeFlow(chatId: string, userId: string) {
    await this.prisma.registrationFlow.deleteMany({ where: { expiresAt: { lte: this.now() } } });
    return this.prisma.registrationFlow.findUnique({ where: { chatId_telegramUserId: { chatId, telegramUserId: userId } } });
  }

  private async deleteFlow(chatId: string, userId: string): Promise<void> {
    await this.prisma.registrationFlow.deleteMany({ where: { chatId, telegramUserId: userId } });
  }

  private ownedForm(chatId: string, publicId: string) {
    return this.prisma.registrationForm.findFirst({ where: { publicId, churchGroup: { telegramChatId: chatId } } });
  }

  private writeData(data: FlowData): string { return this.encryption.encrypt(JSON.stringify(data)); }
  private readData(value: string): FlowData { return JSON.parse(this.encryption.decrypt(value)) as FlowData; }
  private deepLink(publicId: string): string { return `https://t.me/${this.botUsername ?? 'pastorHelperBot'}?start=reg_${publicId}`; }
  private registrationLink(publicId: string): InlineButton[][] { return [[{ text: '📝 Зарегистрироваться', url: this.deepLink(publicId) }]]; }
}

class RegistrationCapacityError extends Error {
  public constructor(public readonly code: string, public readonly userMessage?: string) { super(code); }
}
function parseLimit(value: string): number | null { const number = Number(value); return Number.isInteger(number) && number >= 1 && number <= 10_000 ? number : null; }
function parseAge(value: string): number | null { const number = Number(value); return Number.isInteger(number) && number >= 1 && number <= 120 ? number : null; }
function parseNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}
function validName(value: string): boolean { return value.length >= 2 && value.length <= 60 && !/[<>\n\r]/.test(value); }
function stringArray(value: Prisma.JsonValue): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function isUniqueError(error: unknown): boolean { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'; }
function statusIcon(status: RegistrationFormStatus): string { return status === RegistrationFormStatus.OPEN ? '🟢' : status === RegistrationFormStatus.CLOSED ? '⏸' : '⚪'; }
function statusLabel(status: RegistrationFormStatus): string { return status === RegistrationFormStatus.OPEN ? '🟢 открыта' : status === RegistrationFormStatus.CLOSED ? '⏸ закрыта' : '⚪ черновик'; }
function fieldKindLabel(kind: RegistrationFieldKind): string { return kind === RegistrationFieldKind.CHOICE ? 'выбор' : kind === RegistrationFieldKind.NUMBER ? 'число' : 'текст'; }
function cityKeyboard(cities: Array<{ id: string; name: string; quota: number; _count: { entries: number } }>): InlineButton[][] { return cities.map((city) => [{ text: `${city.name} · ${city._count.entries}/${city.quota}`, callbackData: `reg:city:${city.id}` }]); }
function cancelReply(text: string, back = 'admin:registrations'): RegistrationReply { return { text, keyboard: [[{ text: 'Отменить', callbackData: back === 'menu:home' ? 'menu:home' : 'regadmin:cancel' }]] }; }
function expiredReply(): RegistrationReply { return { text: 'Этот сценарий уже завершён или истёк. Начните заново.' }; }
function notFoundReply(): RegistrationReply { return { text: 'Регистрация не найдена или недоступна.' }; }
function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
