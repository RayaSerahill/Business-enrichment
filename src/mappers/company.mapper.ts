import {
  PRH_NAME_TYPE,
  type PrhAddress,
  type PrhCompany,
  type PrhDescription,
} from '../clients/prh.client.js';
import type {
  BusinessIdStatus,
  CodedValue,
  Company,
  CompanyAddress,
  CompanySituation,
  TradeRegisterStatus,
} from '../types/company.js';

const LEGAL_FORM_ABBREVIATIONS: Record<string, string> = {
  '2': 'AOY',
  '3': 'ASH',
  '4': 'ASY',
  '5': 'AY',
  '6': 'AYH',
  '7': 'ETS',
  '8': 'ETY',
  '9': 'HY',
  '10': 'KOY',
  '11': 'KVJ',
  '12': 'KVY',
  '13': 'KY',
  '14': 'OK',
  '15': 'OP',
  '16': 'OY',
  '17': 'OYJ',
  '18': 'SÄÄ',
  '19': 'SL',
  '20': 'SP',
  '21': 'TYH',
  '22': 'VALTLL',
  '23': 'VOJ',
  '24': 'VOY',
  '25': 'VY',
  '80': 'SE',
  '83': 'SCE',
  '84': 'SCP',
};

const TRADE_REGISTER_STATUSES: Record<string, TradeRegisterStatus> = {
  '0': 'unregistered',
  '1': 'registered',
  '2': 'removed',
  '3': 'startup_not_registered',
  '4': 'ceased',
};

const BUSINESS_ID_STATUSES: Record<string, BusinessIdStatus> = {
  '1': 'pending',
  '2': 'valid',
  '5': 'invalidated',
};

const COMPANY_SITUATIONS: Record<string, CompanySituation> = {
  SELTILA: 'liquidation',
  KONK: 'bankruptcy',
  SANE: 'reorganisation',
};

const STREET_ADDRESS = 1;
const POSTAL_ADDRESS = 2;
const VAT_REGISTER = '6';
const FINNISH = '1';
const DESCRIPTION_LANGUAGE_PREFERENCE = ['3', '1', '2'];

export function mapCompany(company: PrhCompany): Company {
  const endDate = company.endDate ?? null;
  const tradeRegisterStatus = TRADE_REGISTER_STATUSES[company.tradeRegisterStatus] ?? null;
  const businessIdStatus = company.status ? (BUSINESS_ID_STATUSES[company.status] ?? null) : null;

  return {
    businessId: company.businessId.value,
    name: officialName(company),
    legalForm: legalForm(company),
    industry: {
      code: company.mainBusinessLine?.type ?? null,
      description: describe(company.mainBusinessLine?.descriptions ?? []),
    },
    address: mapAddress(company.addresses.find((address) => address.type === STREET_ADDRESS)),
    postalAddress: mapAddress(company.addresses.find((address) => address.type === POSTAL_ADDRESS)),
    website: blankToNull(company.website?.url),
    registrationDate: company.registrationDate ?? null,
    endDate,
    tradeRegisterStatus,
    businessIdStatus,
    situations: company.companySituations
      .filter((situation) => !situation.endDate)
      .map((situation) => COMPANY_SITUATIONS[situation.type])
      .filter((situation) => situation !== undefined),
    vatRegistered: company.registeredEntries.some(
      (entry) => entry.register === VAT_REGISTER && !entry.endDate,
    ),
    isActive:
      endDate === null &&
      businessIdStatus !== 'invalidated' &&
      tradeRegisterStatus !== 'removed' &&
      tradeRegisterStatus !== 'ceased',
  };
}

function officialName(company: PrhCompany): string | null {
  const names = company.names.filter((name) => name.type === PRH_NAME_TYPE.company);
  return (names.find((name) => name.version === 1) ?? names[0])?.name ?? null;
}

function legalForm(company: PrhCompany): CodedValue {
  const form =
    company.companyForms.find((candidate) => candidate.version === 1) ?? company.companyForms[0];
  if (!form) return { code: null, description: null };
  return {
    code: LEGAL_FORM_ABBREVIATIONS[form.type] ?? form.type,
    description: describe(form.descriptions),
  };
}

function describe(descriptions: PrhDescription[]): string | null {
  for (const language of DESCRIPTION_LANGUAGE_PREFERENCE) {
    const match = descriptions.find((description) => description.languageCode === language);
    if (match) return match.description;
  }
  return null;
}

function mapAddress(address: PrhAddress | undefined): CompanyAddress | null {
  if (!address) return null;
  const city =
    address.postOffices.find((postOffice) => postOffice.languageCode === FINNISH) ??
    address.postOffices[0];
  const mapped: CompanyAddress = {
    street: blankToNull(address.street)
      ? joinParts([
          address.street,
          address.buildingNumber,
          address.entrance,
          joinParts([address.apartmentNumber, address.apartmentIdSuffix], ''),
        ])
      : null,
    postOfficeBox: blankToNull(address.postOfficeBox),
    careOf: blankToNull(address.co),
    postCode: blankToNull(address.postCode),
    city: blankToNull(city?.city),
    country: blankToNull(address.country),
  };
  return Object.values(mapped).some((value) => value !== null) ? mapped : null;
}

function joinParts(parts: (string | null | undefined)[], separator = ' '): string | null {
  const present = parts.map(blankToNull).filter((part) => part !== null);
  return present.length > 0 ? present.join(separator) : null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
