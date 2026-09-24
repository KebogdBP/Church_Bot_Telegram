import type { MessageSender } from '../messaging/message-sender.js';
import type { IncomingCallback, IncomingMessage } from '../telegram/types.js';
import {
  parseEditEventCommand,
  parseOneTimeEventCommand,
  parseWeeklyEventCommand,
} from '../events/event-command-parser.js';
import { EventService, EventValidationError, formatEvent } from '../events/event-service.js';
import type { SermonPostService } from '../sermons/sermon-post-service.js';
import { escapeHtml } from '../messaging/html.js';
import type { BibleAssistantService } from '../assistant/bible-assistant-service.js';
import type { AdminService } from '../admin/admin-service.js';
import type { SermonIntakeService } from '../sermons/sermon-intake-service.js';
import type { SermonStatusReader } from '../sermons/sermon-status-service.js';
import type { GuidedEventService } from '../admin/guided-event-service.js';
import type { WeeklyDigestService } from '../digests/weekly-digest-service.js';
import type { EventRsvpService } from '../events/event-rsvp-service.js';
import type { SermonSearchService } from '../sermons/sermon-search-service.js';
import { DateTime } from 'luxon';
import type { AnnouncementService } from '../announcements/announcement-service.js';
import type { PrayerRequestService } from '../prayers/prayer-request-service.js';
import type { AuditService } from '../audit/audit-service.js';
import { parseRetentionSetting, type RetentionService } from '../retention/retention-service.js';
import type { FastifyBaseLogger } from 'fastify';
import { readFile } from 'node:fs/promises';
import type { DevotionalAdminService } from '../devotionals/devotional-admin-service.js';

export interface CommandRouterOptions {
  sender: MessageSender;
  eventService: EventService;
  timezone: string;
  sermonPostService?: SermonPostService;
  bibleAssistant?: BibleAssistantService;
  adminService: AdminService;
  sermonIntake?: SermonIntakeService;
  sermonStatus?: SermonStatusReader;
  guidedEvents?: GuidedEventService;
  weeklyDigestService?: WeeklyDigestService;
  eventRsvpService?: EventRsvpService;
  sermonSearchService?: SermonSearchService;
  announcementService?: AnnouncementService;
  prayerRequestService?: PrayerRequestService;
  auditService?: AuditService;
  retentionService?: RetentionService;
  devotionalService?: DevotionalAdminService;
  logger?: Pick<FastifyBaseLogger, 'error'>;
}

const HELP_TEXT = [
  '<b>Помощник церковной группы</b>',
  '',
  'В личном чате просто напишите вопрос обычным сообщением.',
  '',
  '/help - показать доступные команды',
  '/whoami - показать ваш Telegram ID',
  '/status - проверить состояние бота (для администраторов)',
  '/activity - последние действия администраторов',
  '/retention - сроки хранения данных',
  '/retention_set audio|transcripts|prayers DAYS - изменить срок',
  '/retention_dry_run - предварительный отчёт',
  '/retention_run CONFIRM - запустить очистку',
  '/admin - открыть панель администратора',
  '/events - ближайшие события',
  '/ask ВОПРОС - задать библейский вопрос',
  '/new_chat - забыть историю диалога с AI',
  '/ask_sermons ВОПРОС - спросить с учетом архива проповедей',
  '/sermon_search ЗАПРОС - найти мысль в архиве проповедей',
  '/church_id - показать ID церковной группы',
  '/prayer_to GROUP_ID private|share | ТЕКСТ - личная молитвенная просьба',
  '',
  '<b>Команды администратора</b>',
  '/event_add ГГГГ-ММ-ДД ЧЧ:ММ | Название | Место | Минут до напоминания',
  '/event_weekly 1-7 ЧЧ:ММ | Название | Место | Минут до напоминания',
  '/event_edit ID ДАТА/ДЕНЬ ЧЧ:ММ | Название | Место | Минут до напоминания',
  '/event_delete ID',
  '',
  '<b>Материалы проповедей</b>',
  '/sermons - черновики публикаций',
  '/sermon_link HTTPS_URL - добавить аудио или видео по ссылке',
  '/sermon_status ID - проверить обработку проповеди',
  '/sermon_show ID - показать структуру и полный транскрипт',
  '/ask_sermon ID ВОПРОС - спросить по конкретной проповеди',
  '/sermon_review ID - посмотреть черновик',
  '/sermon_approve ID - одобрить серию',
  '/sermon_edit ID | ТЕКСТ - изменить черновик',
  '/sermon_reject ID - отклонить черновик',
  '/sermon_regenerate SERMON_ID - заново создать материалы',
  '/digest_preview - подготовить дайджест недели',
  '/digest_approve ID - одобрить и отправить дайджест',
  '/digest_enable 1-7 ЧЧ:ММ - включить еженедельные черновики',
  '/digest_disable - отключить еженедельные черновики',
  '/announce_new ТЕКСТ - создать черновик объявления',
  '/announcements - черновики объявлений',
  '/announce_edit ID | ТЕКСТ - исправить объявление',
  '/announce_approve ID [ГГГГ-ММ-ДД ЧЧ:ММ] - одобрить отправку',
  '/announce_reject ID - отклонить объявление',
  '/prayers GROUP_ID - молитвенные просьбы для лидеров',
  '/prayer_ack ID - отметить просьбу принятой',
  '/prayer_publish ID | АНОНИМНЫЙ ТЕКСТ - одобрить публикацию',
  '/prayer_archive ID - архивировать просьбу',
  '/context_set ТЕКСТ - задать контекст общины',
  '/settings - настройки и состояние группы',
  '/admin_add ID - добавить администратора',
  '/admin_remove ID - удалить администратора',
  '',
  '☀️ Devotional настраивается кнопками: /admin → Настройки → Devotional',
].join('\n');

export class CommandRouter {
  private readonly pendingQuestions = new Set<string>();
  private readonly pendingArchiveSearch = new Set<string>();
  private readonly pendingSermonQuestions = new Map<string, string>();
  private readonly pendingManualText = new Map<string, { title?: string; body: string }>();
  private readonly pendingAdminInput = new Map<string, 'announcement' | 'context'>();

  public constructor(private readonly options: CommandRouterOptions) {}

