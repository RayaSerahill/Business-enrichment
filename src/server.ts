import { z } from 'zod';
import { buildApp } from './app.js';
import { PrhClient } from './clients/prh.client.js';
import { EnrichmentService } from './services/enrichment.service.js';

const env = z
  .object({
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    MAX_ROWS: z.coerce.number().int().positive().default(1000),
    PRH_BASE_URL: z.url().default('https://avoindata.prh.fi/opendata-ytj-api/v3'),
    PRH_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    PRH_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
    PRH_CONCURRENCY: z.coerce.number().int().positive().default(2),
  })
  .parse(process.env);

const prhClient = new PrhClient({
  baseUrl: env.PRH_BASE_URL,
  timeoutMs: env.PRH_TIMEOUT_MS,
  maxRetries: env.PRH_MAX_RETRIES,
  maxConcurrency: env.PRH_CONCURRENCY,
});

const app = buildApp({
  enrichmentService: new EnrichmentService(prhClient),
  maxRows: env.MAX_ROWS,
  logger: { level: env.LOG_LEVEL },
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void app.close());
}

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
