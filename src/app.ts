import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { enrichmentRoutes } from './routes/enrichment.routes.js';
import type { EnrichmentService } from './services/enrichment.service.js';

export type AppOptions = {
  enrichmentService: EnrichmentService;
  maxRows?: number;
  bodyLimitBytes?: number;
  logger?: FastifyServerOptions['logger'];
};

export function buildApp({
  enrichmentService,
  maxRows = 1000,
  bodyLimitBytes = 5 * 1024 * 1024,
  logger = false,
}: AppOptions): FastifyInstance {
  const app = Fastify({ logger, bodyLimit: bodyLimitBytes });

  app.get('/health', async () => ({ status: 'ok' }));
  app.register(enrichmentRoutes, { service: enrichmentService, maxRows });

  return app;
}
