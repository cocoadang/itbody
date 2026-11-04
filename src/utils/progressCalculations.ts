import type { BodyMeasurement, PtSession, MemberGoal } from '../types';

export interface MetricComparisonResult {
  hasData: boolean;
  count: number;
  earliest?: BodyMeasurement;
  latest?: BodyMeasurement;
  startValue?: number;
  currentValue?: number;
  delta?: number;
  deltaFormatted?: string;
  trendIcon: '▲' | '▼' | '-';
  earliestDate?: string;
  latestDate?: string;
}

/**
 * Calculates start, current, and delta for a specific measurement metric.
 * Correctly skips records where the metric is missing/undefined without defaulting to 0.
 */
export function calculateMetricComparison(
  measurements: BodyMeasurement[],
  metric: keyof BodyMeasurement
): MetricComparisonResult {
  // Sort ascending by measuredAt
  const sorted = [...measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));

  // Filter only records where metric is a valid number
  const validRecords = sorted.filter(
    (m) => m[metric] !== undefined && m[metric] !== null && typeof m[metric] === 'number'
  );

  if (validRecords.length === 0) {
    return {
      hasData: false,
      count: 0,
      trendIcon: '-'
    };
  }

  const earliest = validRecords[0];
  const latest = validRecords[validRecords.length - 1];
  const startValue = earliest[metric] as number;
  const currentValue = latest[metric] as number;
  const delta = Number((currentValue - startValue).toFixed(2));

  let deltaFormatted = '0';
  let trendIcon: '▲' | '▼' | '-' = '-';

  if (delta > 0) {
    deltaFormatted = `+${delta}`;
    trendIcon = '▲';
  } else if (delta < 0) {
    deltaFormatted = `${delta}`;
    trendIcon = '▼';
  }

  return {
    hasData: true,
    count: validRecords.length,
    earliest,
    latest,
    startValue,
    currentValue,
    delta,
    deltaFormatted,
    trendIcon,
    earliestDate: earliest.measuredAt,
    latestDate: latest.measuredAt
  };
}

export interface ExerciseSessionRecord {
  date: string;
  time?: string;
  sessionNumber: number;
  sessionId: string;
  sets: { setNumber: number; weight: number; reps: number }[];
  maxWeight: number;
  maxReps: number;
  sessionVolume: number; // sum of weight * reps for weight > 0
  hasBodyweightSets: boolean;
}

export interface ExerciseProgressSummary {
  exerciseName: string;
  sessionRecords: ExerciseSessionRecord[];
  overallMaxWeight: number;
  overallMaxReps: number;
  overallTotalVolume: number;
  earliestMaxWeight?: number;
  latestMaxWeight?: number;
  weightDelta?: number;
  weightDeltaFormatted?: string;
}

/**
 * Extracts exercise history and progress from completed PT sessions.
 */
export function calculateExerciseProgress(
  sessions: PtSession[],
  targetExerciseName?: string
): {
  availableExercises: string[];
  summary?: ExerciseProgressSummary;
} {
  const completedSessions = sessions
    .filter((s) => s.status === 'COMPLETED')
    .sort((a, b) => a.date.localeCompare(b.date));

  // Extract all unique exercise names
  const exerciseSet = new Set<string>();
  for (const session of completedSessions) {
    for (const ex of session.exercises || []) {
      if (ex.exerciseName && ex.exerciseName.trim()) {
        exerciseSet.add(ex.exerciseName.trim());
      }
    }
  }

  const availableExercises = Array.from(exerciseSet).sort();

  if (!targetExerciseName || !availableExercises.includes(targetExerciseName)) {
    return {
      availableExercises
    };
  }

  const sessionRecords: ExerciseSessionRecord[] = [];
  let overallMaxWeight = 0;
  let overallMaxReps = 0;
  let overallTotalVolume = 0;

  for (const s of completedSessions) {
    const exRecord = (s.exercises || []).find(
      (e) => e.exerciseName.trim().toLowerCase() === targetExerciseName.trim().toLowerCase()
    );

    if (exRecord && exRecord.sets && exRecord.sets.length > 0) {
      let maxWeight = 0;
      let maxReps = 0;
      let sessionVolume = 0;
      let hasBodyweightSets = false;

      for (const set of exRecord.sets) {
        if (set.weight > maxWeight) maxWeight = set.weight;
        if (set.reps > maxReps) maxReps = set.reps;
        if (set.weight > 0) {
          sessionVolume += set.weight * set.reps;
        } else {
          hasBodyweightSets = true;
        }
      }

      if (maxWeight > overallMaxWeight) overallMaxWeight = maxWeight;
      if (maxReps > overallMaxReps) overallMaxReps = maxReps;
      overallTotalVolume += sessionVolume;

      sessionRecords.push({
        date: s.date,
        time: s.time,
        sessionNumber: s.sessionNumber,
        sessionId: s.sessionId,
        sets: exRecord.sets,
        maxWeight,
        maxReps,
        sessionVolume,
        hasBodyweightSets
      });
    }
  }

  const earliestMaxWeight = sessionRecords[0]?.maxWeight;
  const latestMaxWeight = sessionRecords[sessionRecords.length - 1]?.maxWeight;
  const weightDelta =
    earliestMaxWeight !== undefined && latestMaxWeight !== undefined
      ? Number((latestMaxWeight - earliestMaxWeight).toFixed(1))
      : undefined;

  let weightDeltaFormatted = '0';
  if (weightDelta !== undefined) {
    if (weightDelta > 0) weightDeltaFormatted = `+${weightDelta}`;
    else weightDeltaFormatted = `${weightDelta}`;
  }

  return {
    availableExercises,
    summary: {
      exerciseName: targetExerciseName,
      sessionRecords,
      overallMaxWeight,
      overallMaxReps,
      overallTotalVolume,
      earliestMaxWeight,
      latestMaxWeight,
      weightDelta,
      weightDeltaFormatted
    }
  };
}

