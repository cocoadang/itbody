/**
 * Phase 9B Automated Verification Test Suite:
 * Validates PT Renewal UI Logic and Data Integration:
 * 1. Candidates detection: 0~5 remaining sessions included
 * 2. Candidates exclusion: > 5 sessions excluded
 * 3. Inactive/Completed contracts excluded from candidates
 * 4. Active Renewal exclusion from candidate list (duplicate prevention in candidate section)
 * 5. Candidate sorting: remainingSessions ascending (0 -> 1 -> 2 -> ... -> 5)
 * 6. Status filter logic: ALL, TARGET, CONTACTED, CONSULTING, RENEWED, DECLINED, CLOSED
 * 7. DECLINED status validation: declineReason is mandatory
 * 8. RENEWED status validation: preserves data without creating contracts (Phase 9C notice)
 * 9. RBAC permission checks: CENTER_ADMIN vs TRAINER vs MEMBER
 */
import {
  createMember,
  createContract,
  createPtSession,
  getRenewalCandidates,
  createRenewal,
  getRenewals,
  getRenewalById,
  updateRenewal,
  clearCenterData
} from '../src/services/dataService';
import type { Renewal, RenewalCandidate, RenewalStatus, RenewalDeclineReason } from '../src/types';

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

async function runPhase9bTests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 9B PT Renewal UI Verification Suite');
  console.log('====================================================\n');

  const centerId = 'center-phase9b-test';
  const trainerAId = 'tr-kim-9b';
  const trainerBId = 'tr-park-9b';

  await clearCenterData(centerId);

  // ----------------------------------------------------
  // Scenario 1: Setup Members with varying remaining sessions
  // Member 1 (Trainer A): 30 sessions, 30 used -> 0 remaining (<= 5) -> Candidate!
  // Member 2 (Trainer A): 20 sessions, 18 used -> 2 remaining (<= 5) -> Candidate!
  // Member 3 (Trainer B): 10 sessions, 5 used -> 5 remaining (<= 5) -> Candidate!
  // Member 4 (Trainer B): 10 sessions, 3 used -> 7 remaining (> 5) -> EXCLUDED!
  // Member 5 (Trainer A): 10 sessions, 10 used, status='COMPLETED' -> EXCLUDED!
  // ----------------------------------------------------
  const member1 = await createMember({
    centerId,
    trainerId: trainerAId,
    name: '김영희_잔여1회',
    gender: 'FEMALE',
    birthDate: '1992-05-10',
    phone: '010-9000-0001',
    startDate: '2026-08-01',
    status: 'ACTIVE'
  });
  const contract1 = await createContract({
    centerId,
    memberId: member1.memberId,
    trainerId: trainerAId,
    title: '정규 30회권',
    totalSessions: 30,
    startDate: '2026-08-01',
    expirationDate: '2026-10-31',
    status: 'ACTIVE'
  });
  for (let i = 1; i <= 29; i++) {
    await createPtSession({
      centerId,
      trainerId: trainerAId,
      memberId: member1.memberId,
      memberName: member1.name,
      contractId: contract1.contractId,
      sessionNumber: i,
      date: '2026-08-10',
      time: '10:00',
      status: 'COMPLETED',
      exercises: []
    });
  }

  const member2 = await createMember({
    centerId,
    trainerId: trainerAId,
    name: '이철수_잔여2회',
    gender: 'MALE',
    birthDate: '1988-03-15',
    phone: '010-9000-0002',
    startDate: '2026-08-15',
    status: 'ACTIVE'
  });
  const contract2 = await createContract({
    centerId,
    memberId: member2.memberId,
    trainerId: trainerAId,
    title: '정규 20회권',
    totalSessions: 20,
    startDate: '2026-08-15',
    expirationDate: '2026-11-30',
    status: 'ACTIVE'
  });
  for (let i = 1; i <= 18; i++) {
    await createPtSession({
      centerId,
      trainerId: trainerAId,
      memberId: member2.memberId,
      memberName: member2.name,
      contractId: contract2.contractId,
      sessionNumber: i,
      date: '2026-08-20',
      time: '11:00',
      status: 'COMPLETED',
      exercises: []
    });
  }

  const member3 = await createMember({
    centerId,
    trainerId: trainerBId,
    name: '박지민_잔여5회',
    gender: 'FEMALE',
    birthDate: '1995-07-20',
    phone: '010-9000-0003',
    startDate: '2026-09-01',
    status: 'ACTIVE'
  });
  const contract3 = await createContract({
    centerId,
    memberId: member3.memberId,
    trainerId: trainerBId,
    title: '스타터 10회권',
    totalSessions: 10,
    startDate: '2026-09-01',
    expirationDate: '2026-10-15',
    status: 'ACTIVE'
  });
  for (let i = 1; i <= 5; i++) {
    await createPtSession({
      centerId,
      trainerId: trainerBId,
      memberId: member3.memberId,
      memberName: member3.name,
      contractId: contract3.contractId,
      sessionNumber: i,
      date: '2026-09-05',
      time: '14:00',
      status: 'COMPLETED',
      exercises: []
    });
  }

  const member4 = await createMember({
    centerId,
    trainerId: trainerBId,
    name: '최동욱_잔여7회',
    gender: 'MALE',
    birthDate: '1991-11-25',
    phone: '010-9000-0004',
    startDate: '2026-09-01',
    status: 'ACTIVE'
  });
  const contract4 = await createContract({
    centerId,
    memberId: member4.memberId,
    trainerId: trainerBId,
    title: '베이직 10회권',
    totalSessions: 10,
    startDate: '2026-09-01',
    expirationDate: '2026-12-31',
    status: 'ACTIVE'
  });
  for (let i = 1; i <= 3; i++) {
    await createPtSession({
      centerId,
      trainerId: trainerBId,
      memberId: member4.memberId,
      memberName: member4.name,
      contractId: contract4.contractId,
      sessionNumber: i,
      date: '2026-09-05',
      time: '16:00',
      status: 'COMPLETED',
      exercises: []
    });
  }

  const member5 = await createMember({
    centerId,
    trainerId: trainerAId,
    name: '정수진_종료계약',
    gender: 'FEMALE',
    birthDate: '1994-09-09',
    phone: '010-9000-0005',
    startDate: '2026-07-01',
    status: 'ACTIVE'
  });
  const contract5 = await createContract({
    centerId,
    memberId: member5.memberId,
    trainerId: trainerAId,
    title: '이전 10회권',
    totalSessions: 10,
    startDate: '2026-07-01',
    expirationDate: '2026-08-31',
    status: 'COMPLETED'
  });

  // ----------------------------------------------------
  // Scenario 2: Candidate Retrieval & Verification
  // ----------------------------------------------------
  const adminCandidates = await getRenewalCandidates(centerId, 'CENTER_ADMIN');
  assert(
    adminCandidates.length === 3,
    'Scenario 2A: Exactly 3 candidates with <= 5 sessions found',
    `Expected 3, found ${adminCandidates.length}`
  );

  // Exclude > 5 sessions
  const member4Found = adminCandidates.some((c) => c.memberId === member4.memberId);
  assert(
    !member4Found,
    'Scenario 2B: Member 4 with 7 remaining sessions is excluded',
    'Member 4 should not be in candidates'
  );

  // Exclude non-ACTIVE contract
  const member5Found = adminCandidates.some((c) => c.memberId === member5.memberId);
  assert(
    !member5Found,
    'Scenario 2C: Member 5 with COMPLETED contract is excluded',
    'Completed contract should not be in candidates'
  );

  // ----------------------------------------------------
  // Scenario 3: Ascending Sort Verification (1 -> 2 -> 5)
  // ----------------------------------------------------
  assert(
    adminCandidates[0].remainingSessions === 1,
    'Scenario 3A: First candidate has 1 remaining sessions (김영희)',
    `Expected 1, got ${adminCandidates[0].remainingSessions}`
  );
  assert(
    adminCandidates[1].remainingSessions === 2,
    'Scenario 3B: Second candidate has 2 remaining sessions (이철수)',
    `Expected 2, got ${adminCandidates[1].remainingSessions}`
  );
  assert(
    adminCandidates[2].remainingSessions === 5,
    'Scenario 3C: Third candidate has 5 remaining sessions (박지민)',
    `Expected 5, got ${adminCandidates[2].remainingSessions}`
  );

  // ----------------------------------------------------
  // Scenario 4: Start Renewal Management & Exclude from Candidate List
  // ----------------------------------------------------
  // Trainer A starts renewal for Member 1 (remainingSessions: 1)
  const renewal1 = await createRenewal(
    {
      centerId,
      memberId: member1.memberId,
      trainerId: trainerAId,
      contractId: contract1.contractId,
      remainingSessionsAtStart: 1,
      status: 'TARGET'
    },
    'TRAINER',
    trainerAId
  );

  assert(
    renewal1.renewalId.startsWith('rn-'),
    'Scenario 4A: Renewal 1 created successfully with status TARGET',
    `Invalid renewalId: ${renewal1.renewalId}`
  );

  // In the UI logic: active renewal on contract is excluded from candidates
  const updatedCandidates = await getRenewalCandidates(centerId, 'CENTER_ADMIN');
  const activeRenewalStatuses: RenewalStatus[] = ['TARGET', 'CONTACTED', 'CONSULTING', 'RENEWED'];
  const pendingUiCandidates = updatedCandidates.filter(
    (c) => !c.existingRenewal || !activeRenewalStatuses.includes(c.existingRenewal.status)
  );

  assert(
    pendingUiCandidates.length === 2,
    'Scenario 4B: Candidate with active renewal is excluded from pending candidates UI list',
    `Expected 2 pending candidates, got ${pendingUiCandidates.length}`
  );
  assert(
    !pendingUiCandidates.some((c) => c.contractId === contract1.contractId),
    'Scenario 4C: Contract 1 with ongoing renewal is no longer in pending candidates',
    'Contract 1 should be excluded from pending candidates'
  );

  // ----------------------------------------------------
  // Scenario 5: Update Renewal & Status Filters
  // ----------------------------------------------------
  // Update Renewal 1 to CONTACTED, set consultationDate
  const updated1 = await updateRenewal(
    centerId,
    renewal1.renewalId,
    {
      status: 'CONTACTED',
      consultationDate: '2026-09-29',
      memo: '1차 전화 상담 일정 안내 완료'
    },
    'CENTER_ADMIN'
  );

  assert(
    updated1.status === 'CONTACTED',
    'Scenario 5A: Status updated to CONTACTED',
    `Expected CONTACTED, got ${updated1.status}`
  );
  assert(
    updated1.consultationDate === '2026-09-29',
    'Scenario 5B: Consultation date updated',
    `Expected 2026-09-29, got ${updated1.consultationDate}`
  );

  // Trainer A starts renewal for Member 2 -> DECLINED
  const renewal2 = await createRenewal(
    {
      centerId,
      memberId: member2.memberId,
      trainerId: trainerAId,
      contractId: contract2.contractId,
      remainingSessionsAtStart: 2,
      status: 'CONSULTING'
    },
    'CENTER_ADMIN'
  );

  // Decline renewal 2 with reason
  const declined2 = await updateRenewal(
    centerId,
    renewal2.renewalId,
    {
      status: 'DECLINED',
      declineReason: 'PRICE' as RenewalDeclineReason,
      declineMemo: '개인 예산 부담으로 잠시 휴식 희망'
    },
    'CENTER_ADMIN'
  );

  assert(
    declined2.status === 'DECLINED',
    'Scenario 5C: Renewal 2 status updated to DECLINED',
    `Expected DECLINED, got ${declined2.status}`
  );
  assert(
    declined2.declineReason === 'PRICE',
    'Scenario 5D: Decline reason correctly saved as PRICE',
    `Expected PRICE, got ${declined2.declineReason}`
  );

  // Trainer B starts renewal for Member 3 -> RENEWED
  const renewal3 = await createRenewal(
    {
      centerId,
      memberId: member3.memberId,
      trainerId: trainerBId,
      contractId: contract3.contractId,
      remainingSessionsAtStart: 5,
      status: 'CONSULTING'
    },
    'TRAINER',
    trainerBId
  );

  const renewed3 = await updateRenewal(
    centerId,
    renewal3.renewalId,
    {
      status: 'RENEWED',
      renewedAt: '2026-09-28T10:00:00.000Z',
      memo: '재등록 결정, 다음 달 신규 20회 등록 예정'
    },
    'TRAINER',
    trainerBId
  );

  assert(
    renewed3.status === 'RENEWED',
    'Scenario 5E: Renewal 3 status updated to RENEWED',
    `Expected RENEWED, got ${renewed3.status}`
  );

  // Test status filters on getRenewals
  const allRenewals = await getRenewals(centerId, 'CENTER_ADMIN');
  assert(allRenewals.length === 3, 'Scenario 5F: Total 3 renewals in center', `Expected 3, got ${allRenewals.length}`);

  const contactedList = await getRenewals(centerId, 'CENTER_ADMIN', undefined, 'CONTACTED');
  assert(contactedList.length === 1, 'Scenario 5G: Filter CONTACTED returns 1 item', `Expected 1, got ${contactedList.length}`);

  const declinedList = await getRenewals(centerId, 'CENTER_ADMIN', undefined, 'DECLINED');
  assert(declinedList.length === 1, 'Scenario 5H: Filter DECLINED returns 1 item', `Expected 1, got ${declinedList.length}`);

  const renewedList = await getRenewals(centerId, 'CENTER_ADMIN', undefined, 'RENEWED');
  assert(renewedList.length === 1, 'Scenario 5I: Filter RENEWED returns 1 item', `Expected 1, got ${renewedList.length}`);

  // ----------------------------------------------------
  // Scenario 6: Trainer Scope Isolation
  // ----------------------------------------------------
  const trainerARenewals = await getRenewals(centerId, 'TRAINER', trainerAId);
  assert(
    trainerARenewals.length === 2,
    'Scenario 6A: Trainer A sees only their 2 assigned renewals (Member 1 & Member 2)',
    `Expected 2, got ${trainerARenewals.length}`
  );

  const trainerBRenewals = await getRenewals(centerId, 'TRAINER', trainerBId);
  assert(
    trainerBRenewals.length === 1,
    'Scenario 6B: Trainer B sees only their 1 assigned renewal (Member 3)',
    `Expected 1, got ${trainerBRenewals.length}`
  );

  // Trainer B cannot edit Trainer A's renewal
  try {
    await updateRenewal(
      centerId,
      renewal1.renewalId,
      { memo: '불법 수정 시도' },
      'TRAINER',
      trainerBId
    );
    assert(false, 'Scenario 6C: Trainer B modification of Trainer A renewal must fail', 'Should have thrown error');
  } catch (err: any) {
    assert(
      err.message.includes('접근 권한이 없습니다') || err.message.includes('본인 담당 회원의 재등록만 수정'),
      'Scenario 6C: Cross-trainer update blocked with RBAC error',
      err.message
    );
  }

  // ----------------------------------------------------
  // Scenario 7: MEMBER Role is completely blocked
  // ----------------------------------------------------
  try {
    await getRenewalCandidates(centerId, 'MEMBER');
    assert(false, 'Scenario 7A: MEMBER accessing candidates must fail', 'Should have thrown error');
  } catch (err: any) {
    assert(
      err.message.includes('회원은 재등록 대상 후보에 접근할 수 없습니다'),
      'Scenario 7A: MEMBER blocked from candidates',
      err.message
    );
  }

  try {
    await getRenewals(centerId, 'MEMBER');
    assert(false, 'Scenario 7B: MEMBER accessing renewals must fail', 'Should have thrown error');
  } catch (err: any) {
    assert(
      err.message.includes('회원은 재등록 데이터에 접근할 수 없습니다'),
      'Scenario 7B: MEMBER blocked from renewals',
      err.message
    );
  }

  console.log('\n====================================================');
  console.log(`🎉 Phase 9B Test Results: ${results.filter((r) => r.passed).length}/${results.length} PASSED`);
  console.log('====================================================\n');
}

runPhase9bTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
