import React from 'react';
import {
  FileText,
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
  ProgressPhoto
} from '../types';

const REVIEW_TYPE_LABELS: Record<ProgressReviewType, string> = {
  TEN_SESSION: '10회차 중간 점검',
  TWENTY_SESSION: '20회차 성과 점검',
  CONTRACT_END: '계약 종료 종합 리뷰',
  MANUAL: '수시 성과 리뷰'
};

export interface ReviewPresentationCardProps {
  member: Member;
  review: ProgressReview | null;
  consultation: Consultation | null;
  completedSessions: PtSession[];
  periodSessions: PtSession[];
  currentPeriodStart: string;
  currentPeriodEnd: string;
  measurements: BodyMeasurement[];
  weightComp: any;
  muscleComp: any;
  fatComp: any;
  waistComp: any;
  exerciseSummaries: any[];
  photos: ProgressPhoto[];
  periodPhotos: ProgressPhoto[];
  achievedGoals: MemberGoal[];
  inProgressGoals: MemberGoal[];
  goals: MemberGoal[];
  isReviewMode?: boolean;
  isMemberView?: boolean;
  onDelete?: () => void;
  onClose?: () => void;
  onNavigateToGoal?: () => void;
}

export const ReviewPresentationCard: React.FC<ReviewPresentationCardProps> = ({
  member,
  review,
  consultation,
  completedSessions,
  periodSessions,
  currentPeriodStart,
  currentPeriodEnd,
  measurements,
  weightComp,
  muscleComp,
  fatComp,
  waistComp,
  exerciseSummaries,
  photos,
  periodPhotos,
  achievedGoals,
  inProgressGoals,
  goals,
  isReviewMode = false,
  isMemberView = false,
  onDelete,
  onClose,
  onNavigateToGoal
}) => {
  return (
    <div className="@container space-y-6" id={`review-card-${review?.reviewId || 'current'}`}>
      {/* 0. Header Summary Card */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                {review ? REVIEW_TYPE_LABELS[review.reviewType] : '현재 시점 PT 진행 현황 요약'}
              </span>
              <span className="text-xs text-stone-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                리뷰일: {review?.reviewDate || currentPeriodEnd}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-stone-900 mt-2">
              {review?.summary || `${member.name} 회원님의 PT 여정 성장 리뷰`}
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              점검 대상 기간: <span className="block">{currentPeriodStart}</span><span className="block">~ {currentPeriodEnd}</span>
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {!isMemberView && !isReviewMode && review && onDelete && (
              <button
                type="button"
                id="btn-delete-review"
                onClick={onDelete}
                className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                title="리뷰 삭제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {onClose && (
              <button
                type="button"
                id="btn-close-review"
                onClick={onClose}
                className="p-1.5 text-stone-500 hover:text-stone-800 rounded-lg hover:bg-stone-100 transition-colors"
                title="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* 1. 처음 목표 (Consultation Motivation & Purpose) */}
        <div className="p-4 bg-stone-50/80 rounded-xl border border-stone-200/80 space-y-2">
          <h4 className="text-xs font-bold text-stone-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-600" />
            1. 처음 시작할 때의 목표와 계기
          </h4>
          {consultation ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-stone-700">
              <div>
                <span className="text-stone-500 block text-[11px]">상담 시 주요 운동 목적:</span>
                <p className="font-semibold text-stone-900 mt-0.5">
                  {consultation.exercisePurposes.join(', ') || '체력 증진 및 체형 관리'}
                </p>
              </div>
              {consultation.motivationInterview?.biggestReason && (
                <div>
                  <span className="text-stone-500 block text-[11px]">PT를 결심한 가장 큰 계기:</span>
                  <p className="italic text-stone-800 mt-0.5">
                    "{consultation.motivationInterview.biggestReason}"
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-stone-500">
              최초 상담 기록이 등록되지 않았습니다. 기본 등록 정보 기준으로 리뷰가 진행됩니다.
            </p>
          )}
        </div>

        {/* 2. PT 진행 현황 (Sessions progress) */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-stone-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-600" />
            2. PT 수업 진행 현황
          </h4>
          <div className="grid grid-cols-2 @min-[640px]:grid-cols-4 gap-2 sm:gap-3">
            <div className="min-w-0 bg-stone-50 p-2 sm:p-3 rounded-xl border border-stone-200">
              <span className="text-[11px] text-stone-500 block">완료 수업</span>
              <span className="font-mono text-base sm:text-lg font-bold text-stone-900 break-keep">
                {completedSessions.length}회
              </span>
            </div>
            <div className="min-w-0 bg-stone-50 p-2 sm:p-3 rounded-xl border border-stone-200">
              <span className="text-[11px] text-stone-500 block">리뷰 구간</span>
              <span className="font-mono text-[11px] sm:text-xs font-semibold text-stone-700 block mt-1 whitespace-nowrap">
                <span className="block">{currentPeriodStart}</span><span className="block">~ {currentPeriodEnd}</span>
              </span>
            </div>
            <div className="min-w-0 bg-stone-50 p-2 sm:p-3 rounded-xl border border-stone-200">
              <span className="text-[11px] text-stone-500 block">구간 출석 일수</span>
              <span className="font-mono text-base sm:text-lg font-bold text-stone-900 break-keep">
                <span className="inline-block whitespace-nowrap">{periodSessions.length}회 완료</span>
              </span>
            </div>
            <div className="min-w-0 bg-stone-50 p-2 sm:p-3 rounded-xl border border-stone-200">
              <span className="text-[11px] text-stone-500 block">목표 달성률</span>
              <span className="font-mono text-lg font-bold text-emerald-700">
                {goals.length > 0
                  ? `${Math.round((achievedGoals.length / goals.length) * 100)}%`
                  : '0%'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 신체 변화 (Body Changes: Weight, Muscle, Fat, Circumference) */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <h4 className="text-xs font-bold text-stone-900 flex items-center gap-2 border-b border-stone-100 pb-3">
          <Activity className="w-4 h-4 text-teal-600" />
          3. 신체 지표 실측 변화 (시작점 vs 현재)
        </h4>

        {measurements.length === 0 ? (
          <p className="text-xs text-stone-500 py-4 text-center">
            등록된 신체 측정 기록이 없습니다.
          </p>
        ) : measurements.length === 1 ? (
          <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600">
            현재 1회의 기준 측정값({measurements[0].measuredAt})만 등록되어 있어 시작 기준값으로 표시됩니다.
            2회차 측정 이후부터 구체적인 증감 변화가 표시됩니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* 체중 */}
            <div className="p-3.5 bg-stone-50/70 rounded-xl border border-stone-200 min-w-0 flex flex-col justify-between">
              <div className="flex items-center justify-between flex-wrap gap-1.5 text-xs text-stone-500 min-w-0">
                <span className="truncate">체중</span>
                {weightComp?.deltaFormatted && (
                  <span className="font-mono font-bold text-stone-800 bg-white px-2 py-0.5 rounded border border-stone-200 shrink-0">
                    {weightComp.deltaFormatted} kg
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2 flex-wrap min-w-0">
                <span className="text-xs text-stone-400 shrink-0">시작 {weightComp?.startValue}kg</span>
                <ArrowRight className="w-3 h-3 text-stone-400 shrink-0" />
                <span className="text-lg font-bold font-mono text-stone-900 break-words">
                  {weightComp?.currentValue} kg
                </span>
              </div>
            </div>

            {/* 골격근량 */}
            <div className="p-3.5 bg-stone-50/70 rounded-xl border border-stone-200 min-w-0 flex flex-col justify-between">
              <div className="flex items-center justify-between flex-wrap gap-1.5 text-xs text-stone-500 min-w-0">
                <span className="truncate">골격근량</span>
                {muscleComp?.deltaFormatted && (
                  <span className="font-mono font-bold text-stone-800 bg-white px-2 py-0.5 rounded border border-stone-200 shrink-0">
                    {muscleComp.deltaFormatted} kg
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2 flex-wrap min-w-0">
                <span className="text-xs text-stone-400 shrink-0">시작 {muscleComp?.startValue}kg</span>
                <ArrowRight className="w-3 h-3 text-stone-400 shrink-0" />
                <span className="text-lg font-bold font-mono text-stone-900 break-words">
                  {muscleComp?.currentValue} kg
                </span>
              </div>
            </div>

            {/* 체지방률 */}
            <div className="p-3.5 bg-stone-50/70 rounded-xl border border-stone-200 min-w-0 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between flex-wrap gap-1.5 text-xs text-stone-500 min-w-0">
                <span className="truncate">체지방률</span>
                {fatComp?.deltaFormatted && (
                  <span className="font-mono font-bold text-stone-800 bg-white px-2 py-0.5 rounded border border-stone-200 shrink-0">
                    {fatComp.deltaFormatted} %p
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2 flex-wrap min-w-0">
                <span className="text-xs text-stone-400 shrink-0">시작 {fatComp?.startValue}%</span>
                <ArrowRight className="w-3 h-3 text-stone-400 shrink-0" />
                <span className="text-lg font-bold font-mono text-stone-900 break-words">
                  {fatComp?.currentValue} %
                </span>
              </div>
            </div>
          </div>
        )}

        {waistComp?.hasData && waistComp.count > 1 && (
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs flex items-center justify-between">
            <span className="text-stone-600">허리둘레 변화</span>
            <span className="font-mono font-bold text-stone-900">
              {waistComp.startValue}cm → {waistComp.currentValue}cm ({waistComp.deltaFormatted}cm)
            </span>
          </div>
        )}
      </div>

      {/* 4. 운동 수행 변화 (Exercise performance: actual weights/reps, no 1RM guesswork) */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <h4 className="text-xs font-bold text-stone-900 flex items-center gap-2 border-b border-stone-100 pb-3">
          <Dumbbell className="w-4 h-4 text-stone-800" />
          4. 주요 종목 운동 수행능력 향상 (수업일지 실측 기반)
        </h4>

        {exerciseSummaries.length === 0 ? (
          <p className="text-xs text-stone-500 py-3 text-center">
            수업 일지에 기록된 운동 세트 데이터가 아직 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {exerciseSummaries.slice(0, 6).map((ex) => (
              <div
                key={ex.exerciseName}
                className="p-3.5 bg-stone-50/80 rounded-xl border border-stone-200 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-stone-900">{ex.exerciseName}</span>
                  {ex.sessionRecords.length > 1 && ex.weightDelta !== undefined && (
                    <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      {ex.weightDeltaFormatted} kg
                    </span>
                  )}
                </div>

                <div className="text-xs space-y-1">
                  <div className="flex items-baseline justify-between text-stone-600">
                    <span>최고 중량:</span>
                    <span className="font-mono font-bold text-stone-900">
                      {ex.overallMaxWeight} kg
                    </span>
                  </div>
                  {ex.earliestMaxWeight !== undefined && ex.latestMaxWeight !== undefined && (
                    <div className="text-[10px] text-stone-400 flex items-center justify-between">
                      <span>시작 → 최근:</span>
                      <span className="font-mono">
                        {ex.earliestMaxWeight}kg → {ex.latestMaxWeight}kg
                      </span>
                    </div>
                  )}
                  <div className="text-[10px] text-stone-400 pt-1 border-t border-stone-200/60 flex items-center justify-between">
                    <span>수행 횟수 / 누적 볼륨:</span>
                    <span>{ex.sessionRecords.length}회차 / {ex.overallTotalVolume.toLocaleString()}kg</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Before & After Photos (Photos in period) */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <h4 className="text-xs font-bold text-stone-900 flex items-center gap-2 border-b border-stone-100 pb-3">
          <Camera className="w-4 h-4 text-stone-800" />
          5. 체형 전/후 눈바디 사진
        </h4>

        {photos.length === 0 ? (
          <p className="text-xs text-stone-500 py-3 text-center">
            등록된 체형 사진이 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-2 @min-[640px]:grid-cols-4 gap-2 sm:gap-3">
            {periodPhotos.slice(0, 4).map((p) => (
              <div
                key={p.photoId}
                className="bg-stone-50 rounded-xl border border-stone-200 overflow-hidden"
              >
                <div className="aspect-3/4 bg-stone-100 flex items-center justify-center overflow-hidden">
                  <img
                    src={p.photoUrl}
                    alt={p.caption || '체형 사진'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="p-2 text-[10px] font-mono text-stone-600 bg-white border-t border-stone-100 flex items-center justify-between">
                  <span>{p.takenAt}</span>
                  <span className="font-bold">{p.viewType}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6 & 7. 달성한 목표 & 진행 중 목표 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 달성한 목표 */}
        <div className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs space-y-3">
          <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5 text-emerald-800 border-b border-stone-100 pb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            6. 지금까지 달성한 목표 ({achievedGoals.length}개)
          </h4>
          {achievedGoals.length === 0 ? (
            <p className="text-xs text-stone-400 py-2">아직 완료 표시된 목표가 없습니다.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {achievedGoals.map((g) => (
                <li
                  key={g.goalId}
                  className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-200/80 flex items-center justify-between"
                >
                  <span className="font-semibold text-emerald-950">{g.title}</span>
                  {g.targetValue && (
                    <span className="font-mono text-xs text-emerald-800 font-bold">
                      {g.targetValue} {g.targetUnit}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 진행 중 목표 */}
        <div className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs space-y-3">
          <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5 text-amber-800 border-b border-stone-100 pb-2">
            <TrendingUp className="w-4 h-4 text-amber-600" />
            7. 현재 진행 중인 목표 ({inProgressGoals.length}개)
          </h4>
          {inProgressGoals.length === 0 ? (
            <p className="text-xs text-stone-400 py-2">진행 중인 목표가 없습니다.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {inProgressGoals.map((g) => (
                <li
                  key={g.goalId}
                  className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-stone-900 block">{g.title}</span>
                    {g.targetDate && (
                      <span className="text-[10px] text-stone-400">기한: {g.targetDate}</span>
                    )}
                  </div>
                  {g.targetValue && (
                    <span className="font-mono text-xs text-stone-700 font-medium">
                      목표 {g.targetValue} {g.targetUnit}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 8. 트레이너 총평 (Trainer Feedback) */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-3">
        <h4 className="text-xs font-bold text-stone-900 flex items-center gap-2 border-b border-stone-100 pb-3">
          <Sparkles className="w-4 h-4 text-amber-500" />
          8. 담당 트레이너 종합 피드백
        </h4>
        <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-800 leading-relaxed whitespace-pre-line font-medium">
          {review?.trainerFeedback ||
            `회원님께서 바쁜 일상 속에서도 주 2~3회 꾸준히 출석하며 기초 근력과 가동범위를 성공적으로 확립하셨습니다. 특히 스쿼트와 상체 프레스 계열의 자세 안정성이 크게 향상되었으며, 앞으로는 심폐 지구력과 세부 목표 달성에 집중할 예정입니다.`}
        </div>
      </div>

      {/* 9 & 10. 다음 목표 & 다음 단계 설정 */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <h4 className="text-xs font-bold text-stone-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-stone-800" />
            9 & 10. 다음 목표 및 향후 운동 계획
          </h4>
          {onNavigateToGoal && !isReviewMode && !isMemberView && (
            <button
              type="button"
              onClick={onNavigateToGoal}
              className="text-xs font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-1"
            >
              목표 관리 탭 바로가기 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="space-y-2">
          {review?.nextGoals && review.nextGoals.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {review.nextGoals.map((ng, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-purple-50/50 rounded-xl border border-purple-200/60 text-xs flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded-full bg-purple-200 text-purple-900 flex items-center justify-center font-bold text-[10px]">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-purple-950">{ng}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-500">
              다음 주기 목표는 담당 트레이너와의 상담을 통해 새롭게 수립됩니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
