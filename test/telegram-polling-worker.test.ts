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

    worker.start();
    await vi.waitFor(() => expect(handleUpdate).toHaveBeenCalledTimes(2));
    await worker.tick();
    worker.stop();

    expect(client.deleteWebhook).toHaveBeenCalledOnce();
    expect(handleUpdate).toHaveBeenCalledTimes(2);
    expect(client.getUpdates).toHaveBeenLastCalledWith(12);
  });

  it('does not block application startup while webhook cleanup is pending', () => {
    const client = { deleteWebhook: vi.fn().mockReturnValue(new Promise(() => undefined)), getUpdates: vi.fn() } satisfies TelegramPollingClient;
    const worker = new TelegramPollingWorker({ client, handleUpdate: vi.fn(), logger: { info: vi.fn(), error: vi.fn() }, intervalMs: 60_000 });
    expect(worker.start()).toBeUndefined();
    expect(client.deleteWebhook).toHaveBeenCalledOnce();
    worker.stop();
  });
});
