import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { UpstreamErrorCode } from '../types/enrichment.js';

export const PRH_NAME_TYPE = {
  company: '1',
  parallel: '2',
} as const;

const descriptionSchema = z.object({
  languageCode: z.string(),
  description: z.string(),
});

const nameSchema = z.object({
  name: z.string(),
  type: z.string(),
  version: z.number(),
  endDate: z.string().nullish(),
});

const companyFormSchema = z.object({
  type: z.string(),
  version: z.number(),
  descriptions: z.array(descriptionSchema).default([]),
  endDate: z.string().nullish(),
});

const addressSchema = z.object({
  type: z.number(),
  street: z.string().nullish(),
  buildingNumber: z.string().nullish(),
  entrance: z.string().nullish(),
  apartmentNumber: z.string().nullish(),
  apartmentIdSuffix: z.string().nullish(),
  postOfficeBox: z.string().nullish(),
  co: z.string().nullish(),
  postCode: z.string().nullish(),
  postOffices: z.array(z.object({ city: z.string(), languageCode: z.string() })).default([]),
  country: z.string().nullish(),
});

const companySchema = z.object({
  businessId: z.object({ value: z.string() }),
  names: z.array(nameSchema).default([]),
  mainBusinessLine: z
    .object({ type: z.string(), descriptions: z.array(descriptionSchema).default([]) })
    .nullish(),
  website: z.object({ url: z.string() }).nullish(),
  companyForms: z.array(companyFormSchema).default([]),
  companySituations: z
    .array(z.object({ type: z.string(), endDate: z.string().nullish() }))
    .default([]),
  registeredEntries: z.array(
    z.object({ type: z.string(), register: z.string(), endDate: z.string().nullish() }),
  ),
  addresses: z.array(addressSchema).default([]),
  tradeRegisterStatus: z.string(),
  status: z.string().nullish(),
  registrationDate: z.string().nullish(),
  endDate: z.string().nullish(),
});

export const prhCompanyResultSchema = z.object({
  totalResults: z.number(),
  companies: z.array(companySchema),
});

export type PrhCompanyResult = z.infer<typeof prhCompanyResultSchema>;
export type PrhCompany = z.infer<typeof companySchema>;
export type PrhAddress = z.infer<typeof addressSchema>;
export type PrhDescription = z.infer<typeof descriptionSchema>;

export type NameSearchResult = {
  companies: PrhCompany[];
  totalResults: number;
  complete: boolean;
};

export interface CompanyRegistry {
  findByBusinessId(businessId: string): Promise<PrhCompany | null>;
  searchByName(name: string): Promise<NameSearchResult>;
}

export class PrhError extends Error {
  constructor(
    readonly code: UpstreamErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'PrhError';
  }
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export type PrhClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  maxConcurrency: number;
  maxPages: number;
  fetch: FetchFn;
};

const USER_AGENT = 'business-enrichment/1.0';

const DEFAULT_OPTIONS: PrhClientOptions = {
  baseUrl: 'https://avoindata.prh.fi/opendata-ytj-api/v3',
  timeoutMs: 10_000,
  maxRetries: 2,
  retryDelayMs: 500,
  maxConcurrency: 2,
  maxPages: 5,
  fetch: (url, init) => fetch(url, init),
};

export class PrhClient implements CompanyRegistry {
  private readonly options: PrhClientOptions;
  private readonly limit: <T>(task: () => Promise<T>) => Promise<T>;

  constructor(options: Partial<PrhClientOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.limit = createLimiter(this.options.maxConcurrency);
  }

  async findByBusinessId(businessId: string): Promise<PrhCompany | null> {
    const result = await this.getCompanies({ businessId });
    return result.companies.find((company) => company.businessId.value === businessId) ?? null;
  }

  async searchByName(name: string): Promise<NameSearchResult> {
    const query = name.trim().replace(/\s+/g, ' ');
    const companies: PrhCompany[] = [];
    let totalResults = 0;
    for (let page = 1; page <= this.options.maxPages; page++) {
      const result = await this.getCompanies({ name: query, page: String(page) });
      totalResults = result.totalResults;
      companies.push(...result.companies);
      if (result.companies.length === 0 || companies.length >= totalResults) {
        return { companies, totalResults, complete: true };
      }
    }
    return { companies, totalResults, complete: false };
  }

  private async getCompanies(params: Record<string, string>): Promise<PrhCompanyResult> {
    const url = `${this.options.baseUrl}/companies?${new URLSearchParams(params).toString()}`;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.limit(() => this.fetchOnce(url));
      } catch (error) {
        if (
          !(error instanceof PrhError) ||
          !error.retryable ||
          attempt >= this.options.maxRetries
        ) {
          throw error;
        }
        await sleep(this.options.retryDelayMs * 2 ** attempt);
      }
    }
  }

  private async fetchOnce(url: string): Promise<PrhCompanyResult> {
    let response: Response;
    try {
      response = await this.options.fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      throw new PrhError('PRH_UNAVAILABLE', `PRH request failed: ${describeError(error)}`, true);
    }

    if (response.status === 429) {
      throw new PrhError('PRH_RATE_LIMITED', 'PRH rate limit exceeded', true);
    }
    if (response.status >= 500) {
      throw new PrhError('PRH_UNAVAILABLE', `PRH responded with HTTP ${response.status}`, true);
    }
    if (!response.ok) {
      throw new PrhError(
        'PRH_REQUEST_REJECTED',
        `PRH rejected the request with HTTP ${response.status}`,
      );
    }

    const body: unknown = await response.json().catch(() => null);
    const parsed = prhCompanyResultSchema.safeParse(body);
    if (!parsed.success) {
      throw new PrhError('PRH_INVALID_RESPONSE', 'PRH response did not match the expected format');
    }
    return parsed.data;
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}

function createLimiter(maxConcurrency: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= maxConcurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      active++;
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
