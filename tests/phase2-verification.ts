/**
 * Phase 2 Automated Verification Suite:
 * 12 Crucial Test Scenarios for ITBODY Phase 1 & Phase 2
 */
import {
  createContract,
  getContractsByMember,
  createPtSession,
  updatePtSession,
  deletePtSession,
  getSessionsByMember,
  saveConsultation,
  getConsultationByMemberId,
  createGoal,
  getGoalsByMember,
  getAttentionMembers,
  createMember,
  seedInitialCenterData
} from '../src/services/dataService';
import type { UserRole } from '../src/types';

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

async function runTests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 2 Verification Test Suite');
  console.log('====================================================\n');

  const centerId = 'test-center-v2';
  const trainerAId = 'tr-alpha-01';
  const trainerBId = 'tr-beta-02';

  // Seed baseline data
  await seedInitialCenterData(centerId, '테스트 피트니스', [
    { id: trainerAId, name: '트레이너A', phone: '010-1111-2222', specialty: '웨이트' },
    { id: trainerBId, name: '트레이너B', phone: '010-3333-4444', specialty: '필라테스' }
  ]);

  // Create test member for Trainer A
  const memberA = await createMember({
    centerId,
    trainerId: trainerAId,
    name: '테스트회원A',
    gender: 'MALE',
    birthDate: '1992-05-15',
    phone: '010-9999-1111',
    startDate: '2026-09-01',
    status: 'ACTIVE'
  });

  // TEST 1: Contract Creation & Initial State
  const contract1 = await createContract({
    centerId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    title: '테스트 PT 10회권',
    totalSessions: 10,
    startDate: '2026-09-01',
    expirationDate: '2026-12-31',
    status: 'ACTIVE'
  });

  assert(
    contract1.totalSessions === 10 && contract1.usedSessions === 0 && contract1.status === 'ACTIVE',
    'Test 1: Contract Creation & Initial State',
    `Expected totalSessions=10, usedSessions=0, status=ACTIVE, got used=${contract1.usedSessions}, status=${contract1.status}`
  );

  // TEST 2: Single PT Session Creation (COMPLETED)
  const session1 = await createPtSession({
    centerId,
    memberId: memberA.memberId,
    memberName: memberA.name,
    trainerId: trainerAId,
    contractId: contract1.contractId,
    sessionNumber: 1,
    date: '2026-09-02',
    time: '14:00',
    status: 'COMPLETED',
    memberCondition: 'GOOD',
    exercises: [
      {
        exerciseName: '스쿼트',
        sets: [{ setNumber: 1, weight: 40, reps: 10 }]
      }
    ]
  });

  let contractsAfter1 = await getContractsByMember(centerId, memberA.memberId, 'CENTER_ADMIN');
  let currentCt1 = contractsAfter1.find((c) => c.contractId === contract1.contractId)!;

  assert(
    currentCt1.usedSessions === 1,
    'Test 2: Single PT Session Creation (COMPLETED)',
    `Expected usedSessions=1, got ${currentCt1.usedSessions}`
  );

  // TEST 3: Session Status Change (COMPLETED -> CANCELLED)
  await updatePtSession(centerId, session1.sessionId, { status: 'CANCELLED' });
  let contractsAfterCancel = await getContractsByMember(centerId, memberA.memberId, 'CENTER_ADMIN');
  let currentCtAfterCancel = contractsAfterCancel.find((c) => c.contractId === contract1.contractId)!;

  assert(
    currentCtAfterCancel.usedSessions === 0,
    'Test 3: Session Status Change (COMPLETED -> CANCELLED)',
    `Expected usedSessions to revert to 0, got ${currentCtAfterCancel.usedSessions}`
  );

  // TEST 4: Session Status Change (CANCELLED -> COMPLETED)
  await updatePtSession(centerId, session1.sessionId, { status: 'COMPLETED' });
  let contractsAfterRecomplete = await getContractsByMember(centerId, memberA.memberId, 'CENTER_ADMIN');
  let currentCtAfterRecomplete = contractsAfterRecomplete.find((c) => c.contractId === contract1.contractId)!;

  assert(
    currentCtAfterRecomplete.usedSessions === 1,
    'Test 4: Session Status Change (CANCELLED -> COMPLETED)',
    `Expected usedSessions to return to 1, got ${currentCtAfterRecomplete.usedSessions}`
  );

  // TEST 5: Session Deletion (COMPLETED)
  await deletePtSession(centerId, session1.sessionId);
  let contractsAfterDelete = await getContractsByMember(centerId, memberA.memberId, 'CENTER_ADMIN');
  let currentCtAfterDelete = contractsAfterDelete.find((c) => c.contractId === contract1.contractId)!;

  assert(
    currentCtAfterDelete.usedSessions === 0,
    'Test 5: Session Deletion (COMPLETED)',
    `Expected usedSessions to decrement to 0 upon deletion, got ${currentCtAfterDelete.usedSessions}`
  );

  // TEST 6: Contract Expiration / Full Completion Boundary
  const smallContract = await createContract({
    centerId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    title: '미니 2회권',
    totalSessions: 2,
    startDate: '2026-09-01',
    expirationDate: '2026-10-01',
    status: 'ACTIVE'
  });

  await createPtSession({
    centerId,
    memberId: memberA.memberId,
    memberName: memberA.name,
    trainerId: trainerAId,
    contractId: smallContract.contractId,
    sessionNumber: 1,
    date: '2026-09-03',
    time: '10:00',
    status: 'COMPLETED',
    exercises: []
  });

  await createPtSession({
    centerId,
    memberId: memberA.memberId,
    memberName: memberA.name,
    trainerId: trainerAId,
    contractId: smallContract.contractId,
    sessionNumber: 2,
    date: '2026-09-05',
    time: '10:00',
    status: 'COMPLETED',
    exercises: []
  });

  let smallCtAfterFull = (await getContractsByMember(centerId, memberA.memberId, 'CENTER_ADMIN')).find(
    (c) => c.contractId === smallContract.contractId
  )!;

  assert(
    smallCtAfterFull.usedSessions === 2 && smallCtAfterFull.status === 'COMPLETED',
    'Test 6: Contract Expiration / Full Completion Boundary',
    `Expected usedSessions=2 and status=COMPLETED, got used=${smallCtAfterFull.usedSessions}, status=${smallCtAfterFull.status}`
  );

  // TEST 7: Exceeding Session Boundary Protection
  let boundaryErrorThrown = false;
  try {
    await createPtSession({
      centerId,
      memberId: memberA.memberId,
      memberName: memberA.name,
      trainerId: trainerAId,
      contractId: smallContract.contractId,
      sessionNumber: 3,
      date: '2026-09-07',
      time: '10:00',
      status: 'COMPLETED',
      exercises: []
    });
  } catch (err: any) {
    boundaryErrorThrown = true;
  }

  assert(
    boundaryErrorThrown,
    'Test 7: Exceeding Session Boundary Protection',
    'Expected error when attempting to complete session exceeding contract limit'
  );

  // TEST 8: Negative / Zero Used Sessions Invariant
  // Create an unscheduled/planned session and delete it
  const plannedSession = await createPtSession({
    centerId,
    memberId: memberA.memberId,
    memberName: memberA.name,
    trainerId: trainerAId,
    contractId: contract1.contractId,
    sessionNumber: 5,
    date: '2026-09-10',
    time: '15:00',
    status: 'SCHEDULED',
    exercises: []
  });
  await deletePtSession(centerId, plannedSession.sessionId);
  let ct1ZeroCheck = (await getContractsByMember(centerId, memberA.memberId, 'CENTER_ADMIN')).find(
    (c) => c.contractId === contract1.contractId
  )!;

  assert(
    ct1ZeroCheck.usedSessions === 0,
    'Test 8: Negative / Zero Used Sessions Invariant',
    `Expected usedSessions=0 (never negative), got ${ct1ZeroCheck.usedSessions}`
  );

  // TEST 9: Multiple Contracts for Member (Strict contractId linkage)
  const contractMultiA = await createContract({
    centerId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    title: '다중이용권 A (10회)',
    totalSessions: 10,
    startDate: '2026-09-01',
    expirationDate: '2026-12-31',
    status: 'ACTIVE'
  });
  const contractMultiB = await createContract({
    centerId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    title: '다중이용권 B (20회)',
    totalSessions: 20,
    startDate: '2026-09-01',
    expirationDate: '2026-12-31',
    status: 'ACTIVE'
  });

  await createPtSession({
    centerId,
    memberId: memberA.memberId,
    memberName: memberA.name,
    trainerId: trainerAId,
    contractId: contractMultiB.contractId,
    sessionNumber: 10,
    date: '2026-09-12',
    time: '11:00',
    status: 'COMPLETED',
    exercises: []
  });

  const memberContracts = await getContractsByMember(centerId, memberA.memberId, 'CENTER_ADMIN');
  const checkedMultiA = memberContracts.find((c) => c.contractId === contractMultiA.contractId)!;
  const checkedMultiB = memberContracts.find((c) => c.contractId === contractMultiB.contractId)!;

  assert(
    checkedMultiA.usedSessions === 0 && checkedMultiB.usedSessions === 1,
    'Test 9: Multiple Contracts for Member Linkage',
    `Expected MultiA=0, MultiB=1, got MultiA=${checkedMultiA.usedSessions}, MultiB=${checkedMultiB.usedSessions}`
  );

  // TEST 10: Attention Members Logic (LOW_REMAINING_SESSIONS threshold <= 5)
  const memberAttention = await createMember({
    centerId,
    trainerId: trainerAId,
    name: '주의대상회원',
    gender: 'FEMALE',
    birthDate: '1995-03-20',
    phone: '010-8888-2222',
    startDate: '2026-09-01',
    status: 'ACTIVE'
  });

  const attentionContract = await createContract({
    centerId,
    memberId: memberAttention.memberId,
    trainerId: trainerAId,
    title: '주의회원 테스트 계약',
    totalSessions: 10,
    startDate: '2026-09-01',
    expirationDate: '2026-12-31',
    status: 'ACTIVE'
  });

  for (let i = 1; i <= 6; i++) {
    await createPtSession({
      centerId,
      memberId: memberAttention.memberId,
      memberName: memberAttention.name,
      trainerId: trainerAId,
      contractId: attentionContract.contractId,
      sessionNumber: i,
      date: `2026-09-1${i}`,
      time: '12:00',
      status: 'COMPLETED',
      exercises: []
    });
  }

  const attentionList = await getAttentionMembers(centerId, 'CENTER_ADMIN');
  const foundAttention = attentionList.find((item) => item.member.memberId === memberAttention.memberId);

  assert(
    !!foundAttention && (foundAttention.reasonCodes?.includes('LOW_REMAINING_SESSIONS') ?? false),
    'Test 10: Attention Members Logic',
    `Expected memberAttention to have LOW_REMAINING_SESSIONS reasonCode, found=${JSON.stringify(foundAttention?.reasonCodes)}`
  );

  // TEST 11: Non-Medical Terminology Integrity
  await saveConsultation({
    centerId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    trainerName: '이준호 트레이너',
    consultationDate: '2026-09-01',
    exercisePurposes: ['FITNESS', 'BODY_SHAPE'],
    exerciseExperience: { hasExperience: false },
    lifestyle: { sleepHoursPerDay: 7, workoutDaysPerWeek: 3, jobActivityLevel: 'SEDENTARY' },
    motivationInterview: {
      biggestReason: '체력 증진 및 체형 교정',
      goalAchievedWish: '건강한 라이프스타일',
      biggestConcern: '부상 없는 지속 가능한 운동',
      pastObstacle: '잦은 야근',
      threeMonthsVision: '주 3회 규칙적인 운동 습관 형성'
    },
    memberPrecautions: '장시간 좌식 근무로 인해 요추 피로감 호소',
    trainerObservations: '기초 맨몸 스쿼트 시 흉추 신전 가동성 및 발목 가동범위 타이트함 관찰',
    initialExercisePlan: '초기 2주간 코어 안정화 및 흉추 스트레칭 후 점진적 하체 루틴 진행'
  });

  const retrievedCon = await getConsultationByMemberId(centerId, memberA.memberId, 'CENTER_ADMIN');

  assert(
    !!retrievedCon &&
      retrievedCon.memberPrecautions === '장시간 좌식 근무로 인해 요추 피로감 호소' &&
      (retrievedCon.trainerObservations?.includes('흉추 신전 가동성') ?? false) &&
      (retrievedCon.initialExercisePlan?.includes('코어 안정화') ?? false),
    'Test 11: Non-Medical Terminology Integrity',
    'Consultation fields do not properly preserve distinct non-medical sections'
  );

  // TEST 12: Role-based Tenant & Trainer Scoping
  // Member A is assigned to Trainer A.
  // When Trainer A queries sessions -> receives Member A's sessions.
  // When Trainer B queries Member A's sessions -> receives empty array.
  const trainerASessions = await getSessionsByMember(centerId, memberA.memberId, 'TRAINER', trainerAId);
  const trainerBSessions = await getSessionsByMember(centerId, memberA.memberId, 'TRAINER', trainerBId);

  const trainerAContracts = await getContractsByMember(centerId, memberA.memberId, 'TRAINER', trainerAId);
  const trainerBContracts = await getContractsByMember(centerId, memberA.memberId, 'TRAINER', trainerBId);

  assert(
    trainerASessions.length > 0 &&
      trainerBSessions.length === 0 &&
      trainerAContracts.length > 0 &&
      trainerBContracts.length === 0,
    'Test 12: Role-based Tenant & Trainer Scoping',
    `Expected Trainer A to have access and Trainer B to be blocked. Got TrainerA sessions=${trainerASessions.length}, TrainerB sessions=${trainerBSessions.length}, TrainerA contracts=${trainerAContracts.length}, TrainerB contracts=${trainerBContracts.length}`
  );

  console.log('\n====================================================');
  console.log(`✨ All ${results.length} Phase 2 Verification Tests PASSED!`);
  console.log('====================================================');
}

runTests().catch((e) => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
