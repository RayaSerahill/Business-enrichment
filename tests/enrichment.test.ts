import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PrhError, type CompanyRegistry } from '../src/clients/prh.client.js';
import { EnrichmentService } from '../src/services/enrichment.service.js';
import type { InputRow } from '../src/types/enrichment.js';
import { FakeRegistry } from './fixtures/fake-registry.js';
import { prhCompany } from './fixtures/prh-factory.js';

const veho = prhCompany({ businessId: '0115761-6', name: 'Veho Oy Ab' });
const hedin = prhCompany({
  businessId: '0872076-6',
  name: 'Hedin Automotive Retail Oy',
  formerNames: ['Delta Auto Oy'],
  auxiliaryNames: ['Delta Parts'],
});
const wetteriAuto = prhCompany({
  businessId: '1814605-9',
  name: 'Wetteri Auto Oy',
  formerNames: ['Wetteri Oy'],
});
const wetteriYhtiot = prhCompany({
  businessId: '0877345-4',
  name: 'Wetteri Yhtiöt Oy',
  formerNames: ['Wetteri Oy'],
});
const virtanenTurku = prhCompany({
  businessId: '1000002-0',
  name: 'Autoliike Virtanen Oy',
  city: 'TURKU',
});
const virtanenOulu = prhCompany({
  businessId: '1234567-1',
  name: 'Autoliike Virtanen Oy',
  city: 'OULU',
});
const laineActive = prhCompany({ businessId: '1578666-7', name: 'Autokeskus Laine Oy' });
const laineDissolved = prhCompany({
  businessId: '0483753-7',
  name: 'Autokeskus Laine Oy',
  endDate: '2004-12-30',
});

const companies = [
  veho,
  hedin,
  wetteriAuto,
  wetteriYhtiot,
  virtanenTurku,
  virtanenOulu,
  laineActive,
  laineDissolved,
];

function row(rowNumber: number, businessId: string | null, name: string | null): InputRow {
  return { row: rowNumber, businessId, name };
}

async function enrichOne(input: InputRow, registry: CompanyRegistry = new FakeRegistry(companies)) {
  const { results } = await new EnrichmentService(registry).enrich([input]);
  const [result] = results;
  if (!result) throw new Error('No result returned');
  return result;
}

