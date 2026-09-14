import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { MessageSender } from '../src/messaging/message-sender.js';

function createTestApp(adminIds = '', sermonPostService?: import('../src/sermons/sermon-post-service.js').SermonPostService, weeklyDigestService?: import('../src/digests/weekly-digest-service.js').WeeklyDigestService, eventRsvpService?: import('../src/events/event-rsvp-service.js').EventRsvpService, sermonSearchService?: import('../src/sermons/sermon-search-service.js').SermonSearchService, bibleAssistant?: import('../src/assistant/bible-assistant-service.js').BibleAssistantService, announcementService?: import('../src/announcements/announcement-service.js').AnnouncementService, prayerRequestService?: import('../src/prayers/prayer-request-service.js').PrayerRequestService) {
  const sendMessage = vi.fn<MessageSender['sendMessage']>().mockResolvedValue(undefined);
  const answerCallback = vi.fn<NonNullable<MessageSender['answerCallback']>>().mockResolvedValue(undefined);
  const app = buildApp({
    config: loadConfig({
      APP_ENV: 'test',
      TELEGRAM_WEBHOOK_SECRET: 'test-secret',
      TELEGRAM_ADMIN_USER_IDS: adminIds,
    }),
    sender: { sendMessage, answerCallback },
    logger: false,
    ...(sermonPostService ? { sermonPostService } : {}),
    ...(weeklyDigestService ? { weeklyDigestService } : {}),
    ...(eventRsvpService ? { eventRsvpService } : {}),
    ...(sermonSearchService ? { sermonSearchService } : {}),
    ...(bibleAssistant ? { bibleAssistant } : {}),
    ...(announcementService ? { announcementService } : {}),
    ...(prayerRequestService ? { prayerRequestService } : {}),
  });

  return { app, sendMessage, answerCallback };
}

function callbackUpdate(data: string, userId = 42) {
  return { update_id: 3, callback_query: { id: 'callback-1', from: { id: userId, is_bot: false, first_name: 'Test User' }, data, message: { message_id: 12, date: Math.floor(Date.now() / 1_000), chat: { id: 100, type: 'group' } } } };
}

function messageUpdate(text: string, userId = 42, chatType: 'private' | 'group' = 'group') {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      date: Math.floor(Date.now() / 1_000),
      from: { id: userId, is_bot: false, first_name: 'Test User' },
      chat: { id: 100, type: chatType },
      text,
    },
  };
}

function audioUpdate(userId = 42) {
  return {
    update_id: 2,
    message: {
      message_id: 11,
      date: Math.floor(Date.now() / 1_000),
      from: { id: userId, is_bot: false, first_name: 'Test User' },
      chat: { id: 100, type: 'group' },
      caption: 'Проповедь',
      audio: {
        file_id: 'file-id',
        file_unique_id: 'unique-id',
        duration: 1_800,
        file_name: 'sermon.mp3',
        mime_type: 'audio/mpeg',
        file_size: 1_024,
      },
    },
  };
}

