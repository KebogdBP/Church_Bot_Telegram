import { Agent, ProxyAgent } from 'undici';
import type { GeneratedImage, ImageProvider } from './image-provider.js';

interface CloudflareImageResponse {
  success?: boolean;
  result?: { image?: string };
  errors?: Array<{ message?: string }>;
}

export class CloudflareImageProvider implements ImageProvider {
  private readonly dispatcher: Agent | ProxyAgent;
  private readonly request: typeof fetch;

  public constructor(private readonly options: {
    apiToken?: string;
    accountId?: string;
    baseUrl: string;
    model: string;
    proxyUrl?: string;
    request?: typeof fetch;
  }) {
    this.dispatcher = options.proxyUrl ? new ProxyAgent(options.proxyUrl) : new Agent();
    this.request = options.request ?? fetch;
  }

  public async generate(prompt: string): Promise<GeneratedImage> {
    if (!this.options.apiToken || !this.options.accountId) {
      throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
    }
    const response = await this.request(
      `${this.options.baseUrl}/accounts/${encodeURIComponent(this.options.accountId)}/ai/run/${this.options.model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, steps: 4 }),
        signal: AbortSignal.timeout(5 * 60_000),
        dispatcher: this.dispatcher,
      } as RequestInit & { dispatcher: Agent | ProxyAgent },
    );
    const body = await response.json() as CloudflareImageResponse;
    const encoded = body.result?.image;
    if (!response.ok || !body.success || !encoded) {
      const message = body.errors?.map((error) => error.message).filter(Boolean).join('; ') || 'empty image';
      throw new Error(`Cloudflare image returned ${response.status}: ${message}`);
    }
    return {
      bytes: Uint8Array.from(Buffer.from(encoded, 'base64')),
      mimeType: 'image/jpeg',
    };
  }
}
