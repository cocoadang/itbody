/**
 * Date Input Formatting & Validation Verification Test Suite
 * Validates:
 * 1. 8-digit continuous numeric typing (19860101 -> 1986-01-01)
 * 2. Hyphenated string support (1986-01-01)
 * 3. Prevention of year accumulation bugs (198601-01-01 -> capped to 8 digits)
 * 4. Progressive keystroke formatting (1 -> 19 -> 198 -> 1986 -> 1986-0 -> 1986-01 -> ...)
 * 5. Backspace behavior simulation (smooth character-by-character deletion)
 * 6. Calendar date validation (leap years, month bounds, day bounds, year range)
 * 7. Invalid date rejection
 */

import { formatDateInput, isValidDate, normalizeDateInput } from '../src/utils/dateInputUtils';

interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, testName: string, failureMessage: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${testName}: ${failureMessage}`);
    results.push({ name: testName, passed: false, message: failureMessage });
    throw new Error(`Assertion failed in ${testName}: ${failureMessage}`);
  } else {
    console.log(`✅ [PASS] ${testName}`);
    results.push({ name: testName, passed: true });
  }
}

function runDateTests() {
  console.log('====================================================');
  console.log('🚀 Running Date Input & Validation Test Suite');
  console.log('====================================================\n');

  // 1. 8-digit continuous typing
  assert(
    formatDateInput('19860101') === '1986-01-01',
    '8-digit numeric input formats to YYYY-MM-DD',
    `Expected 1986-01-01, got ${formatDateInput('19860101')}`
  );

  assert(
    formatDateInput('20261029') === '2026-10-29',
    'PT start date 8-digit numeric input formats to YYYY-MM-DD',
    `Expected 2026-10-29, got ${formatDateInput('20261029')}`
  );

  // 2. Pre-formatted YYYY-MM-DD support
  assert(
    formatDateInput('1986-01-01') === '1986-01-01',
    'Standard YYYY-MM-DD is preserved',
    `Expected 1986-01-01, got ${formatDateInput('1986-01-01')}`
  );

  // 3. Prevention of year accumulation
  const corrupted = formatDateInput('198601-01-01');
  assert(
    corrupted === '1986-01-01',
    'Year-accumulation string is sanitized and capped to 8 digits',
    `Expected 1986-01-01, got ${corrupted}`
  );

  const corrupted2 = formatDateInput('198610-10-29');
  assert(
    corrupted2 === '1986-10-10',
    'Corrupted 198610-10-29 is capped to 8 digits (1986-10-10)',
    `Expected 1986-10-10, got ${corrupted2}`
  );

  // 4. Progressive typing simulation
  const steps: [string, string][] = [
    ['1', '1'],
    ['19', '19'],
    ['198', '198'],
    ['1986', '1986'],
    ['19860', '1986-0'],
    ['198601', '1986-01'],
    ['1986010', '1986-01-0'],
    ['19860101', '1986-01-01']
  ];

  for (const [input, expected] of steps) {
    const formatted = formatDateInput(input);
    assert(
      formatted === expected,
      `Progressive typing '${input}' -> '${expected}'`,
      `Expected ${expected}, got ${formatted}`
    );
  }

  // 5. Backspacing simulation
  const backspaceSteps: [string, string][] = [
    ['1986-01-0', '1986-01-0'],
    ['1986-01-', '1986-01-'],
    ['1986-01', '1986-01'],
    ['1986-0', '1986-0'],
    ['1986-', '1986-'],
    ['1986', '1986'],
    ['198', '198'],
    ['19', '19'],
    ['1', '1'],
    ['', '']
  ];

  for (const [input, expected] of backspaceSteps) {
    const formatted = formatDateInput(input);
    assert(
      formatted === expected,
      `Backspace step '${input}' -> '${expected}'`,
      `Expected ${expected}, got ${formatted}`
    );
  }

  // 6. Strict Calendar Date Validation
  assert(isValidDate('1986-01-01'), '1986-01-01 is valid', 'Expected true');
  assert(isValidDate('2024-02-29'), '2024-02-29 (leap year) is valid', 'Expected true');
  assert(!isValidDate('1986-02-29'), '1986-02-29 (non-leap year) is invalid', 'Expected false');
  assert(!isValidDate('1986-04-31'), '1986-04-31 (April only 30 days) is invalid', 'Expected false');
  assert(!isValidDate('1986-13-01'), '1986-13-01 (month 13) is invalid', 'Expected false');
  assert(!isValidDate('1986-00-10'), '1986-00-10 (month 0) is invalid', 'Expected false');
  assert(!isValidDate('1899-12-31'), '1899-12-31 (out of range year) is invalid', 'Expected false');
  assert(!isValidDate('2101-01-01'), '2101-01-01 (out of range year) is invalid', 'Expected false');
  assert(!isValidDate('19860101'), 'Unformatted 8 digits is not valid YYYY-MM-DD', 'Expected false');
  assert(!isValidDate('1986-01'), 'Incomplete date is invalid', 'Expected false');
  assert(!isValidDate(''), 'Empty string is invalid', 'Expected false');

  console.log('\n====================================================');
  console.log(`🎉 All ${results.length} Date Input Verification Tests Passed Successfully!`);
  console.log('====================================================\n');
}

runDateTests();