describe('Telegram webhook', () => {
  it('accepts empty optional secrets from the environment template', () => {
    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_WEBHOOK_SECRET: '',
      GEMINI_API_KEY: '',
      GROQ_API_KEY: '',
      DATABASE_URL: '',
    });

    expect(config.telegram.botToken).toBeUndefined();
    expect(config.telegram.webhookSecret).toBeUndefined();
    expect(config.ai.geminiApiKey).toBeUndefined();
    expect(config.ai.groqApiKey).toBeUndefined();
    expect(config.databaseUrl).toBeUndefined();
  });

  it('reports service health', async () => {
    const { app } = createTestApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('reports not ready when the database is not configured', async () => {
    const { app } = createTestApp();
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', database: 'not_configured' });
  });

  it('requires production secrets and webhook mode', () => {
    expect(() => loadConfig({ APP_ENV: 'production', TELEGRAM_UPDATE_MODE: 'polling' })).toThrow();
  });

  it('rejects a request with an invalid webhook secret', async () => {
    const { app } = createTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
      payload: messageUpdate('/help'),
    });

    expect(response.statusCode).toBe(401);
  });

  it('replies to the help command', async () => {
    const { app, sendMessage } = createTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      payload: messageUpdate('/help'),
    });

    expect(response.statusCode).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ chatId: '100' }));
  });

  it('allows status only for configured admins', async () => {
    const { app, sendMessage } = createTestApp('42');
    await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      payload: messageUpdate('/status'),
    });

    expect(sendMessage).toHaveBeenCalledWith({
      chatId: '100',
      text: expect.stringContaining('Подключение к Telegram активно.'),
    });
  });

  it('shows an inline administration dashboard', async () => {
    const { app, sendMessage } = createTestApp('42');
    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers: { 'x-telegram-bot-api-secret-token': 'test-secret' }, payload: messageUpdate('/admin') });
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Панель администратора'),
      keyboard: expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ callbackData: 'admin:event_new' })])]),
    }));
  });

  it('rechecks administrator rights for callbacks', async () => {
    const { app, answerCallback, sendMessage } = createTestApp('99');
    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers: { 'x-telegram-bot-api-secret-token': 'test-secret' }, payload: callbackUpdate('admin:home') });
    expect(answerCallback).toHaveBeenCalledWith('callback-1', 'Недостаточно прав');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('handles draft moderation callbacks for administrators', async () => {
    const service = {
      list: vi.fn(), review: vi.fn(), approve: vi.fn().mockResolvedValue(3),
      edit: vi.fn(), reject: vi.fn().mockResolvedValue(true), regenerate: vi.fn(),
    } as unknown as import('../src/sermons/sermon-post-service.js').SermonPostService;
    const { app, sendMessage } = createTestApp('42', service);
    const headers = { 'x-telegram-bot-api-secret-token': 'test-secret' };

    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers, payload: callbackUpdate('post:approve:post-1') });
    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers, payload: callbackUpdate('post:reject:post-2') });

    expect(service.approve).toHaveBeenCalledWith('100', 'post-1', '42');
    expect(service.reject).toHaveBeenCalledWith('100', 'post-2', '42');
    expect(sendMessage).toHaveBeenLastCalledWith({ chatId: '100', text: 'Черновик отклонён.' });
  });

  it('parses edited draft content without publishing it', async () => {
    const service = {
      list: vi.fn(), review: vi.fn(), approve: vi.fn(), reject: vi.fn(), regenerate: vi.fn(),
      edit: vi.fn().mockResolvedValue(true),
    } as unknown as import('../src/sermons/sermon-post-service.js').SermonPostService;
    const { app, sendMessage } = createTestApp('42', service);
    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers: { 'x-telegram-bot-api-secret-token': 'test-secret' }, payload: messageUpdate('/sermon_edit post-1 | Новый безопасный текст') });

    expect(service.edit).toHaveBeenCalledWith('100', 'post-1', 'Новый безопасный текст', '42');
    expect(sendMessage).toHaveBeenLastCalledWith({ chatId: '100', text: 'Черновик обновлён.' });
  });

  it('previews and approves a weekly digest through Telegram', async () => {
    const digestService = {
      preview: vi.fn().mockResolvedValue({ id: 'digest-1', content: '<b>Неделя</b>', status: 'draft' }),
      approve: vi.fn().mockResolvedValue(true), configure: vi.fn(), disable: vi.fn(),
    } as unknown as import('../src/digests/weekly-digest-service.js').WeeklyDigestService;
    const { app, sendMessage } = createTestApp('42', undefined, digestService);
    const headers = { 'x-telegram-bot-api-secret-token': 'test-secret' };

    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers, payload: messageUpdate('/digest_preview') });
    expect(sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ keyboard: [[expect.objectContaining({ callbackData: 'digest:approve:digest-1' })]] }));
    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers, payload: callbackUpdate('digest:approve:digest-1') });
    expect(digestService.approve).toHaveBeenCalledWith('100', 'digest-1', '42');
  });

  it('accepts RSVP callbacks from a regular group member', async () => {
    const rsvpService = { respond: vi.fn().mockResolvedValue({ going: 2, maybe: 1, notGoing: 0 }) } as unknown as import('../src/events/event-rsvp-service.js').EventRsvpService;
    const { app, answerCallback, sendMessage } = createTestApp('99', undefined, undefined, rsvpService);

    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers: { 'x-telegram-bot-api-secret-token': 'test-secret' }, payload: callbackUpdate('rsvp:event-1:going', 42) });

    expect(rsvpService.respond).toHaveBeenCalledWith('100', 'event-1', '42', 'going');
    expect(answerCallback).toHaveBeenCalledWith('callback-1', 'Ответ сохранён');
    expect(sendMessage).toHaveBeenCalledWith({ chatId: '100', text: expect.stringContaining('пойду — 2') });
  });

  it('returns sourced sermon search results to regular members', async () => {
    const searchService = { search: vi.fn().mockResolvedValue([{ sermonId: 'sermon-1', title: 'О надежде', date: new Date('2026-09-13T10:00:00Z'), excerpt: 'надежда не постыжает' }]) } as unknown as import('../src/sermons/sermon-search-service.js').SermonSearchService;
    const { app, sendMessage } = createTestApp('', undefined, undefined, undefined, searchService);

    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers: { 'x-telegram-bot-api-secret-token': 'test-secret' }, payload: messageUpdate('/sermon_search надежда', 77) });

    expect(searchService.search).toHaveBeenCalledWith('100', 'надежда');
    expect(sendMessage).toHaveBeenCalledWith({ chatId: '100', text: expect.stringContaining('Источник: <code>sermon-1</code>') });
  });

  it('routes archive-grounded questions without requiring admin rights', async () => {
    const bibleAssistant = { ask: vi.fn(), askWithSermons: vi.fn().mockResolvedValue({ text: 'Ответ\n\nИсточники архива: [sermon-1]', escalated: false }) } as unknown as import('../src/assistant/bible-assistant-service.js').BibleAssistantService;
    const { app, sendMessage } = createTestApp('', undefined, undefined, undefined, undefined, bibleAssistant);

    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers: { 'x-telegram-bot-api-secret-token': 'test-secret' }, payload: messageUpdate('/ask_sermons Что говорили о надежде?', 77) });

    expect(bibleAssistant.askWithSermons).toHaveBeenCalledWith('100', '77', 'Что говорили о надежде?');
    expect(sendMessage).toHaveBeenCalledWith({ chatId: '100', text: expect.stringContaining('[sermon-1]') });
  });

  it('creates and approves an announcement only for an administrator', async () => {
    const announcements = { create: vi.fn().mockResolvedValue({ id: 'a1', content: 'Общее собрание', status: 'draft' }), find: vi.fn(), list: vi.fn(), edit: vi.fn(), reject: vi.fn(), approve: vi.fn().mockResolvedValue(true) } as unknown as import('../src/announcements/announcement-service.js').AnnouncementService;
    const { app, sendMessage } = createTestApp('42', undefined, undefined, undefined, undefined, undefined, announcements);
    const headers = { 'x-telegram-bot-api-secret-token': 'test-secret' };
    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers, payload: messageUpdate('/announce_new Общее собрание') });
    expect(announcements.create).toHaveBeenCalledWith('100', '42', 'Общее собрание');
    expect(sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ keyboard: [[expect.objectContaining({ callbackData: 'announce:approve:a1' }), expect.anything()]] }));
    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers, payload: callbackUpdate('announce:approve:a1') });
    expect(announcements.approve).toHaveBeenCalledWith('100', 'a1', '42');
  });

  it('accepts prayer requests only in a private chat with explicit visibility', async () => {
    const prayers = { submit: vi.fn().mockResolvedValue({ id: 'p1', visibility: 'LEADERS_ONLY' }) } as unknown as import('../src/prayers/prayer-request-service.js').PrayerRequestService;
    const { app, sendMessage } = createTestApp('', undefined, undefined, undefined, undefined, undefined, undefined, prayers);
    const headers = { 'x-telegram-bot-api-secret-token': 'test-secret' };
    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers, payload: messageUpdate('/prayer_to -100 private | Помолитесь обо мне', 77, 'group') });
    expect(prayers.submit).not.toHaveBeenCalled();
    await app.inject({ method: 'POST', url: '/webhooks/telegram', headers, payload: messageUpdate('/prayer_to -100 private | Помолитесь обо мне', 77, 'private') });
    expect(prayers.submit).toHaveBeenCalledWith('-100', '77', 'Помолитесь обо мне', false);
    expect(sendMessage).toHaveBeenLastCalledWith({ chatId: '100', text: expect.stringContaining('только для лидеров') });
  });

  it('allows an admin to create and list an event', async () => {
    const { app, sendMessage } = createTestApp('42');
    const headers = { 'x-telegram-bot-api-secret-token': 'test-secret' };

    await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers,
      payload: messageUpdate('/event_add 2099-09-20 10:00 | Воскресное собрание | Дом молитвы | 1020'),
    });
    await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers,
      payload: messageUpdate('/events'),
    });

    expect(sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      chatId: '100',
      text: expect.stringContaining('Воскресное собрание'),
      keyboard: expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ callbackData: expect.stringContaining('rsvp:') })])]),
    }));
  });

  it('allows an admin to edit an event', async () => {
    const { app, sendMessage } = createTestApp('42');
    const headers = { 'x-telegram-bot-api-secret-token': 'test-secret' };
    await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers,
      payload: messageUpdate('/event_add 2099-09-20 10:00 | Старое название | Старый зал | 60'),
    });
    const creationText = sendMessage.mock.calls[0]?.[0].text ?? '';
    const eventId = creationText.match(/<code>([^<]+)<\/code>/)?.[1];
    expect(eventId).toBeTruthy();

    await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers,
      payload: messageUpdate(`/event_edit ${eventId} 2099-09-27 11:00 | Новое название | Новый зал | 1440`),
    });

    expect(sendMessage).toHaveBeenLastCalledWith({
      chatId: '100',
      text: expect.stringContaining('Новое название'),
    });
  });

  it('accepts sermon audio from an administrator', async () => {
    const { app, sendMessage } = createTestApp('42');
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      payload: audioUpdate(),
    });

    expect(response.statusCode).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith({
      chatId: '100',
      text: expect.stringContaining('Аудио проповеди принято'),
    });
  });

  it('rejects sermon audio from a regular group member', async () => {
    const { app, sendMessage } = createTestApp('99');
    await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      payload: audioUpdate(),
    });

    expect(sendMessage).toHaveBeenCalledWith({
      chatId: '100',
      text: 'Добавлять проповеди могут только администраторы.',
    });
  });
});
