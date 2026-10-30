import { describe, expect, it } from 'vitest';
import {
  calculateCheckDigit,
  validateBusinessId,
} from '../src/validators/business-id.validator.js';

describe('validateBusinessId', () => {
  it.each(['0112038-9', '0109862-8', '2336509-6', '1000002-0', '1234567-1'])(
    'accepts %s',
    (businessId) => {
      expect(validateBusinessId(businessId)).toEqual({ valid: true, businessId });
    },
  );

  it('trims surrounding whitespace', () => {
    expect(validateBusinessId('  0112038-9 ')).toEqual({ valid: true, businessId: '0112038-9' });
  });

  it.each([
    ['0112038-8', 'check digit does not match'],
    ['1234568-0', 'number part cannot have a valid check digit'],
    ['1234567', 'expected format is 1234567-8'],
    ['FI01120389', 'expected format is 1234567-8'],
    ['12345678-9', 'expected format is 1234567-8'],
    ['0112038 9', 'expected format is 1234567-8'],
    ['112038-9', 'expected format is 1234567-8'],
    ['', 'expected format is 1234567-8'],
  ])('rejects %j', (businessId, reason) => {
    expect(validateBusinessId(businessId)).toEqual({ valid: false, reason });
  });
});

describe('calculateCheckDigit', () => {
  it('returns 11 minus the remainder for regular numbers', () => {
    expect(calculateCheckDigit('0112038')).toBe(9);
  });

  it('returns 0 when the weighted sum is divisible by 11', () => {
    expect(calculateCheckDigit('1000002')).toBe(0);
  });

  it('returns null when the remainder is 1 because such numbers are never issued', () => {
    expect(calculateCheckDigit('1234568')).toBeNull();
  });
});
