import type { MessageSender, SendFileInput, SendMessageInput, SendPhotoReferenceInput } from '../messaging/message-sender.js';
import type { TelegramUpdate } from './types.js';
import { Agent } from 'undici';
import { readFile } from 'node:fs/promises';

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApiClient implements MessageSender {
  private readonly directAgent = new Agent();
  public constructor(
    private readonly token: string | undefined,
    private readonly baseUrl: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  public async sendMessage(input: SendMessageInput): Promise<void> {
    if (!this.token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required to send messages');
    }

    const response = await this.request(`${this.baseUrl}/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.text,
        parse_mode: 'HTML',
        disable_notification: !(input.notify ?? true),
        ...(input.forceReply ? {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: 'Ответ церковному помощнику',
          },
        } : input.keyboard ? {
          reply_markup: {
            inline_keyboard: input.keyboard.map((row) => row.map((button) => button.url
              ? { text: button.text, url: button.url }
              : { text: button.text, callback_data: button.callbackData })),
          },
        } : {}),
      }),
      signal: AbortSignal.timeout(35_000), dispatcher: this.directAgent,
    } as RequestInit & { dispatcher: Agent });
    const body = await readTelegramResponse(response);
    if (!response.ok || !body.ok) {
      throw new Error(`Telegram API returned ${body.error_code ?? response.status}: ${body.description ?? 'unknown error'}`);
    }
  }

  public async answerCallback(callbackId: string, text?: string): Promise<void> {
    await this.call<true>('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text } : {}) });
  }

  public sendAudio(input: SendFileInput): Promise<void> {
    return this.sendMultipart('sendAudio', 'audio', input);
  }

  public sendDocument(input: SendFileInput): Promise<void> {
    return this.sendMultipart('sendDocument', 'document', input);
  }

  public sendPhoto(input: SendFileInput): Promise<void> {
    return this.sendMultipart('sendPhoto', 'photo', input, true);
  }

  public async sendPhotoById(input: SendPhotoReferenceInput): Promise<void> {
    await this.call<unknown>('sendPhoto', {
      chat_id: input.chatId,
      photo: input.fileId,
      caption: input.caption,
      parse_mode: 'HTML',
    });
  }

  public async getFile(fileId: string): Promise<{ filePath: string; fileSize?: number }> {
    const body = await this.call<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId });
    if (!body.file_path) throw new Error('Telegram getFile response did not contain file_path');
    return {
      filePath: body.file_path,
      ...(body.file_size === undefined ? {} : { fileSize: body.file_size }),
    };
  }

  public async downloadFile(filePath: string): Promise<Uint8Array> {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN is required to download files');
    if (filePath.split('/').includes('..')) throw new Error('Telegram returned an unsafe file path');
    if (filePath.startsWith('/var/lib/telegram-bot-api/')) {
      return new Uint8Array(await readFile(filePath));
    }

    const response = await this.request(`${this.baseUrl}/file/bot${this.token}/${filePath}`, { signal: AbortSignal.timeout(10 * 60_000), dispatcher: this.directAgent } as RequestInit & { dispatcher: Agent });
    if (!response.ok) throw new Error(`Telegram file download returned ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  public async deleteWebhook(): Promise<void> {
    await this.call<true>('deleteWebhook', { drop_pending_updates: false });
  }

  public async getUpdates(offset: number | undefined): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>('getUpdates', {
      timeout: this.baseUrl.includes('://telegram-api:') ? 0 : 25,
      allowed_updates: ['message', 'channel_post', 'callback_query'],
      ...(offset === undefined ? {} : { offset }),
    });
  }

  private async call<T>(method: string, payload: unknown): Promise<T> {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN is required to call Telegram');
    const response = await this.request(`${this.baseUrl}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    signal: AbortSignal.timeout(method === 'getUpdates' ? 35_000 : 60_000), dispatcher: this.directAgent,
    } as RequestInit & { dispatcher: Agent });
    const body = await readTelegramResponse(response) as TelegramApiResponse<T>;
    if (!response.ok || !body.ok || body.result === undefined) {
      throw new Error(`Telegram API returned ${body.error_code ?? response.status}: ${body.description ?? 'unknown error'}`);
    }
    return body.result;
  }

  private async sendMultipart(method: string, field: 'audio' | 'document' | 'photo', input: SendFileInput, parseHtml = false): Promise<void> {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN is required to send files');
    const form = new FormData();
    form.set('chat_id', input.chatId);
    if (input.caption) form.set('caption', input.caption);
    if (parseHtml) form.set('parse_mode', 'HTML');
    form.set(field, new Blob([input.bytes as unknown as BlobPart]), input.fileName);
    const response = await this.request(`${this.baseUrl}/bot${this.token}/${method}`, { method: 'POST', body: form, signal: AbortSignal.timeout(10 * 60_000), dispatcher: this.directAgent } as RequestInit & { dispatcher: Agent });
    const body = await readTelegramResponse(response);
    if (!response.ok || !body.ok) throw new Error(`Telegram API returned ${body.error_code ?? response.status}: ${body.description ?? 'unknown error'}`);
  }
}

export interface TelegramFileClient {
  getFile(fileId: string): Promise<{ filePath: string; fileSize?: number }>;
  downloadFile(filePath: string): Promise<Uint8Array>;
}

export interface TelegramPollingClient {
  deleteWebhook(): Promise<void>;
  getUpdates(offset: number | undefined): Promise<TelegramUpdate[]>;
}

async function readTelegramResponse(response: Response): Promise<TelegramApiResponse<unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as TelegramApiResponse<unknown>;
  } catch {
    return { ok: false, description: text.slice(0, 500) };
  }
}
