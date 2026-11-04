import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Edit2,
  ChevronRight,
  TrendingUp,
  FileCheck,
  Dumbbell,
  Copy,
  Flame,
  Sparkles
} from 'lucide-react';
import type {
  Member,
  PtSession,
  PtContract,
  ExerciseRecord,
  ExerciseSet,
  SessionStatus,
  MemberCondition,
  PersonalWorkoutLog,
  AiSessionDraft
} from '../types';
import {
  getSessionsByMember,
  createPtSession,
  updatePtSession,
  deletePtSession,
  getContractsByMember,
  getPriorityContract,
  getPreviousExerciseRecord,
  getPersonalWorkoutLogsByMember
} from '../services/dataService';
import { generateAiSessionDraft } from '../services/aiService';
import { useAuth } from '../context/AuthContext';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';

interface PtSessionsTabProps {
  member: Member;
  trainerName?: string;
  onSessionUpdated?: () => void;
}

const CONDITION_LABELS: Record<MemberCondition, { label: string; icon: string }> = {
  EXCELLENT: { label: '매우 좋음', icon: '⚡' },
  GOOD: { label: '좋음', icon: '😊' },
  NORMAL: { label: '보통', icon: '😐' },
  TIRED: { label: '피로감', icon: '🥱' },
  POOR: { label: '컨디션 저하', icon: '🤕' }
};

