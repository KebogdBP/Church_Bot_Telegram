import { describe, expect, it, vi } from 'vitest';
import { normalizeMessage } from '../src/telegram/normalize-update.js';
import { TelegramApiClient } from '../src/telegram/telegram-api-client.js';

describe('TelegramApiClient', () => {
  it('sends an HTML message to the selected chat', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, result: { message_id: 1 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const client = new TelegramApiClient('secret-token', 'https://api.telegram.org', request);

    await client.sendMessage({ chatId: '-100123', text: '<b>Напоминание</b>' });

    expect(request).toHaveBeenCalledWith(
      'https://api.telegram.org/botsecret-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: '-100123',
          text: '<b>Напоминание</b>',
          parse_mode: 'HTML',
          disable_notification: false,
        }),
      }),
    );
  });

  it('reports Telegram API errors', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ ok: false, error_code: 403, description: 'bot was blocked' }),
      { status: 403 },
    ));
    const client = new TelegramApiClient('secret-token', 'https://api.telegram.org', request);

    await expect(client.sendMessage({ chatId: '1', text: 'hello' }))
      .rejects.toThrow('Telegram API returned 403: bot was blocked');
  });
});

describe('normalizeMessage', () => {
  it('normalizes a Telegram group message', () => {
    const message = normalizeMessage({
      update_id: 100,
      message: {
        message_id: 5,
        date: 1_700_000_000,
        from: { id: 42, is_bot: false, first_name: 'Игорь' },
        chat: { id: -100500, type: 'supergroup' },
        text: '/events',
      },
    });

    expect(message).toEqual({
      chatId: '-100500',
      userId: '42',
      text: '/events',
      messageId: '5',
      chatType: 'supergroup',
    });
  });
});
