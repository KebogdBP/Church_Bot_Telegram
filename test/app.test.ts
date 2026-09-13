import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { MessageSender } from '../src/messaging/message-sender.js';

function createTestApp(adminIds = '') {
  const sendMessage = vi.fn<MessageSender['sendMessage']>().mockResolvedValue(undefined);
  const app = buildApp({
    config: loadConfig({
      APP_ENV: 'test',
      TELEGRAM_WEBHOOK_SECRET: 'test-secret',
      TELEGRAM_ADMIN_USER_IDS: adminIds,
    }),
    sender: { sendMessage },
    logger: false,
  });

  return { app, sendMessage };
}

function messageUpdate(text: string, userId = 42) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      date: Math.floor(Date.now() / 1_000),
      from: { id: userId, is_bot: false, first_name: 'Test User' },
      chat: { id: 100, type: 'group' },
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
      OPENAI_API_KEY: '',
      DATABASE_URL: '',
    });

    expect(config.telegram.botToken).toBeUndefined();
    expect(config.telegram.webhookSecret).toBeUndefined();
    expect(config.openai.apiKey).toBeUndefined();
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

    expect(sendMessage).toHaveBeenLastCalledWith({
      chatId: '100',
      text: expect.stringContaining('Воскресное собрание'),
    });
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
