import { describe, expect, it } from 'vitest';
import { retryDelayMs } from '../src/prayers/prayer-request-worker.js';

describe('PrayerRequestWorker retry policy', () => {
  it('uses bounded exponential backoff', () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(240_000);
    expect(retryDelayMs(20)).toBe(3_600_000);
  });
});
