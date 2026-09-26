import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';
import { CommandRouter } from './bot/command-router.js';
import type { MessageSender } from './messaging/message-sender.js';
import { normalizeCallback, normalizeMessage, normalizePhoto, normalizeSermonAudio } from './telegram/normalize-update.js';
import { TelegramApiClient } from './telegram/telegram-api-client.js';
import { telegramUpdateSchema } from './telegram/types.js';
import type { EventRepository } from './events/event.js';
import { EventService } from './events/event-service.js';
import { InMemoryEventRepository } from './events/in-memory-event-repository.js';
import { PrismaEventRepository } from './events/prisma-event-repository.js';
import { PrismaReminderRepository } from './reminders/prisma-reminder-repository.js';
import { ReminderWorker } from './reminders/reminder-worker.js';
import type { SermonRepository } from './sermons/sermon.js';
import { InMemorySermonRepository } from './sermons/in-memory-sermon-repository.js';
import { PrismaSermonRepository } from './sermons/prisma-sermon-repository.js';
import { SermonIntakeService } from './sermons/sermon-intake-service.js';
import { LocalAudioStorage } from './sermons/audio-storage.js';
import { SermonDownloadWorker } from './sermons/sermon-download-worker.js';
import { GroqTranscriptionProvider } from './ai/groq-transcription-provider.js';
import { PrismaTranscriptionRepository } from './sermons/prisma-transcription-repository.js';
import { SermonTranscriptionWorker } from './sermons/sermon-transcription-worker.js';
import { TelegramPollingWorker } from './telegram/telegram-polling-worker.js';
import { GeminiSermonContentProvider } from './ai/gemini-sermon-content-provider.js';
import { PrismaContentGenerationRepository } from './sermons/prisma-content-generation-repository.js';
import { SermonContentWorker } from './sermons/sermon-content-worker.js';
import { PrismaSermonPostRepository } from './sermons/prisma-sermon-post-repository.js';
import { SermonPostService } from './sermons/sermon-post-service.js';
import { SermonPostWorker } from './sermons/sermon-post-worker.js';
import { PrismaAssistantRepository } from './assistant/prisma-assistant-repository.js';
import { GeminiBibleAnswerProvider } from './assistant/gemini-bible-answer-provider.js';
import { BibleAssistantService } from './assistant/bible-assistant-service.js';
import { AdminService } from './admin/admin-service.js';
import { PrismaAdminRepository } from './admin/prisma-admin-repository.js';
import { SafePublicAudioClient } from './sermons/public-audio-client.js';
import { UniversalPublicAudioClient, YtDlpAudioClient } from './sermons/platform-audio-client.js';
import { FfmpegAudioSegmenter } from './sermons/audio-segmenter.js';
import { PrismaSermonStatusReader } from './sermons/sermon-status-service.js';
import { GuidedEventService } from './admin/guided-event-service.js';
import { PrismaSermonNotificationRepository } from './sermons/prisma-sermon-notification-repository.js';
import { SermonNotificationWorker } from './sermons/sermon-notification-worker.js';
import { PrismaWeeklyDigestRepository } from './digests/prisma-weekly-digest-repository.js';
import { WeeklyDigestService } from './digests/weekly-digest-service.js';
import { WeeklyDigestWorker } from './digests/weekly-digest-worker.js';
import { EventRsvpService } from './events/event-rsvp-service.js';
import { SermonSearchService } from './sermons/sermon-search-service.js';
import { PrismaAnnouncementRepository } from './announcements/prisma-announcement-repository.js';
import { AnnouncementService } from './announcements/announcement-service.js';
import { AnnouncementWorker } from './announcements/announcement-worker.js';
import { PrayerRequestService } from './prayers/prayer-request-service.js';
import { PrayerRequestWorker } from './prayers/prayer-request-worker.js';
import { AuditService } from './audit/audit-service.js';
import { PrismaAuditRepository } from './audit/prisma-audit-repository.js';
import { RetentionService } from './retention/retention-service.js';
import { GroqBibleAnswerProvider } from './assistant/groq-bible-answer-provider.js';
import { GroqSermonContentProvider } from './ai/groq-sermon-content-provider.js';
import { OpenRouterSermonContentProvider } from './ai/openrouter-sermon-content-provider.js';
import { FallbackBibleAnswerProvider, FallbackSermonContentProvider } from './ai/fallback-providers.js';
import type { BibleAnswerProvider } from './assistant/bible-answer-provider.js';
import { OpenRouterBibleAnswerProvider } from './assistant/openrouter-bible-answer-provider.js';
import type { SermonContentProvider } from './ai/sermon-content-provider.js';
import { OpenRouterDevotionalProvider } from './ai/openrouter-devotional-provider.js';
import { DailyDevotionalWorker } from './devotionals/daily-devotional-worker.js';
import { OpenRouterImageProvider } from './ai/openrouter-image-provider.js';
import { CloudflareImageProvider } from './ai/cloudflare-image-provider.js';
import { FallbackImageProvider, type ImageProvider } from './ai/image-provider.js';
import { DevotionalAdminService } from './devotionals/devotional-admin-service.js';
import { RegistrationService } from './registrations/registration-service.js';

