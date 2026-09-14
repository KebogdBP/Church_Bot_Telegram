import 'dotenv/config';
import { z } from 'zod';

const settings = z.object({
  TELEGRAM_API_BASE_URL: z.url().default('https://api.telegram.org'),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/),
  TELEGRAM_WEBHOOK_URL: z.url().refine((url) => url.startsWith('https://'), 'Webhook URL must use HTTPS'),
}).parse(process.env);

const apiUrl = `${settings.TELEGRAM_API_BASE_URL}/bot${settings.TELEGRAM_BOT_TOKEN}`;

const bot = await callTelegram<{ id: number; username?: string }>('getMe');
await callTelegram('setMyCommands', {
  commands: [
    { command: 'help', description: 'Показать доступные команды' },
    { command: 'whoami', description: 'Показать ваш Telegram ID' },
    { command: 'events', description: 'Показать ближайшие события' },
    { command: 'ask', description: 'Задать библейский вопрос' },
    { command: 'sermons', description: 'Проверить черновики проповедей' },
    { command: 'sermon_status', description: 'Статус обработки проповеди' },
    { command: 'settings', description: 'Настройки группы' },
    { command: 'status', description: 'Проверить состояние бота' },
  ],
});
await callTelegram('setWebhook', {
  url: settings.TELEGRAM_WEBHOOK_URL,
  secret_token: settings.TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ['message', 'channel_post', 'callback_query'],
  drop_pending_updates: false,
});
const webhook = await callTelegram<{ url: string; pending_update_count: number }>('getWebhookInfo');

console.log(`Telegram bot connected: @${bot.username ?? bot.id}`);
console.log(`Webhook: ${webhook.url}`);
console.log(`Pending updates: ${webhook.pending_update_count}`);

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
