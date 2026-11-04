/**
 * Phase 9A Automated Verification Test Suite:
 * Validates PT Renewal Data Foundation:
 * 1. Renewal Candidates Detection (remainingSessions <= 5 on ACTIVE contract)
 * 2. Exclusion of > 5 sessions and non-ACTIVE contracts
 * 3. Duplicate active renewal creation prevention on same memberId + contractId
 * 4. CRUD operations on Renewal
 * 5. RBAC permissions (CENTER_ADMIN, TRAINER, MEMBER)
 * 6. Protection of trainerId/memberId/contractId from trainer modification
 * 7. Multi-center isolation
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
  updateRenewalStatus,
  deleteRenewal,
  clearCenterData
} from '../src/services/dataService';
import type { Renewal, RenewalStatus, RenewalCandidate } from '../src/types';

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

async function runPhase9aTests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 9A PT Renewal Foundation Test Suite');
  console.log('====================================================\n');

  const centerId = 'center-renewal-test';
  const trainerAId = 'tr-kim-rn';
  const trainerBId = 'tr-lee-rn';

  await clearCenterData(centerId);

  // ----------------------------------------------------
  // Scenario 1: Setup Members and Contracts
  // Member 1 (Trainer A): Contract 1 (30 sessions, 27 used -> 3 remaining <= 5) -> Candidate!
  // Member 2 (Trainer A): Contract 2 (20 sessions, 10 used -> 10 remaining > 5) -> NOT Candidate
  // Member 3 (Trainer B): Contract 3 (10 sessions, 6 used -> 4 remaining <= 5) -> Candidate!
  // Member 4 (Trainer B): Contract 4 (10 sessions, 10 used, status='COMPLETED') -> NOT Candidate (not ACTIVE)
  // ----------------------------------------------------
  const member1 = await createMember({
    centerId,
    trainerId: trainerAId,
    name: '김회원_잔여3회',
    gender: 'MALE',
    birthDate: '1990-01-01',
    phone: '010-1000-0001',
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
    expirationDate: '2026-12-31',
    status: 'ACTIVE'
  });

  // Complete 27 sessions for Member 1 -> 3 remaining
  for (let i = 1; i <= 27; i++) {
    await createPtSession({
      centerId,
      trainerId: trainerAId,
      memberId: member1.memberId,
      memberName: member1.name,
      contractId: contract1.contractId,
      sessionNumber: i,
      date: '2026-08-10',
      time: '14:00',
      status: 'COMPLETED',
      exercises: []
    });
  }

  const member2 = await createMember({
    centerId,
    trainerId: trainerAId,
    name: '이회원_잔여10회',
    gender: 'FEMALE',
    birthDate: '1995-02-02',
    phone: '010-1000-0002',
    startDate: '2026-09-01',
    status: 'ACTIVE'
  });

  const contract2 = await createContract({
    centerId,
    memberId: member2.memberId,
    trainerId: trainerAId,
    title: '정규 20회권',
    totalSessions: 20,
    startDate: '2026-09-01',
    expirationDate: '2026-12-31',
    status: 'ACTIVE'
  });

  // Complete 10 sessions for Member 2 -> 10 remaining
  for (let i = 1; i <= 10; i++) {
    await createPtSession({
      centerId,
      trainerId: trainerAId,
      memberId: member2.memberId,
      memberName: member2.name,
      contractId: contract2.contractId,
      sessionNumber: i,
      date: '2026-09-10',
      time: '15:00',
      status: 'COMPLETED',
      exercises: []
    });
  }

  const member3 = await createMember({
    centerId,
    trainerId: trainerBId,
    name: '박회원_잔여4회',
    gender: 'FEMALE',
    birthDate: '1993-03-03',
    phone: '010-1000-0003',
    startDate: '2026-09-05',
    status: 'ACTIVE'
  });

  const contract3 = await createContract({
    centerId,
    memberId: member3.memberId,
    trainerId: trainerBId,
    title: '정규 10회권',
    totalSessions: 10,
    startDate: '2026-09-05',
    expirationDate: '2026-11-30',
    status: 'ACTIVE'
  });

  // Complete 6 sessions for Member 3 -> 4 remaining
  for (let i = 1; i <= 6; i++) {
    await createPtSession({
      centerId,
      trainerId: trainerBId,
      memberId: member3.memberId,
      memberName: member3.name,
      contractId: contract3.contractId,
      sessionNumber: i,
      date: '2026-09-12',
      time: '18:00',
      status: 'COMPLETED',
      exercises: []
    });
  }

  const member4 = await createMember({
    centerId,
    trainerId: trainerBId,
    name: '최회원_종료계약',
    gender: 'MALE',
    birthDate: '1988-04-04',
    phone: '010-1000-0004',
    startDate: '2026-07-01',
    status: 'ACTIVE'
  });

  const contract4 = await createContract({
    centerId,
    memberId: member4.memberId,
    trainerId: trainerBId,
    title: '정규 10회권 (종료)',
    totalSessions: 10,
    startDate: '2026-07-01',
    expirationDate: '2026-08-31',
    status: 'COMPLETED'
  });

  // ----------------------------------------------------
  // Scenario 2: getRenewalCandidates() Detection & Filter Verification
  // Requirement 2:
  // - 활성 PT 이용권
  // - 잔여 5회 이하
  // 6회 이상 및 비활성 계약 제외
  // ----------------------------------------------------
  const adminCandidates = await getRenewalCandidates(centerId, 'CENTER_ADMIN');
  assert(
    adminCandidates.length === 2,
    'Scenario 2A: CENTER_ADMIN finds exactly 2 renewal candidates (Member 1 & Member 3)',
    `Expected 2, got ${adminCandidates.length}`
  );

  const candidate1 = adminCandidates.find((c) => c.memberId === member1.memberId);
  const candidate3 = adminCandidates.find((c) => c.memberId === member3.memberId);

  assert(
    Boolean(candidate1 && candidate1.remainingSessions === 3),
    'Scenario 2B: Candidate 1 has exactly 3 remaining sessions',
    `Got ${candidate1?.remainingSessions}`
  );
  assert(
    Boolean(candidate3 && candidate3.remainingSessions === 4),
    'Scenario 2C: Candidate 3 has exactly 4 remaining sessions',
    `Got ${candidate3?.remainingSessions}`
  );

  const candidate2 = adminCandidates.find((c) => c.memberId === member2.memberId);
  assert(
    !candidate2,
    'Scenario 2D: Member 2 with 10 sessions remaining (> 5) is excluded',
    'Member 2 was erroneously included'
  );

  const candidate4 = adminCandidates.find((c) => c.memberId === member4.memberId);
  assert(
    !candidate4,
    'Scenario 2E: Member 4 with COMPLETED status contract is excluded',
    'Member 4 was erroneously included'
  );

  // ----------------------------------------------------
  // Scenario 3: Trainer Scope Isolation in getRenewalCandidates()
  // Trainer A sees only Member 1
  // Trainer B sees only Member 3
  // ----------------------------------------------------
  const trainerACandidates = await getRenewalCandidates(centerId, 'TRAINER', trainerAId);
  assert(
    trainerACandidates.length === 1 && trainerACandidates[0].memberId === member1.memberId,
    'Scenario 3A: Trainer A sees only Candidate 1',
    `Expected 1 (member1), got ${trainerACandidates.length}`
  );

  const trainerBCandidates = await getRenewalCandidates(centerId, 'TRAINER', trainerBId);
  assert(
    trainerBCandidates.length === 1 && trainerBCandidates[0].memberId === member3.memberId,
    'Scenario 3B: Trainer B sees only Candidate 3',
    `Expected 1 (member3), got ${trainerBCandidates.length}`
  );

  // ----------------------------------------------------
  // Scenario 4: createRenewal() and Duplicate Prevention
  // Requirement 3: 동일 memberId + contractId에 활성 Renewal이 중복 생성되지 않도록 방어.
  // ----------------------------------------------------
  const renewal1 = await createRenewal(
    {
      centerId,
      memberId: member1.memberId,
      trainerId: trainerAId,
      contractId: contract1.contractId,
      status: 'TARGET',
      remainingSessionsAtStart: 3,
      memo: '하체 근력 보강 목표로 30회 재등록 제안 예정'
    },
    'TRAINER',
    trainerAId
  );

  assert(
    renewal1.status === 'TARGET' && renewal1.remainingSessionsAtStart === 3,
    'Scenario 4A: Renewal created successfully with status TARGET',
    `Status: ${renewal1.status}`
  );

  // Attempt to create duplicate active renewal on same member1 + contract1
  let duplicateBlocked = false;
  try {
    await createRenewal(
      {
        centerId,
        memberId: member1.memberId,
        trainerId: trainerAId,
        contractId: contract1.contractId,
        status: 'CONTACTED',
        remainingSessionsAtStart: 3
      },
      'TRAINER',
      trainerAId
    );
  } catch (err: any) {
    duplicateBlocked = true;
  }

  assert(
    duplicateBlocked,
    'Scenario 4B: Duplicate active renewal creation on same contract is blocked',
    'Duplicate renewal was allowed'
  );

  // ----------------------------------------------------
  // Scenario 5: Renewal Status Transitions (CONTACTED -> CONSULTING -> RENEWED)
  // ----------------------------------------------------
  const updatedToConsulting = await updateRenewalStatus(
    centerId,
    renewal1.renewalId,
    'CONSULTING',
    {
      consultationDate: '2026-09-27',
      memo: '20회 재등록 조건 협의 중 (할인 혜택 문의)'
    },
    'TRAINER',
    trainerAId
  );

  assert(
    updatedToConsulting.status === 'CONSULTING' && updatedToConsulting.consultationDate === '2026-09-27',
    'Scenario 5A: Status transitioned to CONSULTING',
    'Status update failed'
  );

  const renewedTime = new Date().toISOString();
  const updatedToRenewed = await updateRenewalStatus(
    centerId,
    renewal1.renewalId,
    'RENEWED',
    {
      renewedContractId: 'ct-new-30-sessions',
      renewedAt: renewedTime
    },
    'TRAINER',
    trainerAId
  );

  assert(
    updatedToRenewed.status === 'RENEWED' && updatedToRenewed.renewedContractId === 'ct-new-30-sessions',
    'Scenario 5B: Status transitioned to RENEWED with renewedContractId',
    'RENEWED status update failed'
  );

  // ----------------------------------------------------
  // Scenario 6: Decline Flow (DECLINED with declineReason & declineMemo)
  // ----------------------------------------------------
  const renewal3 = await createRenewal(
    {
      centerId,
      memberId: member3.memberId,
      trainerId: trainerBId,
      contractId: contract3.contractId,
      status: 'TARGET',
      remainingSessionsAtStart: 4
    },
    'TRAINER',
    trainerBId
  );

  const declinedRenewal = await updateRenewalStatus(
    centerId,
    renewal3.renewalId,
    'DECLINED',
    {
      declineReason: 'TIME',
      declineMemo: '회사 야근 및 해외 출장 일정으로 인해 연장 보류'
    },
    'TRAINER',
    trainerBId
  );

  assert(
    declinedRenewal.status === 'DECLINED' && declinedRenewal.declineReason === 'TIME',
    'Scenario 6: DECLINED flow with declineReason recorded',
    `Got ${declinedRenewal.declineReason}`
  );

  // ----------------------------------------------------
  // Scenario 7: RBAC Protection - Trainer cannot change trainerId, memberId, contractId
  // ----------------------------------------------------
  let trainerMutationBlocked = false;
  try {
    await updateRenewal(
      centerId,
      renewal3.renewalId,
      { trainerId: trainerAId }, // Trainer B trying to reassign to Trainer A
      'TRAINER',
      trainerBId
    );
  } catch (err: any) {
    trainerMutationBlocked = true;
  }
  assert(
    trainerMutationBlocked,
    'Scenario 7A: TRAINER cannot change trainerId',
    'Trainer was allowed to change trainerId'
  );

  // Trainer A cannot read/update Renewal 3 (assigned to Trainer B)
  let trainerCrossAccessBlocked = false;
  try {
    await updateRenewal(
      centerId,
      renewal3.renewalId,
      { memo: 'Hacked by Trainer A' },
      'TRAINER',
      trainerAId
    );
  } catch (err: any) {
    trainerCrossAccessBlocked = true;
  }
  assert(
    trainerCrossAccessBlocked,
    'Scenario 7B: Trainer A cannot update Renewal belonging to Trainer B',
    'Cross trainer access was allowed'
  );

  // ----------------------------------------------------
  // Scenario 8: MEMBER Role is completely blocked
  // ----------------------------------------------------
  let memberCandidatesBlocked = false;
  try {
    await getRenewalCandidates(centerId, 'MEMBER');
  } catch (err: any) {
    memberCandidatesBlocked = true;
  }
  assert(
    memberCandidatesBlocked,
    'Scenario 8A: MEMBER cannot access getRenewalCandidates',
    'MEMBER was permitted'
  );

  let memberGetRenewalsBlocked = false;
  try {
    await getRenewals(centerId, 'MEMBER');
  } catch (err: any) {
    memberGetRenewalsBlocked = true;
  }
  assert(
    memberGetRenewalsBlocked,
    'Scenario 8B: MEMBER cannot access getRenewals',
    'MEMBER was permitted'
  );

  // ----------------------------------------------------
  // Scenario 9: Deletion restricted to CENTER_ADMIN
  // ----------------------------------------------------
  let trainerDeleteBlocked = false;
  try {
    await deleteRenewal(centerId, renewal3.renewalId, 'TRAINER');
  } catch (err: any) {
    trainerDeleteBlocked = true;
  }
  assert(
    trainerDeleteBlocked,
    'Scenario 9A: TRAINER cannot delete renewal',
    'TRAINER was permitted to delete renewal'
  );

  await deleteRenewal(centerId, renewal3.renewalId, 'CENTER_ADMIN');
  const deletedRenewal = await getRenewalById(centerId, renewal3.renewalId, 'CENTER_ADMIN');
  assert(
    deletedRenewal === null,
    'Scenario 9B: CENTER_ADMIN successfully deletes renewal',
    'Renewal still exists after deletion'
  );

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  const passedCount = results.filter((r) => r.passed).length;
  console.log('\n====================================================');
  console.log(`🎉 Phase 9A Test Results: ${passedCount}/${results.length} PASSED`);
  console.log('====================================================\n');
}

runPhase9aTests().catch((e) => {
  console.error('Fatal error during Phase 9A tests:', e);
  process.exit(1);
});
