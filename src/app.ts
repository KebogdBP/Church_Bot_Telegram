import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';
import { CommandRouter } from './bot/command-router.js';
import { MaxApiClient, type MaxMessageSender } from './max/max-api-client.js';
import { normalizeMessage } from './max/normalize-update.js';
import { maxUpdateSchema } from './max/types.js';
import type { EventRepository } from './events/event.js';
import { EventService } from './events/event-service.js';
import { InMemoryEventRepository } from './events/in-memory-event-repository.js';
import { PrismaEventRepository } from './events/prisma-event-repository.js';

export interface BuildAppOptions {
  config: AppConfig;
  sender?: MaxMessageSender;
  eventRepository?: EventRepository;
  logger?: FastifyBaseLogger | false;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config } = options;
  const app = Fastify({
    logger: options.logger ?? { level: config.app.logLevel },
  });
  const sender = options.sender ?? new MaxApiClient(config.max.botToken, config.max.apiBaseUrl);
  const prisma = !options.eventRepository && config.databaseUrl ? new PrismaClient() : null;
  const eventRepository = options.eventRepository
    ?? (prisma ? new PrismaEventRepository(prisma) : new InMemoryEventRepository());
  const eventService = new EventService(eventRepository);
  const router = new CommandRouter({
    sender,
    adminUserIds: config.max.adminUserIds,
    eventService,
    timezone: config.app.timezone,
  });

  if (prisma) {
    app.addHook('onClose', async () => prisma.$disconnect());
  }

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/webhooks/max', async (request, reply) => {
    if (config.max.webhookSecret) {
      const secret = request.headers['x-max-bot-api-secret'];
      if (secret !== config.max.webhookSecret) {
        return reply.code(401).send({ error: 'invalid_webhook_secret' });
      }
    }

    const parsed = maxUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      request.log.warn({ issues: parsed.error.issues }, 'Rejected invalid MAX update');
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
