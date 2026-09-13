import { z } from 'zod';

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_HOST: z.string().default('0.0.0.0'),
  APP_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  APP_TIMEZONE: z.string().default('Europe/Moscow'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TELEGRAM_API_BASE_URL: z.url().default('https://api.telegram.org'),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/).optional(),
  TELEGRAM_ADMIN_USER_IDS: z.string().default(''),
  DATABASE_URL: z.string().min(1).optional(),
  REMINDER_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);

  return {
    app: {
      env: parsed.APP_ENV,
      host: parsed.APP_HOST,
      port: parsed.APP_PORT,
      timezone: parsed.APP_TIMEZONE,
      logLevel: parsed.LOG_LEVEL,
    },
    telegram: {
      apiBaseUrl: parsed.TELEGRAM_API_BASE_URL,
      botToken: parsed.TELEGRAM_BOT_TOKEN,
      webhookSecret: parsed.TELEGRAM_WEBHOOK_SECRET,
      adminUserIds: new Set(
        parsed.TELEGRAM_ADMIN_USER_IDS.split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    },
    databaseUrl: parsed.DATABASE_URL,
    reminderPollIntervalMs: parsed.REMINDER_POLL_INTERVAL_MS,
  };
}