export interface BuildAppOptions {
  config: AppConfig;
  sender?: MessageSender;
  eventRepository?: EventRepository;
  sermonRepository?: SermonRepository;
  sermonPostService?: SermonPostService;
  bibleAssistant?: BibleAssistantService;
  weeklyDigestService?: WeeklyDigestService;
  eventRsvpService?: EventRsvpService;
  sermonSearchService?: SermonSearchService;
  announcementService?: AnnouncementService;
  prayerRequestService?: PrayerRequestService;
  auditService?: AuditService;
  retentionService?: RetentionService;
  registrationService?: RegistrationService;
  logger?: FastifyBaseLogger | false;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config } = options;
  const app = Fastify({
    logger: options.logger ?? { level: config.app.logLevel },
  });
  const telegramClient = new TelegramApiClient(config.telegram.botToken, config.telegram.apiBaseUrl);
  const sender = options.sender ?? telegramClient;
  const prisma = !options.eventRepository && config.databaseUrl ? new PrismaClient() : null;
  const eventRepository = options.eventRepository
    ?? (prisma ? new PrismaEventRepository(prisma) : new InMemoryEventRepository());
  const eventService = new EventService(eventRepository);
  const sermonRepository = options.sermonRepository
    ?? (prisma ? new PrismaSermonRepository(prisma) : new InMemorySermonRepository());
  const adminService = new AdminService(prisma ? new PrismaAdminRepository(prisma) : undefined, config.telegram.adminUserIds, config.app.timezone);
  const sermonIntake = new SermonIntakeService(
    sermonRepository,
    (chatId, userId) => adminService.isAdmin(chatId, userId),
    config.app.timezone,
  );
  const guidedEvents = prisma ? new GuidedEventService(prisma, eventService, config.app.timezone) : undefined;
  const sermonPostRepository = prisma ? new PrismaSermonPostRepository(prisma) : null;
  const sermonPostService = options.sermonPostService ?? (sermonPostRepository ? new SermonPostService(sermonPostRepository) : undefined);
  const weeklyDigestRepository = prisma ? new PrismaWeeklyDigestRepository(prisma) : null;
  const weeklyDigestService = options.weeklyDigestService ?? (weeklyDigestRepository ? new WeeklyDigestService(weeklyDigestRepository) : undefined);
  const eventRsvpService = options.eventRsvpService ?? (prisma ? new EventRsvpService(prisma) : undefined);
  const sermonSearchService = options.sermonSearchService ?? (prisma ? new SermonSearchService(prisma) : undefined);
  const announcementRepository = prisma ? new PrismaAnnouncementRepository(prisma) : null;
  const announcementService = options.announcementService ?? (announcementRepository ? new AnnouncementService(announcementRepository, config.app.timezone) : undefined);
  const prayerRequestService = options.prayerRequestService ?? (prisma ? new PrayerRequestService(prisma) : undefined);
  const auditService = options.auditService ?? (prisma ? new AuditService(new PrismaAuditRepository(prisma, config.app.timezone)) : undefined);
  const retentionService = options.retentionService ?? (prisma ? new RetentionService(prisma) : undefined);
  const devotionalService = prisma ? new DevotionalAdminService(prisma) : undefined;
  const registrationService = options.registrationService ?? (prisma ? new RegistrationService(prisma, config.privacySecret, config.app.timezone, config.telegram.botUsername) : undefined);
  const bibleProviders: BibleAnswerProvider[] = [
    ...(config.ai.openRouterApiKey ? [new OpenRouterBibleAnswerProvider({ apiKey: config.ai.openRouterApiKey, baseUrl: config.ai.openRouterApiBaseUrl, model: config.ai.openRouterTextModel, ...(config.outboundProxyUrl ? { proxyUrl: config.outboundProxyUrl } : {}) })] : []),
    ...(config.ai.geminiApiKey ? [new GeminiBibleAnswerProvider({ apiKey: config.ai.geminiApiKey, model: config.ai.textModel, baseUrl: config.ai.geminiApiBaseUrl })] : []),
    ...(config.ai.groqApiKey ? [new GroqBibleAnswerProvider({ apiKey: config.ai.groqApiKey, model: config.ai.groqTextModel, baseUrl: config.ai.groqApiBaseUrl })] : []),
  ];
  const bibleProvider = bibleProviders.reduce<BibleAnswerProvider | undefined>((fallback, provider) => fallback
    ? new FallbackBibleAnswerProvider(provider, fallback, (error) => app.log.warn({ error: errorMessage(error) }, 'Bible AI provider failed; using fallback'))
    : provider, undefined);
  const bibleAssistant = options.bibleAssistant ?? (prisma && bibleProvider
    ? new BibleAssistantService(
        new PrismaAssistantRepository(prisma, config.privacySecret),
        bibleProvider,
        config.privacySecret,
        config.app.timezone,
        sermonSearchService,
      )
    : undefined);
  const router = new CommandRouter({
    sender,
    eventService,
    timezone: config.app.timezone,
    ...(sermonPostService ? { sermonPostService } : {}),
    ...(bibleAssistant ? { bibleAssistant } : {}),
    adminService,
    sermonIntake,
    ...(prisma ? { sermonStatus: new PrismaSermonStatusReader(prisma) } : {}),
    ...(guidedEvents ? { guidedEvents } : {}),
    ...(weeklyDigestService ? { weeklyDigestService } : {}),
    ...(eventRsvpService ? { eventRsvpService } : {}),
    ...(sermonSearchService ? { sermonSearchService } : {}),
    ...(announcementService ? { announcementService } : {}),
    ...(prayerRequestService ? { prayerRequestService } : {}),
    ...(auditService ? { auditService } : {}),
    ...(retentionService ? { retentionService } : {}),
    ...(devotionalService ? { devotionalService } : {}),
    ...(registrationService ? { registrationService } : {}),
    logger: app.log,
  });
  const reminderWorker = prisma && config.telegram.botToken
    ? new ReminderWorker({
        repository: new PrismaReminderRepository(prisma),
        sender,
        logger: app.log,
        intervalMs: config.reminderPollIntervalMs,
      })
    : null;
  const sermonDownloadWorker = prisma && config.telegram.botToken
    ? new SermonDownloadWorker({
        repository: sermonRepository,
        telegram: telegramClient,
        storage: new LocalAudioStorage(config.sermon.storageDirectory),
        logger: app.log,
        intervalMs: config.sermon.downloadIntervalMs,
        maxFileSizeBytes: config.sermon.maxFileSizeBytes,
        maxLinkFileSizeBytes: config.sermon.maxLinkFileSizeBytes,
        publicAudio: new UniversalPublicAudioClient(new SafePublicAudioClient(), new YtDlpAudioClient('yt-dlp', config.outboundProxyUrl)),
      })
    : null;
  const sermonTranscriptionWorker = prisma && config.ai.groqApiKey
    ? new SermonTranscriptionWorker({
        repository: new PrismaTranscriptionRepository(prisma),
        provider: new GroqTranscriptionProvider(
          config.ai.groqApiKey,
          config.ai.transcriptionModel,
          config.ai.transcriptionLanguage,
          config.ai.groqApiBaseUrl,
        ),
        logger: app.log,
        intervalMs: config.ai.transcriptionPollIntervalMs,
        segmenter: new FfmpegAudioSegmenter(),
      })
    : null;
  const telegramPollingWorker = config.telegram.updateMode === 'polling' && config.telegram.botToken
    ? new TelegramPollingWorker({
        client: telegramClient,
        logger: app.log,
        intervalMs: config.telegram.pollIntervalMs,
        handleUpdate: async (update) => {
          const response = await app.inject({
            method: 'POST',
            url: '/webhooks/telegram',
            headers: config.telegram.webhookSecret
              ? { 'x-telegram-bot-api-secret-token': config.telegram.webhookSecret }
              : {},
            payload: update,
          });
          if (response.statusCode >= 400) {
            throw new Error(`Local Telegram update handling returned ${response.statusCode}`);
          }
        },
      })
    : null;
  const contentProviders: SermonContentProvider[] = [
    ...(config.ai.openRouterApiKey ? [new OpenRouterSermonContentProvider({ apiKey: config.ai.openRouterApiKey, baseUrl: config.ai.openRouterApiBaseUrl, model: config.ai.openRouterStructuredModel, ...(config.outboundProxyUrl ? { proxyUrl: config.outboundProxyUrl } : {}) })] : []),
    ...(config.ai.geminiApiKey ? [new GeminiSermonContentProvider({ apiKey: config.ai.geminiApiKey, model: config.ai.textModel, baseUrl: config.ai.geminiApiBaseUrl })] : []),
    ...(config.ai.groqApiKey ? [new GroqSermonContentProvider({ apiKey: config.ai.groqApiKey, model: config.ai.groqTextModel, baseUrl: config.ai.groqApiBaseUrl })] : []),
  ];
  const contentProvider = contentProviders.reduce<SermonContentProvider | undefined>((fallback, provider) => fallback ? new FallbackSermonContentProvider(provider, fallback, (error) => app.log.warn({ error: errorMessage(error) }, 'Sermon AI provider failed; using fallback')) : provider, undefined);
  const sermonContentWorker = prisma && contentProvider
    ? new SermonContentWorker({
        repository: new PrismaContentGenerationRepository(prisma),
        provider: contentProvider,
        logger: app.log,
        intervalMs: config.ai.contentGenerationPollIntervalMs,
      })
    : null;
  const imageProviders: ImageProvider[] = [
    ...(config.ai.cloudflareApiToken && config.ai.cloudflareAccountId ? [new CloudflareImageProvider({ apiToken: config.ai.cloudflareApiToken, accountId: config.ai.cloudflareAccountId, baseUrl: config.ai.cloudflareApiBaseUrl, model: config.ai.cloudflareImageModel, ...(config.outboundProxyUrl ? { proxyUrl: config.outboundProxyUrl } : {}) })] : []),
    ...(config.ai.openRouterApiKey ? [new OpenRouterImageProvider({ apiKey: config.ai.openRouterApiKey, baseUrl: config.ai.openRouterApiBaseUrl, model: config.ai.openRouterImageModel, ...(config.outboundProxyUrl ? { proxyUrl: config.outboundProxyUrl } : {}) })] : []),
  ];
  const imageProvider = imageProviders.length ? new FallbackImageProvider(imageProviders, (error) => app.log.warn({ error: errorMessage(error) }, 'Image provider failed; using fallback')) : undefined;
  const sermonPostWorker = sermonPostRepository && config.telegram.botToken
    ? new SermonPostWorker({ repository: sermonPostRepository, sender, logger: app.log, intervalMs: config.ai.sermonPostPollIntervalMs, ...(imageProvider ? { imageProvider } : {}) })
    : null;
  const sermonNotificationWorker = prisma && config.telegram.botToken
    ? new SermonNotificationWorker({
        repository: new PrismaSermonNotificationRepository(prisma),
        sender,
        logger: app.log,
        intervalMs: config.ai.sermonNotificationPollIntervalMs,
      })
    : null;
  const weeklyDigestWorker = weeklyDigestRepository && config.telegram.botToken
    ? new WeeklyDigestWorker({ repository: weeklyDigestRepository, sender, logger: app.log, intervalMs: config.ai.weeklyDigestPollIntervalMs })
    : null;
  const announcementWorker = announcementRepository && config.telegram.botToken
    ? new AnnouncementWorker({ repository: announcementRepository, sender, logger: app.log, intervalMs: config.ai.announcementPollIntervalMs })
    : null;
  const prayerRequestWorker = prisma && config.telegram.botToken ? new PrayerRequestWorker({ prisma, sender, logger: app.log, intervalMs: config.ai.prayerRequestPollIntervalMs }) : null;
  const devotionalWorker = prisma && config.telegram.botToken && config.ai.openRouterApiKey
    ? new DailyDevotionalWorker({ prisma, sender, logger: app.log, intervalMs: config.ai.weeklyDigestPollIntervalMs, provider: new OpenRouterDevotionalProvider({ apiKey: config.ai.openRouterApiKey, baseUrl: config.ai.openRouterApiBaseUrl, model: config.ai.openRouterStructuredModel, ...(config.outboundProxyUrl ? { proxyUrl: config.outboundProxyUrl } : {}) }), ...(imageProvider ? { imageProvider } : {}) })
    : null;

  if (prisma) {
    app.addHook('onReady', async () => {
      if (reminderWorker) {
        reminderWorker.start();
        sermonDownloadWorker?.start();
      } else {
        app.log.warn('Reminder worker is disabled because TELEGRAM_BOT_TOKEN is not configured');
      }
      if (sermonTranscriptionWorker) {
        sermonTranscriptionWorker.start();
      } else {
        app.log.warn('Transcription worker is disabled because GROQ_API_KEY is not configured');
      }
      telegramPollingWorker?.start();
      sermonContentWorker?.start();
      sermonPostWorker?.start();
      sermonNotificationWorker?.start();
      weeklyDigestWorker?.start();
      announcementWorker?.start();
      prayerRequestWorker?.start();
      devotionalWorker?.start();
    });
    app.addHook('onClose', async () => {
      reminderWorker?.stop();
      sermonDownloadWorker?.stop();
      sermonTranscriptionWorker?.stop();
      telegramPollingWorker?.stop();
      sermonContentWorker?.stop();
      sermonPostWorker?.stop();
      sermonNotificationWorker?.stop();
      weeklyDigestWorker?.stop();
      announcementWorker?.stop();
      prayerRequestWorker?.stop();
      devotionalWorker?.stop();
      await prisma.$disconnect();
    });
  }

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    if (!prisma) return reply.code(503).send({ status: 'not_ready', database: 'not_configured' });
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'not_ready', database: 'unavailable' });
    }
  });

  app.post('/webhooks/telegram', async (request, reply) => {
    if (config.telegram.webhookSecret) {
      const secret = request.headers['x-telegram-bot-api-secret-token'];
      if (secret !== config.telegram.webhookSecret) {
        return reply.code(401).send({ error: 'invalid_webhook_secret' });
      }
    }

    const parsed = telegramUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      request.log.warn({ issues: parsed.error.issues }, 'Rejected invalid Telegram update');
      return reply.code(400).send({ error: 'invalid_update' });
    }

    const message = normalizeMessage(parsed.data);
    const callback = normalizeCallback(parsed.data);
    const sermonAudio = normalizeSermonAudio(parsed.data);
    const photo = normalizePhoto(parsed.data);
    if (sermonAudio) {
      const result = await sermonIntake.receive(sermonAudio);
      if (sermonAudio.chatType !== 'channel' && result.status === 'accepted') {
        await sender.sendMessage({
          chatId: sermonAudio.chatId,
          text: result.sermon.purpose === 'personal_transcription'
            ? `Аудио принято на транскрибацию. ID: <code>${result.sermon.id}</code>. Я пришлю текст автоматически.`
            : `Аудио проповеди принято. ID: <code>${result.sermon.id}</code>`,
        });
      } else if (sermonAudio.chatType !== 'channel' && result.status === 'forbidden') {
        await sender.sendMessage({
          chatId: sermonAudio.chatId,
          text: 'Добавлять проповеди могут только администраторы.',
        });
      }
    }
    if (callback) {
      await router.handleCallback(callback);
    } else if (photo?.userId && guidedEvents) {
      const flowReply = await guidedEvents.consumePhoto(photo.chatId, photo.userId, photo);
      if (flowReply) await sender.sendMessage({ chatId: photo.chatId, text: flowReply.text, ...(flowReply.keyboard ? { keyboard: flowReply.keyboard } : {}), ...(flowReply.forceReply ? { forceReply: true } : {}) });
    } else if (message && !sermonAudio) {
      await router.handle(message);
    }

    return reply.code(200).send({ ok: true });
  });

  return app;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
