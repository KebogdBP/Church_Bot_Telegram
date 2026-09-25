import { describe, expect, it, vi } from 'vitest';
import { FallbackImageProvider } from '../src/ai/image-provider.js';

describe('FallbackImageProvider', () => {
  it('uses the next provider when the primary provider fails', async () => {
    const onFallback = vi.fn();
    const fallbackImage = { bytes: new Uint8Array([9]), mimeType: 'image/jpeg' };
    const provider = new FallbackImageProvider([
      { generate: vi.fn().mockRejectedValue(new Error('primary unavailable')) },
      { generate: vi.fn().mockResolvedValue(fallbackImage) },
    ], onFallback);

    await expect(provider.generate('prompt')).resolves.toEqual(fallbackImage);
    expect(onFallback).toHaveBeenCalledOnce();
  });
});
