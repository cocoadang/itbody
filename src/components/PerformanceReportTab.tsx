import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Plus,
  Calendar,
  Activity,
  Dumbbell,
  Target,
  CheckCircle2,
  TrendingUp,
  Clock,
  Printer,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Trash2,
  AlertCircle,
  Eye,
  Camera,
  X
} from 'lucide-react';
import type {
  Member,
  ProgressReview,
  ProgressReviewType,
  BodyMeasurement,
  PtSession,
  MemberGoal,
  Consultation,
  ProgressPhoto,
  UserRole,
  PersonalWorkoutLog,
  AiReviewDraft,
  AiReviewDraftRequest
} from '../types';
import {
  getProgressReviews,
  createProgressReview,
  deleteProgressReview,
  getBodyMeasurements,
  getSessionsByMember,
  getGoalsByMember,
  getConsultationByMemberId,
  getProgressPhotos,
  getPersonalWorkoutLogsByMember
} from '../services/dataService';
import { generateAiReviewDraft } from '../services/aiService';
import {
  calculateMetricComparison,
  calculateExerciseProgress
} from '../utils/progressCalculations';
import { ReviewPresentationCard } from './ReviewPresentationCard';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import { localToday } from '../utils/dateInputUtils';

interface PerformanceReportTabProps {
  member: Member;
  userRole: UserRole;
  currentTrainerId?: string | null;
  onRefresh?: () => Promise<void>;
  onNavigateToGoal?: () => void;
}

const REVIEW_TYPE_LABELS: Record<ProgressReviewType, string> = {
  TEN_SESSION: '10회차 중간 점검',
  TWENTY_SESSION: '20회차 성과 점검',
  CONTRACT_END: '계약 종료 종합 리뷰',
  MANUAL: '수시 성과 리뷰'
};

