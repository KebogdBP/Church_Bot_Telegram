import { describe, expect, it, vi } from 'vitest';
import { OpenRouterImageProvider } from '../src/ai/openrouter-image-provider.js';

describe('OpenRouterImageProvider', () => {
  it('decodes the generated base64 image', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: Buffer.from([1, 2, 3]).toString('base64'), media_type: 'image/png' }] }), { status: 200 }));
    const image = await new OpenRouterImageProvider({ apiKey: 'key', baseUrl: 'https://openrouter.test/api/v1', model: 'image/model', request }).generate('scene without text');
    expect([...image.bytes]).toEqual([1, 2, 3]);
    expect(image.mimeType).toBe('image/png');
  });
});
