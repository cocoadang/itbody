import React, { useState, useEffect } from 'react';
import {
  Flame,
  Plus,
  Calendar,
  Clock,
  Dumbbell,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Bookmark,
  Trash2,
  Edit3,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Send,
  Sparkles,
  Info,
  Check
} from 'lucide-react';
import type {
  Member,
  Exercise,
  PersonalWorkoutPlan,
  PersonalWorkoutLog,
  WorkoutTemplate,
  PersonalWorkoutPlanExercise,
  WeeklyActivitySummary,
  UserRole
} from '../types';
import {
  getExercises,
  getExerciseDefaults,
  getPersonalWorkoutPlansByMember,
  createPersonalWorkoutPlan,
  updatePersonalWorkoutPlan,
  deletePersonalWorkoutPlan,
  getPersonalWorkoutLogsByMember,
  addTrainerFeedbackToWorkoutLog,
  deletePersonalWorkoutLog,
  getWorkoutTemplates,
  createWorkoutTemplate,
  deleteWorkoutTemplate,
  getWeeklyActivitySummary
} from '../services/dataService';
import { ExerciseRegistrationForm } from './ExerciseLibraryView';
import { useAuth } from '../context/AuthContext';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import { localToday } from '../utils/dateInputUtils';

interface SoloWorkoutTabProps {
  member: Member;
  onUpdated?: () => void;
}

