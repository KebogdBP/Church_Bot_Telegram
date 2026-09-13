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
}

async function readTelegramResponse(response: Response): Promise<TelegramApiResponse<unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as TelegramApiResponse<unknown>;
  } catch {
    return { ok: false, description: text.slice(0, 500) };
  }
}
