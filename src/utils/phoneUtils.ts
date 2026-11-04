/**
 * Utility functions for user phone number inputs and validations.
 *
 * Rules:
 * - Digits only
 * - Maximum 11 digits
 * - Strips any non-digit characters (Korean, English, special characters, hyphens, spaces, etc.)
 * - Truncates beyond 11 digits immediately
 * - Mobile numeric keypad support (inputMode="numeric")
 * - Valid required phone number: 10 or 11 digits
 * - Optional phone number: allows empty string
 */

export function sanitizePhoneNumber(input?: string | null): string {
  if (!input) return '';
  return input.replace(/\D/g, '').slice(0, 11);
}

export function isValidPhoneNumber(phone?: string | null, required = true): boolean {
  if (!phone || phone.trim() === '') {
    return !required;
  }
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

export const PHONE_ERROR_MESSAGE = '연락처는 10자리 또는 11자리 숫자(예: 01012345678)로 입력해주세요.';
