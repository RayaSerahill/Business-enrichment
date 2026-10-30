import { prhCompanyResultSchema, type PrhCompany } from '../../src/clients/prh.client.js';

type CompanyFields = {
  businessId: string;
  name: string;
  formerNames?: string[];
  auxiliaryNames?: string[];
  endDate?: string;
  city?: string;
};

export function prhCompany(fields: CompanyFields): PrhCompany {
  const endDate = fields.endDate ?? null;
  return {
    businessId: { value: fields.businessId },
    names: [
      { name: fields.name, type: '1', version: 1, endDate },
      ...(fields.formerNames ?? []).map((name, index) => ({
        name,
        type: '1',
        version: index + 2,
        endDate: '2020-01-01',
      })),
      ...(fields.auxiliaryNames ?? []).map((name) => ({ name, type: '3', version: 1 })),
    ],
    mainBusinessLine: {
      type: '45111',
      descriptions: [{ languageCode: '3', description: 'Sale of cars and light motor vehicles' }],
    },
    companyForms: [
      {
        type: '16',
        version: 1,
        descriptions: [{ languageCode: '3', description: 'Limited company' }],
      },
    ],
    companySituations: [],
    registeredEntries: [{ type: '80', register: '6' }],
    addresses: [
      {
        type: 1,
        street: 'Autotie',
        buildingNumber: '1',
        postCode: '00100',
        postOffices: [{ city: fields.city ?? 'HELSINKI', languageCode: '1' }],
      },
    ],
    tradeRegisterStatus: endDate ? '4' : '1',
    status: '2',
    registrationDate: '2010-01-01',
    endDate,
  };
}

export function loadPrhCompany(json: unknown): PrhCompany {
  const [company] = prhCompanyResultSchema.parse(json).companies;
  if (!company) throw new Error('Fixture contains no companies');
  return company;
}
