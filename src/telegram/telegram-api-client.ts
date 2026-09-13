import type { MessageSender, SendMessageInput } from '../messaging/message-sender.js';

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApiClient implements MessageSender {
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
      }),
    });
    const body = await readTelegramResponse(response);
    if (!response.ok || !body.ok) {
      throw new Error(`Telegram API returned ${body.error_code ?? response.status}: ${body.description ?? 'unknown error'}`);
    }
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

    const response = await this.request(`${this.baseUrl}/file/bot${this.token}/${filePath}`);
    if (!response.ok) throw new Error(`Telegram file download returned ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  private async call<T>(method: string, payload: unknown): Promise<T> {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN is required to call Telegram');
    const response = await this.request(`${this.baseUrl}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await readTelegramResponse(response) as TelegramApiResponse<T>;
    if (!response.ok || !body.ok || body.result === undefined) {
      throw new Error(`Telegram API returned ${body.error_code ?? response.status}: ${body.description ?? 'unknown error'}`);
    }
    return body.result;
  }
}

export interface TelegramFileClient {
  getFile(fileId: string): Promise<{ filePath: string; fileSize?: number }>;
  downloadFile(filePath: string): Promise<Uint8Array>;
}

async function readTelegramResponse(response: Response): Promise<TelegramApiResponse<unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as TelegramApiResponse<unknown>;
  } catch {
    return { ok: false, description: text.slice(0, 500) };
  }
}
