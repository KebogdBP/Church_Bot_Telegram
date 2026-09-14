import type { MessageSender } from '../messaging/message-sender.js';
import type { IncomingMessage } from '../telegram/types.js';
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

export interface CommandRouterOptions {
  sender: MessageSender;
  eventService: EventService;
  timezone: string;
  sermonPostService?: SermonPostService;
  bibleAssistant?: BibleAssistantService;
  adminService: AdminService;
  sermonIntake?: SermonIntakeService;
  sermonStatus?: SermonStatusReader;
}

const HELP_TEXT = [
  '<b>Помощник церковной группы</b>',
  '',
  '/help - показать доступные команды',
  '/whoami - показать ваш Telegram ID',
  '/status - проверить состояние бота (для администраторов)',
  '/events - ближайшие события',
  '/ask ВОПРОС - задать библейский вопрос',
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
      await this.reply(message.chatId, response);
      return;
    }

    if (command === '/ask') {
      const question = message.text.replace(/^\/ask(?:@\w+)?\s*/i, '').trim();
      if (!question) { await this.reply(message.chatId, 'Формат: /ask ваш вопрос'); return; }
      if (!this.options.bibleAssistant) { await this.reply(message.chatId, 'AI-помощник пока не настроен.'); return; }
      try {
        const answer = await this.options.bibleAssistant.ask(message.chatId, message.userId, question);
        await this.reply(message.chatId, escapeHtml(answer.text));
      } catch {
        await this.reply(message.chatId, 'Не удалось подготовить ответ. Попробуйте позже или обратитесь к пастору.');
      }
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

    if (command === '/sermons' || command === '/sermon_review' || command === '/sermon_approve' || command === '/sermon_link' || command === '/sermon_status') {
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
  }

  private async handleSermonCommand(command: string, message: IncomingMessage): Promise<void> {
    const service = this.options.sermonPostService;
    if (!service) { await this.reply(message.chatId, 'Хранилище проповедей сейчас недоступно.'); return; }
    if (command === '/sermons') {
      const drafts = await service.list(message.chatId);
      await this.reply(message.chatId, drafts.length
        ? ['<b>Черновики проповедей</b>', ...drafts.map((post) => `<code>${post.id}</code> — ${escapeHtml(post.content.slice(0, 100))}`)].join('\n\n')
        : 'Черновиков для проверки пока нет.');
      return;
    }
    const postId = message.text.split(/\s+/, 2)[1];
    if (!postId) { await this.reply(message.chatId, `Формат: ${command} ID`); return; }
    if (command === '/sermon_review') {
      const post = await service.review(message.chatId, postId);
      await this.reply(message.chatId, post
        ? `<b>Черновик</b>\n\n${escapeHtml(post.content)}\n\nID: <code>${post.id}</code>`
        : 'Черновик не найден.');
      return;
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

  private async reply(chatId: string, text: string): Promise<void> {
    await this.options.sender.sendMessage({ chatId, text });
  }
}
