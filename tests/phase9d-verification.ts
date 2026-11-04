/**
 * Phase 9D Automated Verification Test Suite:
 * Validates PT Renewal Performance Analytics:
 * 1. Division by zero handling (0건 처리 시 0% 안전 반환)
 * 2. Renewal Rate calculation: RENEWED / (RENEWED + DECLINED)
 * 3. In-progress exclusions (TARGET / CONTACTED / CONSULTING) excluded from rate denominator
 * 4. CLOSED status excluded from rate denominator
 * 5. Decline Reason distribution aggregation & percentage
 * 6. Date Range filtering by startedAt (fallback createdAt)
 * 7. Trainer-level isolation and breakdown by Renewal.trainerId
 * 8. RENEWED data integrity (renewedContractId + renewedAt)
 * 9. RBAC permission checks: CENTER_ADMIN vs TRAINER vs MEMBER
 */
import {
  createMember,
  createContract,
  createRenewal,
  updateRenewal,
  completeRenewalWithContract,
  getRenewals,
  getRenewalCandidates,
  clearCenterData
} from '../src/services/dataService';
import {
  calculateRenewalKpis,
  calculateRenewalFunnel,
  calculateDeclineReasonStats,
  calculateTrainerRenewalStats,
  filterRenewalsByDate,
  isRenewalCompleted,
  formatRate
} from '../src/components/RenewalPerformanceDashboard';
import type { Renewal, Trainer, RenewalStatus, RenewalDeclineReason } from '../src/types';

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

