import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = buildApp({ config });

try {
  await app.listen({ host: config.app.host, port: config.app.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
