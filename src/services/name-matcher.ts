import { PRH_NAME_TYPE, type PrhCompany } from '../clients/prh.client.js';

export function normalizeName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fi-FI');
}

export function hasCurrentName(company: PrhCompany, name: string): boolean {
  const target = normalizeName(name);
  return company.names.some(
    (registered) =>
      (registered.type === PRH_NAME_TYPE.company || registered.type === PRH_NAME_TYPE.parallel) &&
      registered.version === 1 &&
      normalizeName(registered.name) === target,
  );
}

export function hasRegisteredName(company: PrhCompany, name: string): boolean {
  const target = normalizeName(name);
  return company.names.some((registered) => normalizeName(registered.name) === target);
}
