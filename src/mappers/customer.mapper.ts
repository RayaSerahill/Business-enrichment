import type { Company, CompanyAddress } from '../types/company.js';
import type { Customer, CustomerAddress } from '../types/customer.js';

const DEFAULT_COUNTRY = 'FI';

export function mapCustomer(company: Company): Customer {
  const holdCredit = !company.isActive || company.situations.length > 0;

  return {
    externalId: `FI-${company.businessId}`,
    entityType: 'COMPANY',
    companyName: company.name,
    businessId: company.businessId,
    vatRegNumber: company.vatRegistered ? `FI${company.businessId.replace('-', '')}` : null,
    url: company.website,
    isInactive: !company.isActive,
    creditHoldOverride: holdCredit ? 'ON' : 'AUTO',
    address: mapAddress(company.address ?? company.postalAddress),
    billingAddress: mapAddress(company.postalAddress ?? company.address),
    customFields: {
      legalForm: company.legalForm.code,
      industryCode: company.industry.code,
      industryDescription: company.industry.description,
    },
  };
}

function mapAddress(address: CompanyAddress | null): CustomerAddress | null {
  if (!address) return null;
  return {
    attention: address.careOf,
    addr1: address.street ?? (address.postOfficeBox ? `PL ${address.postOfficeBox}` : null),
    zip: address.postCode,
    city: address.city,
    country: address.country ?? DEFAULT_COUNTRY,
  };
}
