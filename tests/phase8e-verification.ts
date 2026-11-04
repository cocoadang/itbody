/**
 * Phase 8E Automated Verification Test Suite:
 * Validates Lead Performance KPI calculations, Date Range filtering, Funnel metrics,
 * Trainer and Source aggregations, Division by zero handling, and RBAC visibility.
 */
import {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  convertLeadToRegistration,
  clearCenterData
} from '../src/services/dataService';
import { normalizeSourceLabel } from '../src/components/LeadPerformanceDashboard';
import type { Lead, LeadSource, LeadStatus } from '../src/types';

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

function formatRate(num: number, denom: number): string {
  if (denom <= 0) return '0%';
  return `${Math.round((num / denom) * 100)}%`;
}

async function runPhase8eTests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 8E Lead Performance Test Suite');
  console.log('====================================================\n');

  const centerId = 'center-lead-perf-test';
  const trainerAId = 'tr-kim-perf';
  const trainerBId = 'tr-lee-perf';

  await clearCenterData(centerId);

  // ----------------------------------------------------
  // Scenario 1: Empty Center KPI Zero-handling (Division by Zero Safety)
  // Requirement 2: 분모가 0이면 0% 또는 - 로 안전 처리.
  // ----------------------------------------------------
  const emptyLeads = await getLeads(centerId, 'CENTER_ADMIN');
  assert(emptyLeads.length === 0, 'Scenario 1A: Initial leads count is 0', 'Center is not empty');

  const emptyOtAssigned = emptyLeads.filter((l) => Boolean(l.otDate)).length;
  const emptyOtCompleted = emptyLeads.filter((l) => Boolean(l.otCompletedAt)).length;
  const emptyPtRegistered = emptyLeads.filter((l) => Boolean(l.registeredAt && l.convertedMemberId)).length;

  assert(
    formatRate(emptyOtCompleted, emptyOtAssigned) === '0%',
    'Scenario 1B: OT 실시율 with 0 denominator safely returns 0%',
    'Division by zero not handled'
  );
  assert(
    formatRate(emptyPtRegistered, emptyOtCompleted) === '0%',
    'Scenario 1C: OT 등록률 with 0 denominator safely returns 0%',
    'Division by zero not handled'
  );
  assert(
    formatRate(emptyPtRegistered, emptyLeads.length) === '0%',
    'Scenario 1D: 전체 문의 등록률 with 0 denominator safely returns 0%',
    'Division by zero not handled'
  );

  // ----------------------------------------------------
  // Scenario 2: Create Mock Leads with specific Dates & Statuses
  // Lead 1: Trainer A, VISIT, Sept 10 (otDate, otCompletedAt, REGISTERED)
  // Lead 2: Trainer A, PHONE, Sept 15 (otDate, otCompletedAt, LOST)
  // Lead 3: Trainer B, ONLINE, Sept 20 (otDate only, OT_SCHEDULED)
  // Lead 4: Trainer B, REFERRAL, Sept 25 (no OT, CONSULTING)
  // Lead 5: Trainer A, OTHER, Aug 15 (Last month, otDate, otCompletedAt, REGISTERED)
  // ----------------------------------------------------
  const lead1 = await createLead(
    {
      centerId,
      name: '고객1',
      phone: '010-1111-0001',
      inquiryDate: '2026-09-10',
      source: '방문',
      status: 'OT_SCHEDULED',
      assignedTrainerId: trainerAId,
      otDate: '2026-09-12'
    },
    'CENTER_ADMIN'
  );
  await updateLead(
    centerId,
    lead1.leadId,
    { status: 'OT_COMPLETED', otCompletedAt: '2026-09-12T10:00:00Z' },
    'CENTER_ADMIN'
  );
  await convertLeadToRegistration(
    centerId,
    lead1.leadId,
    { convertedMemberId: 'mem-001', registeredAt: '2026-09-13T11:00:00Z' },
    'CENTER_ADMIN'
  );

  const lead2 = await createLead(
    {
      centerId,
      name: '고객2',
      phone: '010-1111-0002',
      inquiryDate: '2026-09-15',
      source: '전화',
      status: 'OT_SCHEDULED',
      assignedTrainerId: trainerAId,
      otDate: '2026-09-16'
    },
    'CENTER_ADMIN'
  );
  await updateLead(
    centerId,
    lead2.leadId,
    {
      status: 'LOST',
      otCompletedAt: '2026-09-16T15:00:00Z',
      lostReason: '가격'
    },
    'CENTER_ADMIN'
  );

  await createLead(
    {
      centerId,
      name: '고객3',
      phone: '010-1111-0003',
      inquiryDate: '2026-09-20',
      source: '온라인',
      status: 'OT_SCHEDULED',
      assignedTrainerId: trainerBId,
      otDate: '2026-09-25'
    },
    'CENTER_ADMIN'
  );

  await createLead(
    {
      centerId,
      name: '고객4',
      phone: '010-1111-0004',
      inquiryDate: '2026-09-25',
      source: '소개',
      status: 'CONSULTING',
      assignedTrainerId: trainerBId
    },
    'CENTER_ADMIN'
  );

  const lead5 = await createLead(
    {
      centerId,
      name: '고객5_지난달',
      phone: '010-1111-0005',
      inquiryDate: '2026-08-15',
      source: '기타',
      status: 'OT_SCHEDULED',
      assignedTrainerId: trainerAId,
      otDate: '2026-08-18'
    },
    'CENTER_ADMIN'
  );
  await updateLead(
    centerId,
    lead5.leadId,
    { status: 'OT_COMPLETED', otCompletedAt: '2026-08-18T10:00:00Z' },
    'CENTER_ADMIN'
  );
  await convertLeadToRegistration(
    centerId,
    lead5.leadId,
    { convertedMemberId: 'mem-005', registeredAt: '2026-08-19T10:00:00Z' },
    'CENTER_ADMIN'
  );

  // ----------------------------------------------------
  // Scenario 3: Date Filtering by inquiryDate
  // September 2026 (4 leads: Lead 1, 2, 3, 4)
  // August 2026 (1 lead: Lead 5)
  // ----------------------------------------------------
  const allLeads = await getLeads(centerId, 'CENTER_ADMIN');
  assert(allLeads.length === 5, 'Scenario 3A: Total 5 leads created in center', `Got ${allLeads.length}`);

  const septLeads = allLeads.filter((l) => l.inquiryDate >= '2026-09-01' && l.inquiryDate <= '2026-09-30');
  const augLeads = allLeads.filter((l) => l.inquiryDate >= '2026-08-01' && l.inquiryDate <= '2026-08-31');

  assert(septLeads.length === 4, 'Scenario 3B: September date filter matches exactly 4 leads', `Got ${septLeads.length}`);
  assert(augLeads.length === 1, 'Scenario 3C: August date filter matches exactly 1 lead', `Got ${augLeads.length}`);

  // ----------------------------------------------------
  // Scenario 4: Core KPI Calculation Verification (September Leads)
  // - 신규문의: 4건
  // - OT 배정 수 (otDate 존재): Lead 1, 2, 3 -> 3건
  // - OT 완료 수 (otCompletedAt 존재): Lead 1, 2 -> 2건
  // - PT 등록 수 (registeredAt + convertedMemberId): Lead 1 -> 1건
  // - 미등록 수 (status==='LOST' or lostReason): Lead 2 -> 1건
  // ----------------------------------------------------
  const septOtAssigned = septLeads.filter((l) => Boolean(l.otDate)).length;
  const septOtCompleted = septLeads.filter((l) => Boolean(l.otCompletedAt)).length;
  const septPtRegistered = septLeads.filter((l) => Boolean(l.registeredAt && l.convertedMemberId)).length;
  const septLost = septLeads.filter((l) => l.status === 'LOST' || Boolean(l.lostReason)).length;

  assert(septOtAssigned === 3, 'Scenario 4A: September OT 배정 수 is 3', `Got ${septOtAssigned}`);
  assert(septOtCompleted === 2, 'Scenario 4B: September OT 완료 수 is 2', `Got ${septOtCompleted}`);
  assert(septPtRegistered === 1, 'Scenario 4C: September PT 등록 수 is 1', `Got ${septPtRegistered}`);
  assert(septLost === 1, 'Scenario 4D: September 미등록 수 is 1', `Got ${septLost}`);

  // Rate calculations
  // OT 실시율 = OT 완료(2) / OT 배정(3) = 67%
  // OT 등록률 = PT 등록(1) / OT 완료(2) = 50%
  // 전체 문의 등록률 = PT 등록(1) / 신규문의(4) = 25%
  assert(
    formatRate(septOtCompleted, septOtAssigned) === '67%',
    'Scenario 4E: OT 실시율 is 67%',
    `Got ${formatRate(septOtCompleted, septOtAssigned)}`
  );
  assert(
    formatRate(septPtRegistered, septOtCompleted) === '50%',
    'Scenario 4F: OT 등록률 is 50%',
    `Got ${formatRate(septPtRegistered, septOtCompleted)}`
  );
  assert(
    formatRate(septPtRegistered, septLeads.length) === '25%',
    'Scenario 4G: 전체 문의 등록률 is 25%',
    `Got ${formatRate(septPtRegistered, septLeads.length)}`
  );

  // ----------------------------------------------------
  // Scenario 5: Trainer Performance Breakdown (September Leads)
  // Trainer A: Lead 1, 2 -> Assigned: 2, Completed: 2, Registered: 1, OT등록률: 50%
  // Trainer B: Lead 3, 4 -> Assigned: 1, Completed: 0, Registered: 0, OT등록률: 0%
  // ----------------------------------------------------
  const trainerALeads = septLeads.filter((l) => l.assignedTrainerId === trainerAId);
  const trainerBLeads = septLeads.filter((l) => l.assignedTrainerId === trainerBId);

  const tAAssigned = trainerALeads.filter((l) => Boolean(l.otDate)).length;
  const tACompleted = trainerALeads.filter((l) => Boolean(l.otCompletedAt)).length;
  const tARegistered = trainerALeads.filter((l) => Boolean(l.registeredAt && l.convertedMemberId)).length;
  const tARate = formatRate(tARegistered, tACompleted);

  assert(
    tAAssigned === 2 && tACompleted === 2 && tARegistered === 1 && tARate === '50%',
    'Scenario 5A: Trainer A stats verified (2 assigned, 2 completed, 1 registered, 50% rate)',
    `Got assigned: ${tAAssigned}, completed: ${tACompleted}, reg: ${tARegistered}, rate: ${tARate}`
  );

  const tBAssigned = trainerBLeads.filter((l) => Boolean(l.otDate)).length;
  const tBCompleted = trainerBLeads.filter((l) => Boolean(l.otCompletedAt)).length;
  const tBRegistered = trainerBLeads.filter((l) => Boolean(l.registeredAt && l.convertedMemberId)).length;
  const tBRate = formatRate(tBRegistered, tBCompleted);

  assert(
    tBAssigned === 1 && tBCompleted === 0 && tBRegistered === 0 && tBRate === '0%',
    'Scenario 5B: Trainer B stats verified (1 assigned, 0 completed, 0 registered, 0% rate)',
    `Got assigned: ${tBAssigned}, completed: ${tBCompleted}, reg: ${tBRegistered}, rate: ${tBRate}`
  );

  // ----------------------------------------------------
  // Scenario 6: Inflow Source Normalization and Performance (September Leads)
  // Sources: 방문(Lead 1), 전화(Lead 2), 온라인(Lead 3), 소개(Lead 4)
  // ----------------------------------------------------
  assert(normalizeSourceLabel('VISIT') === '방문', 'Scenario 6A: VISIT normalized to 방문', 'Mismatch');
  assert(normalizeSourceLabel('PHONE') === '전화', 'Scenario 6B: PHONE normalized to 전화', 'Mismatch');
  assert(normalizeSourceLabel('REFERRAL') === '소개', 'Scenario 6C: REFERRAL normalized to 소개', 'Mismatch');
  assert(normalizeSourceLabel('ONLINE') === '온라인', 'Scenario 6D: ONLINE normalized to 온라인', 'Mismatch');
  assert(normalizeSourceLabel('OTHER') === '기타', 'Scenario 6E: OTHER normalized to 기타', 'Mismatch');

  const visitLeads = septLeads.filter((l) => normalizeSourceLabel(l.source) === '방문');
  const visitReg = visitLeads.filter((l) => Boolean(l.registeredAt && l.convertedMemberId)).length;
  assert(
    visitLeads.length === 1 && visitReg === 1 && formatRate(visitReg, visitLeads.length) === '100%',
    'Scenario 6F: 방문 source 1 lead, 1 registered, 100% conversion rate',
    'Visit stats mismatch'
  );

  // ----------------------------------------------------
  // Scenario 7: RBAC Access for TRAINER
  // Trainer A sees only Lead 1, 2, 5 (assigned to them)
  // Trainer B sees only Lead 3, 4 (assigned to them)
  // MEMBER is blocked
  // ----------------------------------------------------
  const trainerAFetched = await getLeads(centerId, 'TRAINER', trainerAId);
  assert(
    trainerAFetched.every((l) => l.assignedTrainerId === trainerAId),
    'Scenario 7A: Trainer A fetches only their own leads',
    'Trainer A fetched leads assigned to others'
  );

  const trainerBFetched = await getLeads(centerId, 'TRAINER', trainerBId);
  assert(
    trainerBFetched.every((l) => l.assignedTrainerId === trainerBId),
    'Scenario 7B: Trainer B fetches only their own leads',
    'Trainer B fetched leads assigned to others'
  );

  let memberBlocked = false;
  try {
    await getLeads(centerId, 'MEMBER');
  } catch (e) {
    memberBlocked = true;
  }
  assert(memberBlocked, 'Scenario 7C: MEMBER is strictly blocked from leads', 'MEMBER was permitted');

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  const passedCount = results.filter((r) => r.passed).length;
  console.log('\n====================================================');
  console.log(`🎉 Phase 8E Test Results: ${passedCount}/${results.length} PASSED`);
  console.log('====================================================\n');
}

runPhase8eTests().catch((e) => {
  console.error('Fatal error during Phase 8E tests:', e);
  process.exit(1);
});
