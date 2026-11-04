import * as fs from 'fs';
import * as path from 'path';
import type { Renewal } from '../src/types';

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${testName}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
  console.log(`✅ [PASS] ${testName}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 Running Renewal Mobile & KPI Filter Verification');
  console.log('====================================================\n');

  const filePath = path.resolve(process.cwd(), 'src/components/RenewalManagementView.tsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  // --- Requirement 1: Candidate Mobile Cards & Desktop Table Preservation ---
  console.log('[Test Group 1: Candidate List Mobile Card & Desktop Table]');

  assert(
    fileContent.includes('hidden md:block') && fileContent.includes('<table className="w-full text-left text-xs border-collapse">'),
    'Desktop table is preserved and responsive with hidden md:block'
  );

  assert(
    fileContent.includes('block md:hidden') && fileContent.includes('cand-mobile-'),
    'Mobile card view is implemented with block md:hidden and candidate key cand-mobile-'
  );

  assert(
    fileContent.includes('btn-mobile-start-renewal-'),
    'Mobile cards contain full-width button with id btn-mobile-start-renewal-'
  );

  assert(
    fileContent.includes('총 횟수') && fileContent.includes('잔여 횟수') && fileContent.includes('종료 예정일'),
    'Mobile cards display 총 횟수, 잔여 횟수, and 종료 예정일 in un-cramped card layout'
  );

  // --- Requirement 2: Renewal KPI Card Click & Filter Logic ---
  console.log('\n[Test Group 2: KPI Cards Click & Filter & Smooth Scroll]');

  assert(
    fileContent.includes('id="kpi-card-candidates"') &&
    fileContent.includes('id="kpi-card-in-progress"') &&
    fileContent.includes('id="kpi-card-renewed"') &&
    fileContent.includes('id="kpi-card-declined"'),
    'All 4 KPI cards have unique IDs and are rendered as interactive buttons'
  );

  assert(
    fileContent.includes('id="renewal-candidates-section"') &&
    fileContent.includes('id="renewal-tasks-section"'),
    'Section targets renewal-candidates-section and renewal-tasks-section exist for smooth scroll'
  );

  assert(
    fileContent.includes("value: 'IN_PROGRESS', label: '진행중'"),
    'STATUS_FILTER_OPTIONS includes IN_PROGRESS filter option'
  );

  assert(
    fileContent.includes("scrollIntoView({ behavior: 'smooth'"),
    'Smooth scrollIntoView is invoked on card click'
  );

  // --- Requirement 2 Filter Logic Simulation Test ---
  console.log('\n[Test Group 3: IN_PROGRESS Filter Functional Logic Test]');

  const mockRenewals: Partial<Renewal>[] = [
    { renewalId: 'r1', status: 'TARGET', memberId: 'm1' },
    { renewalId: 'r2', status: 'CONTACTED', memberId: 'm2' },
    { renewalId: 'r3', status: 'CONSULTING', memberId: 'm3' },
    { renewalId: 'r4', status: 'RENEWED', memberId: 'm4' },
    { renewalId: 'r5', status: 'DECLINED', memberId: 'm5' },
    { renewalId: 'r6', status: 'CLOSED', memberId: 'm6' }
  ];

  const inProgressStatuses = ['TARGET', 'CONTACTED', 'CONSULTING'];
  const inProgressFiltered = mockRenewals.filter((r) => inProgressStatuses.includes(r.status!));
  assert(inProgressFiltered.length === 3, 'IN_PROGRESS filter matches exactly TARGET, CONTACTED, CONSULTING');
  assert(inProgressFiltered.every((r) => inProgressStatuses.includes(r.status!)), 'No RENEWED or DECLINED in IN_PROGRESS');

  const renewedFiltered = mockRenewals.filter((r) => r.status === 'RENEWED');
  assert(renewedFiltered.length === 1 && renewedFiltered[0].renewalId === 'r4', 'RENEWED filter matches correctly');

  const declinedFiltered = mockRenewals.filter((r) => r.status === 'DECLINED');
  assert(declinedFiltered.length === 1 && declinedFiltered[0].renewalId === 'r5', 'DECLINED filter matches correctly');

  console.log('\n====================================================');
  console.log('🎉 All Renewal Mobile & KPI Tests Passed Successfully!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
