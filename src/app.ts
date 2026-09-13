import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';
import { CommandRouter } from './bot/command-router.js';
import type { MessageSender } from './messaging/message-sender.js';
import { normalizeMessage } from './telegram/normalize-update.js';
import { TelegramApiClient } from './telegram/telegram-api-client.js';
import { telegramUpdateSchema } from './telegram/types.js';
import type { EventRepository } from './events/event.js';
import { EventService } from './events/event-service.js';
import { InMemoryEventRepository } from './events/in-memory-event-repository.js';
import { PrismaEventRepository } from './events/prisma-event-repository.js';
import { PrismaReminderRepository } from './reminders/prisma-reminder-repository.js';
import { ReminderWorker } from './reminders/reminder-worker.js';

export interface BuildAppOptions {
  config: AppConfig;
  sender?: MessageSender;
  eventRepository?: EventRepository;
  logger?: FastifyBaseLogger | false;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config } = options;
  const app = Fastify({
    logger: options.logger ?? { level: config.app.logLevel },
  });
  const sender = options.sender ?? new TelegramApiClient(config.telegram.botToken, config.telegram.apiBaseUrl);
  const prisma = !options.eventRepository && config.databaseUrl ? new PrismaClient() : null;
  const eventRepository = options.eventRepository
    ?? (prisma ? new PrismaEventRepository(prisma) : new InMemoryEventRepository());
  const eventService = new EventService(eventRepository);
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

  if (prisma) {
    app.addHook('onReady', async () => {
      if (reminderWorker) {
        reminderWorker.start();
      } else {
        app.log.warn('Reminder worker is disabled because TELEGRAM_BOT_TOKEN is not configured');
      }
    });
    app.addHook('onClose', async () => {
      reminderWorker?.stop();
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
    if (message) {
      await router.handle(message);
    }

    return reply.code(200).send({ ok: true });
  });

  return app;
}