export const PtSessionsTab: React.FC<PtSessionsTabProps> = ({
  member,
  trainerName = '담당 트레이너',
  onSessionUpdated
}) => {
  const { currentUser } = useAuth();
  const [sessions, setSessions] = useState<PtSession[]>([]);
  const [contracts, setContracts] = useState<PtContract[]>([]);
  const [activeContract, setActiveContract] = useState<PtContract | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  const [sessionNumber, setSessionNumber] = useState<number>(1);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('14:00');
  const [status, setStatus] = useState<SessionStatus>('COMPLETED');
  const [memberCondition, setMemberCondition] = useState<MemberCondition>('GOOD');
  const [sessionNotes, setSessionNotes] = useState('');
  const [trainerFeedback, setTrainerFeedback] = useState('');
  const [nextSessionGoal, setNextSessionGoal] = useState('');
  const [contractId, setContractId] = useState<string>('');

  // Exercise records for current form
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);

  // Previous exercise comparison lookup map
  const [prevRecordMap, setPrevRecordMap] = useState<
    Record<string, { sessionDate: string; sessionNumber: number; sets: ExerciseSet[]; memo?: string } | null>
  >({});

  // Phase 6: Member's recent personal workout logs (for reference only)
  const [recentSoloLogs, setRecentSoloLogs] = useState<PersonalWorkoutLog[]>([]);

  // Phase 7: AI Session Memo Draft Assistant
  const [aiQuickMemo, setAiQuickMemo] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiDraft, setAiDraft] = useState<AiSessionDraft | null>(null);
  const [aiApplySuccess, setAiApplySuccess] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [member.memberId, member.centerId]);

  const loadData = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const [sessionsList, contractsList, soloLogsList] = await Promise.all([
        getSessionsByMember(member.centerId, member.memberId, currentUser.role, currentUser.trainerId),
        getContractsByMember(member.centerId, member.memberId, currentUser.role, currentUser.trainerId),
        getPersonalWorkoutLogsByMember(member.centerId, member.memberId, currentUser.role, currentUser.trainerId)
      ]);
      setSessions(sessionsList);
      setContracts(contractsList);
      setRecentSoloLogs(soloLogsList);

      const active = getPriorityContract(contractsList);
      setActiveContract(active);
    } catch (err) {
      console.error('Failed to load sessions data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openNewSessionModal = () => {
    setEditingSessionId(null);
    const nextNum = sessions.length > 0 ? Math.max(...sessions.map((s) => s.sessionNumber)) + 1 : 1;
    setSessionNumber(nextNum);
    setDate(new Date().toISOString().split('T')[0]);
    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMins = String(now.getMinutes()).padStart(2, '0');
    setTime(`${currentHours}:${currentMins}`);
    setStatus('COMPLETED');
    setMemberCondition('GOOD');
    setSessionNotes('');
    setTrainerFeedback('');
    setNextSessionGoal('');
    const priority = getPriorityContract(contracts);
    setContractId(priority?.contractId || activeContract?.contractId || '');
    setAiQuickMemo('');
    setAiDraft(null);
    setAiApplySuccess(false);
    setAiNotice(null);

    // Default template exercises
    setExercises([
      {
        exerciseName: '스쿼트',
        sets: [
          { setNumber: 1, weight: 40, reps: 12 },
          { setNumber: 2, weight: 50, reps: 10 },
          { setNumber: 3, weight: 50, reps: 10 }
        ],
        memo: ''
      }
    ]);
    setPrevRecordMap({});
    lookupPreviousExercise('스쿼트');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleCopyPreviousSessionExercises = () => {
    const lastSessionWithExercises = [...sessions]
      .sort((a, b) => b.sessionNumber - a.sessionNumber)
      .find((s) => s.exercises && s.exercises.length > 0);

    if (!lastSessionWithExercises || !lastSessionWithExercises.exercises) {
      alert('복사할 이전 수업 운동 기록이 없습니다.');
      return;
    }

    const clonedExercises = lastSessionWithExercises.exercises.map((ex) => ({
      exerciseName: ex.exerciseName,
      sets: ex.sets.map((s) => ({ ...s })),
      memo: ''
    }));

    setExercises(clonedExercises);
    clonedExercises.forEach((ex) => lookupPreviousExercise(ex.exerciseName));
  };

  const handleQuickAddExercise = (name: string) => {
    setExercises((prev) => [
      ...prev,
      {
        exerciseName: name,
        sets: [{ setNumber: 1, weight: 20, reps: 10 }],
        memo: ''
      }
    ]);
    lookupPreviousExercise(name);
  };

  const openEditModal = (session: PtSession) => {
    setEditingSessionId(session.sessionId);
    setSessionNumber(session.sessionNumber);
    setDate(session.date);
    setTime(session.time);
    setStatus(session.status);
    setMemberCondition(session.memberCondition || 'GOOD');
    setSessionNotes(session.sessionNotes || '');
    setTrainerFeedback(session.trainerFeedback || '');
    setNextSessionGoal(session.nextSessionGoal || '');
    setContractId(session.contractId || activeContract?.contractId || '');
    setExercises(session.exercises || []);
    setAiQuickMemo('');
    setAiDraft(null);
    setAiApplySuccess(false);
    setAiNotice(null);
    setErrorMessage('');

    // Pre-lookup comparison for all exercises
    if (session.exercises) {
      session.exercises.forEach((ex) => lookupPreviousExercise(ex.exerciseName));
    }
    setIsModalOpen(true);
  };

  const lookupPreviousExercise = async (name: string) => {
    if (!name.trim()) return;
    try {
      const prev = await getPreviousExerciseRecord(member.centerId, member.memberId, name);
      setPrevRecordMap((prevMap) => ({ ...prevMap, [name]: prev }));
    } catch (e) {
      console.warn('Failed lookup prev exercise', e);
    }
  };

  // Phase 7: AI Session Draft Generator (Strict Anonymized Context, Draft-Only, Non-blocking)
  const handleGenerateAiSessionDraft = async () => {
    if (!aiQuickMemo.trim()) return;
    setIsAiGenerating(true);
    setAiNotice(null);
    try {
      // Collect strictly anonymous context: recent 2 PT sessions & recent 2 personal workout logs
      const recentPt = sessions
        .filter((s) => s.status === 'COMPLETED')
        .slice(0, 2)
        .map((s) => ({
          date: s.date,
          sessionNumber: s.sessionNumber,
          exercises: s.exercises.map((e) => ({
            exerciseName: e.exerciseName,
            sets: e.sets.map((st) => ({ weight: st.weight, reps: st.reps }))
          }))
        }));

      const recentSolo = recentSoloLogs.slice(0, 2).map((l) => ({
        date: l.date,
        exercises: l.completedExercises.map((e) => ({
          exerciseName: e.exerciseName,
          sets: e.actualSets.map((st) => ({ weight: st.weight, reps: st.reps }))
        })),
        memberMemo: l.memberMemo
      }));

      const draft = await generateAiSessionDraft(aiQuickMemo.trim(), {
        recentPtSessions: recentPt,
        recentSoloWorkouts: recentSolo
      }, member.memberId);

      setAiDraft(draft);
      setAiNotice('AI 초안이 생성되었습니다. 내용을 검토한 후 [초안 적용하기]를 눌러주세요.');
    } catch (err) {
      console.error('Failed to generate AI session draft:', err);
      setAiNotice('AI 초안 생성 중 오류가 발생했습니다. 직접 입력해주세요.');
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Phase 7: Apply draft to active form (Explicit Trainer Confirmation, NO AUTO SAVE)
  const handleApplyAiDraft = () => {
    if (!aiDraft) return;
    if (aiDraft.exercises && aiDraft.exercises.length > 0) {
      setExercises(aiDraft.exercises);
      aiDraft.exercises.forEach((ex) => lookupPreviousExercise(ex.exerciseName));
    }
    if (aiDraft.memberFeedback) {
      setTrainerFeedback(aiDraft.memberFeedback);
    }
    if (aiDraft.nextSessionGoal) {
      setNextSessionGoal(aiDraft.nextSessionGoal);
    }
    if (aiDraft.internalNote) {
      setSessionNotes(aiDraft.internalNote);
    }
    setAiDraft(null);
    setAiApplySuccess(true);
    setAiNotice('AI 초안이 입력 폼에 반영되었습니다! 수정 후 하단의 [수업 일지 저장]을 누르세요.');
    setTimeout(() => {
      setAiApplySuccess(false);
      setAiNotice(null);
    }, 4000);
  };

  const handleAddExercise = () => {
    setExercises([
      ...exercises,
      {
        exerciseName: '',
        sets: [{ setNumber: 1, weight: 20, reps: 10 }],
        memo: ''
      }
    ]);
  };

  const handleRemoveExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const handleExerciseNameChange = (index: number, newName: string) => {
    const updated = [...exercises];
    updated[index].exerciseName = newName;
    setExercises(updated);
    lookupPreviousExercise(newName);
  };

  const handleAddSet = (exerciseIndex: number) => {
    const updated = [...exercises];
    const sets = updated[exerciseIndex].sets;
    const lastSet = sets[sets.length - 1];
    sets.push({
      setNumber: sets.length + 1,
      weight: lastSet ? lastSet.weight : 20,
      reps: lastSet ? lastSet.reps : 10
    });
    setExercises(updated);
  };

  const handleDuplicateSet = (exerciseIndex: number, setIndex: number) => {
    const updated = [...exercises];
    const targetSet = updated[exerciseIndex].sets[setIndex];
    updated[exerciseIndex].sets.splice(setIndex + 1, 0, {
      setNumber: setIndex + 2,
      weight: targetSet.weight,
      reps: targetSet.reps
    });
    // Renumber sets
    updated[exerciseIndex].sets.forEach((s, idx) => {
      s.setNumber = idx + 1;
    });
    setExercises(updated);
  };

  const handleRemoveSet = (exerciseIndex: number, setIndex: number) => {
    const updated = [...exercises];
    updated[exerciseIndex].sets = updated[exerciseIndex].sets.filter((_, i) => i !== setIndex);
    // Renumber sets
    updated[exerciseIndex].sets.forEach((s, idx) => {
      s.setNumber = idx + 1;
    });
    setExercises(updated);
  };

  const handleSetChange = (
    exerciseIndex: number,
    setIndex: number,
    field: 'weight' | 'reps',
    value: number
  ) => {
    const updated = [...exercises];
    updated[exerciseIndex].sets[setIndex][field] = value;
    setExercises(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (currentUser.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      setErrorMessage('본인 담당 회원의 수업 일지만 작성 및 수정할 수 있습니다.');
      return;
    }
    if (!date || !isValidDate(date)) {
      setErrorMessage('유효한 수업 일자를 입력해주세요 (YYYY-MM-DD).');
      return;
    }
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      if (editingSessionId) {
        await updatePtSession(
          member.centerId,
          editingSessionId,
          {
            sessionNumber,
            date,
            time,
            status,
            memberCondition,
            sessionNotes,
            trainerFeedback,
            nextSessionGoal,
            contractId: contractId || undefined,
            exercises
          },
          currentUser.role,
          currentUser.trainerId
        );
      } else {
        await createPtSession(
          {
            centerId: member.centerId,
            trainerId: member.trainerId,
            trainerName: trainerName,
            memberId: member.memberId,
            memberName: member.name,
            contractId: contractId || (contracts[0]?.contractId || ''),
            sessionNumber,
            date,
            time,
            status,
            memberCondition,
            sessionNotes,
            trainerFeedback,
            nextSessionGoal,
            exercises
          },
          currentUser.role,
          currentUser.trainerId
        );
      }

      setIsModalOpen(false);
      await loadData();
      if (onSessionUpdated) onSessionUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || '수업 일지 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!currentUser) return;
    if (currentUser.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      alert('본인 담당 회원의 수업 일지만 삭제할 수 있습니다.');
      return;
    }
    if (!window.confirm('정말 이 수업 일지를 삭제하시겠습니까? (완료된 수업일 경우 PT 잔여 횟수가 복구됩니다)')) {
      return;
    }
    try {
      await deletePtSession(member.centerId, sessionId, currentUser.role, currentUser.trainerId);
      await loadData();
      if (onSessionUpdated) onSessionUpdated();
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-stone-500">
        <div className="w-6 h-6 border-2 border-stone-800 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        수업 일지를 불러오는 중입니다...
      </div>
    );
  }

  const remainingCount = activeContract
    ? activeContract.totalSessions - activeContract.usedSessions
    : null;

  return (
    <div className="space-y-6">
      {/* Top Banner with Active Contract & Add Session Button */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-stone-900">PT 수업 일지 및 일정</h3>
            <span className="text-xs bg-stone-100 text-stone-700 px-2.5 py-0.5 rounded-full font-medium">
              총 {sessions.length}회차 기록
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500 mt-1.5">
            {activeContract ? (
              <span className="flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-stone-600" />
                이용권: <span className="font-semibold text-stone-900">{activeContract.title}</span> (
                {activeContract.usedSessions}/{activeContract.totalSessions}회 완료,{' '}
                <span
                  className={
                    remainingCount !== null && remainingCount <= 5
                      ? 'text-rose-600 font-bold'
                      : 'text-emerald-700 font-bold'
                  }
                >
                  잔여 {remainingCount}회
                </span>
                )
              </span>
            ) : (
              <span className="text-amber-600 font-medium">
                등록된 활성 PT 이용권이 없습니다.
              </span>
            )}
          </div>
        </div>

        <button
          id="btn-add-session"
          onClick={openNewSessionModal}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          수업 일지 작성
        </button>
      </div>

      {/* SESSIONS LIST */}
      {sessions.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center">
          <Dumbbell className="w-10 h-10 text-stone-300 mx-auto mb-3" />
          <h4 className="text-sm font-semibold text-stone-800 mb-1">등록된 PT 수업 기록이 없습니다</h4>
          <p className="text-xs text-stone-500 mb-4 max-w-sm mx-auto">
            첫 번째 수업을 진행한 후 운동 종목, 세트별 무게/횟수, 회원 피드백을 기록해보세요.
          </p>
          <button
            onClick={openNewSessionModal}
            className="px-4 py-2 text-xs font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-800"
          >
            첫 수업 일지 작성하기
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => {
            const cond = session.memberCondition ? CONDITION_LABELS[session.memberCondition] : null;

            return (
              <div
                key={session.sessionId}
                className="bg-white border border-stone-200 rounded-xl p-5 hover:border-stone-300 transition-shadow space-y-4"
              >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-stone-900 bg-stone-100 px-3 py-1 rounded-lg">
                      PT #{session.sessionNumber}회차
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-stone-600">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      {session.date}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-stone-600">
                      <Clock className="w-3.5 h-3.5 text-stone-400" />
                      {session.time}
                    </span>
                    {cond && (
                      <span className="text-xs bg-stone-50 border border-stone-200 px-2 py-0.5 rounded text-stone-700">
                        {cond.icon} {cond.label}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        session.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : session.status === 'CANCELLED'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {session.status === 'COMPLETED'
                        ? '수업 완료'
                        : session.status === 'CANCELLED'
                        ? '수업 취소'
                        : '수업 예정'}
                    </span>

                    <button
                      onClick={() => openEditModal(session)}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-50 rounded"
                      title="수정"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(session.sessionId)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Exercises Done */}
                {session.exercises && session.exercises.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-stone-700 block">수행 운동 종목 및 세트</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {session.exercises.map((ex, idx) => (
                        <div key={idx} className="p-3 bg-stone-50 rounded-lg border border-stone-200/80 text-xs">
                          <div className="font-semibold text-stone-900 mb-1.5 flex items-center justify-between">
                            <span>{ex.exerciseName || '종목명 미기재'}</span>
                            <span className="text-[11px] text-stone-500 font-normal">
                              {ex.sets.length}세트
                            </span>
                          </div>
                          <div className="text-stone-600 space-y-0.5 font-mono text-[11px]">
                            {ex.sets.map((s) => (
                              <div key={s.setNumber} className="flex justify-between">
                                <span>{s.setNumber}세트</span>
                                <span>
                                  {s.weight > 0 ? `${s.weight}kg` : '맨몸'} × {s.reps}회
                                </span>
                              </div>
                            ))}
                          </div>
                          {ex.memo && (
                            <p className="text-[11px] text-stone-500 mt-1.5 pt-1 border-t border-stone-200">
                              메모: {ex.memo}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Session Notes & Feedback */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {session.trainerFeedback && (
                    <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
                      <span className="font-semibold text-emerald-900 block mb-1">
                        트레이너 피드백 & 코칭
                      </span>
                      <p className="text-emerald-950 whitespace-pre-wrap">{session.trainerFeedback}</p>
                    </div>
                  )}

                  {session.nextSessionGoal && (
                    <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                      <span className="font-semibold text-blue-900 block mb-1">
                        다음 수업 목표 & 과제
                      </span>
                      <p className="text-blue-950 whitespace-pre-wrap">{session.nextSessionGoal}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl my-8 max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  {editingSessionId ? `PT #${sessionNumber}회차 수업 일지 수정` : '새 PT 수업 일지 작성'}
                </h3>
                <p className="text-xs text-stone-500">
                  회원: {member.name} | 담당: {trainerName}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {errorMessage && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Basic Session Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    회차
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={sessionNumber}
                    onChange={(e) => setSessionNumber(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>

                <div>
                  <label htmlFor="input-session-date" className="block text-xs font-semibold text-stone-700 mb-1">
                    수업 일자
                  </label>
                  <DateInputField
                    id="input-session-date"
                    required
                    value={date}
                    onChange={setDate}
                    className="!text-xs !py-2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    수업 시간
                  </label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    진행 상태
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as SessionStatus)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800 bg-white"
                  >
                    <option value="COMPLETED">수업 완료</option>
                    <option value="SCHEDULED">수업 예정</option>
                    <option value="CANCELLED">수업 취소</option>
                  </select>
                </div>
              </div>

              {/* Condition & Contract Linking */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    회원 컨디션
                  </label>
                  <select
                    value={memberCondition}
                    onChange={(e) => setMemberCondition(e.target.value as MemberCondition)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800 bg-white"
                  >
                    <option value="EXCELLENT">⚡ 매우 좋음</option>
                    <option value="GOOD">😊 좋음</option>
                    <option value="NORMAL">😐 보통</option>
                    <option value="TIRED">🥱 피로감</option>
                    <option value="POOR">🤕 컨디션 저하</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    차감할 PT 이용권
                  </label>
                  <select
                    value={contractId}
                    onChange={(e) => setContractId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800 bg-white"
                  >
                    <option value="">이용권 선택 없음</option>
                    {contracts.map((c) => (
                      <option key={c.contractId} value={c.contractId}>
                        {c.title} (잔여: {c.totalSessions - c.usedSessions}회)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Personal Workout Reference (Phase 6: PT 수업일지 작성 시 회원의 최근 개인운동 기록 참고 기능 - 참고용 조회이며 PT 수업일지로 자동 복사되지 않는다) */}
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center text-xs shadow-2xs">
                      <Flame className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <span className="text-xs font-bold text-stone-900 block">
                        회원의 최근 개인운동 기록 참고 ({recentSoloLogs.length}건)
                      </span>
                      <span className="text-[10px] text-stone-500">
                        회원의 피로도와 자율 운동량을 확인하여 오늘 PT 강도를 조율하세요.
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded font-bold">
                    참고용 조회 전용 (자동 복사 방지)
                  </span>
                </div>

                {recentSoloLogs.length === 0 ? (
                  <p className="text-[11px] text-stone-500 italic py-1">
                    최근 등록된 회원의 개인운동 기록이 없습니다.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {recentSoloLogs.slice(0, 3).map((soloLog) => (
                      <div
                        key={soloLog.logId}
                        className="bg-white p-2.5 rounded-lg border border-amber-200/80 text-xs space-y-1.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-stone-900">
                            {soloLog.date} {soloLog.startTime && `(${soloLog.startTime})`}
                          </span>
                          <span className="text-amber-800 font-semibold">
                            {soloLog.completedExercises.length}개 운동 완료
                          </span>
                        </div>

                        <div className="text-[11px] text-stone-700 space-y-1">
                          {soloLog.completedExercises.map((cex, cIdx) => (
                            <div key={cIdx} className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-stone-800">• {cex.exerciseName}:</span>
                              <span className="font-mono text-stone-600">
                                {cex.actualSets.map((s) => `${s.weight}kg×${s.reps}회`).join(', ')}
                              </span>
                            </div>
                          ))}
                        </div>

                        {soloLog.memberMemo && (
                          <p className="text-[11px] text-stone-600 bg-stone-50 p-2 rounded italic">
                            <span className="font-semibold text-stone-800">회원 소감: </span>
                            "{soloLog.memberMemo}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-stone-400">
                  ※ 안내: 본 영역은 참고용 조회 목적으로 제공되며, PT 수업일지 데이터로 자동 복사되거나 덮어쓰이지 않습니다.
                </p>
              </div>

              {/* Phase 7: AI 수업 메모 정리 (AI Quick Memo Draft Assistant) */}
              <div className="bg-gradient-to-br from-stone-50 via-stone-50 to-amber-50/30 border border-stone-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-stone-900 text-amber-400 flex items-center justify-center text-xs shadow-xs">
                      <Sparkles className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                        AI 수업 메모 정리
                        <span className="text-[10px] font-normal text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded font-medium">
                          초안 모드 (자동 저장 방지)
                        </span>
                      </span>
                      <span className="text-[11px] text-stone-500 block">
                        자연어로 간략히 메모를 작성하면 운동 세트, 공개 피드백, 다음 목표, 내부 메모 초안을 생성합니다.
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-stone-400 hidden sm:inline">
                    익명 context • 비진단성 피트니스 보조
                  </span>
                </div>

                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={aiQuickMemo}
                    onChange={(e) => setAiQuickMemo(e.target.value)}
                    placeholder="예: 스쿼트 60kg 10 10 8. 무릎 불편감 없음. 개인운동 마지막 세트 힘들었다고 함. 다음번 60kg 10회 3세트 목표."
                    className="w-full p-2.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800 placeholder:text-stone-400 leading-relaxed"
                  />

                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-stone-500">
                      💡 생성된 초안은 검토 후 [초안 적용하기]를 눌러야 폼에 입력되며, 직접 [수업 일지 저장]을 눌러야 최종 저장됩니다.
                    </p>
                    <button
                      type="button"
                      disabled={isAiGenerating || !aiQuickMemo.trim()}
                      onClick={handleGenerateAiSessionDraft}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 transition-all shadow-xs shrink-0 cursor-pointer"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin text-amber-400' : 'text-amber-400'}`} />
                      <span>{isAiGenerating ? '초안 생성 중...' : 'AI 초안 생성'}</span>
                    </button>
                  </div>
                </div>

                {aiNotice && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span>{aiNotice}</span>
                  </div>
                )}

                {/* AI Draft Review & Edit Container */}
                {aiDraft && (
                  <div className="p-4 bg-white border-2 border-stone-800 rounded-xl space-y-3.5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-stone-900">
                          AI 생성 초안 검토 (수정 가능)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAiDraft(null)}
                        className="text-[11px] text-stone-400 hover:text-stone-600"
                      >
                        초안 닫기 ✕
                      </button>
                    </div>

                    {/* Extracted Exercises Preview */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-stone-700 block">
                        추출된 운동 종목 및 세트 ({aiDraft.exercises.length}개):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {aiDraft.exercises.map((ex, idx) => (
                          <div key={idx} className="bg-stone-50 p-2.5 rounded-lg border border-stone-200 text-xs space-y-1">
                            <div className="flex items-center justify-between font-bold text-stone-900">
                              <span>{ex.exerciseName}</span>
                              <span className="text-[10px] text-stone-500 font-normal">
                                {ex.sets.length}개 세트
                              </span>
                            </div>
                            <div className="font-mono text-[11px] text-stone-700">
                              {ex.sets.map((s) => `${s.weight}kg×${s.reps}회`).join(', ')}
                            </div>
                            {ex.memo && (
                              <p className="text-[10px] text-stone-500 italic mt-0.5">
                                {ex.memo}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Member Feedback (Public) */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-stone-800">
                        회원 공개 피드백 (memberFeedback)
                      </label>
                      <textarea
                        rows={2}
                        value={aiDraft.memberFeedback}
                        onChange={(e) => setAiDraft({ ...aiDraft, memberFeedback: e.target.value })}
                        className="w-full p-2 text-xs border border-stone-300 rounded-lg bg-stone-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-800 leading-relaxed"
                      />
                    </div>

                    {/* Next Session Goal & Internal Note */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-stone-800">
                          다음 수업 목표 (nextSessionGoal)
                        </label>
                        <input
                          type="text"
                          value={aiDraft.nextSessionGoal}
                          onChange={(e) => setAiDraft({ ...aiDraft, nextSessionGoal: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-stone-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-800"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-stone-800 flex items-center justify-between">
                          <span>트레이너 내부 메모 (internalNote)</span>
                          <span className="text-[9px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded">
                            회원 비공개
                          </span>
                        </label>
                        <input
                          type="text"
                          value={aiDraft.internalNote}
                          onChange={(e) => setAiDraft({ ...aiDraft, internalNote: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-stone-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-800"
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-stone-200">
                      <span className="text-[10px] text-stone-500">
                        * [초안 적용하기]를 누르면 아래 정식 폼으로 복사됩니다.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAiDraft(null)}
                          className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 border border-stone-300 rounded-lg bg-white"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyAiDraft}
                          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          초안 적용하기
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* EXERCISE RECORDS SECTION (STEP 6 & STEP 7) */}
              <div className="space-y-4 border-t border-stone-200 pt-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                      운동 종목 및 세트 기록
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      종목명을 입력하면 지난 수업의 동일 운동 수행 기록이 자동으로 비교 안내됩니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sessions.length > 0 && (
                      <button
                        type="button"
                        onClick={handleCopyPreviousSessionExercises}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                        title="이전 수업의 운동 구성을 그대로 불러옵니다"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        이전 수업 구성 복사
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleAddExercise}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      종목 추가
                    </button>
                  </div>
                </div>

                {/* Quick Add Exercise Preset Chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-stone-400">자주 쓰는 종목:</span>
                  {['스쿼트', '데드리프트', '벤치프레스', '렛풀다운', '바벨 로우', '숄더 프레스'].map(
                    (name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleQuickAddExercise(name)}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer border border-stone-200"
                      >
                        + {name}
                      </button>
                    )
                  )}
                </div>

                {exercises.map((ex, exIndex) => {
                  const prevRecord = prevRecordMap[ex.exerciseName];

                  return (
                    <div
                      key={exIndex}
                      className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3"
                    >
                      {/* Exercise Header */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                            운동 종목명 #{exIndex + 1}
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="예: 스쿼트, 벤치프레스, 루마니안 데드리프트"
                            value={ex.exerciseName}
                            onChange={(e) => handleExerciseNameChange(exIndex, e.target.value)}
                            className="w-full sm:w-80 px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(exIndex)}
                          className="text-stone-400 hover:text-rose-600 p-1 text-xs"
                          title="종목 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* STEP 7: Previous Exercise Comparison Reference Box */}
                      {prevRecord && (
                        <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-lg text-xs text-blue-950 flex items-start gap-2">
                          <TrendingUp className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-blue-900">
                              직전 수업 기록 참고 ({prevRecord.sessionDate} PT #{prevRecord.sessionNumber}):
                            </span>{' '}
                            <span>
                              {prevRecord.sets
                                .map((s) => `${s.weight > 0 ? `${s.weight}kg` : '맨몸'} × ${s.reps}`)
                                .join(' / ')}
                            </span>
                            {prevRecord.memo && (
                              <span className="text-blue-700 ml-2">({prevRecord.memo})</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Sets Table */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold text-stone-600 grid grid-cols-12 gap-2 px-1">
                          <span className="col-span-2">세트</span>
                          <span className="col-span-4">무게 (kg)</span>
                          <span className="col-span-4">횟수 (회)</span>
                          <span className="col-span-2 text-right">삭제</span>
                        </div>

                        {ex.sets.map((set, setIndex) => (
                          <div
                            key={set.setNumber}
                            className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-lg border border-stone-200"
                          >
                            <span className="col-span-2 text-xs font-mono font-medium text-stone-700">
                              {set.setNumber}세트
                            </span>
                            <div className="col-span-4">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={set.weight}
                                onChange={(e) =>
                                  handleSetChange(
                                    exIndex,
                                    setIndex,
                                    'weight',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full px-2 py-1 text-xs border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-stone-800"
                              />
                            </div>
                            <div className="col-span-4">
                              <input
                                type="number"
                                min="1"
                                value={set.reps}
                                onChange={(e) =>
                                  handleSetChange(
                                    exIndex,
                                    setIndex,
                                    'reps',
                                    parseInt(e.target.value) || 1
                                  )
                                }
                                className="w-full px-2 py-1 text-xs border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-stone-800"
                              />
                            </div>
                            <div className="col-span-2 flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleDuplicateSet(exIndex, setIndex)}
                                className="text-stone-400 hover:text-stone-700 p-1 rounded transition-colors"
                                title="이 세트 복제"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              {ex.sets.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSet(exIndex, setIndex)}
                                  className="text-stone-400 hover:text-rose-600 p-1 rounded transition-colors"
                                  title="세트 삭제"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => handleAddSet(exIndex)}
                          className="text-[11px] font-medium text-stone-700 hover:text-stone-900 flex items-center gap-1 mt-1 px-2 py-1"
                        >
                          <Plus className="w-3 h-3" /> 세트 추가
                        </button>
                      </div>

                      {/* Exercise Memo */}
                      <div>
                        <input
                          type="text"
                          placeholder="종목별 특이사항 (예: 흉추 신전 가동성 양호, 3세트 복압 보조 등)"
                          value={ex.memo || ''}
                          onChange={(e) => {
                            const updated = [...exercises];
                            updated[exIndex].memo = e.target.value;
                            setExercises(updated);
                          }}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Feedback & Next Goal */}
              <div className="space-y-4 border-t border-stone-200 pt-5">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    트레이너 코칭 및 피드백
                  </label>
                  <textarea
                    rows={3}
                    placeholder="회원에게 전달할 피드백 (자세 피드백, 칭찬, 호흡 조절 등)"
                    value={trainerFeedback}
                    onChange={(e) => setTrainerFeedback(e.target.value)}
                    className="w-full p-2.5 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    다음 수업 목표 & 자율 운동 과제
                  </label>
                  <input
                    type="text"
                    placeholder="예: 백스쿼트 65kg 도전 및 힙힌지 자율 복습 3세트"
                    value={nextSessionGoal}
                    onChange={(e) => setNextSessionGoal(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg bg-white"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? '저장 중...' : editingSessionId ? '수업 일지 수정' : '수업 일지 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
