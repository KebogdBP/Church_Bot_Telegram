import 'dotenv/config';
import { z } from 'zod';

const optionalString = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((value) => value === '' ? undefined : value, schema.optional());

const settings = z.object({
  TELEGRAM_API_BASE_URL: z.url().default('https://api.telegram.org'),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_UPDATE_MODE: z.enum(['webhook', 'polling']).default('webhook'),
  TELEGRAM_WEBHOOK_SECRET: optionalString(z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/)),
  TELEGRAM_WEBHOOK_URL: optionalString(z.url().refine((url) => url.startsWith('https://'), 'Webhook URL must use HTTPS')),
}).superRefine((value, context) => {
  if (value.TELEGRAM_UPDATE_MODE === 'webhook' && (!value.TELEGRAM_WEBHOOK_SECRET || !value.TELEGRAM_WEBHOOK_URL)) {
    context.addIssue({ code: 'custom', path: ['TELEGRAM_WEBHOOK_URL'], message: 'Webhook mode requires TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET' });
  }
}).parse(process.env);

const apiUrl = `${settings.TELEGRAM_API_BASE_URL}/bot${settings.TELEGRAM_BOT_TOKEN}`;

const bot = await callTelegram<{ id: number; username?: string }>('getMe');
await callTelegram('setMyCommands', {
  commands: [
    { command: 'help', description: 'Показать доступные команды' },
    { command: 'whoami', description: 'Показать ваш Telegram ID' },
    { command: 'events', description: 'Показать ближайшие события' },
    { command: 'ask', description: 'Задать библейский вопрос' },
    { command: 'ask_sermons', description: 'Спросить по архиву проповедей' },
    { command: 'sermon_search', description: 'Поиск по архиву проповедей' },
    { command: 'admin', description: 'Открыть панель администратора' },
    { command: 'sermons', description: 'Проверить черновики проповедей' },
    { command: 'sermon_status', description: 'Статус обработки проповеди' },
    { command: 'digest_preview', description: 'Предпросмотр недельного дайджеста' },
    { command: 'settings', description: 'Настройки группы' },
    { command: 'status', description: 'Проверить состояние бота' },
  ],
});
console.log(`Telegram bot connected: @${bot.username ?? bot.id}`);
if (settings.TELEGRAM_UPDATE_MODE === 'webhook') {
  await callTelegram('setWebhook', { url: settings.TELEGRAM_WEBHOOK_URL, secret_token: settings.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'channel_post', 'callback_query'], drop_pending_updates: false });
  const webhook = await callTelegram<{ url: string; pending_update_count: number }>('getWebhookInfo');
  console.log(`Webhook: ${webhook.url}`);
  console.log(`Pending updates: ${webhook.pending_update_count}`);
} else {
  await callTelegram('deleteWebhook', { drop_pending_updates: false });
  console.log('Update mode: polling (webhook removed)');
}

async function callTelegram<T = true>(method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiUrl}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const result = await response.json() as {
    ok: boolean;
    result?: T;
    description?: string;
    error_code?: number;
  };
  if (!response.ok || !result.ok || result.result === undefined) {
    throw new Error(`Telegram ${method} failed (${result.error_code ?? response.status}): ${result.description ?? 'unknown error'}`);
  }
  return result.result;
}
