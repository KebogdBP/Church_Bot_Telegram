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

describe('Telegram webhook', () => {
  it('reports service health', async () => {
    const { app } = createTestApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
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
      text: 'Бот работает. Подключение к Telegram активно.',
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
});
