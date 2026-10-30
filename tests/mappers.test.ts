import { describe, expect, it } from 'vitest';
import { mapCompany } from '../src/mappers/company.mapper.js';
import { mapCustomer } from '../src/mappers/customer.mapper.js';
import hedinJson from './fixtures/prh-hedin-renamed.json' with { type: 'json' };
import nokiaJson from './fixtures/prh-nokia.json' with { type: 'json' };
import premiumJson from './fixtures/prh-premium-car-center-bankrupt.json' with { type: 'json' };
import valiopyoraJson from './fixtures/prh-valiopyora-dissolved.json' with { type: 'json' };
import { loadPrhCompany } from './fixtures/prh-factory.js';

const nokia = loadPrhCompany(nokiaJson);
const hedin = loadPrhCompany(hedinJson);
const premium = loadPrhCompany(premiumJson);
const valiopyora = loadPrhCompany(valiopyoraJson);

describe('mapCompany', () => {
  it('normalizes an active company', () => {
    expect(mapCompany(nokia)).toEqual({
      businessId: '0112038-9',
      name: 'Nokia Oyj',
      legalForm: { code: 'OYJ', description: 'Public limited company' },
      industry: { code: '70100', description: 'Activities of head offices' },
      address: {
        street: 'Karakaari 7',
        postOfficeBox: null,
        careOf: null,
        postCode: '02610',
        city: 'ESPOO',
        country: null,
      },
      postalAddress: {
        street: null,
        postOfficeBox: '226',
        careOf: null,
        postCode: '00045',
        city: 'NOKIA GROUP',
        country: null,
      },
      website: 'www.nokia.com',
      registrationDate: '1896-12-19',
      endDate: null,
      tradeRegisterStatus: 'registered',
      businessIdStatus: 'valid',
      situations: [],
      vatRegistered: true,
      isActive: true,
    });
  });

  it('uses the current name instead of former names', () => {
    expect(mapCompany(hedin).name).toBe('Hedin Automotive Retail Oy');
  });

  it('keeps missing registry data as null for a dissolved company', () => {
    const company = mapCompany(valiopyora);

    expect(company).toMatchObject({
      name: 'Valiopyörä Oy',
      industry: { code: null, description: null },
      address: null,
      postalAddress: null,
      website: null,
      endDate: '2004-12-30',
      tradeRegisterStatus: 'ceased',
      vatRegistered: false,
      isActive: false,
    });
  });

  it('reports bankruptcy and ended VAT registration', () => {
    const company = mapCompany(premium);

    expect(company.situations).toEqual(['bankruptcy']);
    expect(company.vatRegistered).toBe(false);
    expect(company.isActive).toBe(true);
    expect(company.address).toBeNull();
    expect(company.postalAddress?.street).toBe('rajamaankaari 16');
  });
});

describe('mapCustomer', () => {
  it('maps an active company to an importable customer record', () => {
    expect(mapCustomer(mapCompany(nokia))).toEqual({
      externalId: 'FI-0112038-9',
      entityType: 'COMPANY',
      companyName: 'Nokia Oyj',
      businessId: '0112038-9',
      vatRegNumber: 'FI01120389',
      url: 'www.nokia.com',
      isInactive: false,
      creditHoldOverride: 'AUTO',
      address: {
        attention: null,
        addr1: 'Karakaari 7',
        zip: '02610',
        city: 'ESPOO',
        country: 'FI',
      },
      billingAddress: {
        attention: null,
        addr1: 'PL 226',
        zip: '00045',
        city: 'NOKIA GROUP',
        country: 'FI',
      },
      customFields: {
        legalForm: 'OYJ',
        industryCode: '70100',
        industryDescription: 'Activities of head offices',
      },
    });
  });

  it('falls back to the postal address and puts a bankrupt company on credit hold', () => {
    const customer = mapCustomer(mapCompany(premium));

    expect(customer.vatRegNumber).toBeNull();
    expect(customer.creditHoldOverride).toBe('ON');
    expect(customer.isInactive).toBe(false);
    expect(customer.address).toEqual(customer.billingAddress);
    expect(customer.address?.addr1).toBe('rajamaankaari 16');
  });

  it('marks a dissolved company inactive without inventing an address', () => {
    const customer = mapCustomer(mapCompany(valiopyora));

    expect(customer.isInactive).toBe(true);
    expect(customer.creditHoldOverride).toBe('ON');
    expect(customer.address).toBeNull();
    expect(customer.billingAddress).toBeNull();
    expect(customer.vatRegNumber).toBeNull();
  });
});
