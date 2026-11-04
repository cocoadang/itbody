import { formatDateInput, isValidDate } from '../src/utils/dateInputUtils';
import { getMembers, getAttentionMembers, seedInitialCenterData } from '../src/services/dataService';
import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${testName}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
  console.log(`✅ [PASS] ${testName}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 Running Mobile Improvements Verification Suite');
  console.log('====================================================\n');

  // --- Requirement 2: DateInputField formatting and in-place caret edits ---
  console.log('[Test Group 1: DateInputField In-place & Continuous Formatting]');

  // 1. In-place year edits (must NOT shift month/day digits!)
  assert(
    formatDateInput('1990-10-15') === '1990-10-15',
    'Standard YYYY-MM-DD input preserved'
  );
  assert(
    formatDateInput('199-10-15') === '199-10-15',
    'Deleting a digit in year preserves year position without shifting month/day'
  );
  assert(
    formatDateInput('19-10-15') === '19-10-15',
    'Deleting 2 digits in year preserves month and day'
  );
  assert(
    formatDateInput('1985-10-15') === '1985-10-15',
    'Typing in year updates year cleanly'
  );

  // 2. In-place month edits
  assert(
    formatDateInput('1990-1-15') === '1990-1-15',
    'Deleting a digit in month preserves year and day'
  );
  assert(
    formatDateInput('1990-12-15') === '1990-12-15',
    'Typing in month updates month cleanly'
  );

  // 3. In-place day edits
  assert(
    formatDateInput('1990-10-5') === '1990-10-5',
    'Deleting a digit in day preserves year and month'
  );
  assert(
    formatDateInput('1990-10-25') === '1990-10-25',
    'Typing in day updates day cleanly'
  );

  // 4. Continuous keyboard/paste input
  assert(
    formatDateInput('20261002') === '2026-10-02',
    'Continuous 8-digit paste (20261002 -> 2026-10-02)'
  );
  assert(
    formatDateInput('2026') === '2026',
    '4 digits yields YYYY'
  );
  assert(
    formatDateInput('20260') === '2026-0',
    '5 digits yields YYYY-M'
  );
  assert(
    formatDateInput('202609') === '2026-09',
    '6 digits yields YYYY-MM'
  );
  assert(
    formatDateInput('2026092') === '2026-09-2',
    '7 digits yields YYYY-MM-D'
  );

  // 5. Calendar validation
  assert(isValidDate('2026-10-02') === true, '2026-10-02 is valid calendar date');
  assert(isValidDate('1990-10-15') === true, '1990-10-15 is valid calendar date');
  assert(isValidDate('2026-02-29') === false, 'Invalid leap date 2026-02-29 rejected');
  assert(isValidDate('199-10-15') === false, 'Incomplete year 199-10-15 rejected as invalid');

  // --- Requirement 1: Dashboard KPI -> Member List filtering ---
  console.log('\n[Test Group 2: Dashboard KPI & Member List Filtering]');
  const centerId = 'test-center-mobile-kpi';
  await seedInitialCenterData(centerId, '모바일 테스트 피트니스', [
    { id: 'tr-m-1', name: '김트레이너', phone: '01011112222', specialty: '웨이트' }
  ]);

  const allMembers = await getMembers(centerId, 'CENTER_ADMIN');
  const activeMembers = allMembers.filter((m) => m.status === 'ACTIVE');
  const attentionItems = await getAttentionMembers(centerId, 'CENTER_ADMIN');

  assert(allMembers.length > 0, 'Seeded members exist');
  assert(activeMembers.length > 0, 'Active members exist for ACTIVE KPI filter');
  assert(Array.isArray(attentionItems), 'Attention members array fetched for ATTENTION KPI filter');

  // --- Requirement 3: Mobile Header duplicate button check ---
  console.log('\n[Test Group 3: Mobile Header Duplicate Register Button Check]');
  const navbarSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Navbar.tsx'), 'utf-8');
  assert(
    navbarSource.includes('hidden sm:inline-flex') && navbarSource.includes('id="nav-btn-register-member"'),
    'Header register member button is hidden on mobile screens (hidden sm:inline-flex) and preserved on desktop'
  );

  console.log('\n====================================================');
  console.log('🎉 All Mobile Improvements Tests Passed Successfully!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
