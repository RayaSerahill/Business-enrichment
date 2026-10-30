import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { CsvFormatError, parseCompaniesCsv } from '../parsers/csv.parser.js';
import type { EnrichmentService } from '../services/enrichment.service.js';
import type { InputRow } from '../types/enrichment.js';

export type EnrichmentRoutesOptions = {
  service: EnrichmentService;
  maxRows: number;
};

export const enrichmentRoutes: FastifyPluginAsync<EnrichmentRoutesOptions> = async (
  app,
  { service, maxRows },
) => {
  app.addContentTypeParser(
    ['text/csv', 'application/csv'],
    { parseAs: 'string' },
    (_request, body, done) => done(null, body),
  );

  app.post('/enrichment', async (request, reply) => {
    if (typeof request.body !== 'string' || request.body.trim() === '') {
      return badRequest(reply, 'Send the CSV file as the request body with Content-Type: text/csv');
    }

    let rows: InputRow[];
    try {
      rows = parseCompaniesCsv(request.body);
    } catch (error) {
      if (error instanceof CsvFormatError) return badRequest(reply, error.message);
      throw error;
    }

    if (rows.length > maxRows) {
      return badRequest(reply, `CSV has ${rows.length} rows, the maximum is ${maxRows}`);
    }

    return service.enrich(rows);
  });
};

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message });
}