describe('EnrichmentService', () => {
  describe('Business ID lookups', () => {
    it('matches a valid Business ID and maps a customer record', async () => {
      const result = await enrichOne(row(2, '0115761-6', 'Veho Oy Ab'));

      expect(result).toMatchObject({
        row: 2,
        status: 'matched',
        input: { businessId: '0115761-6', name: 'Veho Oy Ab' },
        company: { businessId: '0115761-6', name: 'Veho Oy Ab', isActive: true },
        customer: { externalId: 'FI-0115761-6', companyName: 'Veho Oy Ab' },
        candidates: [],
        errors: [],
        warnings: [],
      });
    });

    it('compares names ignoring case and extra whitespace', async () => {
      const result = await enrichOne(row(2, '0115761-6', '  VEHO   oy ab '));

      expect(result.warnings).toEqual([]);
    });

    it('keeps the Business ID match but warns when the name belongs to another company', async () => {
      const result = await enrichOne(row(2, '0115761-6', 'Kesko Oyj'));

      expect(result.status).toBe('matched');
      expect(result.company?.name).toBe('Veho Oy Ab');
      expect(result.warnings.map((warning) => warning.code)).toEqual(['NAME_MISMATCH']);
    });

    it('warns when the name is a former or auxiliary name of the company', async () => {
      const former = await enrichOne(row(2, '0872076-6', 'Delta Auto Oy'));
      const auxiliary = await enrichOne(row(2, '0872076-6', 'Delta Parts'));

      expect(former.status).toBe('matched');
      expect(former.warnings.map((warning) => warning.code)).toEqual(['NAME_FORMER_OR_AUXILIARY']);
      expect(auxiliary.warnings.map((warning) => warning.code)).toEqual([
        'NAME_FORMER_OR_AUXILIARY',
      ]);
    });

    it('flags a dissolved company as inactive', async () => {
      const result = await enrichOne(row(2, '0483753-7', null));

      expect(result.status).toBe('matched');
      expect(result.customer?.isInactive).toBe(true);
      expect(result.warnings.map((warning) => warning.code)).toEqual(['COMPANY_INACTIVE']);
    });

    it('returns not_found for a valid Business ID that PRH does not know', async () => {
      const result = await enrichOne(row(2, '2045431-7', 'Olematon Oy'));

      expect(result).toMatchObject({ status: 'not_found', company: null, customer: null });
      expect(result.errors.map((error) => error.code)).toEqual(['BUSINESS_ID_NOT_FOUND']);
    });

    it('returns invalid_input for a malformed Business ID without calling PRH', async () => {
      const registry = new FakeRegistry(companies);
      const result = await enrichOne(row(2, '0115761-5', 'Veho Oy Ab'), registry);

      expect(result.status).toBe('invalid_input');
      expect(result.errors).toEqual([
        {
          code: 'INVALID_BUSINESS_ID',
          message: '"0115761-5" is not a valid Business ID: check digit does not match',
        },
      ]);
      expect(registry.businessIdLookups).toEqual([]);
      expect(registry.nameSearches).toEqual([]);
    });
  });

  describe('name lookups', () => {
    it('accepts a unique current company name', async () => {
      const result = await enrichOne(row(2, null, 'wetteri auto oy'));

      expect(result.status).toBe('matched');
      expect(result.company?.businessId).toBe('1814605-9');
    });

    it('marks the row ambiguous when several companies share the name', async () => {
      const result = await enrichOne(row(2, null, 'Autoliike Virtanen Oy'));

      expect(result.status).toBe('ambiguous');
      expect(result.customer).toBeNull();
      expect(result.errors.map((error) => error.code)).toEqual(['MULTIPLE_NAME_MATCHES']);
      expect(result.candidates).toEqual([
        {
          businessId: '1000002-0',
          name: 'Autoliike Virtanen Oy',
          legalForm: 'OY',
          city: 'TURKU',
          isActive: true,
        },
        {
          businessId: '1234567-1',
          name: 'Autoliike Virtanen Oy',
          legalForm: 'OY',
          city: 'OULU',
          isActive: true,
        },
      ]);
    });

    it('marks the row ambiguous when the name only matches former names', async () => {
      const result = await enrichOne(row(2, null, 'Wetteri Oy'));

      expect(result.status).toBe('ambiguous');
      expect(result.errors).toEqual([
        {
          code: 'NO_EXACT_NAME_MATCH',
          message:
            'PRH returned 2 companies for "Wetteri Oy" but none is currently registered under exactly this name',
        },
      ]);
      expect(result.candidates.map((candidate) => candidate.businessId)).toEqual([
        '1814605-9',
        '0877345-4',
      ]);
    });

    it('uses singular wording when PRH returned one company', async () => {
      const result = await enrichOne(row(2, null, 'Delta Auto Oy'));

      expect(result.status).toBe('ambiguous');
      expect(result.errors[0]?.message).toBe(
        'PRH returned 1 company for "Delta Auto Oy" but none is currently registered under exactly this name',
      );
      expect(result.candidates.map((candidate) => candidate.businessId)).toEqual(['0872076-6']);
    });

    it('prefers the active company when a dissolved company had the same name', async () => {
      const result = await enrichOne(row(2, null, 'Autokeskus Laine Oy'));

      expect(result.status).toBe('matched');
      expect(result.company?.businessId).toBe('1578666-7');
    });

    it('returns not_found when PRH has no candidates', async () => {
      const result = await enrichOne(row(2, null, 'Olematon Autoliike Oy'));

      expect(result.status).toBe('not_found');
      expect(result.errors.map((error) => error.code)).toEqual(['NAME_NOT_FOUND']);
    });

    it('does not accept a single match when PRH results were truncated', async () => {
      const registry: CompanyRegistry = {
        findByBusinessId: async () => null,
        searchByName: async () => ({ companies: [veho], totalResults: 900, complete: false }),
      };

      const result = await enrichOne(row(2, null, 'Veho Oy Ab'), registry);

      expect(result.status).toBe('ambiguous');
      expect(result.errors.map((error) => error.code)).toEqual(['TOO_MANY_RESULTS']);
    });
  });

  describe('batches', () => {
    it('returns invalid_input for a row without Business ID and name', async () => {
      const result = await enrichOne(row(2, null, null));

      expect(result.status).toBe('invalid_input');
      expect(result.errors.map((error) => error.code)).toEqual(['MISSING_INPUT']);
    });

    it('reuses lookups for duplicates while keeping every row', async () => {
      const registry = new FakeRegistry(companies);
      const { results } = await new EnrichmentService(registry).enrich([
        row(2, '0115761-6', 'Veho Oy Ab'),
        row(3, '0115761-6', 'VEHO OY AB'),
        row(4, null, 'Wetteri Auto Oy'),
        row(5, null, 'wetteri auto oy'),
      ]);

      expect(registry.businessIdLookups).toEqual(['0115761-6']);
      expect(registry.nameSearches).toEqual(['Wetteri Auto Oy']);
      expect(results.map((result) => [result.row, result.status])).toEqual([
        [2, 'matched'],
        [3, 'matched'],
        [4, 'matched'],
        [5, 'matched'],
      ]);
      expect(results[0]?.warnings).toEqual([]);
      expect(results[1]?.warnings).toEqual([
        {
          code: 'DUPLICATE_BUSINESS_ID',
          message: 'Business ID 0115761-6 already appears on row 2',
        },
      ]);
    });

    it('reports PRH failures per row without failing the batch', async () => {
      const registry = new FakeRegistry(companies, {
        '0115761-6': new PrhError('PRH_UNAVAILABLE', 'PRH responded with HTTP 503', true),
      });
      const { results } = await new EnrichmentService(registry).enrich([
        row(2, '0115761-6', 'Veho Oy Ab'),
        row(3, '0872076-6', null),
      ]);

      expect(results[0]).toMatchObject({
        status: 'upstream_error',
        company: null,
        errors: [{ code: 'PRH_UNAVAILABLE', message: 'PRH responded with HTTP 503' }],
      });
      expect(results[1]?.status).toBe('matched');
    });

    it('preserves input order and summarizes the statuses', async () => {
      const registry = new FakeRegistry(companies, {
        '1814605-9': new PrhError('PRH_RATE_LIMITED', 'PRH rate limit exceeded', true),
      });
      const response = await new EnrichmentService(registry).enrich([
        row(2, null, 'Autoliike Virtanen Oy'),
        row(3, '0115761-6', null),
        row(4, '1234', null),
        row(5, null, 'Olematon Oy'),
        row(6, '1814605-9', null),
        row(7, null, 'Hedin Automotive Retail Oy'),
      ]);

      expect(response.results.map((result) => [result.row, result.status])).toEqual([
        [2, 'ambiguous'],
        [3, 'matched'],
        [4, 'invalid_input'],
        [5, 'not_found'],
        [6, 'upstream_error'],
        [7, 'matched'],
      ]);
      expect(response.summary).toEqual({
        total: 6,
        matched: 2,
        notFound: 1,
        ambiguous: 1,
        failed: 2,
      });
    });
  });
});

