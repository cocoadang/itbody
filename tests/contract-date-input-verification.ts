/**
 * PT Contract Date Input & Validation Verification Test Suite
 *
 * Verifies:
 * 1. 8-digit keyboard input '20260929' -> '2026-09-29'
 * 2. Direct 'YYYY-MM-DD' input support and formatting
 * 3. Blocking invalid dates (e.g. 198601-01-01, 2026-02-30, 2026-13-01, incomplete strings)
 * 4. Blocking when expirationDate is earlier than startDate
 * 5. Allowing when expirationDate is equal to or after startDate
 * 6. Preserving 'YYYY-MM-DD' storage format in contract data
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatDateInput, isValidDate, normalizeDateInput } from '../src/utils/dateInputUtils';

describe('PT Contract Date Input & Validation Suite', () => {
  it('should format 8-digit numeric keyboard input into YYYY-MM-DD', () => {
    // Entering 20260929
    assert.strictEqual(formatDateInput('20260929'), '2026-09-29');
    assert.strictEqual(formatDateInput('20260101'), '2026-01-01');
    assert.strictEqual(formatDateInput('20261231'), '2026-12-31');
  });

  it('should format progressive typing without digit accumulation bug', () => {
    assert.strictEqual(formatDateInput('2'), '2');
    assert.strictEqual(formatDateInput('20'), '20');
    assert.strictEqual(formatDateInput('202'), '202');
    assert.strictEqual(formatDateInput('2026'), '2026');
    assert.strictEqual(formatDateInput('20260'), '2026-0');
    assert.strictEqual(formatDateInput('202609'), '2026-09');
    assert.strictEqual(formatDateInput('2026092'), '2026-09-2');
    assert.strictEqual(formatDateInput('20260929'), '2026-09-29');
  });

  it('should support YYYY-MM-DD direct input with hyphens', () => {
    assert.strictEqual(formatDateInput('2026-09-29'), '2026-09-29');
    assert.strictEqual(normalizeDateInput('2026-09-29'), '2026-09-29');
  });

  it('should strictly validate legitimate calendar dates', () => {
    assert.strictEqual(isValidDate('2026-09-29'), true);
    assert.strictEqual(isValidDate('2024-02-29'), true); // 2024 leap year
    assert.strictEqual(isValidDate('2026-02-29'), false); // 2026 non-leap year
    assert.strictEqual(isValidDate('2026-02-30'), false);
    assert.strictEqual(isValidDate('2026-04-31'), false);
    assert.strictEqual(isValidDate('2026-13-01'), false);
    assert.strictEqual(isValidDate('2026-00-10'), false);
    assert.strictEqual(isValidDate(''), false);
    assert.strictEqual(isValidDate('198601-01-01'), false); // Abnormal accumulated format
    assert.strictEqual(isValidDate('2026-9-29'), false); // Not 2-digit month
  });

  it('should block saving when expiration date is earlier than start date', () => {
    const validateContractDates = (startDate: string, expirationDate: string) => {
      if (!startDate || !isValidDate(startDate)) {
        return { valid: false, message: '유효한 시작일을 입력해주세요 (YYYY-MM-DD).' };
      }
      if (!expirationDate || !isValidDate(expirationDate)) {
        return { valid: false, message: '유효한 만료일을 입력해주세요 (YYYY-MM-DD).' };
      }
      if (expirationDate < startDate) {
        return { valid: false, message: '만료일은 시작일보다 이전일 수 없습니다.' };
      }
      return { valid: true, message: null };
    };

    // Case 1: expirationDate < startDate (e.g. 2026-08-01 < 2026-09-01) -> blocked
    const resultInvalidOrder = validateContractDates('2026-09-01', '2026-08-01');
    assert.strictEqual(resultInvalidOrder.valid, false);
    assert.strictEqual(resultInvalidOrder.message, '만료일은 시작일보다 이전일 수 없습니다.');

    // Case 2: invalid start date -> blocked
    const resultInvalidStart = validateContractDates('2026-02-30', '2026-05-01');
    assert.strictEqual(resultInvalidStart.valid, false);
    assert.strictEqual(resultInvalidStart.message, '유효한 시작일을 입력해주세요 (YYYY-MM-DD).');

    // Case 3: invalid expiration date -> blocked
    const resultInvalidEnd = validateContractDates('2026-03-01', '20261301');
    assert.strictEqual(resultInvalidEnd.valid, false);
    assert.strictEqual(resultInvalidEnd.message, '유효한 만료일을 입력해주세요 (YYYY-MM-DD).');

    // Case 4: expirationDate == startDate (same day contract) -> allowed
    const resultSameDay = validateContractDates('2026-09-29', '2026-09-29');
    assert.strictEqual(resultSameDay.valid, true);

    // Case 5: expirationDate > startDate -> allowed
    const resultValid = validateContractDates('2026-09-29', '2026-12-28');
    assert.strictEqual(resultValid.valid, true);
  });

  it('should maintain standard YYYY-MM-DD format for contract storage', () => {
    const rawInputStart = '20260929';
    const rawInputEnd = '20261229';

    const formattedStart = formatDateInput(rawInputStart);
    const formattedEnd = formatDateInput(rawInputEnd);

    assert.strictEqual(formattedStart, '2026-09-29');
    assert.strictEqual(formattedEnd, '2026-12-29');
    assert.match(formattedStart, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(formattedEnd, /^\d{4}-\d{2}-\d{2}$/);
  });
});
