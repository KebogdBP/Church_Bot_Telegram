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
}

const HELP_TEXT = [
  '<b>Помощник церковной группы</b>',
  '',
  '/help - показать доступные команды',
  '/whoami - показать ваш Telegram ID',
  '/status - проверить состояние бота (для администраторов)',
  '/admin - открыть панель администратора',
  '/events - ближайшие события',
  '/ask ВОПРОС - задать библейский вопрос',
  '/ask_sermons ВОПРОС - спросить с учетом архива проповедей',
  '/sermon_search ЗАПРОС - найти мысль в архиве проповедей',
  '',
  '<b>Команды администратора</b>',
  '/event_add ГГГГ-ММ-ДД ЧЧ:ММ | Название | Место | Минут до напоминания',
  '/event_weekly 1-7 ЧЧ:ММ | Название | Место | Минут до напоминания',
  '/event_edit ID ДАТА/ДЕНЬ ЧЧ:ММ | Название | Место | Минут до напоминания',
  '/event_delete ID',
  '',
  '<b>Материалы проповедей</b>',
  '/sermons - черновики публикаций',
  '/sermon_link HTTPS_URL - добавить аудио по ссылке',
  '/sermon_status ID - проверить обработку проповеди',
  '/sermon_review ID - посмотреть черновик',
  '/sermon_approve ID - одобрить серию',
  '/sermon_edit ID | ТЕКСТ - изменить черновик',
  '/sermon_reject ID - отклонить черновик',
  '/sermon_regenerate SERMON_ID - заново создать материалы',
  '/digest_preview - подготовить дайджест недели',
  '/digest_approve ID - одобрить и отправить дайджест',
  '/digest_enable 1-7 ЧЧ:ММ - включить еженедельные черновики',
  '/digest_disable - отключить еженедельные черновики',
  '/context_set ТЕКСТ - задать контекст общины',
  '/settings - настройки и состояние группы',
  '/admin_add ID - добавить администратора',
  '/admin_remove ID - удалить администратора',
].join('\n');

export class CommandRouter {
  public constructor(private readonly options: CommandRouterOptions) {}