describe('HTTP API', () => {
  const buildTestApp = (maxRows?: number) =>
    buildApp({ enrichmentService: new EnrichmentService(new FakeRegistry(companies)), maxRows });

  it('enriches an uploaded CSV', async () => {
    const response = await buildTestApp().inject({
      method: 'POST',
      url: '/enrichment',
      headers: { 'content-type': 'text/csv' },
      payload: 'businessId,name\n0115761-6,Veho Oy Ab\n,Wetteri Oy\n',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.summary).toEqual({ total: 2, matched: 1, notFound: 0, ambiguous: 1, failed: 0 });
    expect(body.results.map((result: { row: number }) => result.row)).toEqual([2, 3]);
  });

  it('rejects a CSV without recognised columns', async () => {
    const response = await buildTestApp().inject({
      method: 'POST',
      url: '/enrichment',
      headers: { 'content-type': 'text/csv' },
      payload: 'foo,bar\n1,2\n',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/Business ID column/);
  });

  it('rejects an empty body', async () => {
    const response = await buildTestApp().inject({
      method: 'POST',
      url: '/enrichment',
      headers: { 'content-type': 'text/csv' },
      payload: '',
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects files with too many rows', async () => {
    const response = await buildTestApp(1).inject({
      method: 'POST',
      url: '/enrichment',
      headers: { 'content-type': 'text/csv' },
      payload: 'name\nVeho Oy Ab\nWetteri Auto Oy\n',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe('CSV has 2 rows, the maximum is 1');
  });

  it('rejects unsupported content types', async () => {
    const response = await buildTestApp().inject({
      method: 'POST',
      url: '/enrichment',
      headers: { 'content-type': 'application/xml' },
      payload: '<companies />',
    });

    expect(response.statusCode).toBe(415);
  });

  it('responds to health checks', async () => {
    const response = await buildTestApp().inject({ method: 'GET', url: '/health' });

    expect(response.json()).toEqual({ status: 'ok' });
  });
});
