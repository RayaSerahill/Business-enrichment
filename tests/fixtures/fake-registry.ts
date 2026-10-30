import type {
  CompanyRegistry,
  NameSearchResult,
  PrhCompany,
  PrhError,
} from '../../src/clients/prh.client.js';

export class FakeRegistry implements CompanyRegistry {
  readonly businessIdLookups: string[] = [];
  readonly nameSearches: string[] = [];

  constructor(
    private readonly companies: PrhCompany[],
    private readonly failures: Record<string, PrhError> = {},
  ) {}

  async findByBusinessId(businessId: string): Promise<PrhCompany | null> {
    this.businessIdLookups.push(businessId);
    const failure = this.failures[businessId];
    if (failure) throw failure;
    return this.companies.find((company) => company.businessId.value === businessId) ?? null;
  }

  async searchByName(name: string): Promise<NameSearchResult> {
    this.nameSearches.push(name);
    const failure = this.failures[name];
    if (failure) throw failure;
    const needle = name.toLowerCase();
    const companies = this.companies.filter((company) =>
      company.names.some((registered) => registered.name.toLowerCase().includes(needle)),
    );
    return { companies, totalResults: companies.length, complete: true };
  }
}
