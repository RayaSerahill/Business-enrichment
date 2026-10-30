import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { InputRow } from '../types/enrichment.js';

const BUSINESS_ID_COLUMNS = new Set(['businessid', 'ytunnus']);
const NAME_COLUMNS = new Set([
  'name',
  'companyname',
  'company',
  'nimi',
  'yritys',
  'yrityksennimi',
  'toiminimi',
]);
const DELIMITERS = [',', ';', '\t'];

const parsedRecordsSchema = z.array(
  z.object({
    record: z.array(z.string()),
    info: z.object({ lines: z.number() }),
  }),
);

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvFormatError';
  }
}

export function parseCompaniesCsv(content: string): InputRow[] {
  const [header, ...rows] = readRecords(content);
  if (!header) throw new CsvFormatError('CSV file is empty');

  const columns = header.record.map(normalizeColumnName);
  const businessIdIndex = columns.findIndex((column) => BUSINESS_ID_COLUMNS.has(column));
  const nameIndex = columns.findIndex((column) => NAME_COLUMNS.has(column));
  if (businessIdIndex === -1 && nameIndex === -1) {
    throw new CsvFormatError(
      'CSV header must contain a Business ID column (e.g. "businessId" or "Y-tunnus") and/or a name column (e.g. "name" or "Nimi")',
    );
  }

  return rows.map(({ record, info }) => ({
    row: info.lines,
    businessId: cell(record, businessIdIndex),
    name: cell(record, nameIndex),
  }));
}

function readRecords(content: string) {
  try {
    return parsedRecordsSchema.parse(
      parse(content, {
        bom: true,
        delimiter: detectDelimiter(content),
        info: true,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CsvFormatError(`CSV could not be parsed: ${reason}`);
  }
}

function detectDelimiter(content: string): string {
  const headerLine = content.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
  const occurrences = (delimiter: string) => headerLine.split(delimiter).length - 1;
  return DELIMITERS.reduce((best, candidate) =>
    occurrences(candidate) > occurrences(best) ? candidate : best,
  );
}

function normalizeColumnName(column: string): string {
  return column.toLocaleLowerCase('fi-FI').replace(/[^a-z0-9äöå]/g, '');
}

function cell(record: string[], index: number): string | null {
  const value = index === -1 ? undefined : record[index];
  return value ? value : null;
}