  public async handle(message: IncomingMessage): Promise<void> {
    const command = message.text.split(/\s+/, 1)[0]?.toLowerCase().split('@', 1)[0];

    if (command === '/start' || command === '/help') {
      if (command === '/start') await this.sendMainMenu(message.chatId);
      else await this.reply(message.chatId, HELP_TEXT, [[{ text: '🏠 Главное меню', callbackData: 'menu:home' }]]);
      return;
    }

    if (command === '/whoami') {
      await this.reply(message.chatId, `Ваш Telegram ID: <code>${message.userId}</code>`);
      return;
    }
    if (command === '/church_id') { await this.reply(message.chatId, message.chatType === 'private' ? 'Эту команду нужно вызвать в церковной группе.' : `ID этой группы: <code>${message.chatId}</code>`); return; }
    if (command === '/prayer_to') {
      if (message.chatType !== 'private') { await this.reply(message.chatId, 'Молитвенные просьбы принимаются только в личном чате с ботом.'); return; }
      const match = /^\/prayer_to(?:@\w+)?\s+(\S+)\s+(private|share)\s*\|\s*([\s\S]+)$/i.exec(message.text);
      if (!match || !match[3]?.trim() || match[3].trim().length > 3000 || !this.options.prayerRequestService) { await this.reply(message.chatId, 'Формат: /prayer_to GROUP_ID private|share | текст до 3000 символов'); return; }
      const request = await this.options.prayerRequestService.submit(match[1]!, message.userId, match[3].trim(), match[2] === 'share');
      if (!request) { await this.reply(message.chatId, 'Церковная группа не найдена. Уточните GROUP_ID у лидера.'); return; }
      await this.reply(message.chatId, request.visibility === 'ANONYMOUS_SHARE' ? `Просьба принята. ID: <code>${request.id}</code>. Вы разрешили лидерам подготовить анонимную публикацию.` : `Просьба принята только для лидеров. ID: <code>${request.id}</code>.`); return;
    }
    if (command === '/prayers' || command === '/prayer_ack' || command === '/prayer_publish' || command === '/prayer_archive') {
      const service = this.options.prayerRequestService; if (!service) { await this.reply(message.chatId, 'Молитвенные просьбы сейчас недоступны.'); return; }
      if (command === '/prayers') { const groupId = message.text.split(/\s+/, 2)[1]; if (!groupId || !(await this.options.adminService.isAdmin(groupId, message.userId))) { await this.reply(message.chatId, 'Формат для лидера: /prayers GROUP_ID'); return; } const rows = await service.list(groupId); await this.reply(message.chatId, rows.length ? rows.map((row) => `<code>${row.id}</code> · ${row.visibility === 'ANONYMOUS_SHARE' ? 'разрешена анонимная публикация' : 'только лидерам'}\n${escapeHtml(row.text)}`).join('\n\n') : 'Новых просьб нет.'); return; }
      const match = /^\/\w+(?:@\w+)?\s+(\S+)(?:\s*\|\s*([\s\S]+))?$/i.exec(message.text); const id = match?.[1]; if (!id) { await this.reply(message.chatId, `Формат: ${command} ID`); return; } const groupId = await service.groupFor(id); if (!groupId || !(await this.options.adminService.isAdmin(groupId, message.userId))) { await this.reply(message.chatId, 'Просьба не найдена или недостаточно прав.'); return; }
      const changed = command === '/prayer_ack' ? await service.acknowledge(id, message.userId) : command === '/prayer_archive' ? await service.archive(id, message.userId) : match?.[2]?.trim() ? await service.approveAnonymous(id, message.userId, match[2].trim()) : false;
      if (changed) await this.audit(groupId, message.userId, command === '/prayer_ack' ? 'prayer.acknowledged' : command === '/prayer_archive' ? 'prayer.archived' : 'prayer.approved', 'prayer_request', id);
      await this.reply(message.chatId, changed ? (command === '/prayer_publish' ? 'Анонимная публикация одобрена.' : 'Статус просьбы обновлён.') : 'Действие недоступно для этой просьбы.'); return;
    }

    if (command === '/cancel') {
      const cancelled = await this.options.guidedEvents?.cancel(message.chatId, message.userId);
      await this.reply(message.chatId, cancelled ? 'Действие отменено.' : 'Нет активного действия.');
      return;
    }

    if (!message.text.startsWith('/') && this.options.guidedEvents && await this.options.adminService.isAdmin(message.chatId, message.userId)) {
      const flowReply = await this.options.guidedEvents.consume(message.chatId, message.userId, message.text);
      if (flowReply) { await this.reply(message.chatId, flowReply.text, flowReply.keyboard); return; }
    }

    const sharedSermonUrl = standaloneHttpsUrl(message.text);
    if (sharedSermonUrl && this.options.sermonIntake && await this.options.adminService.isAdmin(message.chatId, message.userId)) {
      const result = await this.options.sermonIntake.receiveLink({ chatId: message.chatId, messageId: message.messageId, userId: message.userId, url: sharedSermonUrl });
      await this.reply(message.chatId, result.status === 'forbidden'
        ? 'Добавлять проповеди могут только администраторы.'
        : result.status === 'duplicate'
        ? 'Эта ссылка уже принята.'
        : `Ссылка принята на транскрибацию. ID: <code>${result.sermon.publicId ?? result.sermon.id}</code>`);
      return;
    }

    const questionKey = `${message.chatId}:${message.userId}`;
    const adminInput = this.pendingAdminInput.get(questionKey);
    if (!message.text.startsWith('/') && adminInput && await this.options.adminService.isAdmin(message.chatId, message.userId)) {
      this.pendingAdminInput.delete(questionKey);
      if (adminInput === 'announcement' && this.options.announcementService) {
        const draft = await this.options.announcementService.create(message.chatId, message.userId, message.text.trim().slice(0, 4_000));
        await this.audit(message.chatId, message.userId, 'announcement.created', 'announcement', draft.id);
        await this.sendAnnouncementPreview(message.chatId, draft); return;
      }
      if (adminInput === 'context' && this.options.bibleAssistant) {
        await this.options.bibleAssistant.setContext(message.chatId, message.text.trim().slice(0, 2_000));
        await this.reply(message.chatId, 'Описание общины сохранено. AI будет учитывать его в ответах.', [[{ text: '◀ Настройки', callbackData: 'admin:settings' }]]); return;
      }
    }
    const manualDraft = this.pendingManualText.get(questionKey);
    if (!message.text.startsWith('/') && manualDraft && this.options.devotionalService && await this.options.adminService.isAdmin(message.chatId, message.userId)) {
      if (!manualDraft.title) {
        manualDraft.title = message.text.trim().slice(0, 120);
        await this.reply(message.chatId, 'Название сохранено. Теперь отправляйте полный текст. Можно несколькими сообщениями, затем нажмите «Готово».', [[{ text: '✅ Готово', callbackData: 'admin:manual_done' }, { text: 'Отмена', callbackData: 'flow:cancel' }]]);
      } else {
        manualDraft.body += `${manualDraft.body ? '\n\n' : ''}${message.text.trim()}`;
        await this.reply(message.chatId, `Текст добавлен (${manualDraft.body.length} знаков). Отправьте продолжение или нажмите «Готово».`, [[{ text: '✅ Готово', callbackData: 'admin:manual_done' }]]);
      }
      return;
    }
    if (!message.text.startsWith('/') && this.pendingArchiveSearch.delete(questionKey)) {
      if (!this.options.sermonSearchService) { await this.reply(message.chatId, 'Архив проповедей сейчас недоступен.'); return; }
      const results = await this.options.sermonSearchService.search(message.chatId, message.text);
      await this.reply(message.chatId, results.length ? ['<b>🔎 Найдено в архиве</b>', ...results.map((result) => `<b>${escapeHtml(result.title)}</b> · <code>${result.sermonId}</code>\n${escapeHtml(result.excerpt)}`)].join('\n\n') : 'По этому запросу ничего не найдено.', [[{ text: '🗂 К архиву', callbackData: 'menu:archive' }], [{ text: '🏠 Главное меню', callbackData: 'menu:home' }]]);
      return;
    }
    const selectedSermonId = !message.text.startsWith('/') ? this.pendingSermonQuestions.get(questionKey) : undefined;
    if (selectedSermonId && this.pendingSermonQuestions.delete(questionKey)) {
      if (!this.options.bibleAssistant) { await this.reply(message.chatId, 'AI-помощник пока не настроен.'); return; }
      try { const answer = await this.options.bibleAssistant.askSelectedSermon(message.chatId, message.userId, selectedSermonId, message.text); await this.reply(message.chatId, escapeHtml(answer.text)); }
      catch (error) { this.options.logger?.error({ chatId: message.chatId, error: errorMessage(error) }, 'Archive question failed'); await this.reply(message.chatId, 'Не удалось подготовить ответ по этой проповеди.'); }
      return;
    }
    if (!message.text.startsWith('/') && (message.chatType === 'private' || this.pendingQuestions.delete(questionKey))) {
      if (message.text.length > 3_000) { await this.reply(message.chatId, 'Сообщение слишком длинное. Сократите вопрос до 3000 символов.'); return; }
      if (!this.options.bibleAssistant) { await this.reply(message.chatId, 'AI-помощник пока не настроен.'); return; }
      try {
        const answer = await this.options.bibleAssistant.ask(message.chatId, message.userId, message.text);
        await this.reply(message.chatId, escapeHtml(answer.text));
      } catch (error) {
        this.options.logger?.error({ chatId: message.chatId, error: errorMessage(error) }, 'Private AI answer failed');
        await this.reply(message.chatId, 'Не удалось подготовить ответ. Попробуйте позже или обратитесь к пастору.');
      }
      return;
    }

    if (command === '/admin') {
      if (!(await this.options.adminService.isAdmin(message.chatId, message.userId))) { await this.reply(message.chatId, 'Эта команда доступна только администраторам.'); return; }
      await this.sendAdminHome(message.chatId);
      return;
    }

    if (command === '/status') {
      if (!(await this.options.adminService.isAdmin(message.chatId, message.userId))) {
        await this.reply(message.chatId, 'Эта команда доступна только администраторам.');
        return;
      }

      const status = await this.options.adminService.dashboard(message.chatId);
      await this.reply(message.chatId, [
        '<b>Бот работает</b>',
        'Подключение к Telegram активно.',
        `События: ${status.events}`,
        `Проповеди: ${status.sermons}`,
        `Черновики: ${status.draftPosts}`,
        `Запланировано постов: ${status.scheduledPosts}`,
      ].join('\n'));
      return;
    }

    if (command === '/activity') {
      if (!(await this.options.adminService.isAdmin(message.chatId, message.userId))) {
        await this.reply(message.chatId, 'Эта команда доступна только администраторам.');
        return;
      }
      if (!this.options.auditService) { await this.reply(message.chatId, 'Журнал действий сейчас недоступен.'); return; }
      const entries = await this.options.auditService.list(message.chatId);
      const failures = await this.options.auditService.failureSummary(message.chatId);
      const labels: Record<string, string> = {
        'event.created': 'создано событие', 'event.updated': 'изменено событие', 'event.deleted': 'удалено событие',
        'sermon.approved': 'одобрена серия публикаций', 'sermon.edited': 'изменён черновик', 'sermon.rejected': 'отклонён черновик',
        'digest.approved': 'одобрен дайджест', 'digest.configured': 'изменены настройки дайджеста',
        'announcement.created': 'создано объявление', 'announcement.approved': 'одобрено объявление', 'announcement.rejected': 'отклонено объявление',
        'admin.added': 'добавлен администратор', 'admin.removed': 'удалён администратор',
        'prayer.acknowledged': 'просьба принята', 'prayer.approved': 'одобрена анонимная публикация', 'prayer.archived': 'просьба архивирована',
        'retention.configured': 'изменён срок хранения', 'retention.executed': 'выполнена очистка данных',
      };
      const failedTotal = Object.values(failures).reduce((sum, count) => sum + count, 0);
      const activity = entries.length ? entries.map((entry) => `${DateTime.fromJSDate(entry.createdAt, { zone: this.options.timezone }).toFormat('dd.LL HH:mm')} · ${escapeHtml(labels[entry.action] ?? entry.action)} · <code>${escapeHtml(entry.actorUserId)}</code>${entry.entityId ? ` · <code>${escapeHtml(entry.entityId)}</code>` : ''}`) : ['Журнал пока пуст.'];
      await this.reply(message.chatId, ['<b>Последние действия</b>', ...activity, '', `<b>Ошибки фоновых задач:</b> ${failedTotal}`].join('\n'));
      return;
    }

    if (command === '/retention' || command === '/retention_set' || command === '/retention_dry_run' || command === '/retention_run') {
      if (!(await this.options.adminService.isAdmin(message.chatId, message.userId))) { await this.reply(message.chatId, 'Эта команда доступна только администраторам.'); return; }
      const service = this.options.retentionService;
      if (!service) { await this.reply(message.chatId, 'Управление хранением сейчас недоступно.'); return; }
      if (command === '/retention') {
        const policy = await service.getPolicy(message.chatId);
        await this.reply(message.chatId, policy ? `<b>Сроки хранения</b>\nАудио: ${policy.audio} дн.\nТранскрипты: ${policy.transcripts} дн.\nМолитвенные просьбы: ${policy.prayers} дн.` : 'Группа ещё не настроена.'); return;
      }
      if (command === '/retention_set') {
        const setting = parseRetentionSetting(message.text);
        if (!setting) { await this.reply(message.chatId, 'Формат: /retention_set audio|transcripts|prayers DAYS (1–3650)'); return; }
        const policy = await service.setPolicy(message.chatId, setting.kind, setting.days);
        if (policy) await this.audit(message.chatId, message.userId, 'retention.configured', 'retention_policy', setting.kind, { days: setting.days });
        await this.reply(message.chatId, policy ? `Срок хранения ${setting.kind}: ${setting.days} дн.` : 'Группа не найдена.'); return;
      }
      if (command === '/retention_dry_run') {
        const preview = await service.preview(message.chatId);
        await this.reply(message.chatId, preview ? `<b>Предварительная очистка</b>\nАудио: ${preview.audio}\nТранскрипты: ${preview.transcripts}\nМолитвенные просьбы: ${preview.prayers}\nФайлы, ожидающие удаления: ${preview.pendingAudioFiles}\n\nДанные не удалены. Для запуска: <code>/retention_run CONFIRM</code>` : 'Группа не найдена.'); return;
      }
      if (message.text.trim() !== '/retention_run CONFIRM') { await this.reply(message.chatId, 'Очистка не запущена. Точная команда: /retention_run CONFIRM'); return; }
      const removed = await service.execute(message.chatId);
      if (removed) await this.audit(message.chatId, message.userId, 'retention.executed', 'retention_cleanup', undefined, { ...removed });
      await this.reply(message.chatId, removed ? `Очистка завершена. Аудио: ${removed.audio}, транскрипты: ${removed.transcripts}, просьбы: ${removed.prayers}. Ожидают удаления с диска: ${removed.pendingAudioFiles}.` : 'Группа не найдена.'); return;
    }

    if (command === '/events') {
      const events = await this.options.eventService.list(message.chatId);
      const response = events.length === 0
        ? 'В расписании пока нет событий.'
        : ['<b>Ближайшие события</b>', '', ...events.map(formatEvent)].join('\n\n');
      await this.reply(message.chatId, response, events.length ? this.rsvpKeyboard(events) : undefined);
      return;
    }

    if (command === '/new_chat') {
      if (!this.options.bibleAssistant) { await this.reply(message.chatId, 'AI-помощник пока не настроен.'); return; }
      await this.options.bibleAssistant.clearHistory(message.chatId, message.userId);
      await this.reply(message.chatId, 'История диалога удалена. Начинаем новый разговор.');
      return;
    }
    if (command === '/ask_sermon') {
      const parts = message.text.split(/\s+/);
      const sermonId = parts[1];
      const question = parts.slice(2).join(' ').trim();
      if (!sermonId || !question) { await this.reply(message.chatId, 'Формат: /ask_sermon ID ваш вопрос'); return; }
      if (!this.options.bibleAssistant) { await this.reply(message.chatId, 'AI-помощник пока не настроен.'); return; }
      try { const answer = await this.options.bibleAssistant.askSelectedSermon(message.chatId, message.userId, sermonId, question); await this.reply(message.chatId, escapeHtml(answer.text)); }
      catch (error) { this.options.logger?.error({ chatId: message.chatId, error: errorMessage(error) }, 'Selected sermon AI command failed'); await this.reply(message.chatId, 'Не удалось найти проповедь или подготовить ответ.'); }
      return;
    }
    if (command === '/ask' || command === '/ask_sermons') {
      const question = message.text.replace(/^\/ask(?:_sermons)?(?:@\w+)?\s*/i, '').trim();
      if (!question) { await this.reply(message.chatId, `Формат: ${command} ваш вопрос`); return; }
      if (!this.options.bibleAssistant) { await this.reply(message.chatId, 'AI-помощник пока не настроен.'); return; }
      try {
        const answer = command === '/ask_sermons'
          ? await this.options.bibleAssistant.askWithSermons(message.chatId, message.userId, question)
          : await this.options.bibleAssistant.ask(message.chatId, message.userId, question);
        await this.reply(message.chatId, escapeHtml(answer.text));
      } catch (error) {
        this.options.logger?.error({ chatId: message.chatId, error: errorMessage(error) }, 'AI command failed');
        await this.reply(message.chatId, 'Не удалось подготовить ответ. Попробуйте позже или обратитесь к пастору.');
      }
      return;
    }

    if (command === '/sermon_show') {
      const sermonId = message.text.split(/\s+/, 2)[1];
      if (!sermonId || !this.options.sermonSearchService) { await this.reply(message.chatId, 'Формат: /sermon_show ID'); return; }
      const sermon = await this.options.sermonSearchService.get(message.chatId, sermonId, true);
      if (!sermon) { await this.reply(message.chatId, 'Проповедь не найдена или ещё не транскрибирована.'); return; }
      const summary = sermon.summary ? `\n\n<b>Кратко</b>\n${escapeHtml(sermon.summary)}` : '';
      const outline = sermon.outline.length ? `\n\n<b>Структура</b>\n${sermon.outline.map((part, index) => `${index + 1}. ${escapeHtml(part.title)}\n${part.points.map((point) => `• ${escapeHtml(point)}`).join('\n')}`).join('\n')}` : '';
      const thoughts = sermon.keyThoughts.length ? `\n\n<b>Ключевые мысли</b>\n${sermon.keyThoughts.map((thought) => `• ${escapeHtml(thought)}`).join('\n')}` : '';
      const questions = sermon.reflectionQuestions.length ? `\n\n<b>Вопросы</b>\n${sermon.reflectionQuestions.map((question) => `• ${escapeHtml(question)}`).join('\n')}` : '';
      await this.reply(message.chatId, `<b>${escapeHtml(sermon.title)}</b> · <code>${sermon.sermonId}</code>${summary}${outline}${thoughts}${questions}`);
      for (const chunk of splitTelegramText(sermon.transcript)) await this.reply(message.chatId, escapeHtml(chunk));
      return;
    }
    if (command === '/sermon_search') {
      const query = message.text.replace(/^\/sermon_search(?:@\w+)?\s*/i, '').trim();
      if (query.length < 2) { await this.reply(message.chatId, 'Формат: /sermon_search слова для поиска'); return; }
      if (!this.options.sermonSearchService) { await this.reply(message.chatId, 'Архив проповедей сейчас недоступен.'); return; }
      const results = await this.options.sermonSearchService.search(message.chatId, query);
      await this.reply(message.chatId, results.length ? ['<b>Найдено в архиве</b>', ...results.map((result) => [
        `<b>${escapeHtml(result.title)}</b> · ${DateTime.fromJSDate(result.date, { zone: this.options.timezone }).toFormat('dd.LL.yyyy')}`,
        `«${escapeHtml(result.excerpt)}»`,
        `Источник: <code>${result.sermonId}</code>`,
      ].join('\n'))].join('\n\n') : 'В транскрипциях этой группы ничего не найдено.');
      return;
    }

    if (command === '/context_set') {
      if (!(await this.options.adminService.isAdmin(message.chatId, message.userId))) { await this.reply(message.chatId, 'Эта команда доступна только администраторам.'); return; }
      const context = message.text.replace(/^\/context_set(?:@\w+)?\s*/i, '').trim();
      if (!context || context.length > 2_000) { await this.reply(message.chatId, 'Добавьте описание общины длиной до 2000 символов.'); return; }
      if (!this.options.bibleAssistant) { await this.reply(message.chatId, 'AI-помощник пока не настроен.'); return; }
      await this.options.bibleAssistant.setContext(message.chatId, context);
      await this.reply(message.chatId, 'Контекст общины сохранён.');
      return;
    }

    if (command === '/event_add' || command === '/event_weekly' || command === '/event_edit' || command === '/event_delete') {
      if (!(await this.options.adminService.isAdmin(message.chatId, message.userId))) {
        await this.reply(message.chatId, 'Эта команда доступна только администраторам.');
        return;
      }

      await this.handleAdminEventCommand(command, message);
      return;
    }

    if (command === '/sermons' || command === '/sermon_review' || command === '/sermon_approve' || command === '/sermon_edit' || command === '/sermon_reject' || command === '/sermon_regenerate' || command === '/sermon_link' || command === '/sermon_status' || command === '/sermon_show') {
      if (!(await this.options.adminService.isAdmin(message.chatId, message.userId))) {
        await this.reply(message.chatId, 'Эта команда доступна только администраторам.');
        return;
      }
      if (command === '/sermon_link') {
        const rawUrl = message.text.split(/\s+/, 2)[1];
        if (!rawUrl || !this.options.sermonIntake) { await this.reply(message.chatId, 'Формат: /sermon_link HTTPS_URL (YouTube, RuTube, VK, OK, MAX или аудиофайл)'); return; }
        try {
          const result = await this.options.sermonIntake.receiveLink({ chatId: message.chatId, messageId: message.messageId, userId: message.userId, url: rawUrl });
          await this.reply(message.chatId, result.status === 'forbidden'
            ? 'Добавлять проповеди могут только администраторы.'
            : result.status === 'duplicate' ? 'Эта ссылка уже принята.' : `Ссылка принята. ID: <code>${result.sermon.publicId ?? result.sermon.id}</code>`);
        } catch { await this.reply(message.chatId, 'Нужна публичная HTTPS-ссылка на видео или аудио.'); }
        return;
      }
      if (command === '/sermon_status') {
        const sermonId = message.text.split(/\s+/, 2)[1];
        if (!sermonId || !this.options.sermonStatus) { await this.reply(message.chatId, 'Формат: /sermon_status ID'); return; }
        const status = await this.options.sermonStatus.get(message.chatId, sermonId);
        if (!status) { await this.reply(message.chatId, 'Проповедь с таким ID не найдена.'); return; }
        await this.reply(message.chatId, [
          `<b>Проповедь</b> <code>${status.id}</code>`,
          ...(status.fileName ? [`Файл: ${escapeHtml(status.fileName)}`] : []),
          `Загрузка: ${status.download}`,
          `Транскрибация: ${status.transcription}`,
          `Материалы Gemini: ${status.content}`,
          `Черновики: ${status.posts}`,
          ...(Object.keys(status.timings).length ? [`Время этапов: загрузка ${status.timings.downloadMinutes ?? '...'} мин, транскрибация ${status.timings.transcriptionMinutes ?? '...'} мин, анализ ${status.timings.analysisMinutes ?? '...'} мин`] : []),
          ...(status.error ? [`Ошибка: ${escapeHtml(status.error)}`] : []),
        ].join('\n'));
        return;
      }
      await this.handleSermonCommand(command, message);
      return;
    }

    if (command === '/settings' || command === '/admin_add' || command === '/admin_remove') {
      if (!(await this.options.adminService.isAdmin(message.chatId, message.userId))) { await this.reply(message.chatId, 'Эта команда доступна только администраторам.'); return; }
      if (command === '/settings') {
        const status = await this.options.adminService.dashboard(message.chatId);
        const admins = await this.options.adminService.list(message.chatId);
        await this.reply(message.chatId, ['<b>Состояние группы</b>', `События: ${status.events}`, `Проповеди: ${status.sermons}`, `Черновики: ${status.draftPosts}`, `Запланировано постов: ${status.scheduledPosts}`, `Контекст AI: ${status.contextConfigured ? 'настроен' : 'не настроен'}`, `Администраторы: ${admins.map((id) => `<code>${id}</code>`).join(', ')}`].join('\n'));
        return;
      }
      const userId = message.text.split(/\s+/, 2)[1];
      if (!userId || !/^\d+$/.test(userId)) { await this.reply(message.chatId, `Формат: ${command} TELEGRAM_ID`); return; }
      const changed = command === '/admin_add'
        ? await this.options.adminService.add(message.chatId, userId, message.userId)
        : await this.options.adminService.remove(message.chatId, userId);
      if (changed) await this.audit(message.chatId, message.userId, command === '/admin_add' ? 'admin.added' : 'admin.removed', 'admin', userId);
      await this.reply(message.chatId, changed ? 'Роли администраторов обновлены.' : 'Изменений нет. Bootstrap-администратора нельзя удалить командой.');
    }

    if (command === '/digest_preview' || command === '/digest_approve' || command === '/digest_enable' || command === '/digest_disable') {
      if (!(await this.options.adminService.isAdmin(message.chatId, message.userId))) { await this.reply(message.chatId, 'Эта команда доступна только администраторам.'); return; }
      const service = this.options.weeklyDigestService;
      if (!service) { await this.reply(message.chatId, 'Дайджесты сейчас недоступны.'); return; }
      if (command === '/digest_preview') {
        const digest = await service.preview(message.chatId);
        await this.reply(message.chatId, `<b>Предпросмотр дайджеста</b>\n\n${digest.content}\n\nID: <code>${digest.id}</code>`, digest.status === 'draft' ? [[{ text: 'Одобрить и отправить', callbackData: `digest:approve:${digest.id}` }]] : undefined); return;
      }
      if (command === '/digest_approve') {
        const id = message.text.split(/\s+/, 2)[1];
        if (!id) { await this.reply(message.chatId, 'Формат: /digest_approve ID'); return; }
        const approved = await service.approve(message.chatId, id, message.userId);
        if (approved) await this.audit(message.chatId, message.userId, 'digest.approved', 'weekly_digest', id);
        await this.reply(message.chatId, approved ? 'Дайджест одобрен и поставлен на отправку.' : 'Черновик дайджеста не найден или уже обработан.'); return;
      }
      if (command === '/digest_disable') { await service.disable(message.chatId); await this.audit(message.chatId, message.userId, 'digest.configured', 'weekly_digest_settings', undefined, { enabled: false }); await this.reply(message.chatId, 'Автоматические еженедельные черновики отключены.'); return; }
      const match = /^\/digest_enable(?:@\w+)?\s+([1-7])\s+([01]\d|2[0-3]):([0-5]\d)$/i.exec(message.text.trim());
      if (!match) { await this.reply(message.chatId, 'Формат: /digest_enable 1-7 ЧЧ:ММ'); return; }
      await service.configure(message.chatId, Number(match[1]), `${match[2]}:${match[3]}`);
      await this.audit(message.chatId, message.userId, 'digest.configured', 'weekly_digest_settings', undefined, { enabled: true, weekday: Number(match[1]) });
      await this.reply(message.chatId, `Еженедельный черновик включён: день ${match[1]}, ${match[2]}:${match[3]}.`); return;
    }

    if (command === '/announce_new' || command === '/announcements' || command === '/announce_preview' || command === '/announce_edit' || command === '/announce_approve' || command === '/announce_reject') {
      if (!(await this.options.adminService.isAdmin(message.chatId, message.userId))) { await this.reply(message.chatId, 'Эта команда доступна только администраторам.'); return; }
      const service = this.options.announcementService;
      if (!service) { await this.reply(message.chatId, 'Объявления сейчас недоступны.'); return; }
      if (command === '/announce_new') {
        const content = message.text.replace(/^\/announce_new(?:@\w+)?\s*/i, '').trim();
        if (!content || content.length > 4_000) { await this.reply(message.chatId, 'Формат: /announce_new текст до 4000 символов'); return; }
        const draft = await service.create(message.chatId, message.userId, content);
        await this.audit(message.chatId, message.userId, 'announcement.created', 'announcement', draft.id);
        await this.sendAnnouncementPreview(message.chatId, draft); return;
      }
      if (command === '/announcements') {
        const drafts = await service.list(message.chatId);
        await this.reply(message.chatId, drafts.length ? ['<b>Черновики объявлений</b>', ...drafts.map((item) => `<code>${item.id}</code> — ${escapeHtml(item.content.slice(0, 120))}`)].join('\n\n') : 'Черновиков объявлений нет.', drafts.slice(0, 8).map((item) => [{ text: 'Проверить', callbackData: `announce:view:${item.id}` }])); return;
      }
      if (command === '/announce_edit') {
        const match = /^\/announce_edit(?:@\w+)?\s+(\S+)\s*\|\s*([\s\S]+)$/i.exec(message.text);
        if (!match || !match[2]?.trim() || match[2].trim().length > 4_000) { await this.reply(message.chatId, 'Формат: /announce_edit ID | новый текст'); return; }
        const edited = await service.edit(message.chatId, match[1]!, message.userId, match[2].trim());
        if (edited) await this.audit(message.chatId, message.userId, 'announcement.edited', 'announcement', match[1]!);
        await this.reply(message.chatId, edited ? 'Объявление обновлено.' : 'Черновик не найден или уже обработан.'); return;
      }
      const [, id, schedule] = /^\/\w+(?:@\w+)?\s+(\S+)(?:\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}))?$/i.exec(message.text.trim()) ?? [];
      if (!id) { await this.reply(message.chatId, `Формат: ${command} ID`); return; }
      if (command === '/announce_preview') { const draft = await service.find(message.chatId, id); if (draft) await this.sendAnnouncementPreview(message.chatId, draft); else await this.reply(message.chatId, 'Объявление не найдено.'); return; }
      if (command === '/announce_reject') { const rejected = await service.reject(message.chatId, id, message.userId); if (rejected) await this.audit(message.chatId, message.userId, 'announcement.rejected', 'announcement', id); await this.reply(message.chatId, rejected ? 'Объявление отклонено.' : 'Черновик не найден или уже обработан.'); return; }
      const approved = await service.approve(message.chatId, id, message.userId, schedule);
      if (approved) await this.audit(message.chatId, message.userId, 'announcement.approved', 'announcement', id, { scheduled: Boolean(schedule) });
      await this.reply(message.chatId, approved ? 'Объявление одобрено и поставлено на отправку.' : 'Проверьте ID, статус и будущую дату ГГГГ-ММ-ДД ЧЧ:ММ.'); return;
    }
  }

  public async handleCallback(callback: IncomingCallback): Promise<void> {
    try {
      if (callback.data === 'menu:home') { await this.options.sender.answerCallback?.(callback.id); await this.sendMainMenu(callback.chatId); return; }
      if (callback.data === 'menu:admin') { await this.options.sender.answerCallback?.(callback.id); if (await this.options.adminService.isAdmin(callback.chatId, callback.userId)) await this.sendAdminHome(callback.chatId); else await this.reply(callback.chatId, 'Эта панель доступна служителям и администраторам.', [[{ text: '◀ Главное меню', callbackData: 'menu:home' }]]); return; }
      if (callback.data === 'menu:ask') { await this.options.sender.answerCallback?.(callback.id); this.pendingQuestions.add(`${callback.chatId}:${callback.userId}`); await this.reply(callback.chatId, '<b>📖 Задать вопрос</b>\n\nНапишите вопрос следующим сообщением. Команды не нужны.\n\nНапример: «Что Библия говорит о прощении?»', [[{ text: '◀ Назад', callbackData: 'menu:home' }]]); return; }
      if (callback.data === 'menu:sermon') { await this.options.sender.answerCallback?.(callback.id); await this.reply(callback.chatId, '<b>🎙 Работа с проповедью</b>\n\nОтправьте аудио или ссылку на проповедь прямо в этот чат. Я полностью транскрибирую её, сохраню в архиве и подготовлю основные мысли.', [[{ text: '🗂 Архив проповедей', callbackData: 'menu:archive' }], [{ text: '◀ Назад', callbackData: 'menu:home' }]]); return; }
      if (callback.data === 'menu:archive') {
        await this.options.sender.answerCallback?.(callback.id);
        if (!this.options.sermonSearchService) { await this.reply(callback.chatId, 'Архив проповедей сейчас недоступен.', [[{ text: '◀ Назад', callbackData: 'menu:home' }]]); return; }
        const sermons = await this.options.sermonSearchService.list(callback.chatId);
        await this.reply(callback.chatId, sermons.length
          ? ['<b>🗂 Архив проповедей</b>', '', ...sermons.map((sermon, index) => `${index + 1}. <b>${escapeHtml(sermon.title)}</b> · <code>${sermon.sermonId}</code>\n${DateTime.fromJSDate(sermon.date, { zone: this.options.timezone }).toFormat('dd.LL.yyyy')}`)].join('\n\n')
          : '<b>🗂 Архив проповедей</b>\n\nОбработанных проповедей пока нет.', [
          ...sermons.map((sermon) => [{ text: `📖 ${sermon.title.slice(0, 28)}`, callbackData: `archive:view:${sermon.sermonId}` }]),
          [{ text: '🔎 Найти по теме', callbackData: 'menu:archive_search' }],
          [{ text: '◀ Назад', callbackData: 'menu:home' }],
        ]);
        return;
      }
      if (callback.data === 'menu:archive_search') { await this.options.sender.answerCallback?.(callback.id); this.pendingArchiveSearch.add(`${callback.chatId}:${callback.userId}`); await this.reply(callback.chatId, '<b>🔎 Поиск в архиве</b>\n\nНапишите тему или ключевое слово следующим сообщением.\nНапример: <i>прощение</i>.', [[{ text: '◀ К архиву', callbackData: 'menu:archive' }]]); return; }
      const archiveView = /^archive:view:([A-Z0-9]{6})$/i.exec(callback.data);
      if (archiveView && this.options.sermonSearchService) {
        await this.options.sender.answerCallback?.(callback.id);
        const sermon = await this.options.sermonSearchService.get(callback.chatId, archiveView[1]!.toUpperCase());
        if (!sermon) { await this.reply(callback.chatId, 'Проповедь не найдена или ещё не обработана.', [[{ text: '◀ К архиву', callbackData: 'menu:archive' }]]); return; }
        await this.sendSermonArchiveEntry(callback.chatId, sermon);
        return;
      }
      const archiveAction = /^archive:(audio|text|question):([A-Z0-9]{6})$/i.exec(callback.data);
      if (archiveAction && this.options.sermonSearchService) {
        await this.options.sender.answerCallback?.(callback.id);
        const sermon = await this.options.sermonSearchService.get(callback.chatId, archiveAction[2]!.toUpperCase());
        if (!sermon) { await this.reply(callback.chatId, 'Проповедь не найдена или аудио уже удалено.', [[{ text: '◀ К архиву', callbackData: 'menu:archive' }]]); return; }
        if (archiveAction[1] === 'question') { this.pendingSermonQuestions.set(`${callback.chatId}:${callback.userId}`, sermon.sermonId); await this.reply(callback.chatId, `Напишите вопрос по проповеди «${escapeHtml(sermon.title)}».`, [[{ text: '◀ К проповеди', callbackData: `archive:view:${sermon.sermonId}` }]]); return; }
        if (archiveAction[1] === 'text') {
          if (!this.options.sender.sendDocument) { await this.reply(callback.chatId, 'Отправка файлов сейчас недоступна.'); return; }
          await this.options.sender.sendDocument({ chatId: callback.chatId, fileName: `${sermon.sermonId}-transcript.txt`, bytes: new TextEncoder().encode(sermon.transcript), caption: `Транскрипция: ${sermon.title}` });
          return;
        }
        if (!sermon.storedPath || !this.options.sender.sendAudio) { await this.reply(callback.chatId, 'Оригинальный аудиофайл уже удалён или недоступен.', [[{ text: '📄 Скачать текст', callbackData: `archive:text:${sermon.sermonId}` }]]); return; }
        await this.options.sender.sendAudio({ chatId: callback.chatId, fileName: `${sermon.sermonId}.mp3`, bytes: await readFile(sermon.storedPath), caption: `Оригинал проповеди: ${sermon.title}` });
        return;
      }
      if (callback.data === 'menu:prayer') { await this.options.sender.answerCallback?.(callback.id); await this.reply(callback.chatId, '<b>🙏 Молитвенная просьба</b>\n\nНапишите свою просьбу следующим сообщением. В личном чате я передам её служителям конфиденциально.', [[{ text: '◀ Назад', callbackData: 'menu:home' }]]); return; }
      if (callback.data === 'menu:thought') { await this.options.sender.answerCallback?.(callback.id); await this.reply(callback.chatId, '<b>💡 Мысль дня</b>\n\nМысли и практические применения публикуются из обработанных проповедей по расписанию.', [[{ text: '🗂 Архив проповедей', callbackData: 'menu:archive' }], [{ text: '◀ Назад', callbackData: 'menu:home' }]]); return; }
      if (callback.data === 'menu:help') { await this.options.sender.answerCallback?.(callback.id); await this.reply(callback.chatId, '<b>❓ Помощь</b>\n\n• Вопросы можно писать обычным сообщением.\n• Аудио проповеди отправляйте как MP3 или голосовое сообщение.\n• Ссылку на видео или аудио можно отправить отдельным сообщением.\n• Для возврата используйте кнопку ниже.', [[{ text: '🏠 Главное меню', callbackData: 'menu:home' }]]); return; }
      if (callback.data === 'menu:schedule') {
        await this.options.sender.answerCallback?.(callback.id);
        const events = await this.options.eventService.list(callback.chatId);
        await this.reply(callback.chatId, events.length ? ['<b>📅 Ближайшие события</b>', ...events.map(formatEvent)].join('\n\n') : '<b>📅 Расписание</b>\n\nБлижайших событий пока нет.', [[{ text: '◀ Назад', callbackData: 'menu:home' }]]);
        return;
      }
      const rsvp = /^rsvp:([^:]+):(going|maybe|not_going)$/.exec(callback.data);
      if (rsvp && this.options.eventRsvpService) {
        const counts = await this.options.eventRsvpService.respond(callback.chatId, rsvp[1]!, callback.userId, rsvp[2]! as import('../events/event-rsvp-service.js').RsvpChoice);
        await this.options.sender.answerCallback?.(callback.id, counts ? 'Ответ сохранён' : 'Событие недоступно');
        if (counts) await this.reply(callback.chatId, `Ответы на событие: пойду — ${counts.going}, возможно — ${counts.maybe}, не смогу — ${counts.notGoing}.`);
        return;
      }
      if (!(await this.options.adminService.isAdmin(callback.chatId, callback.userId))) {
        await this.options.sender.answerCallback?.(callback.id, 'Недостаточно прав');
        return;
      }
      await this.options.sender.answerCallback?.(callback.id);
      if (callback.data === 'admin:home') { await this.sendAdminHome(callback.chatId); return; }
      if (callback.data === 'admin:event_new') {
        const reply = await this.options.guidedEvents?.start(callback.chatId, callback.userId);
        await this.reply(callback.chatId, reply?.text ?? 'Мастер событий недоступен.', reply?.keyboard);
        return;
      }
      if (callback.data === 'flow:cancel') {
        await this.options.guidedEvents?.cancel(callback.chatId, callback.userId);
        this.pendingManualText.delete(`${callback.chatId}:${callback.userId}`);
        this.pendingAdminInput.delete(`${callback.chatId}:${callback.userId}`);
        await this.reply(callback.chatId, 'Действие отменено.'); return;
      }
      if (callback.data === 'flow:confirm') {
        const reply = await this.options.guidedEvents?.confirm(callback.chatId, callback.userId);
        await this.reply(callback.chatId, reply?.text ?? 'Мастер событий недоступен.', reply?.keyboard); return;
      }
      if (callback.data === 'admin:events') {
        const events = await this.options.eventService.list(callback.chatId);
        await this.reply(callback.chatId, events.length ? ['<b>Ближайшие события</b>', ...events.map(formatEvent)].join('\n\n') : 'В расписании пока нет событий.', [...this.rsvpKeyboard(events), [{ text: 'Добавить событие', callbackData: 'admin:event_new' }, { text: 'Панель', callbackData: 'admin:home' }]]); return;
      }
      if (callback.data === 'admin:content') { await this.reply(callback.chatId, '<b>🎙 Проповеди и материалы</b>\n\nДобавляйте аудио, ссылку или готовый текст. После обработки материал появится в архиве и черновиках.', [[{ text: '🎧 Добавить аудио или ссылку', callbackData: 'admin:add_media' }], [{ text: '📝 Добавить готовый текст', callbackData: 'admin:manual_text' }], [{ text: '🗂 Архив', callbackData: 'menu:archive' }, { text: '✅ Черновики', callbackData: 'admin:sermons' }], [{ text: '◀ Панель', callbackData: 'admin:home' }]]); return; }
      if (callback.data === 'admin:add_media') { await this.reply(callback.chatId, 'Отправьте следующим сообщением аудиофайл, голосовое сообщение или одну публичную ссылку. Бот сам начнёт обработку.', [[{ text: '◀ Проповеди', callbackData: 'admin:content' }]]); return; }
      if (callback.data === 'admin:publishing') { await this.reply(callback.chatId, '<b>📣 Публикации</b>\n\nЗдесь находятся объявления, мысли из проповедей и еженедельный дайджест.', [[{ text: '➕ Новое объявление', callbackData: 'admin:announcement_new' }], [{ text: '📋 Черновики объявлений', callbackData: 'admin:announcements' }], [{ text: '📰 Дайджест недели', callbackData: 'admin:digest' }, { text: '⏰ Расписание дайджеста', callbackData: 'admin:digest_settings' }], [{ text: '◀ Панель', callbackData: 'admin:home' }]]); return; }
      if (callback.data === 'admin:announcement_new') { this.pendingAdminInput.set(`${callback.chatId}:${callback.userId}`, 'announcement'); await this.reply(callback.chatId, 'Напишите текст объявления следующим сообщением. После этого появится предпросмотр с кнопками отправки и отмены.', [[{ text: 'Отмена', callbackData: 'flow:cancel' }]]); return; }
      if (callback.data === 'admin:digest_settings') { await this.reply(callback.chatId, '<b>⏰ Расписание дайджеста</b>\n\nВыберите готовый вариант. Дайджест сначала создаётся как черновик для проверки.', [[{ text: 'Пятница 18:00', callbackData: 'admin:digest_fri_1800' }, { text: 'Суббота 18:00', callbackData: 'admin:digest_sat_1800' }], [{ text: 'Отключить', callbackData: 'admin:digest_off' }], [{ text: '◀ Публикации', callbackData: 'admin:publishing' }]]); return; }
      if (callback.data === 'admin:digest_fri_1800' || callback.data === 'admin:digest_sat_1800' || callback.data === 'admin:digest_off') { if (this.options.weeklyDigestService) { if (callback.data === 'admin:digest_off') await this.options.weeklyDigestService.disable(callback.chatId); else await this.options.weeklyDigestService.configure(callback.chatId, callback.data === 'admin:digest_fri_1800' ? 5 : 6, '18:00'); } await this.reply(callback.chatId, callback.data === 'admin:digest_off' ? 'Еженедельный дайджест отключён.' : 'Расписание дайджеста сохранено.', [[{ text: '◀ Публикации', callbackData: 'admin:publishing' }]]); return; }
      if (callback.data === 'admin:community') { const prayers = await this.options.prayerRequestService?.list(callback.chatId) ?? []; await this.reply(callback.chatId, prayers.length ? ['<b>🙏 Забота о людях</b>', '', ...prayers.map((item) => `${escapeHtml(item.text)}\n<code>${item.id}</code>`) ].join('\n\n') : '<b>🙏 Забота о людях</b>\n\nНовых молитвенных просьб нет.', [[{ text: '🔄 Обновить', callbackData: 'admin:community' }], [{ text: '◀ Панель', callbackData: 'admin:home' }]]); return; }
      if (callback.data === 'admin:system') { await this.reply(callback.chatId, '<b>⚙️ Настройки</b>\n\nНастройте работу AI и автоматических публикаций.', [[{ text: '☀️ Devotional', callbackData: 'admin:devotional' }], [{ text: '🏠 Описание общины для AI', callbackData: 'admin:context' }], [{ text: '📊 Состояние бота', callbackData: 'admin:settings' }], [{ text: '◀ Панель', callbackData: 'admin:home' }]]); return; }
      if (callback.data === 'admin:context') { this.pendingAdminInput.set(`${callback.chatId}:${callback.userId}`, 'context'); await this.reply(callback.chatId, 'Опишите общину следующим сообщением: традицию, язык, важные особенности и границы ответов AI.', [[{ text: 'Отмена', callbackData: 'flow:cancel' }]]); return; }
      if (callback.data === 'admin:sermons') {
        const drafts = await this.options.sermonPostService?.list(callback.chatId) ?? [];
        await this.reply(callback.chatId, drafts.length ? `<b>Черновики проповедей</b>\n\n${drafts.map((post) => `<code>${post.id}</code> — ${escapeHtml(post.content.slice(0, 100))}`).join('\n\n')}` : 'Черновиков для проверки пока нет.', [...drafts.slice(0, 8).map((post) => [{ text: `Проверить #${post.sequence + 1}`, callbackData: `post:review:${post.id}` }]), [{ text: 'Обновить', callbackData: 'admin:sermons' }, { text: 'Панель', callbackData: 'admin:home' }]]); return;
      }
      if (callback.data === 'admin:settings') {
        const status = await this.options.adminService.dashboard(callback.chatId);
        const admins = await this.options.adminService.list(callback.chatId);
        const devotional = await this.options.devotionalService?.status(callback.chatId);
        await this.reply(callback.chatId, ['<b>Состояние группы</b>', `События: ${status.events}`, `Проповеди: ${status.sermons}`, `Контекст AI: ${status.contextConfigured ? 'настроен' : 'не настроен'}`, `Администраторы: ${admins.map((id) => `<code>${id}</code>`).join(', ')}`, `Devotional: ${devotional?.enabled ? `включён, ${devotional.localTime}` : 'выключен'}`].join('\n'), [[{ text: '☀️ Devotional', callbackData: 'admin:devotional' }], [{ text: 'Панель', callbackData: 'admin:home' }]]); return;
      }
      if (callback.data === 'admin:devotional') {
        const devotional = await this.options.devotionalService?.status(callback.chatId);
        await this.reply(callback.chatId, `<b>☀️ Утренний devotional</b>\n\nСтатус: ${devotional?.enabled ? 'включён' : 'выключен'}\nВремя: ${devotional?.localTime ?? '08:00'}`, [[{ text: devotional?.enabled ? 'Выключить' : 'Включить', callbackData: devotional?.enabled ? 'admin:devotional_off' : 'admin:devotional_on' }, { text: 'Установить 08:00', callbackData: 'admin:devotional_0800' }], [{ text: '📝 Добавить текст', callbackData: 'admin:manual_text' }], [{ text: '◀ Настройки', callbackData: 'admin:settings' }]]); return;
      }
      if (callback.data === 'admin:devotional_on' || callback.data === 'admin:devotional_off' || callback.data === 'admin:devotional_0800') {
        if (this.options.devotionalService) await this.options.devotionalService.configure(callback.chatId, callback.data !== 'admin:devotional_off', '08:00');
        await this.reply(callback.chatId, callback.data === 'admin:devotional_off' ? 'Devotional отключён.' : 'Devotional включён. Публикация будет каждый день в 08:00 по часовому поясу группы.', [[{ text: '◀ К devotional', callbackData: 'admin:devotional' }]]); return;
      }
      if (callback.data === 'admin:manual_text') {
        this.pendingManualText.set(`${callback.chatId}:${callback.userId}`, { body: '' });
        await this.reply(callback.chatId, 'Отправьте название проповеди.', [[{ text: 'Отмена', callbackData: 'flow:cancel' }]]); return;
      }
      if (callback.data === 'admin:manual_done') {
        const key = `${callback.chatId}:${callback.userId}`;
        const draft = this.pendingManualText.get(key); this.pendingManualText.delete(key);
        if (!draft?.title || draft.body.length < 20 || !this.options.devotionalService) { await this.reply(callback.chatId, 'Текст слишком короткий или не задано название. Добавление отменено.'); return; }
        const id = await this.options.devotionalService.addText(callback.chatId, callback.userId, draft.title, draft.body);
        await this.reply(callback.chatId, `Текст сохранён в архиве. ID: <code>${id}</code>. AI подготовит публикации и devotional.`); return;
      }
      if (callback.data === 'admin:digest') {
        const digest = await this.options.weeklyDigestService?.preview(callback.chatId);
        await this.reply(callback.chatId, digest ? `<b>Предпросмотр дайджеста</b>\n\n${digest.content}\n\nID: <code>${digest.id}</code>` : 'Дайджесты сейчас недоступны.', digest?.status === 'draft' ? [[{ text: 'Одобрить и отправить', callbackData: `digest:approve:${digest.id}` }, { text: 'Панель', callbackData: 'admin:home' }]] : [[{ text: 'Панель', callbackData: 'admin:home' }]]); return;
      }
      if (callback.data === 'admin:announcements') {
        const drafts = await this.options.announcementService?.list(callback.chatId) ?? [];
        await this.reply(callback.chatId, drafts.length ? ['<b>Черновики объявлений</b>', ...drafts.map((item) => `<code>${item.id}</code> — ${escapeHtml(item.content.slice(0, 120))}`)].join('\n\n') : 'Черновиков объявлений нет.', [...drafts.slice(0, 8).map((item) => [{ text: 'Проверить', callbackData: `announce:view:${item.id}` }]), [{ text: 'Панель', callbackData: 'admin:home' }]]); return;
      }
      const announcementAction = /^announce:(view|approve|reject):(.+)$/.exec(callback.data);
      if (announcementAction && this.options.announcementService) {
        const [, action, id] = announcementAction;
        if (action === 'view') { const draft = await this.options.announcementService.find(callback.chatId, id!); if (draft) await this.sendAnnouncementPreview(callback.chatId, draft); else await this.reply(callback.chatId, 'Объявление не найдено.'); return; }
        if (action === 'approve') { const approved = await this.options.announcementService.approve(callback.chatId, id!, callback.userId); if (approved) await this.audit(callback.chatId, callback.userId, 'announcement.approved', 'announcement', id!); await this.reply(callback.chatId, approved ? 'Объявление одобрено и поставлено на отправку.' : 'Черновик не найден или уже обработан.'); return; }
        const rejected = await this.options.announcementService.reject(callback.chatId, id!, callback.userId); if (rejected) await this.audit(callback.chatId, callback.userId, 'announcement.rejected', 'announcement', id!); await this.reply(callback.chatId, rejected ? 'Объявление отклонено.' : 'Черновик не найден или уже обработан.'); return;
      }
      const postAction = /^post:(review|approve|reject):(.+)$/.exec(callback.data);
      if (postAction && this.options.sermonPostService) {
        const [, action, postId] = postAction;
        if (action === 'review') {
          const post = await this.options.sermonPostService.review(callback.chatId, postId!);
          await this.reply(callback.chatId, post ? `<b>Черновик</b>\n\n${escapeHtml(post.content)}\n\nID: <code>${post.id}</code>` : 'Черновик не найден.', post ? [[{ text: 'Одобрить серию', callbackData: `post:approve:${post.id}` }, { text: 'Отклонить', callbackData: `post:reject:${post.id}` }], [{ text: 'К списку', callbackData: 'admin:sermons' }]] : undefined);
          return;
        }
        if (action === 'approve') {
          const count = await this.options.sermonPostService.approve(callback.chatId, postId!, callback.userId);
          if (count) await this.audit(callback.chatId, callback.userId, 'sermon.approved', 'sermon_post', postId!, { posts: count });
          await this.reply(callback.chatId, count ? `Одобрено и запланировано публикаций: ${count}.` : 'Черновик не найден или уже обработан.'); return;
        }
        const rejected = await this.options.sermonPostService.reject(callback.chatId, postId!, callback.userId);
        if (rejected) await this.audit(callback.chatId, callback.userId, 'sermon.rejected', 'sermon_post', postId!);
        await this.reply(callback.chatId, rejected ? 'Черновик отклонён.' : 'Черновик не найден или уже обработан.'); return;
      }
      const digestApproval = /^digest:approve:(.+)$/.exec(callback.data);
      if (digestApproval && this.options.weeklyDigestService) {
        const approved = await this.options.weeklyDigestService.approve(callback.chatId, digestApproval[1]!, callback.userId);
        if (approved) await this.audit(callback.chatId, callback.userId, 'digest.approved', 'weekly_digest', digestApproval[1]!);
        await this.reply(callback.chatId, approved ? 'Дайджест одобрен и поставлен на отправку.' : 'Черновик дайджеста не найден или уже обработан.'); return;
      }
      await this.options.sender.answerCallback?.(callback.id, 'Кнопка устарела');
    } catch (error) {
      this.options.logger?.error({ err: errorMessage(error), chatId: callback.chatId }, 'callback_action_failed');
      await this.options.sender.answerCallback?.(callback.id, 'Не удалось выполнить действие');
    }
  }

  private async sendAdminHome(chatId: string): Promise<void> {
    const status = await this.options.adminService.dashboard(chatId);
    await this.reply(chatId, ['<b>Панель служителя</b>', 'Выберите раздел. Бот подскажет дальнейшие действия.', '', `События: ${status.events} · Проповеди: ${status.sermons}`, `Черновики: ${status.draftPosts} · Запланировано: ${status.scheduledPosts}`].join('\n'), [
      [{ text: '🎙 Проповеди', callbackData: 'admin:content' }, { text: '📣 Публикации', callbackData: 'admin:publishing' }],
      [{ text: '📅 События', callbackData: 'admin:events' }, { text: '🙏 Забота о людях', callbackData: 'admin:community' }],
      [{ text: '⚙️ Настройки', callbackData: 'admin:system' }],
      [{ text: '◀ Обычное меню', callbackData: 'menu:home' }],
    ]);
  }

  private async sendMainMenu(chatId: string): Promise<void> {
    await this.reply(chatId, '<b>🙏 Церковный помощник</b>\n\nЯ помогу найти мысль из проповеди, ответить на библейский вопрос, принять аудиозапись и напомнить о ближайших событиях.', [
      [{ text: '📖 Задать вопрос', callbackData: 'menu:ask' }, { text: '🎙 Проповедь', callbackData: 'menu:sermon' }],
      [{ text: '🗂 Архив', callbackData: 'menu:archive' }, { text: '📅 Расписание', callbackData: 'menu:schedule' }],
      [{ text: '🙏 Молитва', callbackData: 'menu:prayer' }, { text: '💡 Мысль дня', callbackData: 'menu:thought' }],
      [{ text: '❓ Помощь', callbackData: 'menu:help' }, { text: '⚙️ Для служителей', callbackData: 'menu:admin' }],
    ]);
  }

  private async sendSermonArchiveEntry(chatId: string, sermon: import('../sermons/sermon-search-service.js').SermonArchiveEntry): Promise<void> {
    const summary = sermon.summary ? `\n\n<b>Кратко</b>\n${escapeHtml(sermon.summary)}` : '';
    const outline = sermon.outline.length ? `\n\n<b>Структура</b>\n${sermon.outline.map((part, index) => `${index + 1}. ${escapeHtml(part.title)}\n${part.points.map((point) => `• ${escapeHtml(point)}`).join('\n')}`).join('\n')}` : '';
    const thoughts = sermon.keyThoughts.length ? `\n\n<b>Ключевые мысли</b>\n${sermon.keyThoughts.map((thought) => `• ${escapeHtml(thought)}`).join('\n')}` : '';
    await this.reply(chatId, `<b>${escapeHtml(sermon.title)}</b> · <code>${sermon.sermonId}</code>${summary}${outline}${thoughts}`, [[{ text: '🎧 Скачать аудио', callbackData: `archive:audio:${sermon.sermonId}` }, { text: '📄 Скачать текст', callbackData: `archive:text:${sermon.sermonId}` }], [{ text: '💬 Задать вопрос', callbackData: `archive:question:${sermon.sermonId}` }], [{ text: '◀ К архиву', callbackData: 'menu:archive' }]]);
    await this.reply(chatId, '<b>Полная транскрипция</b>');
    for (const chunk of splitTelegramText(sermon.transcript)) await this.reply(chatId, escapeHtml(chunk));
  }

  private async handleSermonCommand(command: string, message: IncomingMessage): Promise<void> {
    const service = this.options.sermonPostService;
    if (!service) { await this.reply(message.chatId, 'Хранилище проповедей сейчас недоступно.'); return; }
    if (command === '/sermons') {
      const drafts = await service.list(message.chatId);
      await this.reply(message.chatId, drafts.length
        ? ['<b>Черновики проповедей</b>', ...drafts.map((post) => `<code>${post.id}</code> — ${escapeHtml(post.content.slice(0, 100))}`)].join('\n\n')
        : 'Черновиков для проверки пока нет.', drafts.length ? drafts.slice(0, 8).map((post) => [{ text: `Проверить #${post.sequence + 1}`, callbackData: `post:review:${post.id}` }]) : undefined);
      return;
    }
    if (command === '/sermon_edit') {
      const match = /^\/sermon_edit(?:@\w+)?\s+(\S+)\s*\|\s*([\s\S]+)$/i.exec(message.text);
      if (!match || !match[2]?.trim() || match[2].trim().length > 4_000) { await this.reply(message.chatId, 'Формат: /sermon_edit ID | новый текст (до 4000 символов)'); return; }
      const edited = await service.edit(message.chatId, match[1]!, match[2].trim(), message.userId);
      if (edited) await this.audit(message.chatId, message.userId, 'sermon.edited', 'sermon_post', match[1]!);
      await this.reply(message.chatId, edited ? 'Черновик обновлён.' : 'Черновик не найден или уже обработан.'); return;
    }
    const postId = message.text.split(/\s+/, 2)[1];
    if (!postId) { await this.reply(message.chatId, `Формат: ${command} ID`); return; }
    if (command === '/sermon_review') {
      const post = await service.review(message.chatId, postId);
      await this.reply(message.chatId, post
        ? `<b>Черновик</b>\n\n${escapeHtml(post.content)}\n\nID: <code>${post.id}</code>`
        : 'Черновик не найден.', post ? [[{ text: 'Одобрить серию', callbackData: `post:approve:${post.id}` }, { text: 'Отклонить', callbackData: `post:reject:${post.id}` }]] : undefined);
      return;
    }
    if (command === '/sermon_reject') {
      const rejected = await service.reject(message.chatId, postId, message.userId);
      if (rejected) await this.audit(message.chatId, message.userId, 'sermon.rejected', 'sermon_post', postId);
      await this.reply(message.chatId, rejected ? 'Черновик отклонён.' : 'Черновик не найден или уже обработан.'); return;
    }
    if (command === '/sermon_regenerate') {
      const regenerated = await service.regenerate(message.chatId, postId, message.userId);
      await this.reply(message.chatId, regenerated ? 'Материалы поставлены на повторную генерацию.' : 'Перегенерация невозможна: проповедь не найдена или серия уже запланирована/опубликована.'); return;
    }
    const count = await service.approve(message.chatId, postId, message.userId);
    if (count) await this.audit(message.chatId, message.userId, 'sermon.approved', 'sermon_post', postId, { posts: count });
    await this.reply(message.chatId, count ? `Одобрено и запланировано публикаций: ${count}.` : 'Черновик не найден или уже обработан.');
  }

  private async handleAdminEventCommand(command: string, message: IncomingMessage): Promise<void> {
    try {
      if (command === '/event_add') {
        const parsed = parseOneTimeEventCommand(message.text);
        if (!parsed) {
          await this.reply(message.chatId, 'Формат: /event_add ГГГГ-ММ-ДД ЧЧ:ММ | Название | Место | Минут до напоминания');
          return;
        }
        const event = await this.options.eventService.createOneTime({
          ...parsed,
          chatId: message.chatId,
          userId: message.userId,
          timezone: this.options.timezone,
        });
        await this.audit(message.chatId, message.userId, 'event.created', 'event', event.id, { recurring: false });
        await this.reply(message.chatId, `Событие добавлено.\n\n${formatEvent(event)}`);
        return;
      }

      if (command === '/event_weekly') {
        const parsed = parseWeeklyEventCommand(message.text);
        if (!parsed) {
          await this.reply(message.chatId, 'Формат: /event_weekly 1-7 ЧЧ:ММ | Название | Место | Минут до напоминания');
          return;
        }
        const event = await this.options.eventService.createWeekly({
          ...parsed,
          chatId: message.chatId,
          userId: message.userId,
          timezone: this.options.timezone,
        });
        await this.audit(message.chatId, message.userId, 'event.created', 'event', event.id, { recurring: true });
        await this.reply(message.chatId, `Еженедельное событие добавлено.\n\n${formatEvent(event)}`);
        return;
      }

      if (command === '/event_edit') {
        const parsed = parseEditEventCommand(message.text);
        if (!parsed) {
          await this.reply(message.chatId, 'Формат: /event_edit ID ДАТА/ДЕНЬ ЧЧ:ММ | Название | Место | Минут до напоминания');
          return;
        }
        const event = await this.options.eventService.edit({
          ...parsed,
          chatId: message.chatId,
        });
        if (event) await this.audit(message.chatId, message.userId, 'event.updated', 'event', event.id);
        await this.reply(
          message.chatId,
          event ? `Событие обновлено.\n\n${formatEvent(event)}` : 'Событие с таким ID не найдено.',
        );
        return;
      }

      const eventId = message.text.split(/\s+/, 2)[1];
      if (!eventId) {
        await this.reply(message.chatId, 'Формат: /event_delete ID');
        return;
      }
      const deleted = await this.options.eventService.delete(message.chatId, eventId);
      if (deleted) await this.audit(message.chatId, message.userId, 'event.deleted', 'event', eventId);
      await this.reply(message.chatId, deleted ? 'Событие удалено.' : 'Событие с таким ID не найдено.');
    } catch (error) {
      if (error instanceof EventValidationError) {
        await this.reply(message.chatId, error.message);
        return;
      }
      throw error;
    }
  }

  private async reply(chatId: string, text: string, keyboard?: import('../messaging/message-sender.js').InlineButton[][]): Promise<void> {
    await this.options.sender.sendMessage({ chatId, text, ...(keyboard ? { keyboard } : {}) });
  }

  private async audit(chatId: string, actorUserId: string, action: string, entityType: string, entityId?: string, metadata?: Record<string, string | number | boolean>): Promise<void> {
    await this.options.auditService?.record(chatId, actorUserId, action, entityType, entityId, metadata);
  }

  private rsvpKeyboard(events: Array<{ id: string }>): import('../messaging/message-sender.js').InlineButton[][] {
    return events.slice(0, 5).flatMap((event, index) => [
      [{ text: `Событие #${index + 1}: пойду`, callbackData: `rsvp:${event.id}:going` }],
      [{ text: 'Возможно', callbackData: `rsvp:${event.id}:maybe` }, { text: 'Не смогу', callbackData: `rsvp:${event.id}:not_going` }],
    ]);
  }

  private async sendAnnouncementPreview(chatId: string, draft: { id: string; content: string; status: string }): Promise<void> {
    await this.reply(chatId, `<b>Предпросмотр объявления</b>\n\n${escapeHtml(draft.content)}\n\nID: <code>${draft.id}</code>\nСтатус: ${escapeHtml(draft.status)}`, draft.status === 'draft' ? [[{ text: 'Отправить сейчас', callbackData: `announce:approve:${draft.id}` }, { text: 'Отклонить', callbackData: `announce:reject:${draft.id}` }]] : undefined);
  }
}

function splitTelegramText(text: string, limit = 3800): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < text.length; offset += limit) chunks.push(text.slice(offset, offset + limit));
  return chunks;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

export function standaloneHttpsUrl(text: string): string | null {
  const value = text.trim();
  if (!/^https:\/\/\S+$/i.test(value)) return null;
  try { return new URL(value).toString(); } catch { return null; }
}
