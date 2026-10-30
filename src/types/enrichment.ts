import type { Company } from './company.js';
import type { Customer } from './customer.js';

export type InputRow = {
  row: number;
  businessId: string | null;
  name: string | null;
};

export type EnrichmentStatus =
  'matched' | 'ambiguous' | 'not_found' | 'invalid_input' | 'upstream_error';

export type UpstreamErrorCode =
  'PRH_UNAVAILABLE' | 'PRH_RATE_LIMITED' | 'PRH_REQUEST_REJECTED' | 'PRH_INVALID_RESPONSE';

export type ErrorCode =
  | 'MISSING_INPUT'
  | 'INVALID_BUSINESS_ID'
  | 'BUSINESS_ID_NOT_FOUND'
  | 'NAME_NOT_FOUND'
  | 'MULTIPLE_NAME_MATCHES'
  | 'NO_EXACT_NAME_MATCH'
  | 'TOO_MANY_RESULTS'
  | UpstreamErrorCode;

export type WarningCode =
  | 'NAME_MISMATCH'
  | 'NAME_FORMER_OR_AUXILIARY'
  | 'DUPLICATE_BUSINESS_ID'
  | 'COMPANY_INACTIVE'
  | 'COMPANY_IN_LIQUIDATION'
  | 'COMPANY_IN_BANKRUPTCY'
  | 'COMPANY_IN_REORGANISATION';

export type Issue<Code extends string> = {
  code: Code;
  message: string;
};

export type Candidate = {
  businessId: string;
  name: string | null;
  legalForm: string | null;
  city: string | null;
  isActive: boolean;
};

export type EnrichmentResult = {
  row: number;
  status: EnrichmentStatus;
  input: {
    businessId: string | null;
    name: string | null;
  };
  company: Company | null;
  customer: Customer | null;
  candidates: Candidate[];
  errors: Issue<ErrorCode>[];
  warnings: Issue<WarningCode>[];
};

export type EnrichmentSummary = {
  total: number;
  matched: number;
  notFound: number;
  ambiguous: number;
  failed: number;
};

export type EnrichmentResponse = {
  summary: EnrichmentSummary;
  results: EnrichmentResult[];
};
