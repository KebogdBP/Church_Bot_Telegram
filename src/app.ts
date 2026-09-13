import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';
import { CommandRouter } from './bot/command-router.js';
import type { MessageSender } from './messaging/message-sender.js';
import { normalizeMessage, normalizeSermonAudio } from './telegram/normalize-update.js';
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

export interface BuildAppOptions {
  config: AppConfig;
  sender?: MessageSender;
  eventRepository?: EventRepository;
  sermonRepository?: SermonRepository;
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
  const sermonIntake = new SermonIntakeService(
    sermonRepository,
    config.telegram.adminUserIds,
    config.app.timezone,
  );
  const router = new CommandRouter({
    sender,
    adminUserIds: config.telegram.adminUserIds,
    eventService,
    timezone: config.app.timezone,
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
      })
    : null;

  if (prisma) {
    app.addHook('onReady', async () => {
      if (reminderWorker) {
        reminderWorker.start();
        sermonDownloadWorker?.start();
      } else {
        app.log.warn('Reminder worker is disabled because TELEGRAM_BOT_TOKEN is not configured');
      }
    });
    app.addHook('onClose', async () => {
      reminderWorker?.stop();
      sermonDownloadWorker?.stop();
      await prisma.$disconnect();
    });
  }

  app.get('/health', async () => ({ status: 'ok' }));

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
    const sermonAudio = normalizeSermonAudio(parsed.data);
    if (sermonAudio) {
      const result = await sermonIntake.receive(sermonAudio);
      if (sermonAudio.chatType !== 'channel' && result.status === 'accepted') {
        await sender.sendMessage({
          chatId: sermonAudio.chatId,
          text: `Аудио проповеди принято. ID: <code>${result.sermon.id}</code>`,
        });
      } else if (sermonAudio.chatType !== 'channel' && result.status === 'forbidden') {
        await sender.sendMessage({
          chatId: sermonAudio.chatId,
          text: 'Добавлять проповеди могут только администраторы.',
        });
      }
    }
    if (message) {
      await router.handle(message);
    }

    return reply.code(200).send({ ok: true });
  });

  return app;
}
