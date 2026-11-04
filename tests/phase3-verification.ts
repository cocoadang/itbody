/**
 * Phase 3 Automated Verification Test Suite:
 * 18 Rigorous Scenarios for Progress Visualization & Body Measurements
 */
import {
  seedInitialCenterData,
  createMember,
  createPtSession,
  createGoal,
  getBodyMeasurements,
  createBodyMeasurement,
  updateBodyMeasurement,
  deleteBodyMeasurement,
  getMemberTimeline
} from '../src/services/dataService';
import {
  calculateMetricComparison,
  calculateExerciseProgress,
  calculateGoalProgress
} from '../src/utils/progressCalculations';
import type {
  BodyMeasurement,
  MemberGoal,
  PtSession,
  UserRole
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

async function runPhase3Tests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 3 Verification Test Suite');
  console.log('====================================================\n');

  const centerAId = 'center-phase3-alpha';
  const centerBId = 'center-phase3-beta';
  const trainerAId = 'tr-p3-a1';
  const trainerBId = 'tr-p3-b2';

  // Seed baseline data
  await seedInitialCenterData(centerAId, '알파 피트니스', [
    { id: trainerAId, name: '이준호 트레이너', phone: '010-1111-2222', specialty: '웨이트' },
    { id: trainerBId, name: '김민수 트레이너', phone: '010-3333-4444', specialty: '재활' }
  ]);

  await seedInitialCenterData(centerBId, '베타 피트니스', [
    { id: 'tr-p3-other', name: '박태환 트레이너', phone: '010-5555-6666', specialty: '유산소' }
  ]);

  const memberA = await createMember({
    centerId: centerAId,
    trainerId: trainerAId,
    name: '김지훈 회원',
    gender: 'MALE',
    birthDate: '1990-03-20',
    phone: '010-1234-5678',
    startDate: '2026-08-01',
    status: 'ACTIVE'
  });

  // ==========================================
  // SCENARIO 1: Create Initial Measurement
  // ==========================================
  const m1 = await createBodyMeasurement({
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    measuredAt: '2026-08-01',
    weightKg: 78.5,
    skeletalMuscleMassKg: 32.0,
    bodyFatMassKg: 24.5,
    bodyFatPercentage: 31.2,
    waistCm: 92.0,
    hipCm: 101.0,
    chestCm: 98.0,
    thighCm: 58.0,
    armCm: 32.0,
    memo: 'PT 등록 당일 최초 인바디 측정'
  });

  assert(
    !!m1.measurementId && m1.weightKg === 78.5 && m1.measuredAt === '2026-08-01',
    'Scenario 1: Create Initial Measurement',
    `Failed to create initial measurement: id=${m1.measurementId}, weight=${m1.weightKg}`
  );

  // ==========================================
  // SCENARIO 2: Create Second Measurement
  // ==========================================
  const m2 = await createBodyMeasurement({
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    measuredAt: '2026-08-20',
    weightKg: 76.8,
    skeletalMuscleMassKg: 32.8,
    bodyFatMassKg: 22.0,
    bodyFatPercentage: 28.6,
    waistCm: 89.5,
    hipCm: 100.0,
    chestCm: 98.5,
    thighCm: 57.5,
    armCm: 32.5,
    memo: '3주차 중간 점검'
  });

  assert(
    !!m2.measurementId && m2.bodyFatPercentage === 28.6,
    'Scenario 2: Create Second Measurement',
    `Failed to create second measurement: ${JSON.stringify(m2)}`
  );

  // ==========================================
  // SCENARIO 3: Create Third Measurement
  // ==========================================
  const m3 = await createBodyMeasurement({
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    measuredAt: '2026-09-10',
    weightKg: 75.2,
    skeletalMuscleMassKg: 33.5,
    bodyFatMassKg: 20.2,
    bodyFatPercentage: 26.8,
    waistCm: 87.0,
    hipCm: 99.0,
    chestCm: 99.0,
    thighCm: 57.0,
    armCm: 33.0,
    memo: '6주차 정기 측정'
  });

  assert(
    !!m3.measurementId && m3.weightKg === 75.2,
    'Scenario 3: Create Third Measurement',
    `Failed to create third measurement: ${JSON.stringify(m3)}`
  );

  // ==========================================
  // SCENARIO 4: Read Measurements & Date Sorting
  // ==========================================
  const listA = await getBodyMeasurements(centerAId, memberA.memberId, 'CENTER_ADMIN');
  assert(
    listA.length === 3 && listA[0].measuredAt === '2026-08-01' && listA[2].measuredAt === '2026-09-10',
    'Scenario 4: Read Measurements with Ascending Sort',
    `Expected 3 measurements sorted by date, got count=${listA.length}, firstDate=${listA[0]?.measuredAt}, lastDate=${listA[2]?.measuredAt}`
  );

  // ==========================================
  // SCENARIO 5: Update Measurement
  // ==========================================
  const updatedM2 = await updateBodyMeasurement(centerAId, m2.measurementId, {
    weightKg: 76.5,
    memo: '3주차 중간 점검 (재측정 보정)'
  });
  assert(
    updatedM2.weightKg === 76.5 && updatedM2.memo === '3주차 중간 점검 (재측정 보정)',
    'Scenario 5: Update Measurement',
    `Expected weight=76.5, got ${updatedM2.weightKg}`
  );

  // ==========================================
  // SCENARIO 6: Delete Measurement & Cascade
  // ==========================================
  const tempM = await createBodyMeasurement({
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    measuredAt: '2026-09-15',
    weightKg: 74.9
  });
  const beforeDel = await getBodyMeasurements(centerAId, memberA.memberId, 'CENTER_ADMIN');
  assert(beforeDel.length === 4, 'Scenario 6a: Temp measurement created', `Expected 4, got ${beforeDel.length}`);

  await deleteBodyMeasurement(centerAId, tempM.measurementId);
  const afterDel = await getBodyMeasurements(centerAId, memberA.memberId, 'CENTER_ADMIN');
  assert(
    afterDel.length === 3 && !afterDel.some((m) => m.measurementId === tempM.measurementId),
    'Scenario 6b: Delete Measurement Successfully',
    `Expected 3 after delete, got ${afterDel.length}`
  );

  // ==========================================
  // SCENARIO 7: Tenant Isolation
  // ==========================================
  const crossCenterMeasurements = await getBodyMeasurements(
    centerBId,
    memberA.memberId,
    'CENTER_ADMIN'
  );
  assert(
    crossCenterMeasurements.length === 0,
    'Scenario 7: Tenant Isolation (Other center cannot access data)',
    `Expected 0 cross-center measurements, got ${crossCenterMeasurements.length}`
  );

  // ==========================================
  // SCENARIO 8: Trainer RBAC Access Control
  // ==========================================
  const assignedTrainerRead = await getBodyMeasurements(
    centerAId,
    memberA.memberId,
    'TRAINER',
    trainerAId
  );
  const unassignedTrainerRead = await getBodyMeasurements(
    centerAId,
    memberA.memberId,
    'TRAINER',
    trainerBId
  );
  assert(
    assignedTrainerRead.length === 3 && unassignedTrainerRead.length === 0,
    'Scenario 8: Trainer RBAC Access Control',
    `Assigned got ${assignedTrainerRead.length}, Unassigned got ${unassignedTrainerRead.length}`
  );

  // ==========================================
  // SCENARIO 9: Metric Comparison — Decreasing Metric (Weight)
  // ==========================================
  const weightComp = calculateMetricComparison(afterDel, 'weightKg');
  assert(
    weightComp.hasData &&
      weightComp.startValue === 78.5 &&
      weightComp.currentValue === 75.2 &&
      weightComp.delta === -3.3 &&
      weightComp.deltaFormatted === '-3.3' &&
      weightComp.trendIcon === '▼',
    'Scenario 9: Metric Comparison for Weight (-3.3kg decrease)',
    `Expected start=78.5, curr=75.2, delta=-3.3, got delta=${weightComp.delta}`
  );

  // ==========================================
  // SCENARIO 10: Metric Comparison — Increasing Metric (Muscle Mass)
  // ==========================================
  const muscleComp = calculateMetricComparison(afterDel, 'skeletalMuscleMassKg');
  assert(
    muscleComp.hasData &&
      muscleComp.startValue === 32.0 &&
      muscleComp.currentValue === 33.5 &&
      muscleComp.delta === 1.5 &&
      muscleComp.deltaFormatted === '+1.5' &&
      muscleComp.trendIcon === '▲',
    'Scenario 10: Metric Comparison for Muscle (+1.5kg increase)',
    `Expected start=32.0, curr=33.5, delta=1.5, got delta=${muscleComp.delta}`
  );

  // ==========================================
  // SCENARIO 11: Metric Comparison — Single Record Edge Case
  // ==========================================
  const singleComp = calculateMetricComparison([m1], 'weightKg');
  assert(
    singleComp.hasData &&
      singleComp.count === 1 &&
      singleComp.startValue === 78.5 &&
      singleComp.currentValue === 78.5 &&
      singleComp.delta === 0 &&
      singleComp.deltaFormatted === '0',
    'Scenario 11: Metric Comparison with Single Record',
    `Expected single count=1, delta=0, got ${JSON.stringify(singleComp)}`
  );

  // ==========================================
  // SCENARIO 12: Metric Comparison — Empty Records Edge Case
  // ==========================================
  const emptyComp = calculateMetricComparison([], 'weightKg');
  assert(
    !emptyComp.hasData && emptyComp.count === 0 && emptyComp.startValue === undefined,
    'Scenario 12: Metric Comparison with Empty Records',
    `Expected hasData=false, got ${emptyComp.hasData}`
  );

  // ==========================================
  // SCENARIO 13: Exercise Progress Extraction from PT Sessions
  // ==========================================
  const sess1: PtSession = {
    sessionId: 'test-ses-1',
    centerId: centerAId,
    memberId: memberA.memberId,
    memberName: memberA.name,
    trainerId: trainerAId,
    trainerName: '이준호',
    contractId: 'con-1',
    sessionNumber: 1,
    date: '2026-08-05',
    time: '19:00',
    status: 'COMPLETED',
    memberCondition: 'GOOD',
    sessionNotes: '스쿼트 기초',
    trainerFeedback: '자세 굿',
    nextSessionGoal: '증량',
    exercises: [
      {
        exerciseName: '스쿼트',
        sets: [
          { setNumber: 1, weight: 40, reps: 10 },
          { setNumber: 2, weight: 50, reps: 10 },
          { setNumber: 3, weight: 50, reps: 10 }
        ]
      },
      {
        exerciseName: '바벨 로우',
        sets: [
          { setNumber: 1, weight: 30, reps: 12 },
          { setNumber: 2, weight: 35, reps: 10 }
        ]
      }
    ],
    createdAt: '2026-08-05T19:00:00Z',
    updatedAt: '2026-08-05T20:00:00Z'
  };

  const sess2: PtSession = {
    sessionId: 'test-ses-2',
    centerId: centerAId,
    memberId: memberA.memberId,
    memberName: memberA.name,
    trainerId: trainerAId,
    trainerName: '이준호',
    contractId: 'con-1',
    sessionNumber: 5,
    date: '2026-08-25',
    time: '19:00',
    status: 'COMPLETED',
    memberCondition: 'GOOD',
    sessionNotes: '스쿼트 증량',
    trainerFeedback: '코어 유지',
    nextSessionGoal: '70kg 도전',
    exercises: [
      {
        exerciseName: '스쿼트',
        sets: [
          { setNumber: 1, weight: 50, reps: 10 },
          { setNumber: 2, weight: 60, reps: 8 },
          { setNumber: 3, weight: 65, reps: 6 }
        ]
      }
    ],
    createdAt: '2026-08-25T19:00:00Z',
    updatedAt: '2026-08-25T20:00:00Z'
  };

  const sessionsList = [sess1, sess2];
  const exSquat = calculateExerciseProgress(sessionsList, '스쿼트');
  assert(
    exSquat.availableExercises.includes('스쿼트') &&
      exSquat.availableExercises.includes('바벨 로우') &&
      exSquat.summary?.overallMaxWeight === 65 &&
      exSquat.summary?.overallMaxReps === 10 &&
      exSquat.summary?.weightDelta === 15 &&
      exSquat.summary?.weightDeltaFormatted === '+15',
    'Scenario 13: Exercise Progress (Squat 50kg -> 65kg, +15kg progress)',
    `Expected maxWeight=65, weightDelta=15, got maxWeight=${exSquat.summary?.overallMaxWeight}, delta=${exSquat.summary?.weightDelta}`
  );

  // ==========================================
  // SCENARIO 14: Total Volume Calculation for Exercise
  // ==========================================
  // Session 1 squat volume: 40*10 + 50*10 + 50*10 = 400 + 500 + 500 = 1400kg
  // Session 2 squat volume: 50*10 + 60*8 + 65*6 = 500 + 480 + 390 = 1370kg
  // Overall total volume = 1400 + 1370 = 2770kg
  const s1Vol = exSquat.summary?.sessionRecords[0].sessionVolume;
  const s2Vol = exSquat.summary?.sessionRecords[1].sessionVolume;
  const totalVol = exSquat.summary?.overallTotalVolume;
  assert(
    s1Vol === 1400 && s2Vol === 1370 && totalVol === 2770,
    'Scenario 14: Total Exercise Volume Calculation (Weight × Reps)',
    `Expected s1=1400, s2=1370, total=2770, got s1=${s1Vol}, s2=${s2Vol}, total=${totalVol}`
  );

  // ==========================================
  // SCENARIO 15: Goal Progress — Decreasing Metric Goal
  // ==========================================
  // Body Fat %: start 31.2%, target 25.0%. Current value = 26.8%
  // Total needed decrease: 31.2 - 25.0 = 6.2
  // Achieved decrease: 31.2 - 26.8 = 4.4
  // Progress: 4.4 / 6.2 = 70.967% -> 71.0%
  // Remaining: 26.8 - 25.0 = 1.8%p
  const fatGoal: MemberGoal = {
    goalId: 'goal-fat-1',
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    category: 'BODY_COMPOSITION',
    title: '체지방률 25% 달성',
    targetValue: '25.0',
    targetUnit: '%',
    metricKey: 'bodyFatPercentage',
    startValue: 31.2,
    status: 'ACTIVE',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z'
  };

  const fatGoalProg = calculateGoalProgress(fatGoal, afterDel, sessionsList);
  assert(
    fatGoalProg.canCalculate &&
      fatGoalProg.startValue === 31.2 &&
      fatGoalProg.currentValue === 26.8 &&
      fatGoalProg.targetValue === 25.0 &&
      fatGoalProg.remaining === 1.8 &&
      fatGoalProg.actualPercent === 71.0 &&
      fatGoalProg.isAchieved === false,
    'Scenario 15: Goal Progress for Decreasing Metric (Body Fat %)',
    `Expected remaining=1.8, actualPercent=71.0, got remaining=${fatGoalProg.remaining}, pct=${fatGoalProg.actualPercent}`
  );

  // ==========================================
  // SCENARIO 16: Goal Progress — Performance Exercise Goal
  // ==========================================
  // Squat Goal: target 70kg, start 50kg. Current max = 65kg
  // Progress: (65 - 50) / (70 - 50) = 15 / 20 = 75.0%
  // Remaining: 70 - 65 = 5kg
  const squatGoal: MemberGoal = {
    goalId: 'goal-squat-1',
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    category: 'PERFORMANCE',
    title: '스쿼트 70kg 달성',
    targetValue: '70',
    targetUnit: 'kg',
    exerciseName: '스쿼트',
    startValue: 50,
    status: 'ACTIVE',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z'
  };

  const squatGoalProg = calculateGoalProgress(squatGoal, afterDel, sessionsList);
  assert(
    squatGoalProg.canCalculate &&
      squatGoalProg.startValue === 50 &&
      squatGoalProg.currentValue === 65 &&
      squatGoalProg.targetValue === 70 &&
      squatGoalProg.remaining === 5 &&
      squatGoalProg.actualPercent === 75.0 &&
      squatGoalProg.isAchieved === false,
    'Scenario 16: Goal Progress for Exercise Performance (Squat)',
    `Expected remaining=5, actualPercent=75.0, got remaining=${squatGoalProg.remaining}, pct=${squatGoalProg.actualPercent}`
  );

  // ==========================================
  // SCENARIO 17: Goal Progress — Divide-by-Zero & Qualitative Handlers
  // ==========================================
  const zeroDivideGoal: MemberGoal = {
    goalId: 'goal-zero-1',
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    category: 'BODY_COMPOSITION',
    title: '동일 수치 목표',
    targetValue: '75.2',
    metricKey: 'weightKg',
    startValue: 75.2,
    status: 'ACTIVE',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z'
  };
  const zeroProg = calculateGoalProgress(zeroDivideGoal, afterDel, sessionsList);
  assert(
    zeroProg.canCalculate &&
      !isNaN(zeroProg.actualPercent) &&
      isFinite(zeroProg.actualPercent) &&
      zeroProg.actualPercent === 100,
    'Scenario 17a: Edge Case Handle Start === Target (no NaN / Infinity)',
    `Expected 100, got ${zeroProg.actualPercent}`
  );

  const qualitativeGoal: MemberGoal = {
    goalId: 'goal-qual-1',
    centerId: centerAId,
    memberId: memberA.memberId,
    trainerId: trainerAId,
    category: 'HABIT',
    title: '주 3회 출석 습관',
    status: 'ACTIVE',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z'
  };
  const qualProg = calculateGoalProgress(qualitativeGoal, afterDel, sessionsList);
  assert(
    !qualProg.canCalculate && qualProg.status === 'NO_TARGET',
    'Scenario 17b: Qualitative Goal without numeric target',
    `Expected NO_TARGET, got ${qualProg.status}`
  );

  // ==========================================
  // SCENARIO 18: Timeline Integration with Body Measurement Event
  // ==========================================
  const timeline = await getMemberTimeline(centerAId, memberA.memberId, 'CENTER_ADMIN');
  const measurementEvents = timeline.filter((e) => e.type === 'BODY_MEASUREMENT');
  assert(
    measurementEvents.length >= 3 &&
      measurementEvents[0].title.includes('신체 측정 기록') &&
      measurementEvents[0].description.includes('75.2kg'),
    'Scenario 18: Timeline Integration (BODY_MEASUREMENT events populated in timeline)',
    `Expected >=3 measurement events containing 75.2kg, got count=${measurementEvents.length}, desc=${measurementEvents[0]?.description}`
  );

  console.log('\n====================================================');
  console.log(`🎉 ALL 18 PHASE 3 TEST SCENARIOS PASSED (${results.filter((r) => r.passed).length}/18)`);
  console.log('====================================================');
}

runPhase3Tests().catch((err) => {
  console.error('Fatal error during Phase 3 verification tests:', err);
  process.exit(1);
});