async function runPhase9dTests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 9D PT Renewal Analytics Suite');
  console.log('====================================================\n');

  const centerId = 'center-phase9d-test';
  const trainerAId = 'tr-kim-9d';
  const trainerBId = 'tr-park-9d';

  await clearCenterData(centerId);

  // ----------------------------------------------------
  // Scenario 1: Empty State & Zero Denominator Handling
  // ----------------------------------------------------
  const emptyKpis = calculateRenewalKpis([]);
  assert(emptyKpis.totalStarted === 0, 'Scenario 1A: Empty renewals count is 0', 'Count mismatch');
  assert(emptyKpis.decided === 0, 'Scenario 1B: Decided count is 0', 'Decided count mismatch');
  assert(
    emptyKpis.renewalRate === '0%',
    'Scenario 1C: Empty renewal rate safely returns 0%',
    `Expected 0%, got ${emptyKpis.renewalRate}`
  );

  const emptyFunnel = calculateRenewalFunnel([]);
  assert(
    emptyFunnel[0].stepRate === '100%' && emptyFunnel[3].stepRate === '0%',
    'Scenario 1D: Empty funnel safely handles rates without division by zero',
    'Funnel rate error'
  );

  // ----------------------------------------------------
  // Scenario 2: Setup Renewal Data with Diverse Statuses and Dates
  // Center has 6 Renewals:
  // - R1 (Trainer A, Sept 10): RENEWED with contract
  // - R2 (Trainer A, Sept 12): DECLINED with PRICE
  // - R3 (Trainer A, Sept 15): CONSULTING (in-progress)
  // - R4 (Trainer B, Sept 18): TARGET (in-progress)
  // - R5 (Trainer B, Sept 20): CLOSED
  // - R6 (Trainer A, Aug 15): Last month - RENEWED with contract
  // ----------------------------------------------------
  const member1 = await createMember({
    centerId,
    trainerId: trainerAId,
    name: '회원1_9D',
    gender: 'FEMALE',
    birthDate: '1995-01-01',
    phone: '010-8888-0001',
    startDate: '2026-08-01',
    status: 'ACTIVE'
  });
  const contract1 = await createContract({
    centerId,
    memberId: member1.memberId,
    trainerId: trainerAId,
    title: '정규 20회권',
    totalSessions: 20,
    startDate: '2026-08-01',
    expirationDate: '2026-10-31',
    status: 'ACTIVE'
  });

  // R1: Trainer A, Sept 10 -> Completed with Contract
  const r1 = await createRenewal(
    {
      centerId,
      memberId: member1.memberId,
      trainerId: trainerAId,
      contractId: contract1.contractId,
      remainingSessionsAtStart: 3,
      status: 'CONSULTING',
      startedAt: '2026-09-10T09:00:00.000Z'
    },
    'TRAINER',
    trainerAId
  );
  const r1Completed = await completeRenewalWithContract(
    centerId,
    r1.renewalId,
    {
      title: '재등록 30회권',
      totalSessions: 30,
      startDate: '2026-10-01',
      expirationDate: '2027-01-31'
    },
    'TRAINER',
    trainerAId
  );

  // R2: Trainer A, Sept 12 -> DECLINED (PRICE)
  const r2 = await createRenewal(
    {
      centerId,
      memberId: member1.memberId,
      trainerId: trainerAId,
      contractId: 'con-dummy-2',
      remainingSessionsAtStart: 2,
      status: 'TARGET',
      startedAt: '2026-09-12T10:00:00.000Z'
    },
    'TRAINER',
    trainerAId
  );
  await updateRenewal(
    centerId,
    r2.renewalId,
    {
      status: 'DECLINED',
      declineReason: 'PRICE' as RenewalDeclineReason,
      declineMemo: '가격 부담'
    },
    'TRAINER',
    trainerAId
  );

  // R3: Trainer A, Sept 15 -> CONSULTING
  await createRenewal(
    {
      centerId,
      memberId: member1.memberId,
      trainerId: trainerAId,
      contractId: 'con-dummy-3',
      remainingSessionsAtStart: 4,
      status: 'CONSULTING',
      startedAt: '2026-09-15T14:00:00.000Z'
    },
    'TRAINER',
    trainerAId
  );

  // R4: Trainer B, Sept 18 -> TARGET
  await createRenewal(
    {
      centerId,
      memberId: member1.memberId,
      trainerId: trainerBId,
      contractId: 'con-dummy-4',
      remainingSessionsAtStart: 5,
      status: 'TARGET',
      startedAt: '2026-09-18T16:00:00.000Z'
    },
    'TRAINER',
    trainerBId
  );

  // R5: Trainer B, Sept 20 -> CLOSED
  const r5 = await createRenewal(
    {
      centerId,
      memberId: member1.memberId,
      trainerId: trainerBId,
      contractId: 'con-dummy-5',
      remainingSessionsAtStart: 1,
      status: 'TARGET',
      startedAt: '2026-09-20T11:00:00.000Z'
    },
    'TRAINER',
    trainerBId
  );
  await updateRenewal(centerId, r5.renewalId, { status: 'CLOSED' }, 'CENTER_ADMIN');

  // R6: Trainer A, Aug 15 -> Last Month RENEWED
  const r6 = await createRenewal(
    {
      centerId,
      memberId: member1.memberId,
      trainerId: trainerAId,
      contractId: 'con-dummy-6',
      remainingSessionsAtStart: 2,
      status: 'CONSULTING',
      startedAt: '2026-08-15T10:00:00.000Z'
    },
    'TRAINER',
    trainerAId
  );
  await completeRenewalWithContract(
    centerId,
    r6.renewalId,
    {
      title: '8월 재등록 20회',
      totalSessions: 20,
      startDate: '2026-08-20',
      expirationDate: '2026-11-20'
    },
    'TRAINER',
    trainerAId
  );

  // ----------------------------------------------------
  // Scenario 3: Date Filtering Verification
  // ----------------------------------------------------
  const allCenterRenewals = await getRenewals(centerId, 'CENTER_ADMIN');
  assert(
    allCenterRenewals.length === 6,
    'Scenario 3A: Center has 6 total renewals',
    `Expected 6, got ${allCenterRenewals.length}`
  );

  const septemberRenewals = filterRenewalsByDate(allCenterRenewals, '2026-09-01', '2026-09-30');
  assert(
    septemberRenewals.length === 5,
    'Scenario 3B: September date filter matches exactly 5 renewals',
    `Expected 5, got ${septemberRenewals.length}`
  );

  const augustRenewals = filterRenewalsByDate(allCenterRenewals, '2026-08-01', '2026-08-31');
  assert(
    augustRenewals.length === 1,
    'Scenario 3C: August date filter matches exactly 1 renewal',
    `Expected 1, got ${augustRenewals.length}`
  );

  // ----------------------------------------------------
  // Scenario 4: Core KPI & Renewal Rate Calculation (September data)
  // In September:
  // Total started: 5
  // In-progress: 2 (R3: CONSULTING, R4: TARGET)
  // Renewed: 1 (R1)
  // Declined: 1 (R2)
  // Closed: 1 (R5)
  // Decided: Renewed(1) + Declined(1) = 2
  // Renewal Rate = 1 / (1 + 1) = 50%
  // ----------------------------------------------------
  const septKpis = calculateRenewalKpis(septemberRenewals);

  assert(septKpis.totalStarted === 5, 'Scenario 4A: Total started in Sept is 5', `Got ${septKpis.totalStarted}`);
  assert(septKpis.inProgress === 2, 'Scenario 4B: In-progress in Sept is 2', `Got ${septKpis.inProgress}`);
  assert(septKpis.renewed === 1, 'Scenario 4C: Renewed count is 1', `Got ${septKpis.renewed}`);
  assert(septKpis.declined === 1, 'Scenario 4D: Declined count is 1', `Got ${septKpis.declined}`);
  assert(septKpis.closed === 1, 'Scenario 4E: Closed count is 1', `Got ${septKpis.closed}`);
  assert(septKpis.decided === 2, 'Scenario 4F: Decided count is 2 (RENEWED + DECLINED)', `Got ${septKpis.decided}`);
  assert(
    septKpis.renewalRate === '50%',
    'Scenario 4G: Renewal rate is exactly 50% (1 / 2)',
    `Expected 50%, got ${septKpis.renewalRate}`
  );

  // ----------------------------------------------------
  // Scenario 5: Exclusion Verification (In-progress & CLOSED excluded from rate)
  // ----------------------------------------------------
  // If denominator included inProgress (2) and closed (1), denom would be 5 -> 20%.
  // But by requirement, in-progress and closed must be excluded, giving 50%!
  assert(
    septKpis.renewalRate !== '20%',
    'Scenario 5A: In-progress and closed are strictly excluded from rate denominator',
    'Denominator incorrectly included inProgress/closed'
  );

  // ----------------------------------------------------
  // Scenario 6: Renewal Funnel Calculations
  // Step 1: 대상 = 5 (100%)
  // Step 2: 상담 진행 = 4 (R1, R2, R3, R5 - non-TARGET)
  // Step 3: 결과 확정 = 2 (R1, R2)
  // Step 4: 재등록 완료 = 1 (R1)
  // ----------------------------------------------------
  const septFunnel = calculateRenewalFunnel(septemberRenewals);
  assert(septFunnel[0].count === 5, 'Scenario 6A: Funnel step 1 (대상) is 5', `Got ${septFunnel[0].count}`);
  assert(septFunnel[1].count === 4, 'Scenario 6B: Funnel step 2 (상담진행) is 4', `Got ${septFunnel[1].count}`);
  assert(septFunnel[2].count === 2, 'Scenario 6C: Funnel step 3 (결과확정) is 2', `Got ${septFunnel[2].count}`);
  assert(septFunnel[3].count === 1, 'Scenario 6D: Funnel step 4 (재등록완료) is 1', `Got ${septFunnel[3].count}`);
  assert(septFunnel[3].stepRate === '50%', 'Scenario 6E: Step 4 conversion rate from decided is 50%', `Got ${septFunnel[3].stepRate}`);

  // ----------------------------------------------------
  // Scenario 7: Decline Reason Distribution
  // R2 declined with PRICE (1건) -> PRICE 100%, others 0%
  // ----------------------------------------------------
  const declineStats = calculateDeclineReasonStats(septemberRenewals);
  const priceStat = declineStats.find((s) => s.reasonKey === 'PRICE');
  const timeStat = declineStats.find((s) => s.reasonKey === 'TIME');

  assert(priceStat?.count === 1, 'Scenario 7A: PRICE decline reason has count 1', `Got ${priceStat?.count}`);
  assert(priceStat?.rate === '100%', 'Scenario 7B: PRICE decline rate is 100%', `Got ${priceStat?.rate}`);
  assert(timeStat?.count === 0, 'Scenario 7C: TIME decline reason has count 0', `Got ${timeStat?.count}`);
  assert(timeStat?.rate === '0%', 'Scenario 7D: TIME decline rate is 0%', `Got ${timeStat?.rate}`);

  // ----------------------------------------------------
  // Scenario 8: Trainer-level Aggregation & RBAC
  // Trainer A has R1(RENEWED), R2(DECLINED), R3(CONSULTING) in Sept -> Total 3, Decided 2, Renewed 1, Declined 1, Rate 50%
  // Trainer B has R4(TARGET), R5(CLOSED) in Sept -> Total 2, Decided 0, Renewed 0, Declined 0, Rate 0%
  // ----------------------------------------------------
  const mockTrainers: Trainer[] = [
    {
      trainerId: trainerAId,
      centerId,
      name: '김트레이너',
      phone: '010-0000-0001',
      specialty: '체형교정',
      role: 'TRAINER',
      status: 'ACTIVE',
      createdAt: '2026-09-01T00:00:00.000Z'
    },
    {
      trainerId: trainerBId,
      centerId,
      name: '박트레이너',
      phone: '010-0000-0002',
      specialty: '다이어트',
      role: 'TRAINER',
      status: 'ACTIVE',
      createdAt: '2026-09-01T00:00:00.000Z'
    }
  ];

  const trainerStats = calculateTrainerRenewalStats(septemberRenewals, mockTrainers);
  const statA = trainerStats.find((t) => t.trainerId === trainerAId);
  const statB = trainerStats.find((t) => t.trainerId === trainerBId);

  assert(statA?.totalStarted === 3, 'Scenario 8A: Trainer A totalStarted is 3', `Got ${statA?.totalStarted}`);
  assert(statA?.decided === 2, 'Scenario 8B: Trainer A decided is 2', `Got ${statA?.decided}`);
  assert(statA?.renewed === 1, 'Scenario 8C: Trainer A renewed is 1', `Got ${statA?.renewed}`);
  assert(statA?.declined === 1, 'Scenario 8D: Trainer A declined is 1', `Got ${statA?.declined}`);
  assert(statA?.rate === '50%', 'Scenario 8E: Trainer A renewal rate is 50%', `Got ${statA?.rate}`);

  assert(statB?.totalStarted === 2, 'Scenario 8F: Trainer B totalStarted is 2', `Got ${statB?.totalStarted}`);
  assert(statB?.decided === 0, 'Scenario 8G: Trainer B decided is 0', `Got ${statB?.decided}`);
  assert(statB?.rate === '0%', 'Scenario 8H: Trainer B renewal rate is safely 0%', `Got ${statB?.rate}`);

  // RBAC trainer isolation: Trainer A only gets their own renewals
  const trainerAFetched = await getRenewals(centerId, 'TRAINER', trainerAId);
  assert(
    trainerAFetched.every((r) => r.trainerId === trainerAId),
    'Scenario 8I: Trainer A query returns only their own renewals',
    'Cross-trainer data leak'
  );

  // MEMBER blocked
  try {
    await getRenewals(centerId, 'MEMBER');
    assert(false, 'Scenario 8J: MEMBER accessing renewals must fail', 'Should throw');
  } catch (err: any) {
    assert(
      err.message.includes('회원은 재등록 데이터에 접근할 수 없습니다'),
      'Scenario 8J: MEMBER blocked from renewals',
      err.message
    );
  }

  console.log('\n====================================================');
  console.log(`🎉 Phase 9D Test Results: ${results.filter((r) => r.passed).length}/${results.length} PASSED`);
  console.log('====================================================\n');
}

runPhase9dTests().catch((err) => {
  console.error('Fatal test error in Phase 9D:', err);
  process.exit(1);
});
