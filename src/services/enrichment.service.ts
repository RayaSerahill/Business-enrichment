import {
  PrhError,
  type CompanyRegistry,
  type NameSearchResult,
  type PrhCompany,
} from '../clients/prh.client.js';
import { mapCompany } from '../mappers/company.mapper.js';
import { mapCustomer } from '../mappers/customer.mapper.js';
import type { Company, CompanySituation } from '../types/company.js';
import type {
  Candidate,
  EnrichmentResponse,
  EnrichmentResult,
  EnrichmentStatus,
  EnrichmentSummary,
  ErrorCode,
  InputRow,
  Issue,
  WarningCode,
} from '../types/enrichment.js';
import { validateBusinessId } from '../validators/business-id.validator.js';
import { hasCurrentName, hasRegisteredName, normalizeName } from './name-matcher.js';

const MAX_CANDIDATES = 10;

const SITUATION_WARNINGS: Record<CompanySituation, WarningCode> = {
  liquidation: 'COMPANY_IN_LIQUIDATION',
  bankruptcy: 'COMPANY_IN_BANKRUPTCY',
  reorganisation: 'COMPANY_IN_REORGANISATION',
};

type LookupPlan =
  | { kind: 'invalid'; errors: Issue<ErrorCode>[] }
  | { kind: 'businessId'; businessId: string; name: string | null }
  | { kind: 'name'; name: string };

type Outcome = Pick<EnrichmentResult, 'status' | 'company' | 'candidates' | 'errors' | 'warnings'>;

type BatchLookup = {
  findByBusinessId(businessId: string): Promise<PrhCompany | null>;
  searchByName(name: string): Promise<NameSearchResult>;
};

export class EnrichmentService {
  constructor(private readonly registry: CompanyRegistry) {}

  async enrich(rows: InputRow[]): Promise<EnrichmentResponse> {
    const lookup = this.createBatchLookup();
    const firstRowByBusinessId = new Map<string, number>();

    const results = await Promise.all(
      rows.map(async (row) => {
        const plan = planLookup(row);
        const duplicateWarnings =
          plan.kind === 'businessId'
            ? trackDuplicate(firstRowByBusinessId, plan.businessId, row.row)
            : [];
        const outcome = await resolve(plan, lookup);
        return toResult(row, { ...outcome, warnings: [...duplicateWarnings, ...outcome.warnings] });
      }),
    );

    return { summary: summarize(results), results };
  }

  private createBatchLookup(): BatchLookup {
    const byBusinessId = new Map<string, Promise<PrhCompany | null>>();
    const byName = new Map<string, Promise<NameSearchResult>>();
    return {
      findByBusinessId: (businessId) =>
        cached(byBusinessId, businessId, () => this.registry.findByBusinessId(businessId)),
      searchByName: (name) =>
        cached(byName, normalizeName(name), () => this.registry.searchByName(name)),
    };
  }
}

function planLookup(row: InputRow): LookupPlan {
  if (row.businessId) {
    const validation = validateBusinessId(row.businessId);
    if (!validation.valid) {
      return {
        kind: 'invalid',
        errors: [
          issue(
            'INVALID_BUSINESS_ID',
            `"${row.businessId}" is not a valid Business ID: ${validation.reason}`,
          ),
        ],
      };
    }
    return { kind: 'businessId', businessId: validation.businessId, name: row.name };
  }
  if (row.name) return { kind: 'name', name: row.name };
  return {
    kind: 'invalid',
    errors: [issue('MISSING_INPUT', 'Row has neither a Business ID nor a company name')],
  };
}

async function resolve(plan: LookupPlan, lookup: BatchLookup): Promise<Outcome> {
  if (plan.kind === 'invalid') return failure('invalid_input', plan.errors);
  try {
    return plan.kind === 'businessId'
      ? await resolveByBusinessId(plan.businessId, plan.name, lookup)
      : await resolveByName(plan.name, lookup);
  } catch (error) {
    if (error instanceof PrhError) {
      return failure('upstream_error', [issue(error.code, error.message)]);
    }
    throw error;
  }
}

async function resolveByBusinessId(
  businessId: string,
  name: string | null,
  lookup: BatchLookup,
): Promise<Outcome> {
  const prhCompany = await lookup.findByBusinessId(businessId);
  if (!prhCompany) {
    return failure('not_found', [
      issue('BUSINESS_ID_NOT_FOUND', `PRH has no company with Business ID ${businessId}`),
    ]);
  }
  const company = mapCompany(prhCompany);
  return matched(company, nameWarnings(prhCompany, company, name));
}

