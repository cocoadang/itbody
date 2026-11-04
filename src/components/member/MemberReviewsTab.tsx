import React, { useState, useMemo } from 'react';
import { Award, Calendar, ChevronRight } from 'lucide-react';
import type {
  Member,
  ProgressReview,
  ProgressReviewType,
  PtSession,
  MemberGoal,
  BodyMeasurement,
  ProgressPhoto,
  Consultation
} from '../../types';
import {
  calculateMetricComparison,
  calculateExerciseProgress
} from '../../utils/progressCalculations';
import { ReviewPresentationCard } from '../ReviewPresentationCard';

interface MemberReviewsTabProps {
  member: Member;
  reviews: ProgressReview[];
  sessions: PtSession[];
  goals: MemberGoal[];
  measurements: BodyMeasurement[];
  photos: ProgressPhoto[];
  consultation: Consultation | null;
}

const REVIEW_TYPE_LABELS: Record<ProgressReviewType, string> = {
  TEN_SESSION: '10회차 중간 점검',
  TWENTY_SESSION: '20회차 성과 점검',
  CONTRACT_END: '계약 종료 종합 리뷰',
  MANUAL: '수시 성과 리뷰'
};

export const MemberReviewsTab: React.FC<MemberReviewsTabProps> = ({
  member,
  reviews,
  sessions,
  goals,
  measurements,
  photos,
  consultation
}) => {
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(
    reviews[reviews.length - 1]?.reviewId || null
  );

  const selectedReview = reviews.find((r) => r.reviewId === selectedReviewId) || null;

  // Calculate session data
  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === 'COMPLETED').sort((a, b) => a.date.localeCompare(b.date)),
    [sessions]
  );

  // Period for report
  const currentPeriodStart =
    selectedReview?.periodStart ||
    member.startDate ||
    (completedSessions[0]?.date ?? new Date().toISOString().split('T')[0]);

  const currentPeriodEnd =
    selectedReview?.periodEnd ||
    (completedSessions[completedSessions.length - 1]?.date ??
      new Date().toISOString().split('T')[0]);

  const periodSessions = useMemo(() => {
    return completedSessions.filter(
      (s) => s.date >= currentPeriodStart && s.date <= currentPeriodEnd
    );
  }, [completedSessions, currentPeriodStart, currentPeriodEnd]);

  // Measurements within review period
  const periodMeasurements = useMemo(() => {
    return measurements.filter(
      (m) => m.measuredAt >= currentPeriodStart && m.measuredAt <= currentPeriodEnd
    );
  }, [measurements, currentPeriodStart, currentPeriodEnd]);

  // Metric comparisons
  const targetMeasurements = periodMeasurements.length > 0 ? periodMeasurements : measurements;
  const weightComp = useMemo(
    () => calculateMetricComparison(targetMeasurements, 'weightKg'),
    [targetMeasurements]
  );
  const muscleComp = useMemo(
    () => calculateMetricComparison(targetMeasurements, 'skeletalMuscleMassKg'),
    [targetMeasurements]
  );
  const fatComp = useMemo(
    () => calculateMetricComparison(targetMeasurements, 'bodyFatPercentage'),
    [targetMeasurements]
  );
  const waistComp = useMemo(
    () => calculateMetricComparison(targetMeasurements, 'waistCm'),
    [targetMeasurements]
  );

  // Exercise Progress for major exercises in period
  const targetSessions = periodSessions.length > 0 ? periodSessions : completedSessions;
  const uniqueExerciseNames = useMemo(() => {
    const set = new Set<string>();
    for (const s of targetSessions) {
      for (const ex of s.exercises || []) {
        if (ex.exerciseName) set.add(ex.exerciseName);
      }
    }
    return Array.from(set);
  }, [targetSessions]);

  const exerciseSummaries = useMemo(() => {
    return uniqueExerciseNames
      .map((name) => calculateExerciseProgress(targetSessions, name).summary)
      .filter((s): s is NonNullable<typeof s> => Boolean(s && s.sessionRecords.length > 0))
      .sort((a, b) => b.overallTotalVolume - a.overallTotalVolume);
  }, [uniqueExerciseNames, targetSessions]);

  // Period photos
  const periodPhotos = useMemo(() => {
    return photos.filter(
      (p) => p.takenAt >= currentPeriodStart && p.takenAt <= currentPeriodEnd
    );
  }, [photos, currentPeriodStart, currentPeriodEnd]);

  // Goals
  const achievedGoals = useMemo(() => goals.filter((g) => g.status === 'ACHIEVED'), [goals]);
  const inProgressGoals = useMemo(
    () => goals.filter((g) => g.status === 'ACTIVE'),
    [goals]
  );

  return (
    <div className="space-y-4 pb-6" id="member-reviews-view">
      {/* 1. Review Selector Pills (if multiple reviews) */}
      {reviews.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {reviews.map((r) => (
            <button
              key={r.reviewId}
              type="button"
              onClick={() => setSelectedReviewId(r.reviewId)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors ${
                selectedReviewId === r.reviewId
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
              }`}
            >
              {REVIEW_TYPE_LABELS[r.reviewType]} ({r.reviewDate})
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedReviewId(null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors ${
              selectedReviewId === null
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
            }`}
          >
            현재 전체 누적 현황
          </button>
        </div>
      )}

      {/* 2. Review Presentation Card */}
      <ReviewPresentationCard
        member={member}
        review={selectedReview}
        consultation={consultation}
        completedSessions={completedSessions}
        periodSessions={periodSessions}
        currentPeriodStart={currentPeriodStart}
        currentPeriodEnd={currentPeriodEnd}
        measurements={measurements}
        weightComp={weightComp}
        muscleComp={muscleComp}
        fatComp={fatComp}
        waistComp={waistComp}
        exerciseSummaries={exerciseSummaries}
        photos={photos}
        periodPhotos={periodPhotos}
        achievedGoals={achievedGoals}
        inProgressGoals={inProgressGoals}
        goals={goals}
        isReviewMode={false}
        isMemberView={true}
      />
    </div>
  );
};