  public async handle(message: IncomingMessage): Promise<void> {
    const command = message.text.split(/\s+/, 1)[0]?.toLowerCase().split('@', 1)[0];

    if (command === '/start' || command === '/help') {
      await this.reply(message.chatId, HELP_TEXT);
      return;
    }

    if (command === '/whoami') {
      await this.reply(message.chatId, `Ваш Telegram ID: <code>${message.userId}</code>`);
      return;
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

    if (command === '/events') {
      const events = await this.options.eventService.list(message.chatId);
      const response = events.length === 0
        ? 'В расписании пока нет событий.'
        : ['<b>Ближайшие события</b>', '', ...events.map(formatEvent)].join('\n\n');
      await this.reply(message.chatId, response, events.length ? this.rsvpKeyboard(events) : undefined);
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
      } catch {
        await this.reply(message.chatId, 'Не удалось подготовить ответ. Попробуйте позже или обратитесь к пастору.');
      }
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

    if (command === '/sermons' || command === '/sermon_review' || command === '/sermon_approve' || command === '/sermon_edit' || command === '/sermon_reject' || command === '/sermon_regenerate' || command === '/sermon_link' || command === '/sermon_status') {
      if (!(await this.options.adminService.isAdmin(message.chatId, message.userId))) {
        await this.reply(message.chatId, 'Эта команда доступна только администраторам.');
        return;
      }
      if (command === '/sermon_link') {
        const rawUrl = message.text.split(/\s+/, 2)[1];
        if (!rawUrl || !this.options.sermonIntake) { await this.reply(message.chatId, 'Формат: /sermon_link https://example.org/sermon.mp3'); return; }
        try {
          const result = await this.options.sermonIntake.receiveLink({ chatId: message.chatId, messageId: message.messageId, userId: message.userId, url: rawUrl });
          await this.reply(message.chatId, result.status === 'forbidden'
            ? 'Добавлять проповеди могут только администраторы.'
            : result.status === 'duplicate' ? 'Эта ссылка уже принята.' : `Ссылка принята. ID: <code>${result.sermon.id}</code>`);
        } catch { await this.reply(message.chatId, 'Нужна публичная HTTPS-ссылка на аудиофайл.'); }
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
        await this.reply(message.chatId, approved ? 'Дайджест одобрен и поставлен на отправку.' : 'Черновик дайджеста не найден или уже обработан.'); return;
      }
      if (command === '/digest_disable') { await service.disable(message.chatId); await this.reply(message.chatId, 'Автоматические еженедельные черновики отключены.'); return; }
      const match = /^\/digest_enable(?:@\w+)?\s+([1-7])\s+([01]\d|2[0-3]):([0-5]\d)$/i.exec(message.text.trim());
      if (!match) { await this.reply(message.chatId, 'Формат: /digest_enable 1-7 ЧЧ:ММ'); return; }
      await service.configure(message.chatId, Number(match[1]), `${match[2]}:${match[3]}`);
      await this.reply(message.chatId, `Еженедельный черновик включён: день ${match[1]}, ${match[2]}:${match[3]}.`); return;
    }
  }

  public async handleCallback(callback: IncomingCallback): Promise<void> {
    try {
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
      if (callback.data === 'admin:sermons') {
        const drafts = await this.options.sermonPostService?.list(callback.chatId) ?? [];
        await this.reply(callback.chatId, drafts.length ? `<b>Черновики проповедей</b>\n\n${drafts.map((post) => `<code>${post.id}</code> — ${escapeHtml(post.content.slice(0, 100))}`).join('\n\n')}` : 'Черновиков для проверки пока нет.', [...drafts.slice(0, 8).map((post) => [{ text: `Проверить #${post.sequence + 1}`, callbackData: `post:review:${post.id}` }]), [{ text: 'Обновить', callbackData: 'admin:sermons' }, { text: 'Панель', callbackData: 'admin:home' }]]); return;
      }
      if (callback.data === 'admin:settings') {
        const status = await this.options.adminService.dashboard(callback.chatId);
        const admins = await this.options.adminService.list(callback.chatId);
        await this.reply(callback.chatId, ['<b>Состояние группы</b>', `События: ${status.events}`, `Проповеди: ${status.sermons}`, `Контекст AI: ${status.contextConfigured ? 'настроен' : 'не настроен'}`, `Администраторы: ${admins.map((id) => `<code>${id}</code>`).join(', ')}`].join('\n'), [[{ text: 'Панель', callbackData: 'admin:home' }]]); return;
      }
      if (callback.data === 'admin:digest') {
        const digest = await this.options.weeklyDigestService?.preview(callback.chatId);
        await this.reply(callback.chatId, digest ? `<b>Предпросмотр дайджеста</b>\n\n${digest.content}\n\nID: <code>${digest.id}</code>` : 'Дайджесты сейчас недоступны.', digest?.status === 'draft' ? [[{ text: 'Одобрить и отправить', callbackData: `digest:approve:${digest.id}` }, { text: 'Панель', callbackData: 'admin:home' }]] : [[{ text: 'Панель', callbackData: 'admin:home' }]]); return;
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
          await this.reply(callback.chatId, count ? `Одобрено и запланировано публикаций: ${count}.` : 'Черновик не найден или уже обработан.'); return;
        }
        const rejected = await this.options.sermonPostService.reject(callback.chatId, postId!, callback.userId);
        await this.reply(callback.chatId, rejected ? 'Черновик отклонён.' : 'Черновик не найден или уже обработан.'); return;
      }
      const digestApproval = /^digest:approve:(.+)$/.exec(callback.data);
      if (digestApproval && this.options.weeklyDigestService) {
        const approved = await this.options.weeklyDigestService.approve(callback.chatId, digestApproval[1]!, callback.userId);
        await this.reply(callback.chatId, approved ? 'Дайджест одобрен и поставлен на отправку.' : 'Черновик дайджеста не найден или уже обработан.'); return;
      }
      await this.options.sender.answerCallback?.(callback.id, 'Кнопка устарела');
    } catch {
      await this.options.sender.answerCallback?.(callback.id, 'Не удалось выполнить действие');
    }
  }

  private async sendAdminHome(chatId: string): Promise<void> {
    const status = await this.options.adminService.dashboard(chatId);
    await this.reply(chatId, ['<b>Панель администратора</b>', `События: ${status.events}`, `Проповеди: ${status.sermons}`, `Черновики: ${status.draftPosts}`, `Запланировано: ${status.scheduledPosts}`].join('\n'), [
      [{ text: 'Добавить событие', callbackData: 'admin:event_new' }, { text: 'События', callbackData: 'admin:events' }],
      [{ text: 'Проповеди', callbackData: 'admin:sermons' }, { text: 'Настройки', callbackData: 'admin:settings' }],
      [{ text: 'Дайджест недели', callbackData: 'admin:digest' }],
    ]);
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
      await this.reply(message.chatId, rejected ? 'Черновик отклонён.' : 'Черновик не найден или уже обработан.'); return;
    }
    if (command === '/sermon_regenerate') {
      const regenerated = await service.regenerate(message.chatId, postId, message.userId);
      await this.reply(message.chatId, regenerated ? 'Материалы поставлены на повторную генерацию.' : 'Перегенерация невозможна: проповедь не найдена или серия уже запланирована/опубликована.'); return;
    }
    const count = await service.approve(message.chatId, postId, message.userId);
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

  private rsvpKeyboard(events: Array<{ id: string }>): import('../messaging/message-sender.js').InlineButton[][] {
    return events.slice(0, 5).flatMap((event, index) => [
      [{ text: `Событие #${index + 1}: пойду`, callbackData: `rsvp:${event.id}:going` }],
      [{ text: 'Возможно', callbackData: `rsvp:${event.id}:maybe` }, { text: 'Не смогу', callbackData: `rsvp:${event.id}:not_going` }],
    ]);
  }
}
