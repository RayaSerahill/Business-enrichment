import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CsvFormatError, parseCompaniesCsv } from '../src/parsers/csv.parser.js';

const finnishExcelExport = readFileSync(
  new URL('./fixtures/finnish-excel.csv', import.meta.url),
  'utf8',
);

describe('parseCompaniesCsv', () => {
  it('reads a semicolon separated Excel export with Finnish headers', () => {
    expect(parseCompaniesCsv(finnishExcelExport)).toEqual([
      { row: 2, businessId: '0112038-9', name: 'Nokia Oyj' },
      { row: 4, businessId: null, name: 'Autoliike Virtanen, Heikki' },
      { row: 5, businessId: '0109862-8', name: 'Kesko Oyj' },
      { row: 6, businessId: null, name: null },
    ]);
  });

  it('accepts a file with only a name column', () => {
    expect(parseCompaniesCsv('companyName\nValio Oy\n')).toEqual([
      { row: 2, businessId: null, name: 'Valio Oy' },
    ]);
  });

  it('accepts a tab separated file with only a Business ID column', () => {
    expect(parseCompaniesCsv('Business ID\tNotes\n0112038-9\tkey account\n')).toEqual([
      { row: 2, businessId: '0112038-9', name: null },
    ]);
  });

  it('keeps commas inside quoted names in a comma separated file', () => {
    expect(parseCompaniesCsv('business_id,name\n,"Virtanen, Heikki Ky"\n')).toEqual([
      { row: 2, businessId: null, name: 'Virtanen, Heikki Ky' },
    ]);
  });

  it('rejects a header without known columns', () => {
    expect(() => parseCompaniesCsv('foo,bar\n1,2\n')).toThrow(CsvFormatError);
  });

  it('rejects an empty file', () => {
    expect(() => parseCompaniesCsv('\n\n')).toThrow('CSV file is empty');
  });

  it('rejects malformed quoting', () => {
    expect(() => parseCompaniesCsv('name\n"Valio Oy\n')).toThrow(/CSV could not be parsed/);
  });
});