export interface GoalProgressResult {
  canCalculate: boolean;
  status: 'CONNECTED' | 'NO_TARGET' | 'INSUFFICIENT_DATA' | 'UNSUPPORTED_METRIC';
  metricLabel: string;
  unit: string;
  startValue?: number;
  currentValue?: number;
  targetValue?: number;
  remaining?: number;
  progressPercent: number; // 0 ~ 100% clamped for UI bar
  actualPercent: number; // un-clamped (e.g. 115%)
  isDecreasing: boolean;
  isAchieved: boolean;
}

/**
 * Calculates direction-aware goal progress connecting MemberGoal to BodyMeasurement or PtSession.
 */
export function calculateGoalProgress(
  goal: MemberGoal,
  measurements: BodyMeasurement[],
  sessions: PtSession[]
): GoalProgressResult {
  let targetVal: number | undefined;
  if (typeof goal.targetValue === 'number') {
    targetVal = goal.targetValue;
  } else if (goal.targetValue) {
    const parsed = parseFloat(String(goal.targetValue).replace(/[^0-9.-]/g, ''));
    if (!isNaN(parsed)) targetVal = parsed;
  }

  if (targetVal === undefined) {
    return {
      canCalculate: false,
      status: 'NO_TARGET',
      metricLabel: goal.title,
      unit: goal.targetUnit || '',
      progressPercent: 0,
      actualPercent: 0,
      isDecreasing: false,
      isAchieved: goal.status === 'ACHIEVED'
    };
  }

  let metricKey: keyof BodyMeasurement | 'EXERCISE_MAX_WEIGHT' | null = null;
  let metricLabel = goal.title;
  let unit = goal.targetUnit || '';
  let exerciseName = goal.exerciseName;

  const rawKey = String(goal.metricKey || '').toLowerCase().replace(/_/g, '');

  // Determine metric connection (support both UPPER_SNAKE and camelCase)
  if (rawKey === 'weightkg' || rawKey === 'weight') {
    metricKey = 'weightKg';
    metricLabel = '체중';
    unit = 'kg';
  } else if (rawKey === 'bodyfatpercentage' || rawKey === 'bodyfat' || rawKey === 'fatpercentage') {
    metricKey = 'bodyFatPercentage';
    metricLabel = '체지방률';
    unit = '%';
  } else if (rawKey === 'skeletalmusclemasskg' || rawKey === 'musclemass' || rawKey === 'muscle') {
    metricKey = 'skeletalMuscleMassKg';
    metricLabel = '골격근량';
    unit = 'kg';
  } else if (rawKey === 'bodyfatmasskg') {
    metricKey = 'bodyFatMassKg';
    metricLabel = '체지방량';
    unit = 'kg';
  } else if (rawKey === 'waistcm' || rawKey === 'waist') {
    metricKey = 'waistCm';
    metricLabel = '허리둘레';
    unit = 'cm';
  } else if (rawKey === 'exercisemaxweight' || rawKey === 'exerciseweight') {
    metricKey = 'EXERCISE_MAX_WEIGHT';
    metricLabel = exerciseName ? `${exerciseName} 최고중량` : '운동 최고중량';
    unit = 'kg';
  } else if (goal.exerciseName) {
    metricKey = 'EXERCISE_MAX_WEIGHT';
    metricLabel = `${goal.exerciseName} 최고중량`;
    unit = goal.targetUnit || 'kg';
  } else {
    // Auto-infer from title or category
    if (goal.category === 'BODY_COMPOSITION') {
      if (goal.targetUnit === '%' || goal.title.includes('체지방률') || goal.title.includes('체지방')) {
        metricKey = 'bodyFatPercentage';
        metricLabel = '체지방률';
        unit = '%';
      } else if (goal.title.includes('골격근') || goal.title.includes('근육량')) {
        metricKey = 'skeletalMuscleMassKg';
        metricLabel = '골격근량';
        unit = 'kg';
      } else if (goal.title.includes('체중') || goal.title.includes('감량') || goal.title.includes('증량')) {
        metricKey = 'weightKg';
        metricLabel = '체중';
        unit = 'kg';
      }
    } else if (goal.category === 'PERFORMANCE') {
      metricKey = 'EXERCISE_MAX_WEIGHT';
      metricLabel = exerciseName || goal.title;
      unit = goal.targetUnit || 'kg';
    }
  }

  if (!metricKey) {
    return {
      canCalculate: false,
      status: 'UNSUPPORTED_METRIC',
      metricLabel: goal.title,
      unit: goal.targetUnit || '',
      progressPercent: 0,
      actualPercent: 0,
      isDecreasing: false,
      isAchieved: goal.status === 'ACHIEVED'
    };
  }

  let startVal: number | undefined;
  let currentVal: number | undefined;

  if (goal.startValue !== undefined && goal.startValue !== '') {
    const parsedStart = parseFloat(String(goal.startValue));
    if (!isNaN(parsedStart)) startVal = parsedStart;
  }

  if (metricKey === 'EXERCISE_MAX_WEIGHT') {
    // Look in ptSessions
    const targetEx = exerciseName || goal.title.replace(/[^a-zA-Z가-힣0-9]/g, '');
    const exProgress = calculateExerciseProgress(sessions, targetEx);
    if (exProgress.summary && exProgress.summary.sessionRecords.length > 0) {
      if (startVal === undefined) {
        startVal = exProgress.summary.earliestMaxWeight;
      }
      currentVal = exProgress.summary.latestMaxWeight;
    }
  } else {
    // Look in measurements
    const comp = calculateMetricComparison(measurements, metricKey);
    if (comp.hasData) {
      if (startVal === undefined) {
        startVal = comp.startValue;
      }
      currentVal = comp.currentValue;
    }
  }

  if (startVal === undefined || currentVal === undefined) {
    return {
      canCalculate: false,
      status: 'INSUFFICIENT_DATA',
      metricLabel,
      unit,
      targetValue: targetVal,
      startValue: startVal,
      currentValue: currentVal,
      progressPercent: 0,
      actualPercent: 0,
      isDecreasing: false,
      isAchieved: goal.status === 'ACHIEVED'
    };
  }

  // Handle divide-by-zero when start === target (STEP 8 & STEP 14 requirement)
  if (startVal === targetVal) {
    const achieved = currentVal === targetVal;
    return {
      canCalculate: true,
      status: 'CONNECTED',
      metricLabel,
      unit,
      startValue: startVal,
      currentValue: currentVal,
      targetValue: targetVal,
      remaining: 0,
      progressPercent: achieved ? 100 : 0,
      actualPercent: achieved ? 100 : 0,
      isDecreasing: false,
      isAchieved: achieved || goal.status === 'ACHIEVED'
    };
  }

  const isDecreasing = targetVal < startVal;
  let progressRatio: number;
  let remaining: number;

  if (isDecreasing) {
    // Example: start 31.2, current 26.8, target 25
    // progress = (31.2 - 26.8) / (31.2 - 25) = 4.4 / 6.2 = ~71%
    progressRatio = (startVal - currentVal) / (startVal - targetVal);
    remaining = Number((currentVal - targetVal).toFixed(1));
  } else {
    // Increasing: start 24.1, current 25.3, target 27
    // progress = (25.3 - 24.1) / (27 - 24.1) = 1.2 / 2.9 = ~41%
    progressRatio = (currentVal - startVal) / (targetVal - startVal);
    remaining = Number((targetVal - currentVal).toFixed(1));
  }

  const actualPercent = Number((progressRatio * 100).toFixed(1));
  const progressPercent = Math.max(0, Math.min(100, actualPercent));
  const isAchieved =
    (isDecreasing ? currentVal <= targetVal : currentVal >= targetVal) ||
    goal.status === 'ACHIEVED';

  return {
    canCalculate: true,
    status: 'CONNECTED',
    metricLabel,
    unit,
    startValue: startVal,
    currentValue: currentVal,
    targetValue: targetVal,
    remaining: Math.max(0, remaining),
    progressPercent,
    actualPercent,
    isDecreasing,
    isAchieved
  };
}
