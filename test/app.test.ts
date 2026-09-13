import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { MaxMessageSender } from '../src/max/max-api-client.js';

function createTestApp(adminIds = '') {
  const sendMessage = vi.fn<MaxMessageSender['sendMessage']>().mockResolvedValue(undefined);
  const app = buildApp({
    config: loadConfig({
      APP_ENV: 'test',
      MAX_WEBHOOK_SECRET: 'test-secret',
      MAX_ADMIN_USER_IDS: adminIds,
    }),
    sender: { sendMessage },
    logger: false,
  });

  return { app, sendMessage };
}

function messageUpdate(text: string, userId = 42) {
  return {
    update_type: 'message_created',
    timestamp: Date.now(),
    message: {
      sender: { user_id: userId, name: 'Test User' },
      recipient: { chat_id: 100 },
      body: { mid: 'mid.1', text },
    },
  };
}

describe('MAX webhook', () => {
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
      url: '/webhooks/max',
      headers: { 'x-max-bot-api-secret': 'wrong-secret' },
      payload: messageUpdate('/help'),
    });

    expect(response.statusCode).toBe(401);
  });

  it('replies to the help command', async () => {
    const { app, sendMessage } = createTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/max',
      headers: { 'x-max-bot-api-secret': 'test-secret' },
      payload: messageUpdate('/help'),
    });

    expect(response.statusCode).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ chatId: '100' }));
  });

  it('allows status only for configured admins', async () => {
    const { app, sendMessage } = createTestApp('42');
    await app.inject({
      method: 'POST',
      url: '/webhooks/max',
      headers: { 'x-max-bot-api-secret': 'test-secret' },
      payload: messageUpdate('/status'),
    });

    expect(sendMessage).toHaveBeenCalledWith({
      chatId: '100',
      text: 'Бот работает. Подключение к MAX активно.',
    });
  });
});
