import { z } from 'zod';

const optionalString = (schema: z.ZodString) => z.preprocess(
  (value) => value === '' ? undefined : value,
  schema.optional(),
);

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_HOST: z.string().default('0.0.0.0'),
  APP_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  APP_TIMEZONE: z.string().default('Europe/Moscow'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TELEGRAM_API_BASE_URL: z.url().default('https://api.telegram.org'),
  TELEGRAM_BOT_TOKEN: optionalString(z.string().min(1)),
  TELEGRAM_WEBHOOK_SECRET: optionalString(z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/)),
  TELEGRAM_ADMIN_USER_IDS: z.string().default(''),
  TELEGRAM_UPDATE_MODE: z.enum(['webhook', 'polling']).default('webhook'),
  TELEGRAM_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(30_000).default(1_000),
  DATABASE_URL: optionalString(z.string().min(1)),
  REMINDER_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  SERMON_DOWNLOAD_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  SERMON_MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),
  SERMON_STORAGE_DIR: z.string().min(1).default('data/sermons'),
  TRANSCRIPTION_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  OPENAI_API_KEY: optionalString(z.string().min(1)),
  OPENAI_API_BASE_URL: z.url().default('https://api.openai.com/v1'),
  OPENAI_TRANSCRIPTION_MODEL: z.string().min(1).default('gpt-4o-mini-transcribe'),
  OPENAI_TRANSCRIPTION_LANGUAGE: z.string().regex(/^[a-z]{2}$/).default('ru'),
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
      updateMode: parsed.TELEGRAM_UPDATE_MODE,
      pollIntervalMs: parsed.TELEGRAM_POLL_INTERVAL_MS,
    },
    databaseUrl: parsed.DATABASE_URL,
    reminderPollIntervalMs: parsed.REMINDER_POLL_INTERVAL_MS,
    sermon: {
      downloadIntervalMs: parsed.SERMON_DOWNLOAD_INTERVAL_MS,
      maxFileSizeBytes: parsed.SERMON_MAX_FILE_SIZE_BYTES,
      storageDirectory: parsed.SERMON_STORAGE_DIR,
    },
    openai: {
      apiKey: parsed.OPENAI_API_KEY,
      apiBaseUrl: parsed.OPENAI_API_BASE_URL.replace(/\/$/, ''),
      transcriptionModel: parsed.OPENAI_TRANSCRIPTION_MODEL,
      transcriptionLanguage: parsed.OPENAI_TRANSCRIPTION_LANGUAGE,
      transcriptionPollIntervalMs: parsed.TRANSCRIPTION_POLL_INTERVAL_MS,
    },
  };
}
