/**
 * Phase 5 Automated Verification Test Suite:
 * 15 Rigorous Scenarios for Member Mobile Portal, Data Isolation, Privacy, and Calculations
 */
import {
  seedInitialCenterData,
  createMember,
  createContract,
  createPtSession,
  createGoal,
  createBodyMeasurement,
  updateMemberPhotoConsent,
  createProgressPhoto,
  getProgressPhotos,
  createProgressReview,
  getProgressReviews,
  getMemberById,
  getConsultationByMemberId,
  getGoalsByMember,
  getContractsByMember,
  getSessionsByMember,
  getBodyMeasurements,
  clearCenterData
} from '../src/services/dataService';
import {
  calculateMetricComparison,
  calculateExerciseProgress
} from '../src/utils/progressCalculations';
import type {
  Member,
  PtSession,
  BodyMeasurement
} from '../src/types';

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

async function runPhase5Tests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 5 Verification Test Suite');
  console.log('====================================================\n');

  const centerAId = 'center-phase5-test';
  const centerBId = 'center-phase5-other';
  const trainerAId = 'tr-p5-test';

  clearCenterData(centerAId);
  clearCenterData(centerBId);

  // 1. Create Members in Center A
  const memberA = await createMember({
    centerId: centerAId,
    trainerId: trainerAId,
    name: '테스트회원A',
    phone: '010-1111-2222',
    gender: 'MALE',
    birthDate: '1995-01-01',
    startDate: '2026-01-01',
    status: 'ACTIVE'
  });

  const memberB = await createMember({
    centerId: centerAId,
    trainerId: trainerAId,
    name: '테스트회원B',
    phone: '010-3333-4444',
    gender: 'FEMALE',
    birthDate: '1998-05-15',
    startDate: '2026-01-15',
    status: 'ACTIVE'
  });

  // 2. Add contract and sessions for Member A
  const contractA = await createContract({
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    title: 'PT 20회 정규 코스',
    totalSessions: 20,
    startDate: '2026-01-01',
    expirationDate: '2026-06-30',
    status: 'ACTIVE'
  });

  const session1 = await createPtSession({
    centerId: centerAId,
    memberId: memberA.memberId,
    memberName: memberA.name,
    trainerId: trainerAId,
    contractId: contractA.contractId,
    sessionNumber: 1,
    date: '2026-01-05',
    time: '10:00',
    status: 'COMPLETED',
    exercises: [
      {
        exerciseName: '스쿼트',
        sets: [{ setNumber: 1, weight: 60, reps: 10 }]
      }
    ],
    internalNote: '회원 통증 민감성 높음 - 개인 메모(비공개)',
    memberFeedback: '첫 수업 고생 많으셨습니다. 자세 훌륭했습니다!'
  });

  // 3. Add Goal for Member A
  await createGoal({
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    category: 'BODY_COMPOSITION',
    title: '체중 5kg 감량',
    targetValue: '70',
    targetUnit: 'kg',
    status: 'ACTIVE'
  });

  // 4. Add Body Measurements for Member A
  await createBodyMeasurement({
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    measuredAt: '2026-01-01',
    weightKg: 75.0,
    skeletalMuscleMassKg: 32.0,
    bodyFatPercentage: 25.0
  });

  await createBodyMeasurement({
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    measuredAt: '2026-02-01',
    weightKg: 73.5,
    skeletalMuscleMassKg: 32.5,
    bodyFatPercentage: 23.8
  });

  // 5. Add Photo for Member A (with member self-consent)
  await updateMemberPhotoConsent(centerAId, memberA.memberId, true, 'MEMBER', null, memberA.memberId);
  await createProgressPhoto(
    {
      centerId: centerAId,
      memberId: memberA.memberId,
      trainerId: trainerAId,
      photoUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd',
      storagePath: `centers/${centerAId}/members/${memberA.memberId}/photos/p1.png`,
      viewType: 'FRONT',
      takenAt: '2026-01-01',
      caption: '1회차 시작'
    },
    'TRAINER',
    trainerAId
  );

  // 6. Add Review for Member A
  await createProgressReview(
    {
      centerId: centerAId,
      memberId: memberA.memberId,
      trainerId: trainerAId,
      reviewType: 'TEN_SESSION',
      reviewDate: '2026-02-01',
      periodStart: '2026-01-01',
      periodEnd: '2026-02-01',
      summary: '10회차 완료 체형 정렬 개선',
      trainerFeedback: '한 달간 성실하게 임해주셔서 근육량 증가와 체지방 감소가 뚜렷합니다.'
    },
    'TRAINER',
    trainerAId
  );

  // ==========================================
  // TEST SCENARIOS
  // ==========================================

  // Scenario 1: Member A accesses their own profile
  const fetchedMemberA = await getMemberById(centerAId, memberA.memberId, 'MEMBER', null, memberA.memberId);
  assert(
    fetchedMemberA !== null && fetchedMemberA.name === '테스트회원A',
    'Scenario 1: Member can read their own profile',
    'Failed to read own member profile'
  );

  // Scenario 2: Member A tries to access Member B's profile -> MUST BE REJECTED (null)
  const rejectedMemberB = await getMemberById(centerAId, memberB.memberId, 'MEMBER', null, memberA.memberId);
  assert(
    rejectedMemberB === null,
    'Scenario 2: Member cannot read other member profile',
    'Member A was improperly allowed to read Member B profile'
  );

  // Scenario 3: PT Sessions Internal Notes are stripped for Member
  const memberSessions = await getSessionsByMember(centerAId, memberA.memberId, 'MEMBER', null, memberA.memberId);
  assert(
    memberSessions.length === 1,
    'Scenario 3.1: Member can fetch their own sessions',
    'Member sessions count mismatch'
  );

  const returnedSession = memberSessions[0];
  assert(
    !returnedSession.internalNote && !returnedSession.sessionNotes,
    'Scenario 3.2: Internal private notes are completely stripped for Member',
    `Found internalNote on member session: ${returnedSession.internalNote}`
  );

  assert(
    returnedSession.memberFeedback === '첫 수업 고생 많으셨습니다. 자세 훌륭했습니다!',
    'Scenario 3.3: Member feedback is preserved and accessible',
    'Member feedback missing or altered'
  );

  // Scenario 4: Trainer CAN still see internal notes
  const trainerSessions = await getSessionsByMember(centerAId, memberA.memberId, 'TRAINER', trainerAId, null);
  assert(
    trainerSessions[0].internalNote === '회원 통증 민감성 높음 - 개인 메모(비공개)',
    'Scenario 4: Trainer can still access internal private notes',
    'Trainer was improperly blocked from viewing internal note'
  );

  // Scenario 5: Member B cannot fetch Member A's sessions
  const memberBSessions = await getSessionsByMember(centerAId, memberA.memberId, 'MEMBER', null, memberB.memberId);
  assert(
    memberBSessions.length === 0,
    'Scenario 5: Member B cannot access Member A sessions',
    'Cross-member session access was not blocked'
  );

  // Scenario 6: Photo consent check: Active consent returns photos
  const memberPhotos = await getProgressPhotos(centerAId, memberA.memberId, 'MEMBER', null, memberA.memberId);
  assert(
    memberPhotos.length === 1,
    'Scenario 6.1: Consenting member can view their progress photos',
    'Consenting member failed to view photos'
  );

  // Scenario 7: Photo consent check: Revoking consent blocks new uploads while preserving existing records
  await updateMemberPhotoConsent(centerAId, memberA.memberId, false, 'MEMBER', null, memberA.memberId);
  let newUploadBlockedAfterRevoke = false;
  try {
    await createProgressPhoto(
      {
        centerId: centerAId,
        memberId: memberA.memberId,
        trainerId: trainerAId,
        photoUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd',
        storagePath: `centers/${centerAId}/members/${memberA.memberId}/photos/p2.png`,
        viewType: 'SIDE',
        takenAt: '2026-02-01',
        caption: '철회 후 추가 시도'
      },
      'TRAINER',
      trainerAId
    );
  } catch (err) {
    newUploadBlockedAfterRevoke = true;
  }
  assert(
    newUploadBlockedAfterRevoke,
    'Scenario 7.1: Revoking consent blocks new photo upload',
    'Trainer was able to upload new photo after consent was revoked'
  );

  const preservedPhotos = await getProgressPhotos(centerAId, memberA.memberId, 'MEMBER', null, memberA.memberId);
  assert(
    preservedPhotos.length === 1,
    'Scenario 7.2: Existing photos are preserved after consent revocation',
    'Existing photos were unexpectedly deleted or lost'
  );

  // Scenario 8: Progress Reviews accessibility
  const memberReviews = await getProgressReviews(centerAId, memberA.memberId, 'MEMBER', null, memberA.memberId);
  assert(
    memberReviews.length === 1 && memberReviews[0].reviewType === 'TEN_SESSION',
    'Scenario 8: Member can read their progress reviews',
    'Member could not read progress review'
  );

  // Scenario 9: Progress review isolation (Member B cannot read Member A reviews)
  const rejectedReviews = await getProgressReviews(centerAId, memberA.memberId, 'MEMBER', null, memberB.memberId);
  assert(
    rejectedReviews.length === 0,
    'Scenario 9: Member B cannot read Member A progress reviews',
    'Cross-member review isolation failed'
  );

  // Scenario 10: Goals accessibility and isolation
  const memberGoals = await getGoalsByMember(centerAId, memberA.memberId, 'MEMBER', null, memberA.memberId);
  const rejectedGoals = await getGoalsByMember(centerAId, memberA.memberId, 'MEMBER', null, memberB.memberId);
  assert(
    memberGoals.length === 1 && rejectedGoals.length === 0,
    'Scenario 10: Member goals isolation works strictly',
    'Goals isolation failed'
  );

  // Scenario 11: Contracts accessibility and isolation
  const memberContracts = await getContractsByMember(centerAId, memberA.memberId, 'MEMBER', null, memberA.memberId);
  const rejectedContracts = await getContractsByMember(centerAId, memberA.memberId, 'MEMBER', null, memberB.memberId);
  assert(
    memberContracts.length === 1 && rejectedContracts.length === 0,
    'Scenario 11: Member contracts isolation works strictly',
    'Contracts isolation failed'
  );

  // Scenario 12: Body Measurements calculation helper verification
  const measurements = await getBodyMeasurements(centerAId, memberA.memberId, 'MEMBER', null, memberA.memberId);
  const weightComparison = calculateMetricComparison(measurements, 'weightKg');
  assert(
    weightComparison.startValue === 75.0 &&
    weightComparison.currentValue === 73.5 &&
    weightComparison.delta === -1.5,
    'Scenario 12: Weight comparison calculation is exact',
    `Expected delta -1.5, got ${weightComparison.delta}`
  );

  // Scenario 13: Muscle comparison calculation
  const muscleComparison = calculateMetricComparison(measurements, 'skeletalMuscleMassKg');
  assert(
    muscleComparison.startValue === 32.0 &&
    muscleComparison.currentValue === 32.5 &&
    muscleComparison.delta === 0.5,
    'Scenario 13: Skeletal muscle comparison calculation is exact',
    `Expected delta 0.5, got ${muscleComparison.delta}`
  );

  // Scenario 14: Empty measurements handling
  const emptyComparison = calculateMetricComparison([], 'weightKg');
  assert(
    !emptyComparison.hasData && emptyComparison.delta === undefined,
    'Scenario 14: Empty measurements gracefully handled without exceptions',
    'Empty comparison failed'
  );

  // Scenario 15: Cross-center tenant isolation
  const crossCenterMember = await getMemberById(centerBId, memberA.memberId, 'MEMBER', null, memberA.memberId);
  assert(
    crossCenterMember === null,
    'Scenario 15: Cross-center tenant isolation verified',
    'Member was found across wrong center ID'
  );

  console.log('\n====================================================');
  console.log(`🎉 ALL 15 PHASE 5 TESTS PASSED SUCCESSFULLY! (${results.filter((r) => r.passed).length}/15)`);
  console.log('====================================================\n');
}

runPhase5Tests().catch((err) => {
  console.error('Fatal error during Phase 5 verification:', err);
  process.exit(1);
});
