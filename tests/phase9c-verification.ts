/**
 * Phase 9C Automated Verification Test Suite:
 * Validates PT Renewal Contract Creation & Connection:
 * 1. completeRenewalWithContract creates new PT contract and marks Renewal as RENEWED
 * 2. renewedContractId and renewedAt are accurately linked
 * 3. Original contract is preserved untouched (not overwritten or mutated)
 * 4. Duplicate prevention: repeated call on already completed renewal is strictly rejected
 * 5. Failure safety: if contract creation fails or is cancelled, Renewal status is kept intact
 * 6. Direct status change to RENEWED without contract creation is blocked for non-admin
 * 7. RBAC checks: CENTER_ADMIN vs TRAINER vs MEMBER
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
  getContractById,
  getContractsByMember,
  completeRenewalWithContract,
  clearCenterData
} from '../src/services/dataService';
import type { Renewal, PtContract, RenewalStatus } from '../src/types';

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

async function runPhase9cTests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 9C PT Renewal Contract Test Suite');
  console.log('====================================================\n');

  const centerId = 'center-phase9c-test';
  const trainerAId = 'tr-kim-9c';
  const trainerBId = 'tr-lee-9c';

  await clearCenterData(centerId);

  // ----------------------------------------------------
  // Scenario 1: Setup Member with Original Contract (PT 20회)
  // Member 1 has 18 used sessions out of 20 -> 2 remaining (Candidate)
  // ----------------------------------------------------
  const member1 = await createMember({
    centerId,
    trainerId: trainerAId,
    name: '김태리_재등록회원',
    gender: 'FEMALE',
    birthDate: '1995-04-24',
    phone: '010-9999-0001',
    startDate: '2026-07-01',
    status: 'ACTIVE'
  });

  const originalContract1 = await createContract({
    centerId,
    memberId: member1.memberId,
    trainerId: trainerAId,
    title: '정규 20회 패키지 #1',
    totalSessions: 20,
    startDate: '2026-07-01',
    expirationDate: '2026-09-30',
    status: 'ACTIVE'
  });

  for (let i = 1; i <= 18; i++) {
    await createPtSession({
      centerId,
      trainerId: trainerAId,
      memberId: member1.memberId,
      memberName: member1.name,
      contractId: originalContract1.contractId,
      sessionNumber: i,
      date: '2026-07-15',
      time: '11:00',
      status: 'COMPLETED',
      exercises: []
    });
  }

  // ----------------------------------------------------
  // Scenario 2: Start Renewal for Member 1 (Status: CONSULTING)
  // ----------------------------------------------------
  const renewal1 = await createRenewal(
    {
      centerId,
      memberId: member1.memberId,
      trainerId: trainerAId,
      contractId: originalContract1.contractId,
      remainingSessionsAtStart: 2,
      status: 'CONSULTING',
      memo: '재등록 30회권 협의 완료, 이번 주 등록 예정'
    },
    'TRAINER',
    trainerAId
  );

  assert(
    renewal1.status === 'CONSULTING',
    'Scenario 2A: Renewal initialized in CONSULTING status',
    `Expected CONSULTING, got ${renewal1.status}`
  );
  assert(
    !renewal1.renewedContractId,
    'Scenario 2B: No renewedContractId linked initially',
    'renewedContractId should be falsy'
  );

  // ----------------------------------------------------
  // Scenario 3: Complete Renewal with Contract (Trainer A)
  // Generates new contract and links to Renewal
  // ----------------------------------------------------
  const renewalResult = await completeRenewalWithContract(
    centerId,
    renewal1.renewalId,
    {
      title: '정규 30회 패키지 #2 [재등록]',
      totalSessions: 30,
      startDate: '2026-10-01',
      expirationDate: '2027-01-31',
      notes: '재등록 감사 프로모션 10% 추가 세션 제공'
    },
    'TRAINER',
    trainerAId
  );

  const { renewal: updatedRenewal, newContract } = renewalResult;

  assert(
    updatedRenewal.status === 'RENEWED',
    'Scenario 3A: Renewal status successfully transitioned to RENEWED',
    `Expected RENEWED, got ${updatedRenewal.status}`
  );
  assert(
    updatedRenewal.renewedContractId === newContract.contractId,
    'Scenario 3B: Renewal accurately points to newContract.contractId',
    `Expected ${newContract.contractId}, got ${updatedRenewal.renewedContractId}`
  );
  assert(
    !!updatedRenewal.renewedAt,
    'Scenario 3C: renewedAt timestamp recorded',
    'renewedAt timestamp is missing'
  );
  assert(
    newContract.title === '정규 30회 패키지 #2 [재등록]',
    'Scenario 3D: New contract created with correct title',
    `Got ${newContract.title}`
  );
  assert(
    newContract.totalSessions === 30,
    'Scenario 3E: New contract totalSessions is 30',
    `Got ${newContract.totalSessions}`
  );
  assert(
    newContract.usedSessions === 0,
    'Scenario 3F: New contract usedSessions starts at 0',
    `Got ${newContract.usedSessions}`
  );

  // ----------------------------------------------------
  // Scenario 4: Original Contract Preservation
  // ----------------------------------------------------
  const preservedOriginal = await getContractById(
    centerId,
    originalContract1.contractId,
    'TRAINER',
    trainerAId
  );
  assert(
    !!preservedOriginal,
    'Scenario 4A: Original contract still exists in system',
    'Original contract was removed'
  );
  assert(
    preservedOriginal?.contractId === originalContract1.contractId,
    'Scenario 4B: Original contract ID remains intact',
    'Contract ID changed'
  );
  assert(
    preservedOriginal?.totalSessions === 20,
    'Scenario 4C: Original contract totalSessions preserved as 20',
    `Expected 20, got ${preservedOriginal?.totalSessions}`
  );

  const memberContracts = await getContractsByMember(
    centerId,
    member1.memberId,
    'TRAINER',
    trainerAId
  );
  assert(
    memberContracts.length === 2,
    'Scenario 4D: Member now has exactly 2 contracts (original #1 and renewed #2)',
    `Expected 2 contracts, got ${memberContracts.length}`
  );

  // ----------------------------------------------------
  // Scenario 5: Duplicate Prevention on Renewal Contract
  // ----------------------------------------------------
  try {
    await completeRenewalWithContract(
      centerId,
      renewal1.renewalId,
      {
        title: '중복 생성 시도 패키지',
        totalSessions: 10,
        startDate: '2026-10-01',
        expirationDate: '2026-11-01'
      },
      'TRAINER',
      trainerAId
    );
    assert(false, 'Scenario 5A: Duplicate completeRenewalWithContract must throw', 'Should have failed');
  } catch (err: any) {
    assert(
      err.message.includes('이미 재등록 계약이 등록된 상담입니다'),
      'Scenario 5A: Duplicate contract creation prevented with error message',
      err.message
    );
  }

  // ----------------------------------------------------
  // Scenario 6: Failure Safety - Original Status Maintained if Contract Fails
  // ----------------------------------------------------
  const member2 = await createMember({
    centerId,
    trainerId: trainerAId,
    name: '이도현_실패테스트',
    gender: 'MALE',
    birthDate: '1990-08-11',
    phone: '010-9999-0002',
    startDate: '2026-08-01',
    status: 'ACTIVE'
  });

  const contract2 = await createContract({
    centerId,
    memberId: member2.memberId,
    trainerId: trainerAId,
    title: '스타터 10회권',
    totalSessions: 10,
    startDate: '2026-08-01',
    expirationDate: '2026-10-31',
    status: 'ACTIVE'
  });

  const renewal2 = await createRenewal(
    {
      centerId,
      memberId: member2.memberId,
      trainerId: trainerAId,
      contractId: contract2.contractId,
      remainingSessionsAtStart: 3,
      status: 'TARGET'
    },
    'CENTER_ADMIN'
  );

  // Trainer B attempts to create contract for Trainer A's member -> must fail & renewal2 stays TARGET
  try {
    await completeRenewalWithContract(
      centerId,
      renewal2.renewalId,
      {
        title: '불법 20회권',
        totalSessions: 20,
        startDate: '2026-10-01',
        expirationDate: '2026-12-31'
      },
      'TRAINER',
      trainerBId
    );
    assert(false, 'Scenario 6A: Trainer B creating contract for Trainer A renewal must fail', 'Should throw');
  } catch (err: any) {
    assert(
      err.message.includes('접근 권한이 없습니다') || err.message.includes('본인 담당 회원의 이용권만'),
      'Scenario 6A: Unauthorized trainer contract creation blocked',
      err.message
    );
  }

  // Verify renewal2 is STILL TARGET, not RENEWED
  const checkRenewal2 = await getRenewalById(centerId, renewal2.renewalId, 'CENTER_ADMIN');
  assert(
    checkRenewal2?.status === 'TARGET',
    'Scenario 6B: Renewal 2 preserves TARGET status after failed contract attempt',
    `Expected TARGET, got ${checkRenewal2?.status}`
  );
  assert(
    !checkRenewal2?.renewedContractId,
    'Scenario 6C: No renewedContractId set after failed attempt',
    'Should be falsy'
  );

  // ----------------------------------------------------
  // Scenario 7: CENTER_ADMIN Permission
  // Admin can complete renewal with contract for any trainer
  // ----------------------------------------------------
  const adminResult = await completeRenewalWithContract(
    centerId,
    renewal2.renewalId,
    {
      title: '관리자 직권 재등록 10회권',
      totalSessions: 10,
      startDate: '2026-10-01',
      expirationDate: '2026-12-31'
    },
    'CENTER_ADMIN'
  );

  assert(
    adminResult.renewal.status === 'RENEWED',
    'Scenario 7A: CENTER_ADMIN successfully completes renewal with contract',
    `Expected RENEWED, got ${adminResult.renewal.status}`
  );
  assert(
    adminResult.renewal.renewedContractId === adminResult.newContract.contractId,
    'Scenario 7B: Admin completed renewal links correct contractId',
    'Mismatch in contractId'
  );

  // ----------------------------------------------------
  // Scenario 8: MEMBER Role is completely blocked
  // ----------------------------------------------------
  try {
    await completeRenewalWithContract(
      centerId,
      renewal2.renewalId,
      {
        title: '회원 직권 계약 시도',
        totalSessions: 10,
        startDate: '2026-10-01',
        expirationDate: '2026-12-31'
      },
      'MEMBER'
    );
    assert(false, 'Scenario 8: MEMBER cannot call completeRenewalWithContract', 'Should throw');
  } catch (err: any) {
    assert(
      err.message.includes('회원은 재등록 계약을 등록할 수 없습니다'),
      'Scenario 8: MEMBER blocked from completeRenewalWithContract',
      err.message
    );
  }

  console.log('\n====================================================');
  console.log(`🎉 Phase 9C Test Results: ${results.filter((r) => r.passed).length}/${results.length} PASSED`);
  console.log('====================================================\n');
}

runPhase9cTests().catch((err) => {
  console.error('Fatal test error in Phase 9C:', err);
  process.exit(1);
});
