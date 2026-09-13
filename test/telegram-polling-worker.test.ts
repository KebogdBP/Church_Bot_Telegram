import { describe, expect, it, vi } from 'vitest';
import type { TelegramPollingClient } from '../src/telegram/telegram-api-client.js';
import { TelegramPollingWorker } from '../src/telegram/telegram-polling-worker.js';

describe('TelegramPollingWorker', () => {
  it('removes a webhook and advances the update offset', async () => {
    const client = {
      deleteWebhook: vi.fn().mockResolvedValue(undefined),
      getUpdates: vi.fn()
        .mockResolvedValueOnce([{ update_id: 10 }, { update_id: 11 }])
        .mockResolvedValueOnce([]),
    } satisfies TelegramPollingClient;
    const handleUpdate = vi.fn().mockResolvedValue(undefined);
    const worker = new TelegramPollingWorker({
      client,
      handleUpdate,
      logger: { info: vi.fn(), error: vi.fn() },
      intervalMs: 60_000,
    });

    await worker.start();
    await vi.waitFor(() => expect(handleUpdate).toHaveBeenCalledTimes(2));
    await worker.tick();
    worker.stop();

    expect(client.deleteWebhook).toHaveBeenCalledOnce();
    expect(handleUpdate).toHaveBeenCalledTimes(2);
    expect(client.getUpdates).toHaveBeenLastCalledWith(12);
  });
});