export const SoloWorkoutTab: React.FC<SoloWorkoutTabProps> = ({ member, onUpdated }) => {
  const { currentUser } = useAuth();
  const currentCenterId = currentUser?.centerId || member.centerId;

  const [activeSubTab, setActiveSubTab] = useState<'plans' | 'logs' | 'templates'>('plans');
  const [plans, setPlans] = useState<PersonalWorkoutPlan[]>([]);
  const [logs, setLogs] = useState<PersonalWorkoutLog[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklyActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Assignment Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignDate, setAssignDate] = useState<string>(localToday());
  const [assignTitle, setAssignTitle] = useState('');
  const [assignInstructions, setAssignInstructions] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<PersonalWorkoutPlanExercise[]>([]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateCategory, setTemplateCategory] = useState('기본 루틴');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');

  // Exercise Picker Drawer inside Assign Modal
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerCategory, setPickerCategory] = useState('ALL');

  // Trainer Feedback Modal
  const [feedbackLog, setFeedbackLog] = useState<PersonalWorkoutLog | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Template creation modal
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [tplTitle, setTplTitle] = useState('');
  const [tplCategory, setTplCategory] = useState('전신');
  const [tplDesc, setTplDesc] = useState('');
  const [tplExercises, setTplExercises] = useState<PersonalWorkoutPlanExercise[]>([]);
  const [savingTpl, setSavingTpl] = useState(false);

  useEffect(() => {
    loadAllData();
  }, [member.memberId, currentCenterId]);

  const loadAllData = async () => {
    if (!currentCenterId) return;
    setLoading(true);
    try {
      const [plansData, logsData, tplsData, exData, weekData] = await Promise.all([
        getPersonalWorkoutPlansByMember(
          currentCenterId,
          member.memberId,
          currentUser?.role || 'TRAINER',
          currentUser?.trainerId
        ),
        getPersonalWorkoutLogsByMember(
          currentCenterId,
          member.memberId,
          currentUser?.role || 'TRAINER',
          currentUser?.trainerId
        ),
        getWorkoutTemplates(currentCenterId),
        getExercises(currentCenterId),
        getWeeklyActivitySummary(currentCenterId, member.memberId)
      ]);
      setPlans(plansData);
      setLogs(logsData);
      setTemplates(tplsData);
      setExercises(exData);
      setWeeklySummary(weekData);
    } catch (err) {
      console.error('Failed to load solo workout data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Open Assign Modal
  const handleOpenAssignModal = () => {
    setAssignDate(localToday());
    setAssignTitle(`${member.name} 회원 맞춤 개인운동`);
    setAssignInstructions('');
    setSelectedExercises([]);
    setSaveAsTemplate(false);
    setTemplateCategory('기본 루틴');
    setAssignError('');
    setIsAssignModalOpen(true);
  };

  // Load from Template
  const handleLoadTemplate = (tpl: WorkoutTemplate) => {
    setAssignTitle(tpl.title);
    setAssignInstructions(tpl.description || '');
    // Deep clone exercises
    setSelectedExercises(
      tpl.exercises.map((e) => ({
        ...e,
        targetSets: e.targetSets.map((s) => ({ ...s }))
      }))
    );
  };

  // Add Exercise to Plan
  const handleAddExerciseToPlan = (ex: Exercise) => {
    // Check if already in plan (prevent duplicate addition)
    if (selectedExercises.some((e) => e.exerciseId === ex.exerciseId)) {
      return;
    }
    const defaults = getExerciseDefaults(ex);
    const newEx: PersonalWorkoutPlanExercise = {
      repUnit: defaults.repUnit,
      exerciseId: ex.exerciseId,
      exerciseName: ex.name,
      bodyPart: ex.bodyPart,
      equipment: ex.equipment,
      targetSets: [1, 2, 3].map(setNumber => ({ setNumber, targetWeight: defaults.weight, targetReps: defaults.reps })),
      guideNote: ex.description || '',
      restSeconds: 60
    };
    setSelectedExercises(prev => [newEx, ...prev]);
    setIsPickerOpen(false);
  };

  const handleUpdateRestSeconds = (exerciseIndex: number, restSeconds: number) => {
    const updated = [...selectedExercises];
    updated[exerciseIndex].restSeconds = restSeconds;
    setSelectedExercises(updated);
  };

  // Remove Exercise from Plan
  const handleRemoveExercise = (index: number) => {
    setSelectedExercises(selectedExercises.filter((_, i) => i !== index));
  };

  // Set updates
  const handleAddSet = (exerciseIndex: number) => {
    const updated = [...selectedExercises];
    const targetSets = updated[exerciseIndex].targetSets;
    const lastSet = targetSets[targetSets.length - 1];
    targetSets.push({
      setNumber: targetSets.length + 1,
      targetWeight: lastSet ? lastSet.targetWeight : 20,
      targetReps: lastSet ? lastSet.targetReps : 10
    });
    setSelectedExercises(updated);
  };

  const handleRemoveSet = (exerciseIndex: number, setIdx: number) => {
    const updated = [...selectedExercises];
    updated[exerciseIndex].targetSets = updated[exerciseIndex].targetSets
      .filter((_: unknown, i: number) => i !== setIdx)
      .map((s: { setNumber: number; targetWeight: number; targetReps: number }, idx: number) => ({
        ...s,
        setNumber: idx + 1
      }));
    setSelectedExercises(updated);
  };

  const handleUpdateSet = (
    exerciseIndex: number,
    setIdx: number,
    field: 'targetWeight' | 'targetReps',
    value: number
  ) => {
    const updated = [...selectedExercises];
    updated[exerciseIndex].targetSets[setIdx][field] = value;
    setSelectedExercises(updated);
  };

  const handleUpdateGuideNote = (exerciseIndex: number, note: string) => {
    const updated = [...selectedExercises];
    updated[exerciseIndex].guideNote = note;
    setSelectedExercises(updated);
  };

  // Submit Assignment
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentCenterId) return;

    if (selectedExercises.length === 0) {
      setAssignError('최소 1개 이상의 운동을 추가해주세요.');
      return;
    }

    if (currentUser.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      setAssignError('본인 담당 회원의 개인운동만 배정할 수 있습니다.');
      return;
    }

    if (!assignDate || !isValidDate(assignDate)) {
      setAssignError('유효한 배정 날짜를 입력해주세요 (YYYY-MM-DD).');
      return;
    }

    setAssigning(true);
    setAssignError('');

    try {
      await createPersonalWorkoutPlan(
        {
          memberId: member.memberId,
          memberName: member.name,
          trainerId: currentUser.trainerId || member.trainerId || currentUser.uid,
          trainerName: currentUser.name,
          centerId: currentCenterId,
          date: assignDate,
          title: assignTitle.trim() || `${assignDate} 개인운동`,
          trainerInstructions: assignInstructions.trim(),
          exercises: selectedExercises,
          status: 'ASSIGNED'
        },
        currentUser.role,
        currentUser.trainerId
      );

      // If user checked save as template
      if (saveAsTemplate) {
        await createWorkoutTemplate(
          {
            centerId: currentCenterId,
            trainerId: currentUser.trainerId || member.trainerId || currentUser.uid,
            title: assignTitle.trim() || '맞춤 루틴 템플릿',
            category: templateCategory,
            description: assignInstructions.trim(),
            exercises: selectedExercises
          },
          currentUser.role
        );
      }

      setIsAssignModalOpen(false);
      await loadAllData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setAssignError(err.message || '개인운동 배정에 실패했습니다.');
    } finally {
      setAssigning(false);
    }
  };

  // Plan Status change
  const handleStatusChange = async (
    plan: PersonalWorkoutPlan,
    newStatus: PersonalWorkoutPlan['status']
  ) => {
    if (!currentUser || !currentCenterId) return;
    if (currentUser.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      alert('본인 담당 회원의 개인운동 계획만 상태를 변경할 수 있습니다.');
      return;
    }
    try {
      await updatePersonalWorkoutPlan(
        currentCenterId,
        plan.planId,
        { status: newStatus },
        currentUser.role,
        currentUser.trainerId
      );
      await loadAllData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(err.message || '상태 변경에 실패했습니다.');
    }
  };

  // Delete Plan
  const handleDeletePlan = async (plan: PersonalWorkoutPlan) => {
    if (!currentUser || !currentCenterId) return;
    if (currentUser.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      alert('본인 담당 회원의 개인운동 계획만 삭제할 수 있습니다.');
      return;
    }
    if (!window.confirm(`'${plan.title}' 계획을 삭제하시겠습니까?`)) return;
    try {
      await deletePersonalWorkoutPlan(currentCenterId, plan.planId, currentUser.role);
      await loadAllData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(err.message || '삭제에 실패했습니다.');
    }
  };

  // Open Trainer Feedback modal
  const handleOpenFeedbackModal = (log: PersonalWorkoutLog) => {
    if (currentUser?.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      alert('본인 담당 회원의 운동 기록에만 피드백을 작성할 수 있습니다.');
      return;
    }
    setFeedbackLog(log);
    setFeedbackText(log.trainerFeedback || '');
  };

  // Submit Feedback
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentCenterId || !feedbackLog) return;
    setSubmittingFeedback(true);
    try {
      await addTrainerFeedbackToWorkoutLog(
        currentCenterId,
        feedbackLog.logId,
        feedbackText.trim(),
        currentUser.role,
        currentUser.trainerId
      );
      setFeedbackLog(null);
      await loadAllData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(err.message || '피드백 저장에 실패했습니다.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Delete Log
  const handleDeleteLog = async (log: PersonalWorkoutLog) => {
    if (!currentUser || !currentCenterId) return;
    if (!window.confirm('회원의 수행 기록을 삭제하시겠습니까?')) return;
    try {
      await deletePersonalWorkoutLog(currentCenterId, log.logId, currentUser.role);
      await loadAllData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(err.message || '삭제에 실패했습니다.');
    }
  };

  // Delete Template
  const handleDeleteTemplate = async (templateId: string, title: string) => {
    if (!currentUser || !currentCenterId) return;
    if (!window.confirm(`'${title}' 템플릿을 삭제하시겠습니까?`)) return;
    try {
      await deleteWorkoutTemplate(currentCenterId, templateId, currentUser.role);
      await loadAllData();
    } catch (err: any) {
      alert(err.message || '템플릿 삭제에 실패했습니다.');
    }
  };

  return (
    <div className="space-y-6" id="solo-workout-tab">
      {/* 1. Weekly Activity Metrics Bar */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center font-bold text-xs">
                <Flame className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-stone-900">
                {member.name} 회원의 주간 운동 현황
              </h3>
              <span className="text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-600 font-medium">
                {weeklySummary ? `${weeklySummary.weekStart} ~ ${weeklySummary.weekEnd}` : '이번 주'}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              PT 수업과 개인운동을 합산하여 회원의 자율적인 운동 습관 형성을 독려하고 관리합니다.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3.5 py-2 bg-stone-50 rounded-xl border border-stone-200 text-center">
              <span className="text-[10px] text-stone-500 font-semibold block uppercase">PT 수업</span>
              <span className="text-base font-bold text-stone-900">
                {weeklySummary ? weeklySummary.ptCount : 0}
                <span className="text-xs font-normal text-stone-500 ml-0.5">회</span>
              </span>
            </div>
            <div className="px-3.5 py-2 bg-amber-50 rounded-xl border border-amber-200 text-center">
              <span className="text-[10px] text-amber-700 font-semibold block uppercase">개인운동</span>
              <span className="text-base font-bold text-amber-900">
                {weeklySummary ? weeklySummary.soloCount : 0}
                <span className="text-xs font-normal text-amber-700 ml-0.5">회</span>
              </span>
            </div>
            <div className="px-3.5 py-2 bg-stone-900 text-white rounded-xl text-center shadow-xs">
              <span className="text-[10px] text-stone-300 font-semibold block uppercase">주간 합계</span>
              <span className="text-base font-bold text-white">
                {weeklySummary ? weeklySummary.totalCount : 0}
                <span className="text-xs font-normal text-stone-300 ml-0.5">회</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Subtabs and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            id="subtab-plans"
            type="button"
            onClick={() => setActiveSubTab('plans')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'plans'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
            }`}
          >
            배정된 운동 계획 ({plans.length})
          </button>
          <button
            id="subtab-logs"
            type="button"
            onClick={() => setActiveSubTab('logs')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'logs'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
            }`}
          >
            회원 수행 기록 ({logs.length})
          </button>
          <button
            id="subtab-templates"
            type="button"
            onClick={() => setActiveSubTab('templates')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'templates'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
            }`}
          >
            루틴 템플릿 ({templates.length})
          </button>
        </div>

        <button
          id="btn-assign-workout"
          type="button"
          onClick={handleOpenAssignModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>개인운동 배정하기</span>
        </button>
      </div>

      {/* 3. Subtab Content */}
      {loading ? (
        <div className="py-16 text-center text-xs text-stone-400">데이터를 불러오는 중입니다...</div>
      ) : activeSubTab === 'plans' ? (
        /* ================= PLANS LIST ================= */
        plans.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <Flame className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-stone-800">배정된 개인운동 계획이 없습니다</p>
            <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
              회원이 수업 외 시간에도 스스로 수행할 수 있도록 운동 라이브러리에서 루틴을 선택해 배정해보세요.
            </p>
            <button
              onClick={handleOpenAssignModal}
              className="mt-4 px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              지금 개인운동 배정하기
            </button>
          </div>
        ) : (
          <div className="space-y-4" id="plans-list">
            {plans.map((plan) => {
              const statusColor =
                plan.status === 'COMPLETED'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : plan.status === 'IN_PROGRESS'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : plan.status === 'SKIPPED'
                  ? 'bg-stone-100 text-stone-500 border-stone-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200';

              const statusLabel =
                plan.status === 'COMPLETED'
                  ? '완료됨'
                  : plan.status === 'IN_PROGRESS'
                  ? '진행 중'
                  : plan.status === 'SKIPPED'
                  ? '건너뜀'
                  : '배정됨';

              return (
                <div
                  key={plan.planId}
                  id={`plan-card-${plan.planId}`}
                  className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-xs">
                        <Calendar className="w-4 h-4" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-stone-900">{plan.title}</h4>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${statusColor}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">
                          배정일: {plan.date} · 배정 트레이너: {plan.trainerName || '담당 트레이너'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        id={`select-status-${plan.planId}`}
                        value={plan.status}
                        onChange={(e) =>
                          handleStatusChange(plan, e.target.value as PersonalWorkoutPlan['status'])
                        }
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-stone-200 bg-white text-stone-700 cursor-pointer"
                      >
                        <option value="ASSIGNED">배정됨 (ASSIGNED)</option>
                        <option value="IN_PROGRESS">진행 중 (IN_PROGRESS)</option>
                        <option value="COMPLETED">완료됨 (COMPLETED)</option>
                        <option value="SKIPPED">건너뜀 (SKIPPED)</option>
                      </select>
                      <button
                        title="계획 삭제"
                        onClick={() => handleDeletePlan(plan)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Trainer Instructions */}
                  {plan.trainerInstructions && (
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-100 text-xs text-stone-700 leading-relaxed flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-stone-900">트레이너 전달사항: </span>
                        <span>{plan.trainerInstructions}</span>
                      </div>
                    </div>
                  )}

                  {/* Exercises Table */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-stone-600 block">
                      배정된 운동 ({plan.exercises.length}종목)
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {plan.exercises.map((ex, exIdx) => (
                        <div
                          key={ex.exerciseId}
                          className="bg-stone-50/70 p-3.5 rounded-xl border border-stone-200/80 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-stone-200 text-stone-700 text-[10px] flex items-center justify-center font-bold">
                                {exIdx + 1}
                              </span>
                              {ex.exerciseName}
                            </span>
                            <div className="flex items-center gap-1 text-[10px]">
                              {ex.bodyPart && (
                                <span className="px-1.5 py-0.5 rounded bg-white text-stone-600 border border-stone-200">
                                  {ex.bodyPart}
                                </span>
                              )}
                              {ex.equipment && (
                                <span className="px-1.5 py-0.5 rounded bg-white text-stone-600 border border-stone-200">
                                  {ex.equipment}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Sets summary */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {ex.targetSets.map((s) => (
                              <span
                                key={s.setNumber}
                                className="px-2 py-0.5 rounded bg-white border border-stone-200 text-[11px] font-mono text-stone-700"
                              >
                                {s.setNumber}세트: {s.targetWeight}kg × {s.targetReps}{ex.repUnit === 'seconds' ? '초' : '회'}
                              </span>
                            ))}
                          </div>

                          {ex.guideNote && (
                            <p className="text-[11px] text-stone-500 italic mt-1">{ex.guideNote}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : activeSubTab === 'logs' ? (
        /* ================= LOGS LIST ================= */
        logs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-stone-800">완료된 개인운동 기록이 없습니다</p>
            <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
              회원이 모바일 포털의 '운동' 메뉴에서 운동을 수행하고 완료하면 실제 수행값과 함께 이곳에 기록됩니다.
            </p>
          </div>
        ) : (
          <div className="space-y-4" id="logs-list">
            {logs.map((log) => (
              <div
                key={log.logId}
                id={`log-card-${log.logId}`}
                className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-stone-900">
                          {log.date} 개인운동 완료
                        </h4>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                          실제 수행 완료
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">
                        운동 시간: {log.startTime || '미지정'} ~ {log.completedAt || '종료'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      id={`btn-feedback-${log.logId}`}
                      type="button"
                      onClick={() => handleOpenFeedbackModal(log)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{log.trainerFeedback ? '피드백 수정' : '피드백 작성'}</span>
                    </button>
                    <button
                      title="기록 삭제"
                      onClick={() => handleDeleteLog(log)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Performed Exercises with Actual Sets */}
                <div className="space-y-3">
                  <span className="text-xs font-semibold text-stone-600 block">
                    실제 수행 결과 ({log.completedExercises.length}종목)
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {log.completedExercises.map((ex, exIdx) => (
                      <div
                        key={ex.exerciseId}
                        className="bg-stone-50/70 p-3.5 rounded-xl border border-stone-200/80 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[10px] flex items-center justify-center font-bold">
                              ✓
                            </span>
                            {ex.exerciseName}
                          </span>
                        </div>

                        {/* Sets list */}
                        <div className="space-y-1">
                          {ex.actualSets.map((s) => (
                            <div
                              key={s.setNumber}
                              className="flex items-center justify-between px-2.5 py-1 bg-white rounded-lg border border-stone-200 text-xs font-mono"
                            >
                              <span className="text-stone-500 font-sans text-[11px]">
                                {s.setNumber}세트
                              </span>
                              <span className="font-bold text-stone-900">
                                {s.weight}kg × {s.reps}{ex.repUnit === 'seconds' ? '초' : '회'}
                              </span>
                              <span className="text-emerald-600 text-xs">
                                {s.completed ? '완료' : '진행'}
                              </span>
                            </div>
                          ))}
                        </div>

                        {ex.notes && (
                          <p className="text-[11px] text-stone-500 italic mt-1">
                            특이사항: {ex.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Member Memo */}
                {log.memberMemo && (
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-100 text-xs text-stone-700 leading-relaxed">
                    <span className="font-semibold text-stone-900 block mb-0.5">
                      회원 운동 소감:
                    </span>
                    <p>{log.memberMemo}</p>
                  </div>
                )}

                {/* Trainer Feedback Box */}
                {log.trainerFeedback ? (
                  <div className="p-3.5 bg-purple-50/70 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1.5 text-purple-800">
                        <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                        트레이너 피드백 ({log.trainerName || '담당 트레이너'})
                      </span>
                      <button
                        onClick={() => handleOpenFeedbackModal(log)}
                        className="text-[11px] text-purple-600 hover:text-purple-800 underline cursor-pointer"
                      >
                        수정
                      </button>
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{log.trainerFeedback}</p>
                  </div>
                ) : (
                  <div className="p-3 bg-stone-50 border border-dashed border-stone-200 rounded-xl text-xs text-stone-500 flex items-center justify-between">
                    <span>아직 등록된 트레이너 피드백이 없습니다.</span>
                    <button
                      onClick={() => handleOpenFeedbackModal(log)}
                      className="text-purple-600 font-semibold hover:underline cursor-pointer"
                    >
                      + 피드백 남기기
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        /* ================= TEMPLATES LIST ================= */
        <div className="space-y-4" id="templates-list">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-500">
              자주 사용하는 개인운동 루틴을 템플릿으로 저장하여 회원 배정 시 원클릭으로 불러올 수 있습니다.
            </p>
          </div>

          {templates.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <Bookmark className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-stone-800">등록된 루틴 템플릿이 없습니다</p>
              <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
                개인운동 배정 창에서 '템플릿으로 저장'을 선택하거나 템플릿을 직접 추가해보세요.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((tpl) => (
                <div
                  key={tpl.templateId}
                  className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-stone-900">{tpl.title}</h4>
                          <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 text-[11px] font-medium">
                            {tpl.category}
                          </span>
                        </div>
                        {tpl.description && (
                          <p className="text-xs text-stone-500 mt-1">{tpl.description}</p>
                        )}
                      </div>
                      <button
                        title="템플릿 삭제"
                        onClick={() => handleDeleteTemplate(tpl.templateId, tpl.title)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Exercises count */}
                    <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5">
                      <span className="text-[11px] font-semibold text-stone-600 block">
                        포함된 운동 ({tpl.exercises.length}개):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {tpl.exercises.map((e, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-stone-50 border border-stone-200 text-[11px] text-stone-700"
                          >
                            {e.exerciseName} ({e.targetSets.length}세트)
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        handleLoadTemplate(tpl);
                        setIsAssignModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
                    >
                      이 템플릿으로 배정하기
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= ASSIGN WORKOUT MODAL ================= */}
      {isAssignModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setIsAssignModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden border border-stone-200 flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
            id="modal-assign-workout"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    개인운동 배정 — {member.name} 회원
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    목표 세트/횟수/중량을 설정하여 회원의 자율 운동을 안내합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAssignSubmit} className="p-6 space-y-5 overflow-y-auto">
              {assignError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                  {assignError}
                </div>
              )}

              {/* Template quick loader */}
              {templates.length > 0 && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5 text-stone-500" />
                    루틴 템플릿에서 가져오기:
                  </span>
                  <select
                    onChange={(e) => {
                      const tpl = templates.find((t) => t.templateId === e.target.value);
                      if (tpl) handleLoadTemplate(tpl);
                    }}
                    defaultValue=""
                    className="text-xs rounded-lg border border-stone-300 px-2.5 py-1 bg-white text-stone-800 cursor-pointer"
                  >
                    <option value="" disabled>
                      템플릿 선택...
                    </option>
                    {templates.map((t) => (
                      <option key={t.templateId} value={t.templateId}>
                        {t.title} ({t.exercises.length}종목)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date & Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="assign-date-input" className="block text-xs font-semibold text-stone-700 mb-1">
                    배정 날짜
                  </label>
                  <DateInputField
                    id="assign-date-input"
                    value={assignDate}
                    onChange={setAssignDate}
                    className="!text-xs !rounded-xl !bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    루틴 제목
                  </label>
                  <input
                    id="assign-title-input"
                    type="text"
                    value={assignTitle}
                    onChange={(e) => setAssignTitle(e.target.value)}
                    placeholder="예: 하체 기본 & 코어 강화"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200"
                    required
                  />
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  트레이너 설명 및 가이드
                </label>
                <textarea
                  id="assign-instructions-textarea"
                  rows={2}
                  value={assignInstructions}
                  onChange={(e) => setAssignInstructions(e.target.value)}
                  placeholder="예: 스쿼트 시 고관절 힌지 유지에 집중해주세요. 세트 간 휴식은 60초입니다."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200"
                />
              </div>

              {/* Selected Exercises Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-stone-800">
                    운동 종목 구성 ({selectedExercises.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsPickerOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>운동 라이브러리에서 추가</span>
                  </button>
                </div>

                {selectedExercises.length === 0 ? (
                  <div className="py-8 text-center bg-stone-50 border border-dashed border-stone-200 rounded-xl text-xs text-stone-400">
                    아직 추가된 운동이 없습니다. '+ 운동 라이브러리에서 추가' 버튼을 눌러주세요.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedExercises.map((ex, exIdx) => (
                      <div
                        key={ex.exerciseId}
                        className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-stone-900 text-white text-xs font-bold flex items-center justify-center">
                              {exIdx + 1}
                            </span>
                            <span className="text-xs font-bold text-stone-900">
                              {ex.exerciseName}
                            </span>
                            {ex.bodyPart && (
                              <span className="px-2 py-0.5 rounded bg-white text-stone-600 text-[10px] border border-stone-200">
                                {ex.bodyPart}
                              </span>
                            )}
                            {ex.equipment && (
                              <span className="px-2 py-0.5 rounded bg-white text-stone-600 text-[10px] border border-stone-200">
                                {ex.equipment}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveExercise(exIdx)}
                            className="text-stone-400 hover:text-rose-600 p-1 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Sets Config */}
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-stone-500 px-1">
                            <div className="col-span-2">세트</div>
                            <div className="col-span-4">목표 중량 (kg)</div>
                            <div className="col-span-4">목표 {ex.repUnit === 'seconds' ? '시간 (초)' : '횟수 (회)'}</div>
                            <div className="col-span-2 text-right">삭제</div>
                          </div>
                          {ex.targetSets.map((set: { setNumber: number; targetWeight: number; targetReps: number }, setIdx: number) => (
                            <div
                              key={setIdx}
                              className="grid grid-cols-12 gap-2 items-center bg-white p-1.5 rounded-lg border border-stone-200"
                            >
                              <div className="col-span-2 text-xs font-bold text-stone-700 px-1">
                                {set.setNumber}세트
                              </div>
                              <div className="col-span-4">
                                <input
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  value={set.targetWeight}
                                  onChange={(e) =>
                                    handleUpdateSet(
                                      exIdx,
                                      setIdx,
                                      'targetWeight',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-full px-2 py-1 text-xs border border-stone-200 rounded font-mono"
                                />
                              </div>
                              <div className="col-span-4">
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={set.targetReps}
                                  onChange={(e) =>
                                    handleUpdateSet(
                                      exIdx,
                                      setIdx,
                                      'targetReps',
                                      parseInt(e.target.value, 10) || 1
                                    )
                                  }
                                  className="w-full px-2 py-1 text-xs border border-stone-200 rounded font-mono"
                                />
                              </div>
                              <div className="col-span-2 text-right">
                                {ex.targetSets.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSet(exIdx, setIdx)}
                                    className="text-stone-400 hover:text-rose-600 text-xs px-1"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleAddSet(exIdx)}
                            className="text-[11px] text-stone-600 hover:text-stone-900 font-semibold px-1 py-0.5 cursor-pointer"
                          >
                            + 세트 추가
                          </button>
                        </div>

                        {/* Exercise Specific Guide Note & Rest Time */}
                        <div className="space-y-2 pt-1 border-t border-stone-200/60">
                          <input
                            type="text"
                            value={ex.guideNote || ''}
                            onChange={(e) => handleUpdateGuideNote(exIdx, e.target.value)}
                            placeholder="종목별 특이사항 (예: 무릎 안쪽 모임 주의, 빈 봉 웜업)"
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-lg text-stone-700"
                          />

                          {/* Rest Time Config */}
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-stone-500 font-medium">세트 간 권장 휴식:</span>
                            <div className="flex items-center gap-1">
                              {[30, 60, 90, 120].map((sec) => (
                                <button
                                  key={sec}
                                  type="button"
                                  onClick={() => handleUpdateRestSeconds(exIdx, sec)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                                    (ex.restSeconds || 60) === sec
                                      ? 'bg-amber-500 text-white font-bold'
                                      : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                                  }`}
                                >
                                  {sec}초
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Save As Template Option */}
              <div className="pt-3 border-t border-stone-100 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-stone-800">
                  <input
                    type="checkbox"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    className="rounded text-stone-900 focus:ring-stone-900 cursor-pointer"
                  />
                  <span>이 구성을 루틴 템플릿으로 함께 저장하기 (재사용)</span>
                </label>
                {saveAsTemplate && (
                  <div className="pl-6">
                    <input
                      type="text"
                      value={templateCategory}
                      onChange={(e) => setTemplateCategory(e.target.value)}
                      placeholder="템플릿 카테고리 (예: 하체, 상체, 전신, 코어)"
                      className="px-3 py-1.5 text-xs border border-stone-200 rounded-lg w-full max-w-xs"
                    />
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 text-xs text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-xl"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="px-5 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {assigning ? '배정 저장 중...' : '개인운동 배정 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= EXERCISE PICKER DRAWER/MODAL ================= */}
      {isPickerOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setIsPickerOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
            id="modal-exercise-picker"
          >
            <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Dumbbell className="w-4 h-4 text-stone-700" />
                운동 라이브러리에서 선택
              </span>
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {currentUser && (currentUser.role === 'TRAINER' || currentUser.role === 'CENTER_ADMIN') && (
              <ExerciseRegistrationForm centerId={currentCenterId} role={currentUser.role} onCreated={ex => {
                setExercises(prev => [ex, ...prev]);
                setPickerSearch('');
                setPickerCategory('ALL');
                handleAddExerciseToPlan(ex);
              }} />
            )}
            <div className="p-4 border-b border-stone-100 flex items-center gap-2">
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="운동명 또는 부위 검색..."
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-stone-200"
              />
              <select
                value={pickerCategory}
                onChange={(e) => setPickerCategory(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-xl border border-stone-200 bg-white"
              >
                <option value="ALL">전체</option>
                <option value="웨이트">웨이트</option>
                <option value="머신">머신</option>
                <option value="맨몸">맨몸</option>
                <option value="유산소">유산소</option>
              </select>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {(() => {
                const filtered = exercises.filter((ex) => {
                  if (pickerCategory !== 'ALL' && ex.category !== pickerCategory) return false;
                  if (pickerSearch.trim()) {
                    const q = pickerSearch.toLowerCase();
                    return (
                      ex.name.toLowerCase().includes(q) ||
                      ex.bodyPart.toLowerCase().includes(q) ||
                      ex.equipment.toLowerCase().includes(q)
                    );
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div id="picker-empty-results" className="py-12 text-center text-xs text-stone-400 space-y-2">
                      <Dumbbell className="w-8 h-8 text-stone-300 mx-auto" />
                      <p className="font-bold text-stone-700 text-sm">검색 결과가 없습니다</p>
                      <p className="text-[11px] text-stone-400">
                        '{pickerSearch}'에 해당하는 운동을 찾을 수 없습니다. 다른 단어로 검색해보세요.
                      </p>
                    </div>
                  );
                }

                return filtered.map((ex) => {
                  const isAdded = selectedExercises.some((e) => e.exerciseId === ex.exerciseId);
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
                        onClick={() => handleAddExerciseToPlan(ex)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-xl cursor-pointer transition-colors ${
                          isAdded
                            ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                            : 'bg-stone-900 hover:bg-stone-800 text-white shadow-2xs'
                        }`}
                      >
                        {isAdded ? '추가됨' : '+ 추가'}
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ================= TRAINER FEEDBACK MODAL ================= */}
      {feedbackLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setFeedbackLog(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden border border-stone-200"
            onClick={(e) => e.stopPropagation()}
            id="modal-trainer-feedback"
          >
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-purple-50">
              <div className="flex items-center gap-2 text-purple-900">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-bold">
                  트레이너 피드백 작성 ({feedbackLog.date})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackLog(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitFeedback} className="p-6 space-y-4">
              {/* Member's Memo Reference */}
              {feedbackLog.memberMemo && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 leading-relaxed">
                  <span className="font-semibold text-stone-800 block mb-0.5">회원 소감:</span>
                  <p>{feedbackLog.memberMemo}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  트레이너 피드백 내용
                </label>
                <textarea
                  id="textarea-trainer-feedback"
                  rows={4}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="예: 스쿼트 3세트 무게 잘 버텨주셨습니다! 다음엔 호흡 템포만 조금 더 길게 가져가 보세요. 수고 많으셨습니다!"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-purple-600"
                  required
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  작성된 피드백은 회원 모바일 화면에 즉시 전달되며 운동 타임라인에 반영됩니다.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setFeedbackLog(null)}
                  className="px-4 py-2 text-xs text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-xl"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submittingFeedback}
                  className="px-5 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingFeedback ? '전송 중...' : '피드백 등록'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
