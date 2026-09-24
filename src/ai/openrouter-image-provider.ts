import { Agent, ProxyAgent } from 'undici';

export interface GeneratedImage { bytes: Uint8Array; mimeType: string }

export class OpenRouterImageProvider {
  private readonly dispatcher: Agent | ProxyAgent;
  private readonly request: typeof fetch;
  public constructor(private readonly options: { apiKey?: string; baseUrl: string; proxyUrl?: string; model: string; request?: typeof fetch }) {
    this.dispatcher = options.proxyUrl ? new ProxyAgent(options.proxyUrl) : new Agent();
    this.request = options.request ?? fetch;
  }
  public async generate(prompt: string): Promise<GeneratedImage> {
    if (!this.options.apiKey) throw new Error('OPENROUTER_API_KEY is required');
    const response = await this.request(`${this.options.baseUrl}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://church-bot.local', 'X-Title': 'Church Bot' },
      body: JSON.stringify({ model: this.options.model, prompt, n: 1, resolution: '1K', output_format: 'jpeg' }),
      signal: AbortSignal.timeout(10 * 60_000), dispatcher: this.dispatcher,
    } as RequestInit & { dispatcher: Agent | ProxyAgent });
    const body = await response.json() as { data?: Array<{ b64_json?: string; media_type?: string }>; error?: { message?: string } };
    const image = body.data?.[0];
    if (!response.ok || !image?.b64_json) throw new Error(`OpenRouter image returned ${response.status}: ${body.error?.message ?? 'empty image'}`);
    return { bytes: Uint8Array.from(Buffer.from(image.b64_json, 'base64')), mimeType: image.media_type ?? 'image/jpeg' };
  }
}
