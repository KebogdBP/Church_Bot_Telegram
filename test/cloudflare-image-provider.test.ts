import { describe, expect, it, vi } from 'vitest';
import { CloudflareImageProvider } from '../src/ai/cloudflare-image-provider.js';

describe('CloudflareImageProvider', () => {
  it('decodes a Workers AI image response', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: { image: Buffer.from([1, 2, 3]).toString('base64') }, errors: [] }),
    });
    const provider = new CloudflareImageProvider({
      apiToken: 'token',
      accountId: '0123456789abcdef0123456789abcdef',
      baseUrl: 'https://api.cloudflare.test/client/v4',
      model: '@cf/black-forest-labs/flux-1-schnell',
      request,
    });

    await expect(provider.generate('sunrise without text')).resolves.toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
    });
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/ai/run/@cf/black-forest-labs/flux-1-schnell'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reports Cloudflare API errors without exposing the token', async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ success: false, errors: [{ message: 'forbidden' }] }) });
    const provider = new CloudflareImageProvider({ apiToken: 'secret-token', accountId: '0123456789abcdef0123456789abcdef', baseUrl: 'https://api.cloudflare.test/client/v4', model: '@cf/model', request });
    await expect(provider.generate('prompt')).rejects.toThrow('Cloudflare image returned 403: forbidden');
    await expect(provider.generate('prompt')).rejects.not.toThrow('secret-token');
  });
});
