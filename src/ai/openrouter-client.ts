import { Agent, ProxyAgent } from 'undici';

export interface OpenRouterClientOptions {
  apiKey?: string;
  baseUrl: string;
  proxyUrl?: string;
  request?: typeof fetch;
}

export class OpenRouterClient {
  private readonly dispatcher: Agent | ProxyAgent;
  private readonly request: typeof fetch;

  public constructor(private readonly options: OpenRouterClientOptions) {
    this.dispatcher = options.proxyUrl ? new ProxyAgent(options.proxyUrl) : new Agent();
    this.request = options.request ?? fetch;
  }

  public async chat(model: string, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, responseFormat?: unknown): Promise<string> {
    if (!this.options.apiKey) throw new Error('OPENROUTER_API_KEY is required');
    const response = await this.request(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://church-bot.local', 'X-Title': 'Church Bot' },
      body: JSON.stringify({ model, messages, temperature: 0.2, ...(responseFormat ? { response_format: responseFormat } : {}) }),
      signal: AbortSignal.timeout(10 * 60_000),
      dispatcher: this.dispatcher,
    } as RequestInit & { dispatcher: Agent | ProxyAgent });
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!response.ok || !body.choices?.[0]?.message?.content) throw new Error(`OpenRouter returned ${response.status}: ${body.error?.message ?? 'empty response'}`);
    return body.choices[0].message.content;
  }
}
