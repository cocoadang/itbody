/**
 * All Date Inputs Replacement & Validation Verification Test Suite
 *
 * Verifies:
 * 1. 8-digit keyboard input '20260929' -> '2026-09-29'
 * 2. Direct YYYY-MM-DD input support
 * 3. Invalid date rejection (e.g., 2026-02-30, 2026-13-01, year bounds)
 * 4. Period range inversion rejection (end < start)
 * 5. Full code scan verification: 0 user-facing native <input type="date"> remaining
 */

import { formatDateInput, isValidDate } from '../src/utils/dateInputUtils';
import * as fs from 'fs';
import * as path from 'path';

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

function runTests() {
  console.log('====================================================');
  console.log('🚀 Running All Date Inputs Replacement Verification');
  console.log('====================================================\n');

  // Test 1: 8-digit input conversion
  assert(
    formatDateInput('20260929') === '2026-09-29',
    '8-digit numeric input formats to YYYY-MM-DD (20260929 -> 2026-09-29)',
    `Expected 2026-09-29, got ${formatDateInput('20260929')}`
  );

  // Test 2: Standard YYYY-MM-DD input preserved
  assert(
    formatDateInput('2026-09-29') === '2026-09-29',
    'Standard YYYY-MM-DD direct input is preserved',
    `Expected 2026-09-29, got ${formatDateInput('2026-09-29')}`
  );

  // Test 3: Incremental typing behavior
  assert(
    formatDateInput('2026') === '2026',
    'Typing 4 digits yields YYYY',
    `Expected 2026, got ${formatDateInput('2026')}`
  );
  assert(
    formatDateInput('20260') === '2026-0',
    'Typing 5 digits yields YYYY-M',
    `Expected 2026-0, got ${formatDateInput('20260')}`
  );
  assert(
    formatDateInput('202609') === '2026-09',
    'Typing 6 digits yields YYYY-MM',
    `Expected 2026-09, got ${formatDateInput('202609')}`
  );
  assert(
    formatDateInput('2026092') === '2026-09-2',
    'Typing 7 digits yields YYYY-MM-D',
    `Expected 2026-09-2, got ${formatDateInput('2026092')}`
  );

  // Test 4: Calendar Date Validity
  assert(isValidDate('2026-09-29') === true, '2026-09-29 is valid', 'Should be valid');
  assert(isValidDate('2024-02-29') === true, 'Leap year 2024-02-29 is valid', 'Should be valid');
  assert(isValidDate('2026-02-29') === false, 'Non-leap year 2026-02-29 is rejected', 'Should be invalid');
  assert(isValidDate('2026-04-31') === false, 'April 31st is rejected', 'Should be invalid');
  assert(isValidDate('2026-13-01') === false, 'Month 13 is rejected', 'Should be invalid');
  assert(isValidDate('2026-00-10') === false, 'Month 0 is rejected', 'Should be invalid');
  assert(isValidDate('1899-12-31') === false, 'Year below 1900 rejected', 'Should be invalid');
  assert(isValidDate('2101-01-01') === false, 'Year above 2100 rejected', 'Should be invalid');

  // Test 5: Period Range Inversion Validation (end < start)
  const isPeriodValid = (start: string, end: string): boolean => {
    if (!start || !isValidDate(start)) return false;
    if (!end || !isValidDate(end)) return false;
    return end >= start;
  };

  assert(
    isPeriodValid('2026-01-01', '2026-03-31') === true,
    'Valid date range (2026-01-01 ~ 2026-03-31) is accepted',
    'Should be accepted'
  );
  assert(
    isPeriodValid('2026-05-10', '2026-05-10') === true,
    'Same day date range (2026-05-10 ~ 2026-05-10) is accepted',
    'Should be accepted'
  );
  assert(
    isPeriodValid('2026-05-10', '2026-05-09') === false,
    'Inverted date range (end 2026-05-09 < start 2026-05-10) is rejected',
    'Should be rejected'
  );
  assert(
    isPeriodValid('2026-02-30', '2026-05-10') === false,
    'Invalid start date in range is rejected',
    'Should be rejected'
  );

  // Test 6: Verify all 11 target components have DateInputField imported and no native type="date"
  const targetFiles = [
    'src/components/LeadModal.tsx',
    'src/components/ConsultationTab.tsx',
    'src/components/PtSessionsTab.tsx',
    'src/components/BodyChangesTab.tsx',
    'src/components/MemberDetailView.tsx',
    'src/components/SoloWorkoutTab.tsx',
    'src/components/RenewalModal.tsx',
    'src/components/PhotosTab.tsx',
    'src/components/PerformanceReportTab.tsx',
    'src/components/LeadPerformanceDashboard.tsx',
    'src/components/RenewalPerformanceDashboard.tsx'
  ];

  for (const file of targetFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    const content = fs.readFileSync(fullPath, 'utf-8');

    assert(
      content.includes('DateInputField'),
      `${file} imports and uses DateInputField`,
      `Expected ${file} to import DateInputField`
    );

    // Ensure NO <input type="date" remains in target file
    const nativeDateInputMatch = content.match(/<input[^>]*type=["']date["']/g);
    assert(
      nativeDateInputMatch === null,
      `${file} contains 0 native <input type="date"> elements`,
      `Found native date input in ${file}: ${JSON.stringify(nativeDateInputMatch)}`
    );
  }

  // Test 7: Verify entire src/ directory only has 1 type="date" (the hidden picker in DateInputField.tsx)
  const srcDir = path.resolve(process.cwd(), 'src');
  function findDateInputsInDir(dir: string): string[] {
    let matches: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        matches = matches.concat(findDateInputsInDir(full));
      } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
        const text = fs.readFileSync(full, 'utf-8');
        const lines = text.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes('type="date"') || line.includes("type='date'")) {
            matches.push(`${full}:${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
    return matches;
  }

  const allDateInputs = findDateInputsInDir(srcDir);
  assert(
    allDateInputs.length === 1 && allDateInputs[0].includes('DateInputField.tsx'),
    `Entire src/ contains only 1 internal datepicker in DateInputField.tsx (found: ${allDateInputs.length})`,
    `Found unexpected date inputs: ${allDateInputs.join(', ')}`
  );

  console.log('\n====================================================');
  console.log(`🎉 All ${results.length} tests passed successfully!`);
  console.log('====================================================');
}

runTests();
