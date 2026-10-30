import { describe, expect, it } from 'vitest';
import { PrhClient, PrhError, type FetchFn } from '../src/clients/prh.client.js';
import { prhCompany } from './fixtures/prh-factory.js';
import nokiaJson from './fixtures/prh-nokia.json' with { type: 'json' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function fakeFetch(...responses: (Response | Error)[]) {
  const urls: string[] = [];
  const fetch: FetchFn = async (url) => {
    urls.push(url);
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch, urls };
}

const client = (fetch: FetchFn, maxPages = 5) =>
  new PrhClient({
    fetch,
    baseUrl: 'https://prh.test/v3',
    retryDelayMs: 0,
    maxRetries: 2,
    maxPages,
  });

async function expectPrhError(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(PrhError);
  expect((error as PrhError).code).toBe(code);
}

describe('PrhClient', () => {
  it('finds a company by Business ID', async () => {
    const { fetch, urls } = fakeFetch(json(nokiaJson));

    const company = await client(fetch).findByBusinessId('0112038-9');

    expect(company?.businessId.value).toBe('0112038-9');
    expect(urls).toEqual(['https://prh.test/v3/companies?businessId=0112038-9']);
  });

  it('returns null when PRH has no such company', async () => {
    const { fetch } = fakeFetch(json({ totalResults: 0, companies: [] }));

    expect(await client(fetch).findByBusinessId('1234567-1')).toBeNull();
  });

  it('retries temporary failures', async () => {
    const { fetch, urls } = fakeFetch(
      json({ message: 'unavailable' }, 503),
      new TypeError('fetch failed'),
      json(nokiaJson),
    );

    const company = await client(fetch).findByBusinessId('0112038-9');

    expect(company?.businessId.value).toBe('0112038-9');
    expect(urls).toHaveLength(3);
  });

  it('gives up after the configured retries', async () => {
    const { fetch, urls } = fakeFetch(
      json('slow down', 429),
      json('slow down', 429),
      json('slow down', 429),
    );

    await expectPrhError(client(fetch).findByBusinessId('0112038-9'), 'PRH_RATE_LIMITED');
    expect(urls).toHaveLength(3);
  });

  it('does not retry rejected requests', async () => {
    const { fetch, urls } = fakeFetch(json({ message: 'bad request' }, 400));

    await expectPrhError(client(fetch).findByBusinessId('0112038-9'), 'PRH_REQUEST_REJECTED');
    expect(urls).toHaveLength(1);
  });

  it('rejects responses that do not match the expected schema', async () => {
    const { fetch } = fakeFetch(json({ companies: 'nope' }));

    await expectPrhError(client(fetch).findByBusinessId('0112038-9'), 'PRH_INVALID_RESPONSE');
  });

  it('collects every page of a name search', async () => {
    const page1 = [prhCompany({ businessId: '1000002-0', name: 'Valio Oy' })];
    const page2 = [prhCompany({ businessId: '1234567-1', name: 'Valiokuljetus Oy' })];
    const { fetch, urls } = fakeFetch(
      json({ totalResults: 2, companies: page1 }),
      json({ totalResults: 2, companies: page2 }),
    );

    const result = await client(fetch).searchByName('Valio');

    expect(result.complete).toBe(true);
    expect(result.companies.map((company) => company.businessId.value)).toEqual([
      '1000002-0',
      '1234567-1',
    ]);
    expect(urls).toEqual([
      'https://prh.test/v3/companies?name=Valio&page=1',
      'https://prh.test/v3/companies?name=Valio&page=2',
    ]);
  });

  it('collapses extra whitespace in name queries', async () => {
    const { fetch, urls } = fakeFetch(json({ totalResults: 0, companies: [] }));

    await client(fetch).searchByName('  stora   enso  OYJ ');

    expect(urls).toEqual(['https://prh.test/v3/companies?name=stora+enso+OYJ&page=1']);
  });

  it('marks a name search incomplete when the page limit is reached', async () => {
    const page = [prhCompany({ businessId: '1000002-0', name: 'Valio Oy' })];
    const { fetch, urls } = fakeFetch(json({ totalResults: 500, companies: page }));

    const result = await client(fetch, 1).searchByName('Valio');

    expect(result).toMatchObject({ totalResults: 500, complete: false });
    expect(urls).toHaveLength(1);
  });

  it('limits concurrent requests to PRH', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetch: FetchFn = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return json({ totalResults: 0, companies: [] });
    };
    const prh = new PrhClient({ fetch, maxConcurrency: 2 });

    await Promise.all(
      ['0112038-9', '0109862-8', '1463611-4', '1041090-0', '1852302-9'].map((businessId) =>
        prh.findByBusinessId(businessId),
      ),
    );

    expect(peak).toBe(2);
  });
});
