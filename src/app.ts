import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import { CommandRouter } from './bot/command-router.js';
import { MaxApiClient, type MaxMessageSender } from './max/max-api-client.js';
import { normalizeMessage } from './max/normalize-update.js';
import { maxUpdateSchema } from './max/types.js';

export interface BuildAppOptions {
  config: AppConfig;
  sender?: MaxMessageSender;
  logger?: FastifyBaseLogger | false;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config } = options;
  const app = Fastify({
    logger: options.logger ?? { level: config.app.logLevel },
  });
  const sender = options.sender ?? new MaxApiClient(config.max.botToken, config.max.apiBaseUrl);
  const router = new CommandRouter({ sender, adminUserIds: config.max.adminUserIds });

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
