export interface MessageTarget {
  chatId?: string;
  userId?: string;
}

export interface SendMessageInput extends MessageTarget {
  text: string;
  notify?: boolean;
}

export interface MaxMessageSender {
  sendMessage(input: SendMessageInput): Promise<void>;
}

export class MaxApiClient implements MaxMessageSender {
  public constructor(
    private readonly token: string | undefined,
    private readonly baseUrl: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  public async sendMessage(input: SendMessageInput): Promise<void> {
    if (!this.token) {
      throw new Error('MAX_BOT_TOKEN is required to send messages');
    }

    if ((input.chatId ? 1 : 0) + (input.userId ? 1 : 0) !== 1) {
      throw new Error('Exactly one MAX message target is required');
    }

    const url = new URL('/messages', this.baseUrl);
    url.searchParams.set(input.chatId ? 'chat_id' : 'user_id', input.chatId ?? input.userId!);

    const response = await this.request(url, {
      method: 'POST',
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: input.text,
        notify: input.notify ?? true,
        format: 'markdown',
      }),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`MAX API returned ${response.status}: ${responseBody.slice(0, 500)}`);
    }
  }
}