export const PerformanceReportTab: React.FC<PerformanceReportTabProps> = ({
  member,
  userRole,
  currentTrainerId,
  onRefresh,
  onNavigateToGoal
}) => {
  const [reviews, setReviews] = useState<ProgressReview[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [sessions, setSessions] = useState<PtSession[]>([]);
  const [goals, setGoals] = useState<MemberGoal[]>([]);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Selected Review for Detail / Presentation Mode
  const [selectedReview, setSelectedReview] = useState<ProgressReview | null>(null);
  const [isReviewMode, setIsReviewMode] = useState(false); // [회원과 함께 보기] fullscreen mode

  // Create Review Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [reviewType, setReviewType] = useState<ProgressReviewType>('TEN_SESSION');
  const [reviewDate, setReviewDate] = useState(localToday());
  const [periodStart, setPeriodStart] = useState(member.startDate || '2026-01-01');
  const [periodEnd, setPeriodEnd] = useState(localToday());
  const [summary, setSummary] = useState('');
  const [trainerFeedback, setTrainerFeedback] = useState('');
  const [nextGoalsInput, setNextGoalsInput] = useState('');
  const [milestoneCount, setMilestoneCount] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Phase 6 & 7: Personal Workout logs & AI Review Draft State
  const [soloLogs, setSoloLogs] = useState<PersonalWorkoutLog[]>([]);
  const [isAiDrafting, setIsAiDrafting] = useState(false);
  const [aiReviewDraft, setAiReviewDraft] = useState<AiReviewDraft | null>(null);
  const [aiDraftNotice, setAiDraftNotice] = useState<string | null>(null);

  // Delete State
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);

  // Load all member data needed for progress aggregation
  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [rList, mList, sList, gList, cData, pList, soloList] = await Promise.all([
        getProgressReviews(member.centerId, member.memberId, userRole, currentTrainerId),
        getBodyMeasurements(member.centerId, member.memberId, userRole, currentTrainerId),
        getSessionsByMember(member.centerId, member.memberId, userRole, currentTrainerId),
        getGoalsByMember(member.centerId, member.memberId, userRole, currentTrainerId),
        getConsultationByMemberId(member.centerId, member.memberId, userRole, currentTrainerId),
        getProgressPhotos(member.centerId, member.memberId, userRole, currentTrainerId),
        getPersonalWorkoutLogsByMember(member.centerId, member.memberId, userRole, currentTrainerId)
      ]);

      setReviews(rList);
      setMeasurements(mList);
      setSessions(sList);
      setGoals(gList);
      setConsultation(cData);
      setPhotos(pList);
      setSoloLogs(soloList);

      if (rList.length > 0 && !selectedReview) {
        setSelectedReview(rList[0]);
      }
    } catch (err: any) {
      setError(err?.message || '성과 리뷰 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [member.memberId, member.centerId]);

  // Filter completed sessions
  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === 'COMPLETED').sort((a, b) => a.date.localeCompare(b.date)),
    [sessions]
  );

  // Aggregated data for selected review (or current live progress if none selected)
  const currentPeriodStart = selectedReview?.periodStart || member.startDate || '2026-01-01';
  const currentPeriodEnd = selectedReview?.periodEnd || localToday();

  // Measurements within review period
  const periodMeasurements = useMemo(() => {
    return measurements.filter(
      (m) => m.measuredAt >= currentPeriodStart && m.measuredAt <= currentPeriodEnd
    );
  }, [measurements, currentPeriodStart, currentPeriodEnd]);

  // Metric comparisons
  const weightComp = useMemo(
    () => calculateMetricComparison(periodMeasurements.length > 0 ? periodMeasurements : measurements, 'weightKg'),
    [periodMeasurements, measurements]
  );
  const muscleComp = useMemo(
    () => calculateMetricComparison(periodMeasurements.length > 0 ? periodMeasurements : measurements, 'skeletalMuscleMassKg'),
    [periodMeasurements, measurements]
  );
  const fatComp = useMemo(
    () => calculateMetricComparison(periodMeasurements.length > 0 ? periodMeasurements : measurements, 'bodyFatPercentage'),
    [periodMeasurements, measurements]
  );
  const waistComp = useMemo(
    () => calculateMetricComparison(periodMeasurements.length > 0 ? periodMeasurements : measurements, 'waistCm'),
    [periodMeasurements, measurements]
  );

  // Exercise Progress for major exercises in period
  const periodSessions = useMemo(() => {
    return completedSessions.filter(
      (s) => s.date >= currentPeriodStart && s.date <= currentPeriodEnd
    );
  }, [completedSessions, currentPeriodStart, currentPeriodEnd]);

  const uniqueExerciseNames = useMemo(() => {
    const set = new Set<string>();
    for (const s of periodSessions.length > 0 ? periodSessions : completedSessions) {
      for (const ex of s.exercises || []) {
        if (ex.exerciseName) set.add(ex.exerciseName);
      }
    }
    return Array.from(set);
  }, [periodSessions, completedSessions]);

  const exerciseSummaries = useMemo(() => {
    const targetSessions = periodSessions.length > 0 ? periodSessions : completedSessions;
    return uniqueExerciseNames
      .map((name) => calculateExerciseProgress(targetSessions, name).summary)
      .filter((s): s is NonNullable<typeof s> => Boolean(s && s.sessionRecords.length > 0))
      .sort((a, b) => b.overallTotalVolume - a.overallTotalVolume);
  }, [uniqueExerciseNames, periodSessions, completedSessions]);

  // Goal aggregation
  const achievedGoals = useMemo(
    () => goals.filter((g) => g.status === 'ACHIEVED'),
    [goals]
  );
  const inProgressGoals = useMemo(
    () => goals.filter((g) => g.status === 'ACTIVE'),
    [goals]
  );

  // Photos in period
  const periodPhotos = useMemo(() => {
    const pList = photos.filter(
      (p) => p.takenAt >= currentPeriodStart && p.takenAt <= currentPeriodEnd
    );
    return pList.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  }, [photos, currentPeriodStart, currentPeriodEnd]);

  // Handle open create modal with intelligent defaults
  const handleOpenCreateModal = () => {
    const completedCount = completedSessions.length;
    let defType: ProgressReviewType = 'TEN_SESSION';
    let defMilestone = 10;

    if (completedCount >= 20) {
      defType = 'TWENTY_SESSION';
      defMilestone = 20;
    } else if (completedCount >= 10) {
      defType = 'TEN_SESSION';
      defMilestone = 10;
    } else {
      defType = 'MANUAL';
      defMilestone = completedCount || 1;
    }

    setReviewType(defType);
    setMilestoneCount(defMilestone);
    setReviewDate(localToday());
    setPeriodStart(member.startDate || '2026-01-01');
    setPeriodEnd(localToday());

    // Pre-populate summary draft
    const startW = weightComp.startValue ? `${weightComp.startValue}kg` : '';
    const curW = weightComp.currentValue ? `${weightComp.currentValue}kg` : '';
    const deltaW = weightComp.deltaFormatted ? `${weightComp.deltaFormatted}kg` : '';
    let autoSummary = `PT ${completedCount}회차 수행 결과 점검.`;
    if (weightComp.hasData && weightComp.count > 1) {
      autoSummary += ` 체중 ${startW} → ${curW} (${deltaW}).`;
    }
    if (muscleComp.hasData && muscleComp.count > 1) {
      autoSummary += ` 골격근량 ${muscleComp.deltaFormatted}kg 변화.`;
    }
    setSummary(autoSummary);

    setTrainerFeedback(
      `회원님께서 성실하게 출석해주신 덕분에 기본 자세가 크게 향상되었고, 주요 종목의 가동범위와 중량이 안정적으로 향상되었습니다. 다음 회차에는 코어 안정화와 근지구력 강화를 병행할 예정입니다.`
    );
    setNextGoalsInput('주 3회 출석 유지, 스쿼트 자세 교정 완성, 유산소 20분 주 2회 병행');
    setAiReviewDraft(null);
    setAiDraftNotice(null);
    setIsCreateModalOpen(true);
  };

  // Phase 7: AI Review Draft Assistant (Uses ONLY verified existing metrics, NO hallucinations, strictly draft-only)
  const handleGenerateAiReview = async () => {
    setIsAiDrafting(true);
    setAiDraftNotice(null);
    try {
      const inPeriodSolo = soloLogs.filter(
        (log) => log.date >= periodStart && log.date <= periodEnd
      );

      const request: AiReviewDraftRequest = {
        reviewType,
        period: { start: periodStart, end: periodEnd },
        stats: {
          completedPtCount: periodSessions.length,
          completedSoloCount: inPeriodSolo.length,
          bodyChanges: {
            weightChange: weightComp.hasData && weightComp.count > 1 ? `${weightComp.deltaFormatted}kg` : undefined,
            muscleChange: muscleComp.hasData && muscleComp.count > 1 ? `${muscleComp.deltaFormatted}kg` : undefined,
            fatPercentageChange: fatComp.hasData && fatComp.count > 1 ? `${fatComp.deltaFormatted}%` : undefined,
            waistChange: waistComp.hasData && waistComp.count > 1 ? `${waistComp.deltaFormatted}cm` : undefined
          },
          exerciseProgress: exerciseSummaries.slice(0, 4).map((e) => ({
            exerciseName: e.exerciseName,
            startWeight: e.earliestMaxWeight,
            currentWeight: e.latestMaxWeight,
            maxWeightDiff: e.weightDelta
          })),
          achievedGoals: achievedGoals.map((g) => g.title),
          inProgressGoals: inProgressGoals.map((g) => g.title)
        },
        trainerNotes: summary.trim() ? `트레이너 사전 입력 메모: ${summary}` : undefined
      };

      const draft = await generateAiReviewDraft(request, member.memberId);
      setAiReviewDraft(draft);
      setAiDraftNotice('AI 리뷰 피드백 초안이 생성되었습니다. 내용을 검토한 후 [초안 적용]을 눌러주세요.');
    } catch (err) {
      console.error('Failed to generate AI review draft:', err);
      setAiDraftNotice('AI 초안 생성에 실패했습니다. 직접 입력해주세요.');
    } finally {
      setIsAiDrafting(false);
    }
  };

  // Phase 7: Apply review draft to modal form (Explicit Trainer Confirmation, NO AUTO SAVE)
  const handleApplyAiReviewDraft = () => {
    if (!aiReviewDraft) return;
    if (aiReviewDraft.summary) {
      setSummary(aiReviewDraft.summary);
    }
    if (aiReviewDraft.trainerFeedback) {
      setTrainerFeedback(aiReviewDraft.trainerFeedback);
    }
    if (aiReviewDraft.suggestedNextGoals && aiReviewDraft.suggestedNextGoals.length > 0) {
      setNextGoalsInput(aiReviewDraft.suggestedNextGoals.join(', '));
    }
    setAiReviewDraft(null);
    setAiDraftNotice('초안이 입력 폼에 적용되었습니다! 필요에 따라 수정한 후 하단의 [성과 리뷰 저장]을 누르세요.');
    setTimeout(() => setAiDraftNotice(null), 4000);
  };

  // Submit Create Review
  const handleCreateReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || !trainerFeedback.trim()) {
      setError('리뷰 요약과 트레이너 총평을 입력해주세요.');
      return;
    }

    if (!reviewDate || !isValidDate(reviewDate)) {
      setError('유효한 리뷰 일자를 입력해주세요 (YYYY-MM-DD).');
      return;
    }
    if (!periodStart || !isValidDate(periodStart)) {
      setError('유효한 점검 기간 시작일을 입력해주세요 (YYYY-MM-DD).');
      return;
    }
    if (!periodEnd || !isValidDate(periodEnd)) {
      setError('유효한 점검 기간 종료일을 입력해주세요 (YYYY-MM-DD).');
      return;
    }
    if (periodEnd < periodStart) {
      setError('점검 기간 종료일은 시작일보다 이전일 수 없습니다.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const nextGoals = nextGoalsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const newReview = await createProgressReview(
        {
          centerId: member.centerId,
          memberId: member.memberId,
          trainerId: currentTrainerId || member.trainerId,
          reviewType,
          reviewDate,
          periodStart,
          periodEnd,
          summary: summary.trim(),
          trainerFeedback: trainerFeedback.trim(),
          nextGoals: nextGoals.length > 0 ? nextGoals : undefined,
          milestoneSessionCount: milestoneCount,
          completedSessionCountAtReview: completedSessions.length
        },
        userRole,
        currentTrainerId
      );

      setIsCreateModalOpen(false);
      setSelectedReview(newReview);
      setSuccessMessage('성과 리뷰가 성공적으로 저장되었습니다.');
      setTimeout(() => setSuccessMessage(null), 3000);

      if (onRefresh) await onRefresh();
      await loadData();
    } catch (err: any) {
      setError(err?.message || '성과 리뷰 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Review
  const handleDeleteReview = async () => {
    if (!deletingReviewId) return;
    try {
      setError(null);
      await deleteProgressReview(
        member.centerId,
        deletingReviewId,
        userRole,
        currentTrainerId
      );
      setDeletingReviewId(null);
      if (selectedReview?.reviewId === deletingReviewId) {
        setSelectedReview(null);
      }
      setSuccessMessage('성과 리뷰가 삭제되었습니다.');
      setTimeout(() => setSuccessMessage(null), 3000);
      if (onRefresh) await onRefresh();
      await loadData();
    } catch (err: any) {
      setError(err?.message || '리뷰 삭제에 실패했습니다.');
    }
  };

  // Print function
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`space-y-6 ${isReviewMode ? 'print:p-0' : ''}`}>
      {/* Messages */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2 print:hidden">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* REVIEW MODE BANNER / EXIT CONTROLS (STEP 19, 20) */}
      {isReviewMode ? (
        <div className="bg-stone-900 text-white p-4 rounded-2xl flex items-center justify-between print:hidden shadow-lg">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-xs font-bold">회원과 함께 보는 성과 리뷰 모드 실행 중</h3>
              <p className="text-[11px] text-stone-400">
                관리용 편집/삭제 버튼이 숨겨지고 인쇄 및 상담에 최적화된 화면입니다.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-semibold"
            >
              <Printer className="w-3.5 h-3.5" />
              인쇄 / PDF 저장
            </button>
            <button
              onClick={() => setIsReviewMode(false)}
              className="px-3 py-1.5 bg-white text-stone-900 hover:bg-stone-100 rounded-lg text-xs font-bold"
            >
              리뷰 모드 종료
            </button>
          </div>
        </div>
      ) : (
        /* STANDARD HEADER */
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200">
          <div>
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-stone-800" />
              PT 여정 성과 리포트 & 정기 리뷰
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              처음 운동 목표부터 현재까지의 체성분 변화, 운동 수행능력, 달성 목표를 한눈에 리뷰합니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-enter-review-mode"
              onClick={() => setIsReviewMode(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-800 transition-colors shadow-xs"
            >
              <Eye className="w-3.5 h-3.5" />
              회원과 함께 보기
            </button>
            <button
              id="btn-open-create-review"
              onClick={handleOpenCreateModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-white transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              새 성과 리뷰 작성
            </button>
          </div>
        </div>
      )}

      {/* REVIEW SELECTION PILLS (When not printing/review mode) */}
      {!isReviewMode && reviews.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-stone-500 font-semibold shrink-0">기록된 리뷰:</span>
          {reviews.map((r) => (
            <button
              key={r.reviewId}
              onClick={() => setSelectedReview(r)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 ${
                selectedReview?.reviewId === r.reviewId
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
              }`}
            >
              <span>{REVIEW_TYPE_LABELS[r.reviewType]}</span>
              <span className="font-mono text-[10px] opacity-80">({r.reviewDate})</span>
            </button>
          ))}
        </div>
      )}

      {/* 10 CORE REVIEW SECTIONS (STEP 15, STEP 19) */}
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
        isReviewMode={isReviewMode}
        isMemberView={false}
        onDelete={selectedReview ? () => setDeletingReviewId(selectedReview.reviewId) : undefined}
        onNavigateToGoal={onNavigateToGoal}
      />

      {/* CREATE REVIEW MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-sm font-bold text-stone-900">새 PT 성과 리뷰 작성</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateReviewSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    리뷰 유형
                  </label>
                  <select
                    value={reviewType}
                    onChange={(e) => setReviewType(e.target.value as ProgressReviewType)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800 bg-white"
                  >
                    <option value="TEN_SESSION">10회차 중간 점검</option>
                    <option value="TWENTY_SESSION">20회차 성과 점검</option>
                    <option value="CONTRACT_END">계약 종료 종합 리뷰</option>
                    <option value="MANUAL">수시 성과 리뷰</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="review-date-input" className="block text-xs font-semibold text-stone-700 mb-1">
                    리뷰 작성일
                  </label>
                  <DateInputField
                    id="review-date-input"
                    required
                    value={reviewDate}
                    onChange={setReviewDate}
                    className="!text-xs !py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="review-period-start-input" className="block text-xs font-semibold text-stone-700 mb-1">
                    리뷰 시작일
                  </label>
                  <DateInputField
                    id="review-period-start-input"
                    required
                    value={periodStart}
                    onChange={setPeriodStart}
                    className="!text-xs !py-2"
                  />
                </div>

                <div>
                  <label htmlFor="review-period-end-input" className="block text-xs font-semibold text-stone-700 mb-1">
                    리뷰 종료일
                  </label>
                  <DateInputField
                    id="review-period-end-input"
                    required
                    value={periodEnd}
                    onChange={setPeriodEnd}
                    className="!text-xs !py-2"
                  />
                </div>
              </div>

              {/* Phase 7: AI 리뷰 초안 생성 (Actual verified metrics only, Draft only, Trainer confirmation required) */}
              <div className="bg-gradient-to-br from-stone-50 via-stone-50 to-amber-50/30 border border-stone-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-stone-900 text-amber-400 flex items-center justify-center text-xs shadow-2xs">
                      <Sparkles className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                        AI 리뷰 초안 보조
                        <span className="text-[10px] font-medium text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded">
                          실측 데이터 기반
                        </span>
                      </span>
                      <span className="text-[10px] text-stone-500 block">
                        신체 변화, 운동 수행능력, PT 및 개인운동 출석 등 실제 계산된 수치만을 바탕으로 피드백 초안을 작성합니다.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isAiDrafting}
                    onClick={handleGenerateAiReview}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 transition-all shadow-2xs cursor-pointer shrink-0"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isAiDrafting ? 'animate-spin text-amber-400' : 'text-amber-400'}`} />
                    <span>{isAiDrafting ? '초안 생성 중...' : 'AI 리뷰 초안'}</span>
                  </button>
                </div>

                {/* Real Data Preview Badge Row */}
                <div className="flex items-center gap-2 flex-wrap text-[10px] text-stone-600 bg-white/80 p-2 rounded-lg border border-stone-200/80">
                  <span className="font-semibold text-stone-800">참고 실측치:</span>
                  <span className="bg-stone-100 px-1.5 py-0.5 rounded">PT {periodSessions.length}회</span>
                  <span className="bg-stone-100 px-1.5 py-0.5 rounded">
                    개인운동 {soloLogs.filter((l) => l.date >= periodStart && l.date <= periodEnd).length}회
                  </span>
                  {weightComp.hasData && weightComp.count > 1 && (
                    <span className="bg-stone-100 px-1.5 py-0.5 rounded">체중 {weightComp.deltaFormatted}kg</span>
                  )}
                  {muscleComp.hasData && muscleComp.count > 1 && (
                    <span className="bg-stone-100 px-1.5 py-0.5 rounded">골격근량 {muscleComp.deltaFormatted}kg</span>
                  )}
                  <span className="bg-stone-100 px-1.5 py-0.5 rounded">주요 운동 {exerciseSummaries.length}종목</span>
                </div>

                {aiDraftNotice && (
                  <div className="p-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span>{aiDraftNotice}</span>
                  </div>
                )}

                {/* AI Generated Review Draft Box */}
                {aiReviewDraft && (
                  <div className="p-3.5 bg-white border-2 border-stone-800 rounded-xl space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b border-stone-100 pb-1.5">
                      <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        생성된 리뷰 초안 (수정 후 적용)
                      </span>
                      <button
                        type="button"
                        onClick={() => setAiReviewDraft(null)}
                        className="text-[11px] text-stone-400 hover:text-stone-600"
                      >
                        초안 닫기 ✕
                      </button>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-stone-700">성과 핵심 요약:</label>
                      <input
                        type="text"
                        value={aiReviewDraft.summary}
                        onChange={(e) => setAiReviewDraft({ ...aiReviewDraft, summary: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-stone-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-800"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-stone-700">트레이너 총평 및 정성 피드백:</label>
                      <textarea
                        rows={3}
                        value={aiReviewDraft.trainerFeedback}
                        onChange={(e) => setAiReviewDraft({ ...aiReviewDraft, trainerFeedback: e.target.value })}
                        className="w-full p-2 text-xs border border-stone-300 rounded-lg bg-stone-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-800 leading-relaxed"
                      />
                    </div>

                    {aiReviewDraft.suggestedNextGoals && aiReviewDraft.suggestedNextGoals.length > 0 && (
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-stone-700">추천 다음 목표:</label>
                        <div className="flex flex-wrap gap-1.5">
                          {aiReviewDraft.suggestedNextGoals.map((g, idx) => (
                            <span
                              key={idx}
                              className="text-[11px] bg-stone-100 text-stone-800 px-2 py-0.5 rounded border border-stone-200"
                            >
                              🎯 {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                      <span className="text-[10px] text-stone-500">
                        * [초안 적용하기]를 누르면 아래 입력 폼으로 복사됩니다.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAiReviewDraft(null)}
                          className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 border border-stone-300 rounded-lg bg-white"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyAiReviewDraft}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          초안 적용하기
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  성과 핵심 요약 (Summary)
                </label>
                <input
                  type="text"
                  required
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="예: 10회차 완료 체중 3kg 감량 및 스쿼트 70kg 달성"
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  트레이너 총평 및 정성 피드백
                </label>
                <textarea
                  rows={4}
                  required
                  value={trainerFeedback}
                  onChange={(e) => setTrainerFeedback(e.target.value)}
                  placeholder="회원의 출석 성실도, 자세 개선, 수행능력 변화에 대한 솔직하고 격려하는 총평을 작성하세요."
                  className="w-full p-2.5 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  회원과 함께 세운 다음 목표 (쉼표로 구분)
                </label>
                <input
                  type="text"
                  value={nextGoalsInput}
                  onChange={(e) => setNextGoalsInput(e.target.value)}
                  placeholder="예: 체지방 2% 추가 감량, 턱걸이 5회 성공, 주 3회 자율 유산소"
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? '저장 중...' : '리뷰 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deletingReviewId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-stone-900">성과 리뷰 삭제 확인</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              선택한 성과 리뷰 기록이 영구적으로 삭제됩니다. 정말 삭제하시겠습니까?
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setDeletingReviewId(null)}
                className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteReview}
                className="px-4 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
