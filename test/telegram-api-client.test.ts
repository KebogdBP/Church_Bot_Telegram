import { describe, expect, it, vi } from 'vitest';
import { normalizeMessage, normalizeSermonAudio } from '../src/telegram/normalize-update.js';
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
        signal: expect.any(AbortSignal),
        body: JSON.stringify({
          chat_id: '-100123',
          text: '<b>Напоминание</b>',
          parse_mode: 'HTML',
          disable_notification: false,
        }),
      }),
    );
  });

  it('uses long polling with a bounded network timeout', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 }));
    const client = new TelegramApiClient('secret-token', 'https://api.telegram.org', request);
    await client.getUpdates(123);
    const options = request.mock.calls[0]?.[1];
    expect(JSON.parse(String(options?.body))).toMatchObject({ offset: 123, timeout: 25 });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
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

  it('sends a Telegram deep-link button without callback data', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }));
    const client = new TelegramApiClient('secret-token', 'https://api.telegram.org', request);
    await client.sendMessage({ chatId: '-100', text: 'Регистрация', keyboard: [[{ text: 'Открыть', url: 'https://t.me/test_bot?start=reg_ABC123' }]] });
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body.reply_markup.inline_keyboard[0][0]).toEqual({ text: 'Открыть', url: 'https://t.me/test_bot?start=reg_ABC123' });
  });

  it('uploads transcript documents and audio files', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }));
    const client = new TelegramApiClient('secret-token', 'https://api.telegram.org', request);

    await client.sendDocument({ chatId: '1', fileName: 'LAXE9T-transcript.txt', bytes: new TextEncoder().encode('Текст') });
    await client.sendAudio({ chatId: '1', fileName: 'LAXE9T.mp3', bytes: new Uint8Array([1, 2, 3]) });

    expect(request).toHaveBeenNthCalledWith(1, 'https://api.telegram.org/botsecret-token/sendDocument', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
    expect(request).toHaveBeenNthCalledWith(2, 'https://api.telegram.org/botsecret-token/sendAudio', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
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

  it('recognizes an audio document in a channel post', () => {
    const audio = normalizeSermonAudio({
      update_id: 101,
      channel_post: {
        message_id: 6,
        date: 1_700_000_001,
        chat: { id: -100900, type: 'channel' },
        caption: 'Воскресная проповедь',
        document: {
          file_id: 'file-id',
          file_unique_id: 'unique-id',
          file_name: 'sermon.m4a',
          mime_type: 'audio/mp4',
          file_size: 2_048,
        },
      },
    });

    expect(audio).toEqual({
      chatId: '-100900',
      chatType: 'channel',
      messageId: '6',
      kind: 'document',
      fileId: 'file-id',
      fileUniqueId: 'unique-id',
      fileName: 'sermon.m4a',
      mimeType: 'audio/mp4',
      fileSize: 2_048,
      caption: 'Воскресная проповедь',
    });
  });
});