async function resolveByName(name: string, lookup: BatchLookup): Promise<Outcome> {
  const search = await lookup.searchByName(name);
  if (search.companies.length === 0) {
    return failure('not_found', [issue('NAME_NOT_FOUND', `PRH has no company matching "${name}"`)]);
  }

  const matches = search.companies
    .filter((company) => hasCurrentName(company, name))
    .map(mapCompany);
  const activeMatches = matches.filter((company) => company.isActive);
  const pool = activeMatches.length > 0 ? activeMatches : matches;
  const [onlyMatch] = pool;

  if (pool.length === 1 && onlyMatch && search.complete) return matched(onlyMatch, []);

  if (!search.complete && pool.length < 2) {
    return ambiguous(
      search.companies.map(mapCompany),
      issue(
        'TOO_MANY_RESULTS',
        `PRH returned ${search.totalResults} companies for "${name}", too many to confirm a unique match`,
      ),
    );
  }
  if (pool.length > 1) {
    return ambiguous(
      pool,
      issue('MULTIPLE_NAME_MATCHES', `${pool.length} companies are registered as "${name}"`),
    );
  }
  return ambiguous(
    search.companies.map(mapCompany),
    issue(
      'NO_EXACT_NAME_MATCH',
      `PRH returned ${countCompanies(search.totalResults)} for "${name}" but none is currently registered under exactly this name`,
    ),
  );
}

function nameWarnings(
  prhCompany: PrhCompany,
  company: Company,
  name: string | null,
): Issue<WarningCode>[] {
  if (!name || hasCurrentName(prhCompany, name)) return [];
  if (hasRegisteredName(prhCompany, name)) {
    return [
      issue(
        'NAME_FORMER_OR_AUXILIARY',
        `"${name}" is a former or auxiliary name; the registered name is "${company.name}"`,
      ),
    ];
  }
  return [issue('NAME_MISMATCH', `"${name}" does not match the registered name "${company.name}"`)];
}

function statusWarnings(company: Company): Issue<WarningCode>[] {
  const situationWarnings = company.situations.map((situation) =>
    issue(SITUATION_WARNINGS[situation], `Company is in ${situation}`),
  );
  if (company.isActive) return situationWarnings;
  const details = [
    company.tradeRegisterStatus && `trade register status: ${company.tradeRegisterStatus}`,
    company.businessIdStatus === 'invalidated' && 'Business ID invalidated',
    company.endDate && `end date ${company.endDate}`,
  ]
    .filter(Boolean)
    .join(', ');
  return [
    issue('COMPANY_INACTIVE', `Company is no longer active (${details})`),
    ...situationWarnings,
  ];
}

function trackDuplicate(
  firstRows: Map<string, number>,
  businessId: string,
  row: number,
): Issue<WarningCode>[] {
  const firstRow = firstRows.get(businessId);
  if (firstRow === undefined) {
    firstRows.set(businessId, row);
    return [];
  }
  return [
    issue('DUPLICATE_BUSINESS_ID', `Business ID ${businessId} already appears on row ${firstRow}`),
  ];
}

function matched(company: Company, warnings: Issue<WarningCode>[]): Outcome {
  return {
    status: 'matched',
    company,
    candidates: [],
    errors: [],
    warnings: [...warnings, ...statusWarnings(company)],
  };
}

function ambiguous(companies: Company[], error: Issue<ErrorCode>): Outcome {
  const candidates = [...companies]
    .sort((a, b) => Number(b.isActive) - Number(a.isActive))
    .slice(0, MAX_CANDIDATES)
    .map(toCandidate);
  return { status: 'ambiguous', company: null, candidates, errors: [error], warnings: [] };
}

function failure(status: EnrichmentStatus, errors: Issue<ErrorCode>[]): Outcome {
  return { status, company: null, candidates: [], errors, warnings: [] };
}

function toCandidate(company: Company): Candidate {
  return {
    businessId: company.businessId,
    name: company.name,
    legalForm: company.legalForm.code,
    city: company.address?.city ?? company.postalAddress?.city ?? null,
    isActive: company.isActive,
  };
}

function toResult(row: InputRow, outcome: Outcome): EnrichmentResult {
  return {
    row: row.row,
    status: outcome.status,
    input: { businessId: row.businessId, name: row.name },
    company: outcome.company,
    customer: outcome.status === 'matched' && outcome.company ? mapCustomer(outcome.company) : null,
    candidates: outcome.candidates,
    errors: outcome.errors,
    warnings: outcome.warnings,
  };
}

function summarize(results: EnrichmentResult[]): EnrichmentSummary {
  const count = (...statuses: EnrichmentStatus[]) =>
    results.filter((result) => statuses.includes(result.status)).length;
  return {
    total: results.length,
    matched: count('matched'),
    notFound: count('not_found'),
    ambiguous: count('ambiguous'),
    failed: count('invalid_input', 'upstream_error'),
  };
}

function countCompanies(count: number): string {
  return count === 1 ? '1 company' : `${count} companies`;
}

function issue<Code extends string>(code: Code, message: string): Issue<Code> {
  return { code, message };
}

function cached<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = load();
  cache.set(key, pending);
  return pending;
}
