import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { configureOutboundProxy } from './network/outbound-proxy.js';

const config = loadConfig();
configureOutboundProxy(config.outboundProxyUrl);
const app = buildApp({ config });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Shutting down');
    void app.close().finally(() => { process.exitCode = 0; });
  });
}

try {
  await app.listen({ host: config.app.host, port: config.app.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
