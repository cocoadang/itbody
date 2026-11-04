import React, { useState, useEffect, useRef } from 'react';
import {
  Flame,
  Calendar,
  Clock,
  Dumbbell,
  CheckCircle2,
  Play,
  Pause,
  RotateCcw,
  Video,
  MessageSquare,
  Sparkles,
  ChevronRight,
  Info,
  Timer,
  Check,
  Award,
  ExternalLink,
  X,
  AlertCircle
} from 'lucide-react';
import type {
  Member,
  Exercise,
  PersonalWorkoutPlan,
  PersonalWorkoutLog,
  PersonalWorkoutPlanExercise,
  UserRole
} from '../../types';
import {
  getPersonalWorkoutPlansByMember,
  getPersonalWorkoutLogsByMember,
  getExercises,
  createPersonalWorkoutLog,
  getExerciseDefaults,
  updatePersonalWorkoutPlan
} from '../../services/dataService';
import { getYoutubeEmbedUrl, ExerciseRegistrationForm } from '../ExerciseLibraryView';

interface MemberWorkoutTabProps {
  member: Member;
  centerId: string;
  onRefreshParent?: () => void;
}

export const MemberWorkoutTab: React.FC<MemberWorkoutTabProps> = ({
  member,
  centerId,
  onRefreshParent
}) => {
  const [plans, setPlans] = useState<PersonalWorkoutPlan[]>([]);
  const [logs, setLogs] = useState<PersonalWorkoutLog[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  // Active subview: 'assigned' (plans list) | 'active-workout' (workout mode) | 'history' (completed logs)
  const [viewMode, setViewMode] = useState<'assigned' | 'active-workout' | 'history'>('assigned');

  // Currently Selected Plan for Workout Mode
  const [activePlan, setActivePlan] = useState<PersonalWorkoutPlan | null>(null);

  // Workout Mode State: Real-time Actual Sets per exercise
  interface ExerciseActualState {
    exerciseId: string;
    exerciseName: string;
    repUnit?: 'reps' | 'seconds';
    actualSets: Array<{
      setNumber: number;
      weight: number;
      reps: number;
      completed: boolean;
    }>;
    notes: string;
  }
  const [activeExerciseStates, setActiveExerciseStates] = useState<ExerciseActualState[]>([]);
  const [memberMemo, setMemberMemo] = useState('');
  const [workoutStartTime, setWorkoutStartTime] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // Rest Timer State
  const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);
  const [restTimerActive, setRestTimerActive] = useState<boolean>(false);
  const [restTargetInfo, setRestTargetInfo] = useState<{ exerciseName: string; nextSetNumber: number } | null>(null);

  // Validation & Error Feedback States
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState(false);
  const [addExerciseSearch, setAddExerciseSearch] = useState('');

  // Video Guide Modal
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [videoModalTitle, setVideoModalTitle] = useState<string>('');

  // Completion celebratory modal
  const [completedSuccessLog, setCompletedSuccessLog] = useState<PersonalWorkoutLog | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [centerId, member.memberId]);

  // Stopwatch interval
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  // Rest Timer interval
  useEffect(() => {
    let restInterval: NodeJS.Timeout | null = null;
    if (restTimerActive && restSecondsLeft !== null && restSecondsLeft > 0) {
      restInterval = setInterval(() => {
        setRestSecondsLeft((prev) => {
          if (prev === null || prev <= 1) {
            setRestTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (restInterval) clearInterval(restInterval);
    };
  }, [restTimerActive, restSecondsLeft]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [plansData, logsData, exData] = await Promise.all([
        getPersonalWorkoutPlansByMember(centerId, member.memberId, 'MEMBER', null, member.memberId),
        getPersonalWorkoutLogsByMember(centerId, member.memberId, 'MEMBER', null, member.memberId),
        getExercises(centerId)
      ]);
      setPlans(plansData);
      setLogs(logsData);
      setExercises(exData);
    } catch (err) {
      console.error('Failed to load member workout data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Start Workout Mode with a Plan
  const handleStartWorkout = (plan: PersonalWorkoutPlan) => {
    setActivePlan(plan);
    const now = new Date();
    const startTimeStr = now.toTimeString().slice(0, 5); // "19:30"
    setWorkoutStartTime(startTimeStr);
    setElapsedSeconds(0);
    setIsTimerRunning(true);
    setMemberMemo('');

    // Initialize actual sets initialized with target values
    const initialStates: ExerciseActualState[] = plan.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      repUnit: ex.repUnit || 'reps',
      actualSets: ex.targetSets.map((ts) => ({
        setNumber: ts.setNumber,
        weight: ts.targetWeight,
        reps: ts.targetReps,
        completed: false
      })),
      notes: ''
    }));

    setActiveExerciseStates(initialStates);
    setViewMode('active-workout');

    // Update plan status to IN_PROGRESS if currently ASSIGNED
    if (plan.status === 'ASSIGNED') {
      updatePersonalWorkoutPlan(centerId, plan.planId, { status: 'IN_PROGRESS' }, 'MEMBER').catch(
        console.error
      );
    }
  };

  // Start Quick/Free Workout (Without a prior plan)
  const handleStartFreeWorkout = () => {
    setActivePlan(null);
    const now = new Date();
    setWorkoutStartTime(now.toTimeString().slice(0, 5));
    setElapsedSeconds(0);
    setIsTimerRunning(true);
    setMemberMemo('');

    // Pre-populate with first exercise from library or empty
    const firstEx = exercises[0];
    if (firstEx) {
      const defaults = getExerciseDefaults(firstEx);
      setActiveExerciseStates([
        {
          exerciseId: firstEx.exerciseId,
          exerciseName: firstEx.name,
          repUnit: defaults.repUnit,
          actualSets: [
            { setNumber: 1, weight: defaults.weight, reps: defaults.reps, completed: false },
            { setNumber: 2, weight: defaults.weight, reps: defaults.reps, completed: false },
            { setNumber: 3, weight: defaults.weight, reps: defaults.reps, completed: false }
          ],
          notes: ''
        }
      ]);
    } else {
      setActiveExerciseStates([]);
    }
    setViewMode('active-workout');
  };

  // Rest timer control
  const startRestTimer = (seconds: number) => {
    setRestSecondsLeft(seconds);
    setRestTimerActive(true);
  };

  const cancelRestTimer = () => {
    setRestSecondsLeft(null);
    setRestTimerActive(false);
    setRestTargetInfo(null);
  };

  const addRestTime = (seconds: number) => {
    setRestSecondsLeft((prev) => (prev !== null ? prev + seconds : seconds));
  };

  // Toggle set completion in active workout with contextual rest timer
  const handleToggleSetComplete = (exIdx: number, setIdx: number) => {
    const updated = [...activeExerciseStates];
    const currentStatus = updated[exIdx].actualSets[setIdx].completed;
    const nextStatus = !currentStatus;
    updated[exIdx].actualSets[setIdx].completed = nextStatus;
    setActiveExerciseStates(updated);
    setValidationError(null);

    // If marked as complete, automatically trigger configured rest timer
    if (nextStatus) {
      const planEx = activePlan?.exercises.find((e) => e.exerciseId === updated[exIdx].exerciseId);
      const restSeconds = planEx?.restSeconds || 60;
      setRestTargetInfo({
        exerciseName: updated[exIdx].exerciseName,
        nextSetNumber: setIdx + 2
      });
      startRestTimer(restSeconds);
    }
  };

  // Add Exercise to Active Workout
  const handleAddExerciseToActive = (ex: Exercise) => {
    if (activeExerciseStates.some((s) => s.exerciseId === ex.exerciseId)) {
      return;
    }
    const defaults = getExerciseDefaults(ex);
    const newExState: ExerciseActualState = {
      repUnit: defaults.repUnit,
      exerciseId: ex.exerciseId,
      exerciseName: ex.name,
      actualSets: [
        { setNumber: 1, weight: defaults.weight, reps: defaults.reps, completed: false },
        { setNumber: 2, weight: defaults.weight, reps: defaults.reps, completed: false },
        { setNumber: 3, weight: defaults.weight, reps: defaults.reps, completed: false }
      ],
      notes: ''
    };
    setActiveExerciseStates(prev => [newExState, ...prev]);
    setIsAddExerciseModalOpen(false);
    setValidationError(null);
  };

  // Update actual weight or reps
  const handleUpdateActual = (
    exIdx: number,
    setIdx: number,
    field: 'weight' | 'reps',
    value: number
  ) => {
    const updated = [...activeExerciseStates];
    updated[exIdx].actualSets[setIdx][field] = value;
    setActiveExerciseStates(updated);
  };

  // Add set in active workout
  const handleAddActualSet = (exIdx: number) => {
    const updated = [...activeExerciseStates];
    const sets = updated[exIdx].actualSets;
    const last = sets[sets.length - 1];
    sets.push({
      setNumber: sets.length + 1,
      weight: last ? last.weight : 20,
      reps: last ? last.reps : 10,
      completed: false
    });
    setActiveExerciseStates(updated);
  };

  // Finish Workout and Save Log
  const handleFinishWorkout = async () => {
    if (submitting) return;
    setValidationError(null);
    setSaveError(null);

    // 1. Validation: 0 exercises check
    if (activeExerciseStates.length === 0) {
      setValidationError('최소 1개 이상의 운동을 추가해주세요.');
      return;
    }

    // 2. Validation: 0 sets check
    const totalSets = activeExerciseStates.reduce((acc, ex) => acc + ex.actualSets.length, 0);
    if (totalSets === 0) {
      setValidationError('최소 1개 이상의 운동 세트를 기록해주세요.');
      return;
    }

    setSubmitting(true);
    setIsTimerRunning(false);

    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const endTimeStr = now.toTimeString().slice(0, 5);

      const newLogData = {
        planId: activePlan?.planId || null,
        memberId: member.memberId,
        memberName: member.name,
        trainerId: activePlan?.trainerId || member.trainerId,
        trainerName: activePlan?.trainerName || null,
        centerId,
        date: activePlan?.date || todayStr,
        startTime: workoutStartTime || endTimeStr,
        completedAt: endTimeStr,
        completedExercises: activeExerciseStates.map((ex) => ({
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
      repUnit: ex.repUnit || 'reps',
          actualSets: ex.actualSets,
          notes: ex.notes || ''
        })),
        memberMemo: memberMemo.trim()
      };

      const created = await createPersonalWorkoutLog(
        newLogData as any,
        'MEMBER',
        null,
        member.memberId
      );

      setCompletedSuccessLog(created);
      cancelRestTimer();
      await loadData();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error('[handleFinishWorkout error]', err);
      setSaveError(err.message || '운동 기록 저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  // Format stopwatch seconds (e.g. 00:14:32)
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Check if today has assigned plan
  const todayStr = new Date().toISOString().split('T')[0];
  const todayPlan = plans.find((p) => p.date === todayStr && p.status !== 'COMPLETED');
  const completedTodayLogs = logs.filter((l) => l.date === todayStr);

  return (
    <div className="space-y-4" id="member-workout-mode-container">
      {/* 1. Header & Navigation Pills */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
              <Flame className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-stone-900">개인운동 (Workout Mode)</h2>
              <p className="text-[11px] text-stone-500">
                트레이너 배정 루틴 수행 및 목표 대비 실제 기록
              </p>
            </div>
          </div>

          <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-lg">
            총 {logs.length}회 완료
          </span>
        </div>

        {/* View mode switcher pills */}
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-stone-100">
          <button
            type="button"
            onClick={() => setViewMode('assigned')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-center ${
              viewMode === 'assigned'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            배정된 계획 ({plans.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('history')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-center ${
              viewMode === 'history'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            완료 기록 ({logs.length})
          </button>
        </div>
      </div>

      {/* ================= VIEW 1: ASSIGNED PLANS ================= */}
      {viewMode === 'assigned' && (
        <div className="space-y-4">
          {/* Today's Special Focus Banner */}
          {todayPlan ? (
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-5 text-white shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-md bg-white/20 text-white text-[10px] font-bold tracking-wide uppercase">
                  오늘 배정된 운동
                </span>
                <span className="text-xs text-amber-100 font-mono">{todayPlan.date}</span>
              </div>

              <div>
                <h3 className="text-base font-bold text-white">{todayPlan.title}</h3>
                {todayPlan.trainerInstructions && (
                  <p className="text-xs text-amber-100 mt-1 line-clamp-2">
                    {todayPlan.trainerInstructions}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/20">
                <span className="text-xs text-amber-100 font-medium">
                  {todayPlan.exercises.length}개 종목 배정됨
                </span>
                <button
                  id="btn-start-today-workout"
                  type="button"
                  onClick={() => handleStartWorkout(todayPlan)}
                  className="px-4 py-2 bg-white text-stone-900 rounded-xl text-xs font-bold shadow-md hover:bg-stone-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>오늘 운동 시작하기</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 text-center space-y-2">
              <p className="text-xs text-stone-600 font-medium">
                오늘({todayStr}) 배정된 개인운동 일정이 없습니다.
              </p>
              <button
                type="button"
                onClick={handleStartFreeWorkout}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-900 text-white rounded-xl text-xs font-semibold hover:bg-stone-800 transition shadow-2xs"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>자율 운동 기록 시작</span>
              </button>
            </div>
          )}

          {/* All Plans List */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-stone-700 block">전체 배정된 개인운동 계획</span>
            {plans.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center text-xs text-stone-400">
                배정된 개인운동 계획이 없습니다.
              </div>
            ) : (
              plans.map((plan) => {
                const isCompleted = plan.status === 'COMPLETED';
                return (
                  <div
                    key={plan.planId}
                    id={`member-plan-card-${plan.planId}`}
                    className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-stone-900">{plan.title}</h4>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isCompleted
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {isCompleted ? '완료' : '배정됨'}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-400 mt-0.5">
                          배정일: {plan.date} · 트레이너: {plan.trainerName || '담당'}
                        </p>
                      </div>

                      {!isCompleted && (
                        <button
                          type="button"
                          onClick={() => handleStartWorkout(plan)}
                          className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition shadow-2xs shrink-0"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>운동 시작</span>
                        </button>
                      )}
                    </div>

                    {/* Trainer instructions */}
                    {plan.trainerInstructions && (
                      <p className="p-2.5 bg-stone-50 rounded-xl text-xs text-stone-700 leading-relaxed">
                        <span className="font-semibold text-stone-900">가이드: </span>
                        {plan.trainerInstructions}
                      </p>
                    )}

                    {/* Exercises Summary */}
                    <div className="space-y-2 pt-2 border-t border-stone-100">
                      {plan.exercises.map((ex, idx) => {
                        const libEx = exercises.find((e) => e.exerciseId === ex.exerciseId);
                        return (
                          <div
                            key={idx}
                            className="bg-stone-50/70 p-2.5 rounded-xl border border-stone-200/70 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-stone-900 flex items-center gap-1">
                                <span className="w-4 h-4 rounded-full bg-stone-200 text-stone-700 text-[10px] flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                {ex.exerciseName}
                              </span>

                              {libEx?.videoUrl && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVideoModalUrl(libEx.videoUrl || '');
                                    setVideoModalTitle(libEx.name);
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] text-purple-700 font-semibold cursor-pointer"
                                >
                                  <Video className="w-3 h-3 text-purple-600" />
                                  <span>자세 영상</span>
                                </button>
                              )}
                            </div>

                            {/* Target Sets row */}
                            <div className="flex flex-wrap gap-1 text-[11px] font-mono text-stone-600">
                              <span className="font-sans font-medium text-stone-400 mr-1">
                                목표:
                              </span>
                              {ex.targetSets.map((ts) => (
                                <span
                                  key={ts.setNumber}
                                  className="bg-white px-1.5 py-0.5 rounded border border-stone-200"
                                >
                                  {ts.targetWeight}kg×{ts.targetReps}{ex.repUnit === 'seconds' ? '초' : '회'}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= VIEW 2: ACTIVE WORKOUT MODE ================= */}
      {viewMode === 'active-workout' && (
        <div className="space-y-4" id="active-workout-mode-view">
          {/* Top Sticky Workout Dashboard */}
          <div className="sticky top-16 z-20 bg-stone-900 text-white rounded-2xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-bold tracking-wider uppercase text-amber-400">
                  WORKOUT IN PROGRESS
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('운동 모드를 종료하고 계획 목록으로 돌아가시겠습니까?')) {
                    setViewMode('assigned');
                  }
                }}
                className="text-stone-400 hover:text-white text-xs"
              >
                ✕ 나가기
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] text-stone-400 uppercase font-semibold block">
                  운동 진행 시간
                </span>
                <span className="font-mono text-2xl font-bold tracking-tight text-white">
                  {formatTime(elapsedSeconds)}
                </span>
              </div>

              {/* Rest Timer Widget */}
              <div className="bg-stone-800/80 px-3 py-1.5 rounded-xl border border-stone-700 flex items-center gap-2">
                <Timer className="w-4 h-4 text-amber-400" />
                <div className="text-right">
                  <span className="text-[9px] text-stone-400 block">세트 간 휴식</span>
                  {restTimerActive && restSecondsLeft !== null ? (
                    <span className="text-sm font-mono font-bold text-amber-400">
                      {restSecondsLeft}초
                    </span>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        onClick={() => startRestTimer(30)}
                        className="px-1.5 py-0.5 bg-stone-700 hover:bg-stone-600 rounded"
                      >
                        30초
                      </button>
                      <button
                        onClick={() => startRestTimer(60)}
                        className="px-1.5 py-0.5 bg-stone-700 hover:bg-stone-600 rounded"
                      >
                        60초
                      </button>
                      <button
                        onClick={() => startRestTimer(90)}
                        className="px-1.5 py-0.5 bg-stone-700 hover:bg-stone-600 rounded"
                      >
                        90초
                      </button>
                    </div>
                  )}
                </div>
                {restTimerActive && (
                  <button
                    onClick={cancelRestTimer}
                    className="text-[10px] text-stone-400 hover:text-white ml-1"
                  >
                    취소
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Contextual Rest Timer Banner */}
          {restTimerActive && restSecondsLeft !== null && restSecondsLeft > 0 ? (
            <div
              id="active-rest-timer-banner"
              className="bg-amber-500 text-white p-4 rounded-2xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold">
                  <Timer className="w-5 h-5 text-white animate-pulse" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-100 uppercase tracking-wide">
                      세트 간 휴식 중
                    </span>
                    {restTargetInfo?.exerciseName && (
                      <span className="px-2 py-0.5 rounded bg-black/20 text-white text-[11px] font-semibold">
                        {restTargetInfo.exerciseName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/90 mt-0.5">
                    {restTargetInfo?.nextSetNumber
                      ? `다음: ${restTargetInfo.nextSetNumber}세트 수행 준비`
                      : '호흡을 가다듬고 다음 세트를 준비하세요.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl font-black tracking-tight bg-black/20 px-3 py-1 rounded-xl">
                  {restSecondsLeft}초
                </span>
                <button
                  type="button"
                  onClick={() => addRestTime(30)}
                  className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  +30초
                </button>
                <button
                  type="button"
                  onClick={cancelRestTimer}
                  className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  휴식 건너뛰기 (다음 세트)
                </button>
              </div>
            </div>
          ) : restSecondsLeft === 0 ? (
            <div
              id="rest-completed-banner"
              className="bg-emerald-600 text-white p-4 rounded-2xl shadow-md flex items-center justify-between gap-3 animate-in fade-in"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold">
                  <Check className="w-5 h-5 text-white" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-emerald-100 uppercase tracking-wide">
                    휴식 시간 종료!
                  </h4>
                  <p className="text-xs text-white font-medium mt-0.5">
                    {restTargetInfo?.exerciseName
                      ? `${restTargetInfo.exerciseName} ${restTargetInfo.nextSetNumber || ''}세트를 시작하세요.`
                      : '다음 세트를 시작할 준비가 되었습니다.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={cancelRestTimer}
                className="px-3 py-1.5 bg-white text-emerald-900 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer hover:bg-emerald-50"
              >
                확인
              </button>
            </div>
          ) : null}

          {/* Action Bar for Adding Exercises */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-700">
              수행 운동 목록 ({activeExerciseStates.length}개 종목)
            </span>
            <button
              id="btn-add-exercise-to-active-workout"
              type="button"
              onClick={() => {
                setAddExerciseSearch('');
                setIsAddExerciseModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            >
              <Dumbbell className="w-3.5 h-3.5" />
              <span>+ 운동 종목 추가</span>
            </button>
          </div>

          {/* Empty State if 0 exercises */}
          {activeExerciseStates.length === 0 ? (
            <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-300 space-y-3">
              <Dumbbell className="w-8 h-8 text-stone-400 mx-auto" />
              <div>
                <p className="text-stone-700 font-bold text-sm">등록된 운동이 없습니다</p>
                <p className="text-stone-500 text-xs mt-0.5">
                  상단의 '+ 운동 종목 추가' 버튼을 눌러 수행할 운동을 선택해주세요.
                </p>
              </div>
              <button
                id="btn-add-exercise-empty"
                type="button"
                onClick={() => {
                  setAddExerciseSearch('');
                  setIsAddExerciseModalOpen(true);
                }}
                className="px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-semibold cursor-pointer hover:bg-stone-800 transition-colors"
              >
                + 운동 종목 추가하기
              </button>
            </div>
          ) : (
            /* Exercises List (Target vs Actual Sets) */
            <div className="space-y-4">
            {activeExerciseStates.map((exState, exIdx) => {
              const libEx = exercises.find((e) => e.exerciseId === exState.exerciseId);
              const planEx = activePlan?.exercises.find((e) => e.exerciseId === exState.exerciseId);

              return (
                <div
                  key={exState.exerciseId}
                  className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-stone-900 text-white text-xs flex items-center justify-center font-bold">
                          {exIdx + 1}
                        </span>
                        {exState.exerciseName}
                      </h4>
                      {planEx?.guideNote && (
                        <p className="text-[11px] text-amber-700 font-medium mt-1">
                          💡 가이드: {planEx.guideNote}
                        </p>
                      )}
                    </div>

                    {libEx?.videoUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setVideoModalUrl(libEx.videoUrl || '');
                          setVideoModalTitle(libEx.name);
                        }}
                        className="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Video className="w-3.5 h-3.5 text-purple-600" />
                        <span>영상</span>
                      </button>
                    )}
                  </div>

                  {/* Target vs Actual Grid Table */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-1.5 text-[11px] font-semibold text-stone-400 px-1">
                      <div className="col-span-2">세트</div>
                      <div className="col-span-3">목표</div>
                      <div className="col-span-4">실제 수행</div>
                      <div className="col-span-3 text-right">완료체크</div>
                    </div>

                    {exState.actualSets.map((s, setIdx) => {
                      const targetSet = planEx?.targetSets.find(
                        (ts) => ts.setNumber === s.setNumber
                      );
                      return (
                        <div
                          key={setIdx}
                          className={`grid grid-cols-12 gap-1.5 items-center p-2 rounded-xl border transition-colors ${
                            s.completed
                              ? 'bg-emerald-50/60 border-emerald-200'
                              : 'bg-stone-50 border-stone-200'
                          }`}
                        >
                          {/* Set label */}
                          <div className="col-span-2 text-xs font-bold text-stone-700">
                            {s.setNumber}세트
                          </div>

                          {/* Target value */}
                          <div className="col-span-3 text-[11px] font-mono text-stone-500">
                            {targetSet ? `${targetSet.targetWeight}k × ${targetSet.targetReps}${exState.repUnit === 'seconds' ? '초' : '회'}` : '-'}
                          </div>

                          {/* Actual Inputs */}
                          <div className="col-span-4 flex items-center gap-1">
                            <input
                              type="number"
                              step={0.5}
                              value={s.weight}
                              onChange={(e) =>
                                handleUpdateActual(
                                  exIdx,
                                  setIdx,
                                  'weight',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-12 px-1.5 py-1 bg-white border border-stone-300 rounded text-xs font-mono font-bold text-center"
                            />
                            <span className="text-[10px] text-stone-400">k</span>
                            <input
                              type="number"
                              min={0}
                              value={s.reps}
                              onChange={(e) =>
                                handleUpdateActual(
                                  exIdx,
                                  setIdx,
                                  'reps',
                                  parseInt(e.target.value, 10) || 0
                                )
                              }
                              className="w-10 px-1 py-1 bg-white border border-stone-300 rounded text-xs font-mono font-bold text-center"
                            />
                            <span className="text-[10px] text-stone-400">{exState.repUnit === 'seconds' ? '초' : '회'}</span>
                          </div>

                          {/* Complete Check button */}
                          <div className="col-span-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleSetComplete(exIdx, setIdx)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ml-auto ${
                                s.completed
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                              }`}
                            >
                              <Check className="w-3 h-3" />
                              <span>{s.completed ? '완료' : '완료'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => handleAddActualSet(exIdx)}
                      className="text-[11px] text-stone-600 hover:text-stone-900 font-semibold px-2 py-1 cursor-pointer"
                    >
                      + 세트 추가
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}

          {/* Member Memo Box */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs space-y-2">
            <label className="block text-xs font-bold text-stone-800">
              오늘 운동 소감 및 특이사항 (메모)
            </label>
            <textarea
              rows={3}
              value={memberMemo}
              onChange={(e) => setMemberMemo(e.target.value)}
              placeholder="예: 오늘 스쿼트 3세트 때 허리가 조금 뻐근했음, 랫풀다운 자극이 매우 좋았음 등"
              className="w-full p-3 text-xs rounded-xl border border-stone-200 focus:ring-1 focus:ring-stone-900"
            />
            <p className="text-[11px] text-stone-400">
              작성하신 소감은 담당 트레이너에게 전달되며 피드백을 받으실 수 있습니다.
            </p>
          </div>

          {/* Validation & Save Error Alerts */}
          {validationError && (
            <div
              id="validation-msg-workout"
              className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold rounded-xl flex items-center gap-2 animate-in fade-in"
            >
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {saveError && (
            <div
              id="save-error-msg-workout"
              className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold rounded-xl flex items-center gap-2 animate-in fade-in"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Big Finish Button */}
          <div className="pt-2">
            <button
              id="btn-complete-workout"
              type="button"
              disabled={submitting}
              onClick={handleFinishWorkout}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl shadow-md transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>{submitting ? '운동 기록 저장 중...' : '운동 완료 및 기록 저장'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ================= ADD EXERCISE MODAL IN ACTIVE WORKOUT ================= */}
      {isAddExerciseModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setIsAddExerciseModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
            id="modal-member-add-exercise"
          >
            <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Dumbbell className="w-4 h-4 text-stone-700" />
                운동 종목 추가
              </span>
              <button
                type="button"
                onClick={() => setIsAddExerciseModalOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ExerciseRegistrationForm centerId={centerId} role="MEMBER" onCreated={ex => {
              setAddExerciseSearch('');
              handleAddExerciseToActive(ex);
            }} />
            <div className="p-4 border-b border-stone-100">
              <input
                type="text"
                value={addExerciseSearch}
                onChange={(e) => setAddExerciseSearch(e.target.value)}
                placeholder="운동명 또는 부위 검색 (예: 스쿼트, 하체, 가슴)..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200"
                autoFocus
              />
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {exercises
                .filter((ex) => {
                  if (!addExerciseSearch.trim()) return true;
                  const q = addExerciseSearch.toLowerCase();
                  return (
                    ex.name.toLowerCase().includes(q) ||
                    ex.bodyPart.toLowerCase().includes(q) ||
                    ex.equipment.toLowerCase().includes(q)
                  );
                })
                .map((ex) => {
                  const isAdded = activeExerciseStates.some((s) => s.exerciseId === ex.exerciseId);
                  return (
                    <div
                      key={ex.exerciseId}
                      className="p-3 bg-stone-50 hover:bg-stone-100/80 rounded-xl border border-stone-200 flex items-center justify-between transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-stone-900">{ex.name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-white text-stone-600 text-[10px] border border-stone-200">
                            {ex.bodyPart}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-white text-stone-600 text-[10px] border border-stone-200">
                            {ex.equipment}
                          </span>
                        </div>
                        {ex.description && (
                          <p className="text-[11px] text-stone-500 mt-1 line-clamp-1">
                            {ex.description}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isAdded}
                        onClick={() => handleAddExerciseToActive(ex)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-xl cursor-pointer transition-colors ${
                          isAdded
                            ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                            : 'bg-stone-900 hover:bg-stone-800 text-white shadow-2xs'
                        }`}
                      >
                        {isAdded ? '추가됨' : '+ 선택'}
                      </button>
                    </div>
                  );
                })}
              {exercises.filter((ex) => {
                if (!addExerciseSearch.trim()) return true;
                const q = addExerciseSearch.toLowerCase();
                return (
                  ex.name.toLowerCase().includes(q) ||
                  ex.bodyPart.toLowerCase().includes(q) ||
                  ex.equipment.toLowerCase().includes(q)
                );
              }).length === 0 && (
                <div className="py-8 text-center text-xs text-stone-400">
                  검색 결과가 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= VIEW 3: COMPLETED LOGS HISTORY ================= */}
      {viewMode === 'history' && (
        <div className="space-y-4" id="member-workout-logs-history">
          {logs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto mb-3">
                <Flame className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-stone-800">완료된 개인운동 기록이 없습니다</p>
              <p className="text-xs text-stone-400 mt-1">
                배정된 계획을 선택하고 운동을 시작해보세요!
              </p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.logId}
                id={`member-log-card-${log.logId}`}
                className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-3.5"
              >
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-stone-900">{log.date} 개인운동</h4>
                      <p className="text-[10px] text-stone-400">
                        {log.startTime && `${log.startTime} 시작`}
                        {log.completedAt && ` · ${log.completedAt} 완료`}
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                    완료됨
                  </span>
                </div>

                {/* Performed exercises & sets */}
                <div className="space-y-2">
                  {log.completedExercises.map((ex, exIdx) => (
                    <div
                      key={ex.exerciseId}
                      className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/70 text-xs space-y-1.5"
                    >
                      <span className="font-bold text-stone-900 flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-stone-600">
                          {ex.actualSets.filter(s => s.completed).length}/{ex.actualSets.length}세트 완료
                        </span>
                        {ex.exerciseName}
                      </span>

                      <div className="flex flex-wrap gap-1">
                        {ex.actualSets.map((s) => (
                          <span
                            key={s.setNumber}
                            className="px-2 py-0.5 bg-white rounded border border-stone-200 font-mono text-[11px] text-stone-700"
                          >
                            {s.setNumber}세트: {s.weight}kg × {s.reps}{ex.repUnit === 'seconds' ? '초' : '회'} {s.completed ? '완료' : '미완료'}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Member Memo */}
                {log.memberMemo && (
                  <div className="p-2.5 bg-stone-50 rounded-xl text-xs text-stone-700">
                    <span className="font-semibold text-stone-900 block mb-0.5">내 메모:</span>
                    <p>{log.memberMemo}</p>
                  </div>
                )}

                {/* Trainer Feedback Box */}
                {log.trainerFeedback ? (
                  <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-1">
                    <span className="font-bold flex items-center gap-1.5 text-purple-800">
                      <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                      트레이너 피드백 ({log.trainerName || '담당 트레이너'})
                    </span>
                    <p className="leading-relaxed whitespace-pre-wrap">{log.trainerFeedback}</p>
                  </div>
                ) : (
                  <div className="p-2.5 bg-stone-50 rounded-xl text-[11px] text-stone-400 italic">
                    트레이너 피드백 확인 대기 중입니다.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ================= VIDEO MODAL ================= */}
      {videoModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
          onClick={() => setVideoModalUrl(null)}
        >
          <div
            className="bg-black rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-stone-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-stone-900 px-4 py-3 flex items-center justify-between text-white text-xs font-semibold">
              <span className="flex items-center gap-2">
                <Video className="w-4 h-4 text-purple-400" />
                <span>{videoModalTitle} 가이드</span>
              </span>
              <button
                type="button"
                onClick={() => setVideoModalUrl(null)}
                className="p-1 text-stone-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="aspect-video w-full bg-black flex items-center justify-center">
              {getYoutubeEmbedUrl(videoModalUrl) ? (
                <iframe
                  src={getYoutubeEmbedUrl(videoModalUrl) || ''}
                  title={videoModalTitle}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="p-6 text-center text-stone-300 text-xs">
                  <p>외부 링크 영상입니다.</p>
                  <a
                    href={videoModalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg"
                  >
                    <span>새 창에서 열기</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= CELEBRATION MODAL ================= */}
      {completedSuccessLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
          onClick={() => {
            setCompletedSuccessLog(null);
            setViewMode('history');
          }}
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
            id="modal-workout-completed-success"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <Award className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-stone-900">오늘의 개인운동 완료!</h3>
              <p className="text-xs text-stone-500">
                수행하신 기록이 안전하게 저장되었으며, 트레이너에게 전송되었습니다.
              </p>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-700 space-y-1">
              <div className="flex justify-between">
                <span className="text-stone-400">운동 종목</span>
                <span className="font-bold">
                  {completedSuccessLog.completedExercises.length}개 종목
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">운동 시간</span>
                <span className="font-bold">
                  {completedSuccessLog.startTime} ~ {completedSuccessLog.completedAt}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setCompletedSuccessLog(null);
                setViewMode('history');
              }}
              className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
            >
              기록 확인하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
