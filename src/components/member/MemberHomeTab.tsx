import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Target,
  Activity,
  Dumbbell,
  CheckCircle2,
  TrendingUp,
  Award,
  ChevronRight,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  User,
  Flame,
  X,
  FileText
} from 'lucide-react';
import type {
  Member,
  PtContract,
  PtSession,
  MemberGoal,
  BodyMeasurement,
  ProgressReview,
  Consultation,
  WeeklyActivitySummary
} from '../../types';
import { calculateMemberSessionSummary } from '../../services/dataService';

interface MemberHomeTabProps {
  member: Member;
  contracts: PtContract[];
  sessions: PtSession[];
  goals: MemberGoal[];
  measurements: BodyMeasurement[];
  reviews: ProgressReview[];
  consultation: Consultation | null;
  weeklySummary?: WeeklyActivitySummary | null;
  onNavigateTab: (tab: 'home' | 'workout' | 'sessions' | 'goals' | 'photos' | 'reviews') => void;
  onSelectSession?: (session: PtSession) => void;
}

export const MemberHomeTab: React.FC<MemberHomeTabProps> = ({
  member,
  contracts,
  sessions,
  goals,
  measurements,
  reviews,
  consultation,
  weeklySummary,
  onNavigateTab,
  onSelectSession
}) => {
  // Modal state for full review display
  const [reviewModalData, setReviewModalData] = useState<{
    title: string;
    subtitle: string;
    content: string;
  } | null>(null);

  // Unified PT Contract & Session Summary
  const sessionSummary = calculateMemberSessionSummary(contracts, sessions);
  const activeContract = sessionSummary.primaryContract;
  const totalSessions = sessionSummary.activeTotalSessions;
  const usedSessions = sessionSummary.activeUsedSessions;
  const remainingSessions = sessionSummary.activeRemainingSessions;
  const completionRate = sessionSummary.completionRate;

  // Next or latest sessions
  const completedSessions = sessions.filter((s) => s.status === 'COMPLETED');
  const scheduledSessions = sessions.filter((s) => s.status === 'SCHEDULED');
  const nextScheduledSession = scheduledSessions[0];
  const latestCompletedSession = completedSessions[completedSessions.length - 1];

  // Goals
  const activeGoals = goals.filter((g) => g.status === 'ACTIVE');
  const achievedGoals = goals.filter((g) => g.status === 'ACHIEVED');

  // Measurements summary
  const sortedMeasurements = [...measurements].sort(
    (a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime()
  );
  const firstMeasurement = sortedMeasurements[0];
  const latestMeasurement = sortedMeasurements[sortedMeasurements.length - 1];

  const weightDelta =
    firstMeasurement?.weightKg && latestMeasurement?.weightKg && sortedMeasurements.length > 1
      ? Math.round((latestMeasurement.weightKg - firstMeasurement.weightKg) * 10) / 10
      : null;

  const muscleDelta =
    firstMeasurement?.skeletalMuscleMassKg && latestMeasurement?.skeletalMuscleMassKg && sortedMeasurements.length > 1
      ? Math.round((latestMeasurement.skeletalMuscleMassKg - firstMeasurement.skeletalMuscleMassKg) * 10) / 10
      : null;

  const fatDelta =
    firstMeasurement?.bodyFatPercentage && latestMeasurement?.bodyFatPercentage && sortedMeasurements.length > 1
      ? Math.round((latestMeasurement.bodyFatPercentage - firstMeasurement.bodyFatPercentage) * 10) / 10
      : null;

  // Latest Review
  const latestReview = reviews[reviews.length - 1];

  return (
    <div className="space-y-4 pb-6" id="member-home-view">
      {/* 1. Welcome Card */}
      <div className="bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/10 text-stone-200 backdrop-blur-xs flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              회원 안심 포털
            </span>
            <span className="text-xs text-stone-300 font-medium">
              담당: {consultation?.trainerName || '배정 트레이너'}
            </span>
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight">
              안녕하세요, <span className="text-purple-300">{member.name}</span>님!
            </h2>
            <p className="text-xs text-stone-300 mt-1">
              오늘도 건강하고 활기찬 운동 여정을 함께합니다.
            </p>
          </div>

          {/* PT Contract Progress */}
          {sessionSummary.hasActiveContracts ? (
            <div className="bg-white/10 rounded-xl p-3.5 backdrop-blur-xs space-y-2 border border-white/10">
              <div className="flex items-center justify-between text-xs gap-2 min-w-0">
                <span className="font-semibold text-stone-200 truncate">
                  {activeContract?.title || 'PT 정기 회원권'}
                  {sessionSummary.activeContractsCount > 1 && (
                    <span className="ml-1 text-[10px] text-purple-200 bg-white/10 px-1.5 py-0.2 rounded font-normal">
                      총 {sessionSummary.activeContractsCount}건 합산
                    </span>
                  )}
                </span>
                <span className="font-mono text-emerald-300 font-bold shrink-0">
                  잔여 {remainingSessions}회 / {totalSessions}회
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-stone-700/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${completionRate}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-stone-300 pt-0.5">
                <span>완료 {usedSessions}회 | 진행률 {completionRate}%</span>
                <span>총 잔여: {remainingSessions}회</span>
              </div>
            </div>
          ) : (
            <div className="bg-white/10 rounded-xl p-3 text-xs text-stone-300">
              등록된 활성 PT 이용권이 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* 2. Next Session or Recent Session Card */}
      {nextScheduledSession ? (
        <div className="bg-white rounded-2xl border border-stone-200/90 p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              다음 예정 수업
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('sessions')}
              className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-0.5"
            >
              전체 일정 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <div>
              <span className="text-sm font-bold text-stone-900 block">
                {nextScheduledSession.date} {nextScheduledSession.time || ''}
              </span>
              <span className="text-xs text-stone-500">
                {nextScheduledSession.sessionNumber}회차 수업 예정
              </span>
            </div>
            <span className="text-xs font-semibold text-stone-600 bg-stone-100 px-2 py-1 rounded-lg">
              예약 완료
            </span>
          </div>
        </div>
      ) : latestCompletedSession ? (
        <div
          onClick={() => onSelectSession && onSelectSession(latestCompletedSession)}
          className="bg-white rounded-2xl border border-stone-200/90 p-4 shadow-xs space-y-2.5 cursor-pointer hover:border-stone-300 transition-colors overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              최근 완료한 수업
            </span>
            <span className="text-xs text-stone-400 flex items-center gap-0.5">
              기록 상세 <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2 flex-wrap min-w-0">
              <span className="text-sm font-bold text-stone-900 truncate">
                {latestCompletedSession.sessionNumber}회차 수업 ({latestCompletedSession.date})
              </span>
              <span className="text-xs font-mono font-semibold text-stone-600 shrink-0">
                {latestCompletedSession.exercises?.length || 0}개 종목 수행
              </span>
            </div>
            {Boolean(latestCompletedSession.trainerFeedback || latestCompletedSession.memberFeedback) && (() => {
              const reviewText = (latestCompletedSession.trainerFeedback || latestCompletedSession.memberFeedback || '').trim();
              return (
                <div className="mt-2.5 bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-1.5 max-w-full overflow-hidden">
                  <p className="text-xs text-stone-700 leading-relaxed italic line-clamp-3 break-words whitespace-pre-line">
                    "{reviewText}"
                  </p>
                  {reviewText.length > 50 && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReviewModalData({
                            title: `${latestCompletedSession.sessionNumber}회차 수업 리뷰 및 피드백`,
                            subtitle: `${latestCompletedSession.date} 진행 수업`,
                            content: reviewText
                          });
                        }}
                        className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 px-2 py-0.5 rounded-md hover:bg-purple-100/60 transition-colors cursor-pointer"
                      >
                        전체 보기
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* 2.5 Weekly Combined Activity Card (PT Sessions + Solo Workouts) */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </span>
            <div>
              <span className="text-xs font-bold text-stone-900 block">
                이번 주 운동 활동 (PT + 개인운동)
              </span>
              <span className="text-[10px] text-stone-400 font-mono">
                {weeklySummary ? `${weeklySummary.weekStart} ~ ${weeklySummary.weekEnd}` : '이번 주 활동'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('workout')}
            className="text-xs font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-0.5 cursor-pointer"
          >
            개인운동 모드 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center pt-1">
          <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100">
            <span className="text-[10px] text-stone-500 font-medium block">PT 수업</span>
            <span className="text-base font-bold font-mono text-stone-900 block mt-0.5">
              {weeklySummary ? weeklySummary.ptCount : 0}
              <span className="text-xs font-normal text-stone-500 ml-0.5">회</span>
            </span>
          </div>

          <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200/70">
            <span className="text-[10px] text-amber-700 font-medium block">개인운동</span>
            <span className="text-base font-bold font-mono text-amber-900 block mt-0.5">
              {weeklySummary ? weeklySummary.soloCount : 0}
              <span className="text-xs font-normal text-amber-700 ml-0.5">회</span>
            </span>
          </div>

          <div className="p-2.5 bg-stone-900 text-white rounded-xl shadow-2xs">
            <span className="text-[10px] text-stone-300 font-medium block">총 운동횟수</span>
            <span className="text-base font-bold font-mono text-white block mt-0.5">
              {weeklySummary ? weeklySummary.totalCount : 0}
              <span className="text-xs font-normal text-stone-300 ml-0.5">회</span>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Quick Stats Overview Grid */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => onNavigateTab('sessions')}
          className="bg-white p-3 rounded-2xl border border-stone-200/90 shadow-xs text-left hover:bg-stone-50/80 transition-colors"
        >
          <span className="text-[11px] text-stone-500 block mb-1">완료 수업</span>
          <span className="text-lg font-mono font-bold text-stone-900 block">
            {completedSessions.length}회
          </span>
          <span className="text-[10px] text-purple-700 font-semibold mt-1 flex items-center gap-0.5">
            일지 보기 <ChevronRight className="w-2.5 h-2.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('goals')}
          className="bg-white p-3 rounded-2xl border border-stone-200/90 shadow-xs text-left hover:bg-stone-50/80 transition-colors"
        >
          <span className="text-[11px] text-stone-500 block mb-1">달성 목표</span>
          <span className="text-lg font-mono font-bold text-emerald-700 block">
            {achievedGoals.length}/{goals.length}
          </span>
          <span className="text-[10px] text-emerald-700 font-semibold mt-1 flex items-center gap-0.5">
            목표 현황 <ChevronRight className="w-2.5 h-2.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('reviews')}
          className="bg-white p-3 rounded-2xl border border-stone-200/90 shadow-xs text-left hover:bg-stone-50/80 transition-colors"
        >
          <span className="text-[11px] text-stone-500 block mb-1">성과 리뷰</span>
          <span className="text-lg font-mono font-bold text-stone-900 block">
            {reviews.length}건
          </span>
          <span className="text-[10px] text-purple-700 font-semibold mt-1 flex items-center gap-0.5">
            리포트 <ChevronRight className="w-2.5 h-2.5" />
          </span>
        </button>
      </div>

      {/* 4. Body Measurement Summary Card */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-teal-600" />
            신체 지표 변화 (시작 대비 실측)
          </h3>
          {latestMeasurement && (
            <span className="text-[11px] font-mono text-stone-400">
              최근: {latestMeasurement.measuredAt}
            </span>
          )}
        </div>

        {sortedMeasurements.length === 0 ? (
          <p className="text-xs text-stone-400 py-2 text-center">
            등록된 신체 측정 기록이 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-center">
            {/* Weight */}
            <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100">
              <span className="text-[11px] text-stone-500 block">체중</span>
              <span className="text-sm font-bold font-mono text-stone-900 block mt-0.5">
                {latestMeasurement.weightKg ? `${latestMeasurement.weightKg}kg` : '-'}
              </span>
              {weightDelta !== null ? (
                <span
                  className={`text-[10px] font-mono font-bold block mt-0.5 ${
                    weightDelta <= 0 ? 'text-emerald-700' : 'text-stone-700'
                  }`}
                >
                  {weightDelta > 0 ? `+${weightDelta}` : weightDelta} kg
                </span>
              ) : (
                <span className="text-[10px] text-stone-400 block mt-0.5">기준 측정</span>
              )}
            </div>

            {/* Muscle */}
            <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100">
              <span className="text-[11px] text-stone-500 block">골격근량</span>
              <span className="text-sm font-bold font-mono text-stone-900 block mt-0.5">
                {latestMeasurement.skeletalMuscleMassKg ? `${latestMeasurement.skeletalMuscleMassKg}kg` : '-'}
              </span>
              {muscleDelta !== null ? (
                <span
                  className={`text-[10px] font-mono font-bold block mt-0.5 ${
                    muscleDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {muscleDelta > 0 ? `+${muscleDelta}` : muscleDelta} kg
                </span>
              ) : (
                <span className="text-[10px] text-stone-400 block mt-0.5">기준 측정</span>
              )}
            </div>

            {/* Body Fat */}
            <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100">
              <span className="text-[11px] text-stone-500 block">체지방률</span>
              <span className="text-sm font-bold font-mono text-stone-900 block mt-0.5">
                {latestMeasurement.bodyFatPercentage ? `${latestMeasurement.bodyFatPercentage}%` : '-'}
              </span>
              {fatDelta !== null ? (
                <span
                  className={`text-[10px] font-mono font-bold block mt-0.5 ${
                    fatDelta <= 0 ? 'text-emerald-700' : 'text-stone-700'
                  }`}
                >
                  {fatDelta > 0 ? `+${fatDelta}` : fatDelta} %p
                </span>
              ) : (
                <span className="text-[10px] text-stone-400 block mt-0.5">기준 측정</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 5. In-Progress Goals Preview */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
            <Target className="w-4 h-4 text-purple-600" />
            현재 집중 중인 운동 목표 ({activeGoals.length}개)
          </h3>
          <button
            type="button"
            onClick={() => onNavigateTab('goals')}
            className="text-xs text-purple-700 font-semibold hover:text-purple-900 flex items-center gap-0.5"
          >
            전체 보기 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {activeGoals.length === 0 ? (
          <p className="text-xs text-stone-400 py-2">현재 진행 중인 목표가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {activeGoals.slice(0, 3).map((goal) => (
              <div
                key={goal.goalId}
                className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 flex items-center justify-between"
              >
                <div>
                  <span className="text-xs font-bold text-stone-900 block">{goal.title}</span>
                  {goal.targetDate && (
                    <span className="text-[10px] text-stone-400">목표 기한: {goal.targetDate}</span>
                  )}
                </div>
                {goal.targetValue && (
                  <span className="text-xs font-mono font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    {goal.targetValue} {goal.targetUnit}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Latest Trainer Feedback & Review Highlight */}
      {latestReview && (
        <div className="bg-gradient-to-br from-purple-50/70 to-purple-100/40 rounded-2xl border border-purple-200 p-4 shadow-xs space-y-2.5 overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              트레이너 종합 성장 리뷰 ({latestReview.reviewDate})
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('reviews')}
              className="text-xs text-purple-700 font-semibold hover:text-purple-900 flex items-center gap-0.5 cursor-pointer"
            >
              리포트 상세 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-white/80 p-3 rounded-xl border border-purple-100 space-y-1.5 max-w-full overflow-hidden">
            <p className="text-xs text-stone-800 leading-relaxed italic line-clamp-3 break-words whitespace-pre-line">
              "{latestReview.trainerFeedback}"
            </p>
            {latestReview.trainerFeedback.length > 70 && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setReviewModalData({
                      title: '트레이너 종합 성장 리뷰',
                      subtitle: `${latestReview.reviewDate} 작성`,
                      content: latestReview.trainerFeedback
                    })
                  }
                  className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 px-2 py-0.5 rounded-md hover:bg-purple-100/60 transition-colors cursor-pointer"
                >
                  전체 보기
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review Full Text Modal */}
      {reviewModalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setReviewModalData(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-stone-200 space-y-4 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-stone-900">
                  {reviewModalData.title}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">{reviewModalData.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalData(null)}
                className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
                title="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-800 leading-relaxed break-words whitespace-pre-wrap">
                {reviewModalData.content}
              </div>
            </div>

            <div className="pt-2 border-t border-stone-100 flex justify-end">
              <button
                type="button"
                onClick={() => setReviewModalData(null)}
                className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
