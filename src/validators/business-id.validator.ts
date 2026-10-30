import { z } from 'zod';

const BUSINESS_ID_FORMAT = /^\d{7}-\d$/;
const CHECK_DIGIT_WEIGHTS = [7, 9, 10, 5, 8, 4, 2];

export function calculateCheckDigit(digits: string): number | null {
  const sum = CHECK_DIGIT_WEIGHTS.reduce(
    (total, weight, index) => total + weight * Number(digits.charAt(index)),
    0,
  );
  const remainder = sum % 11;
  if (remainder === 0) return 0;
  if (remainder === 1) return null;
  return 11 - remainder;
}

export const businessIdSchema = z
  .string()
  .trim()
  .superRefine((value, context) => {
    if (!BUSINESS_ID_FORMAT.test(value)) {
      context.addIssue({ code: 'custom', message: 'expected format is 1234567-8' });
      return;
    }
    const expected = calculateCheckDigit(value.slice(0, 7));
    if (expected === null) {
      context.addIssue({ code: 'custom', message: 'number part cannot have a valid check digit' });
    } else if (expected !== Number(value.slice(8))) {
      context.addIssue({ code: 'custom', message: 'check digit does not match' });
    }
  });

export type BusinessIdValidation =
  { valid: true; businessId: string } | { valid: false; reason: string };

export function validateBusinessId(input: string): BusinessIdValidation {
  const result = businessIdSchema.safeParse(input);
  if (result.success) return { valid: true, businessId: result.data };
  return { valid: false, reason: result.error.issues[0]?.message ?? 'invalid Business ID' };
}
