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
  APP_PRIVACY_SECRET: optionalString(z.string().min(16)),
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
  SERMON_MAX_LINK_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(500 * 1024 * 1024),
  SERMON_STORAGE_DIR: z.string().min(1).default('data/sermons'),
  TRANSCRIPTION_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  GEMINI_API_KEY: optionalString(z.string().min(1)),
  GEMINI_API_BASE_URL: z.url().default('https://generativelanguage.googleapis.com/v1beta'),
  GEMINI_TEXT_MODEL: z.string().min(1).default('gemini-3.6-flash'),
  GROQ_API_KEY: optionalString(z.string().min(1)),
  GROQ_API_BASE_URL: z.url().default('https://api.groq.com/openai/v1'),
  GROQ_TRANSCRIPTION_MODEL: z.string().min(1).default('whisper-large-v3-turbo'),
  GROQ_TEXT_MODEL: z.string().min(1).default('openai/gpt-oss-20b'),
  OPENROUTER_API_KEY: optionalString(z.string().min(1)),
  OPENROUTER_API_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_TEXT_MODEL: z.string().min(1).default('deepseek/deepseek-v3.2'),
  OPENROUTER_STRUCTURED_MODEL: z.string().min(1).default('qwen/qwen3-30b-a3b'),
  OPENROUTER_IMAGE_MODEL: z.string().min(1).default('bytedance-seed/seedream-4.5'),
  TRANSCRIPTION_LANGUAGE: z.string().regex(/^[a-z]{2}$/).default('ru'),
  CONTENT_GENERATION_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  SERMON_POST_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  SERMON_NOTIFICATION_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(15_000),
  WEEKLY_DIGEST_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
  ANNOUNCEMENT_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(15_000),
  PRAYER_REQUEST_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(15_000),
  OUTBOUND_PROXY_URL: optionalString(z.string().url()).refine((url) => !url || url.startsWith('http://') || url.startsWith('https://'), 'HTTP(S) proxy URL required'),
}).superRefine((env, context) => {
  if (env.APP_ENV !== 'production') return;
  const required = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'APP_PRIVACY_SECRET', 'GEMINI_API_KEY', 'GROQ_API_KEY'] as const;
  for (const key of required) {
    if (!env[key]) context.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
  }
  if (env.TELEGRAM_UPDATE_MODE === 'webhook' && !env.TELEGRAM_WEBHOOK_SECRET) {
    context.addIssue({ code: 'custom', path: ['TELEGRAM_WEBHOOK_SECRET'], message: 'TELEGRAM_WEBHOOK_SECRET is required for production webhook mode' });
  }
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
      maxLinkFileSizeBytes: parsed.SERMON_MAX_LINK_FILE_SIZE_BYTES,
      storageDirectory: parsed.SERMON_STORAGE_DIR,
    },
    ai: {
      geminiApiKey: parsed.GEMINI_API_KEY,
      geminiApiBaseUrl: parsed.GEMINI_API_BASE_URL.replace(/\/$/, ''),
      textModel: parsed.GEMINI_TEXT_MODEL,
      groqApiKey: parsed.GROQ_API_KEY,
      groqApiBaseUrl: parsed.GROQ_API_BASE_URL.replace(/\/$/, ''),
      transcriptionModel: parsed.GROQ_TRANSCRIPTION_MODEL,
      groqTextModel: parsed.GROQ_TEXT_MODEL,
      openRouterApiKey: parsed.OPENROUTER_API_KEY,
      openRouterApiBaseUrl: parsed.OPENROUTER_API_BASE_URL.replace(/\/$/, ''),
      openRouterTextModel: parsed.OPENROUTER_TEXT_MODEL,
      openRouterStructuredModel: parsed.OPENROUTER_STRUCTURED_MODEL,
      openRouterImageModel: parsed.OPENROUTER_IMAGE_MODEL,
      transcriptionLanguage: parsed.TRANSCRIPTION_LANGUAGE,
      transcriptionPollIntervalMs: parsed.TRANSCRIPTION_POLL_INTERVAL_MS,
      contentGenerationPollIntervalMs: parsed.CONTENT_GENERATION_POLL_INTERVAL_MS,
      sermonPostPollIntervalMs: parsed.SERMON_POST_POLL_INTERVAL_MS,
      sermonNotificationPollIntervalMs: parsed.SERMON_NOTIFICATION_POLL_INTERVAL_MS,
      weeklyDigestPollIntervalMs: parsed.WEEKLY_DIGEST_POLL_INTERVAL_MS,
      announcementPollIntervalMs: parsed.ANNOUNCEMENT_POLL_INTERVAL_MS,
      prayerRequestPollIntervalMs: parsed.PRAYER_REQUEST_POLL_INTERVAL_MS,
    },
    privacySecret: parsed.APP_PRIVACY_SECRET ?? parsed.TELEGRAM_WEBHOOK_SECRET ?? parsed.TELEGRAM_BOT_TOKEN ?? 'development-only-privacy-secret',
    outboundProxyUrl: parsed.OUTBOUND_PROXY_URL,
  };
}
