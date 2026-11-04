/**
 * Date input formatting and validation utility for ITBODY.
 * Prevents year-accumulation bugs in native date inputs (e.g. 198601-01-01)
 * while supporting continuous 8-digit keyboard entry (19860101 -> 1986-01-01),
 * hyphens, backspaces, and strict calendar validation.
 */

/**
 * Formats user input as they type digits.
 * - Extracts digits (max 8)
 * - If 1~4 digits: "YYYY" (e.g. "1986")
 * - If 5~6 digits: "YYYY-MM" (e.g. "1986-01")
 * - If 7~8 digits: "YYYY-MM-DD" (e.g. "1986-01-01")
 * Supports normal backspacing without getting stuck on hyphens.
 */
export function formatDateInput(val: string): string {
  if (!val) return '';

  // If no hyphens, format as digits stream (e.g. typing digits continuously or paste 20261002)
  if (!val.includes('-')) {
    const digits = val.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) {
      return digits;
    }
    if (digits.length <= 6) {
      return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    }
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }

  // If hyphens exist (in-place editing of year, month, or day with caret)
  const parts = val.split('-');
  let year = parts[0].replace(/\D/g, '').slice(0, 4);
  let month = '';
  let day = '';

  if (parts.length === 2) {
    const secondDigits = parts[1].replace(/\D/g, '');
    if (secondDigits.length > 2) {
      month = secondDigits.slice(0, 2);
      day = secondDigits.slice(2, 4);
    } else {
      month = secondDigits;
    }
  } else if (parts.length >= 3) {
    month = parts[1].replace(/\D/g, '').slice(0, 2);
    day = parts.slice(2).join('').replace(/\D/g, '').slice(0, 2);
  }

  let result = year;
  if (parts.length >= 2 || month.length > 0) {
    result += `-${month}`;
  }
  if (parts.length >= 3 || day.length > 0) {
    result += `-${day}`;
  }

  return result;
}

/**
 * Validates whether a date string is a legitimate calendar date in YYYY-MM-DD format.
 * - Format must be exactly YYYY-MM-DD
 * - Year between 1900 and 2100
 * - Month between 1 and 12
 * - Day valid for that month/year (handles leap years, 30/31 day limits)
 */
export function isValidDate(dateStr: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Normalizes any date string (8-digit string, dotted string, slash string) to YYYY-MM-DD.
 */
export function normalizeDateInput(val: string): string {
  if (!val) return '';
  return formatDateInput(val);
}
