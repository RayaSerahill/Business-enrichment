export type CustomerAddress = {
  attention: string | null;
  addr1: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
};

export type Customer = {
  externalId: string;
  entityType: 'COMPANY';
  companyName: string | null;
  businessId: string;
  vatRegNumber: string | null;
  url: string | null;
  isInactive: boolean;
  creditHoldOverride: 'ON' | 'AUTO';
  address: CustomerAddress | null;
  billingAddress: CustomerAddress | null;
  customFields: {
    legalForm: string | null;
    industryCode: string | null;
    industryDescription: string | null;
  };
};
