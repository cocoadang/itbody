import { MemberPlanEditor } from './journal/MemberPlanCard';
import { confirmDialog } from '../utils/confirmDialog';
import { KakaoInvite } from './KakaoLogin';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getMemberById,
  updateMemberStatus,
  updateMemberNotes,
  getTrainers,
  getGoalsByMember,
  createGoal,
  updateGoal,
  deleteGoal,
  getContractsByMember,
  getPriorityContract,
  calculateMemberSessionSummary,
  createContract,
  getMemberTimeline,
  getBodyMeasurements,
  getSessionsByMember
} from '../services/dataService';
import type {
  Member,
  Trainer,
  MemberStatus,
  MemberGoal,
  GoalCategory,
  PtContract,
  TimelineEvent,
  BodyMeasurement,
  PtSession,
  GoalMetricKey
} from '../types';
import { EmptyState } from './EmptyState';
import { ConsultationTab } from './ConsultationTab';
import { SessionJournalTab } from './SessionJournalTab';
import { BodyChangesTab } from './BodyChangesTab';
import { PhotosTab } from './PhotosTab';
import { PerformanceReportTab } from './PerformanceReportTab';
import { SoloWorkoutTab } from './SoloWorkoutTab';
import { NewMemberModal } from './NewMemberModal';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import {
  calculateMetricComparison,
  calculateExerciseProgress,
  calculateGoalProgress
} from '../utils/progressCalculations';
import {
  ArrowLeft,
  Calendar,
  UserCheck,
  Phone,
  Mail,
  ShieldAlert,
  Save,
  CheckCircle,
  Clock,
  Sparkles,
  Dumbbell,
  MessageSquare,
  Activity,
  Camera,
  Flame,
  Utensils,
  Award,
  Layers,
  Target,
  Plus,
  Trash2,
  FileCheck,
  CheckCircle2,
  History,
  TrendingUp,
  ArrowRight,
  Smartphone,
  X,
  Edit2,
  RotateCcw,
  KeyRound,
  Loader2,
  AlertCircle,
  ClipboardList
} from 'lucide-react';
import { MemberPortal } from './member/MemberPortal';
import { provisionAccount, generateResetPasswordLink } from '../services/adminAccountService';
import { PasswordLinkModal } from './PasswordLinkModal';
import { localToday } from '../utils/dateInputUtils';

interface MemberDetailViewProps {
  memberId: string;
  onBack: () => void;
}

export type DetailTab =
  | 'plan'
  | 'overview'
  | 'consultation'
  | 'pt-sessions'
  | 'body-changes'
  | 'photos'
  | 'solo-workout'
  | 'performance-report';

interface TabDefinition {
  id: DetailTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isImplemented: boolean;
  phase: string;
  description: string;
}

// Simplified per the trainer meeting: journal first, body changes kept separate, member info.
// Consultation, progress photos, solo workouts and reports are hidden (data is kept).
const SHOW_LEGACY_SECTIONS: boolean = false;

const TABS: TabDefinition[] = [
  { id: 'pt-sessions', label: '수업 일지', icon: Dumbbell, isImplemented: true, phase: 'Journal', description: '회차별 메모·운동·사진/영상·회원 댓글' },
  { id: 'plan', label: '관리 계획', icon: ClipboardList, isImplemented: true, phase: 'Plan', description: '목표·주간 계획·영양·유산소' },
  { id: 'body-changes', label: '신체 변화', icon: Activity, isImplemented: true, phase: 'Body', description: '체중·체성분 변화 그래프' },
  { id: 'overview', label: '회원 정보', icon: Layers, isImplemented: true, phase: 'Info', description: '회원 기본 정보와 PT 이용권' }
];

const GOAL_CATEGORY_MAP: Record<GoalCategory, { label: string; color: string }> = {
  BODY_COMPOSITION: { label: '체성분 / 인바디', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  PERFORMANCE: { label: '운동 수행능력', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  HABIT: { label: '운동 습관 형성', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  REHAB_POSTURE: { label: '자세 교정 / 재활', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  OTHER: { label: '기타 목표', color: 'bg-stone-50 text-stone-700 border-stone-200' }
};

export const MemberDetailView: React.FC<MemberDetailViewProps> = ({
  memberId,
  onBack
}) => {
  const { currentUser } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>('pt-sessions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable fields in overview
  const [notes, setNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Phase 2 & 3: Goals, Contracts, Timeline, Measurements, Sessions
  const [goals, setGoals] = useState<MemberGoal[]>([]);
  const [contracts, setContracts] = useState<PtContract[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [sessions, setSessions] = useState<PtSession[]>([]);

  // Goal Creation Modal
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [newGoalCategory, setNewGoalCategory] = useState<GoalCategory>('BODY_COMPOSITION');
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [newGoalTargetValue, setNewGoalTargetValue] = useState('');
  const [newGoalTargetUnit, setNewGoalTargetUnit] = useState('');
  const [newGoalTargetDate, setNewGoalTargetDate] = useState('');
  const [newGoalMetricKey, setNewGoalMetricKey] = useState<GoalMetricKey | ''>('');
  const [newGoalExerciseName, setNewGoalExerciseName] = useState('');
  const [newGoalStartValue, setNewGoalStartValue] = useState('');
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [isMemberPortalPreviewOpen, setIsMemberPortalPreviewOpen] = useState(false);

  // Contract Creation Modal
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [contractTitle, setContractTitle] = useState('PT 10회 정규 코칭 패키지');
  const [contractTotalSessions, setContractTotalSessions] = useState(10);
  const [contractStartDate, setContractStartDate] = useState(localToday());
  const [contractEndDate, setContractEndDate] = useState(
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [contractNotes, setContractNotes] = useState('');
  const [isSavingContract, setIsSavingContract] = useState(false);
  const [isEditMemberModalOpen, setIsEditMemberModalOpen] = useState(false);

  // Phase 10B Account Provisioning & Password Reset Link Modal State (Firebase Functions 2nd Gen 활성화)
  // Members sign in with Kakao only; email account issuing and reset links are retired.
  const IS_AUTO_PROVISIONING_ENABLED = false;
  const [isAccountActionLoading, setIsAccountActionLoading] = useState(false);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);
  const [passwordModalState, setPasswordModalState] = useState<{
    isOpen: boolean;
    targetName: string;
    targetEmail: string;
    resetLink: string;
    isNewlyProvisioned: boolean;
  }>({
    isOpen: false,
    targetName: '',
    targetEmail: '',
    resetLink: '',
    isNewlyProvisioned: true
  });

  const fetchMember = useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setError(null);
      // Everything for this screen in one parallel round. The activity timeline is no longer
      // shown, so its six extra queries (duplicating the ones below) are not made.
      const [memberData, trainersData, goalsData, contractsData, measurementsData, sessionsData] = await Promise.all([
        getMemberById(currentUser.centerId, memberId, currentUser.role, currentUser.trainerId),
        getTrainers(currentUser.centerId),
        getGoalsByMember(currentUser.centerId, memberId, currentUser.role, currentUser.trainerId),
        getContractsByMember(currentUser.centerId, memberId, currentUser.role, currentUser.trainerId),
        getBodyMeasurements(currentUser.centerId, memberId, currentUser.role, currentUser.trainerId),
        getSessionsByMember(currentUser.centerId, memberId, currentUser.role, currentUser.trainerId)
      ]);

      if (!memberData) {
        setError('해당 회원을 찾을 수 없거나 접근 권한이 없습니다 (테넌트 또는 담당 트레이너 권한 제한).');
        setMember(null);
      } else {
        setMember(memberData);
        setNotes(memberData.notes || '');
        setGoals(goalsData);
        setContracts(contractsData);
        setTimelineEvents([]);
        setMeasurements(measurementsData);
        setSessions(sessionsData);
      }
      setTrainers(trainersData);
    } catch (err) {
      console.error('[MemberDetail fetch error]', err);
      setError('회원 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [currentUser, memberId]);

  useEffect(() => {
    fetchMember();
  }, [fetchMember]);

  // After a journal save: sessions, PT passes and (when body composition was entered) measurements.
  const refreshJournal = async () => {
    if (!currentUser || !member) return;
    const [contractsData, sessionsData, measurementsData] = await Promise.all([
      getContractsByMember(currentUser.centerId, member.memberId, currentUser.role, currentUser.trainerId),
      getSessionsByMember(currentUser.centerId, member.memberId, currentUser.role, currentUser.trainerId),
      getBodyMeasurements(currentUser.centerId, member.memberId, currentUser.role, currentUser.trainerId)
    ]);
    setContracts(contractsData);
    setSessions(sessionsData);
    setMeasurements(measurementsData);
  };

  const refreshTimelineAndGoals = async () => {
    if (!currentUser || !member) return;
    const [goalsData, contractsData, measurementsData, sessionsData] = await Promise.all([
      getGoalsByMember(currentUser.centerId, member.memberId, currentUser.role, currentUser.trainerId),
      getContractsByMember(currentUser.centerId, member.memberId, currentUser.role, currentUser.trainerId),
      getBodyMeasurements(currentUser.centerId, member.memberId, currentUser.role, currentUser.trainerId),
      getSessionsByMember(currentUser.centerId, member.memberId, currentUser.role, currentUser.trainerId)
    ]);
    setGoals(goalsData);
    setContracts(contractsData);
    setMeasurements(measurementsData);
    setSessions(sessionsData);
  };

  // Handle status change
  const handleStatusChange = async (newStatus: MemberStatus) => {
    if (!member || !currentUser) return;
    if (currentUser.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      alert('본인 담당 회원의 상태만 변경할 수 있습니다.');
      return;
    }
    try {
      await updateMemberStatus(member.memberId, newStatus, currentUser.role, currentUser.trainerId);
      setMember((prev) => (prev ? { ...prev, status: newStatus } : null));
    } catch (err: any) {
      console.error('Error updating status:', err);
      alert(err?.message || '상태 변경에 실패했습니다.');
    }
  };

  // Handle notes save
  const handleSaveNotes = async () => {
    if (!member || !currentUser) return;
    if (currentUser.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      alert('본인 담당 회원의 메모만 수정할 수 있습니다.');
      return;
    }
    try {
      setIsSavingNotes(true);
      await updateMemberNotes(member.memberId, notes, currentUser.role, currentUser.trainerId);
      setMember((prev) => (prev ? { ...prev, notes } : null));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving notes:', err);
      alert(err?.message || '메모 저장에 실패했습니다.');
    } finally {
      setIsSavingNotes(false);
    }
  };

  // STEP 9: Overview Recent Changes Summary
  const overviewWeightComp = useMemo(
    () => calculateMetricComparison(measurements, 'weightKg'),
    [measurements]
  );
  const overviewFatComp = useMemo(
    () => calculateMetricComparison(measurements, 'bodyFatPercentage'),
    [measurements]
  );
  const overviewMuscleComp = useMemo(
    () => calculateMetricComparison(measurements, 'skeletalMuscleMassKg'),
    [measurements]
  );
  const overviewExSummary = useMemo(
    () => calculateExerciseProgress(sessions),
    [sessions]
  );

  // Phase 9D Requirement 6: Sorted contracts for renewal history pipeline
  const sortedContracts = useMemo(() => {
    return [...contracts].sort((a, b) => {
      const dateA = a.startDate || a.createdAt;
      const dateB = b.startDate || b.createdAt;
      return dateA.localeCompare(dateB);
    });
  }, [contracts]);

  const sessionSummary = useMemo(
    () => calculateMemberSessionSummary(contracts, sessions),
    [contracts, sessions]
  );
  const activeContract = sessionSummary.primaryContract;
  const remainingSessions = sessionSummary.hasActiveContracts
    ? sessionSummary.activeRemainingSessions
    : null;
  const assignedTrainer = member ? trainers.find((t) => t.trainerId === member.trainerId) : undefined;

  // Phase 10B: CENTER_ADMIN 회원 Firebase 계정 자동 발급
  const handleProvisionAccount = async () => {
    if (!member || !currentUser) return;
    if (currentUser.role !== 'CENTER_ADMIN') {
      setAccountActionError('센터 관리자만 계정을 발급할 수 있습니다.');
      return;
    }
    if (!member.email) {
      setAccountActionError('계정을 발급하려면 회원 정보에 이메일이 등록되어 있어야 합니다. [회원 정보 수정]에서 이메일을 먼저 등록해주세요.');
      return;
    }
    try {
      setAccountActionError(null);
      setIsAccountActionLoading(true);
      const res = await provisionAccount('MEMBER', member.memberId);
      if (res.success && res.uid) {
        setMember((prev) => (prev ? { ...prev, uid: res.uid } : null));
        setPasswordModalState({
          isOpen: true,
          targetName: member.name,
          targetEmail: res.email || member.email || '',
          resetLink: res.resetLink || '',
          isNewlyProvisioned: true
        });
      }
    } catch (err: any) {
      console.warn('[Provision Account Warning]', err?.message || err);
      setAccountActionError(err.message || '계정 발급에 실패했습니다.');
    } finally {
      setIsAccountActionLoading(false);
    }
  };

  // Phase 10B: 비밀번호 재설정 링크 생성
  const handleResetPasswordLink = async () => {
    if (!member || !currentUser) return;
    if (currentUser.role !== 'CENTER_ADMIN') {
      setAccountActionError('센터 관리자만 비밀번호 재설정 링크를 생성할 수 있습니다.');
      return;
    }
    try {
      setAccountActionError(null);
      setIsAccountActionLoading(true);
      const res = await generateResetPasswordLink('MEMBER', member.memberId);
      if (res.success) {
        setPasswordModalState({
          isOpen: true,
          targetName: member.name,
          targetEmail: res.email || member.email || '',
          resetLink: res.resetLink || '',
          isNewlyProvisioned: false
        });
      }
    } catch (err: any) {
      console.warn('[Reset Password Link Warning]', err?.message || err);
      setAccountActionError(err.message || '비밀번호 재설정 링크 생성에 실패했습니다.');
    } finally {
      setIsAccountActionLoading(false);
    }
  };

  // Goal actions
  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member || !currentUser) return;
    if (currentUser.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      alert('본인 담당 회원의 목표만 등록할 수 있습니다.');
      return;
    }
    if (newGoalTargetDate && !isValidDate(newGoalTargetDate)) {
      alert('유효한 목표 달성 기한을 입력해주세요 (YYYY-MM-DD).');
      return;
    }
    setIsSavingGoal(true);
    try {
      const created = await createGoal(
        {
          centerId: member.centerId,
          memberId: member.memberId,
          trainerId: member.trainerId || (currentUser.role === 'TRAINER' && currentUser.trainerId ? currentUser.trainerId : ''),
          category: newGoalCategory,
          title: newGoalTitle,
          description: newGoalDescription,
          targetValue: newGoalTargetValue || undefined,
          targetUnit: newGoalTargetUnit || undefined,
          targetDate: newGoalTargetDate || undefined,
          metricKey: newGoalMetricKey || undefined,
          exerciseName: newGoalExerciseName.trim() || undefined,
          startValue: newGoalStartValue ? parseFloat(newGoalStartValue) : undefined,
          status: 'ACTIVE'
        },
        currentUser.role,
        currentUser.trainerId
      );

      // Immediately update local state to provide instant feedback
      setGoals((prev) => [created, ...prev.filter((g) => g.goalId !== created.goalId)]);

      setIsGoalModalOpen(false);
      setNewGoalTitle('');
      setNewGoalDescription('');
      setNewGoalTargetValue('');
      setNewGoalTargetUnit('');
      setNewGoalTargetDate('');
      setNewGoalMetricKey('');
      setNewGoalExerciseName('');
      setNewGoalStartValue('');
      await refreshTimelineAndGoals();
    } catch (err: any) {
      console.error('Failed to create goal:', err);
      alert(err?.message || '목표 생성에 실패했습니다.');
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleToggleGoalStatus = async (goal: MemberGoal) => {
    if (!member || !currentUser) return;
    if (currentUser.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      alert('본인 담당 회원의 목표만 수정할 수 있습니다.');
      return;
    }
    const nextStatus = goal.status === 'ACHIEVED' ? 'ACTIVE' : 'ACHIEVED';
    try {
      await updateGoal(member.centerId, goal.goalId, { status: nextStatus }, currentUser.role, currentUser.trainerId);
      await refreshTimelineAndGoals();
    } catch (err: any) {
      console.error('Failed to toggle goal status:', err);
      alert(err?.message || '목표 상태 변경에 실패했습니다.');
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!member || !currentUser) return;
    if (currentUser.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      alert('본인 담당 회원의 목표만 삭제할 수 있습니다.');
      return;
    }
    if (!await confirmDialog('이 목표를 삭제하시겠습니까?')) return;
    try {
      await deleteGoal(member.centerId, goalId, currentUser.role, currentUser.trainerId);
      await refreshTimelineAndGoals();
    } catch (err: any) {
      console.error('Failed to delete goal:', err);
      alert(err?.message || '목표 삭제에 실패했습니다.');
    }
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member || !currentUser) return;
    if (currentUser.role === 'TRAINER' && (!currentUser.trainerId || member.trainerId !== currentUser.trainerId)) {
      alert('본인 담당 회원의 이용권만 등록할 수 있습니다.');
      return;
    }
    if (!isValidDate(contractStartDate)) {
      alert('유효한 시작일을 입력해주세요 (YYYY-MM-DD).');
      return;
    }
    if (!isValidDate(contractEndDate)) {
      alert('유효한 만료일을 입력해주세요 (YYYY-MM-DD).');
      return;
    }
    if (contractEndDate < contractStartDate) {
      alert('만료일은 시작일보다 이전일 수 없습니다.');
      return;
    }
    try {
      setIsSavingContract(true);
      await createContract(
        {
          centerId: member.centerId,
          memberId: member.memberId,
          title: contractTitle,
          totalSessions: Number(contractTotalSessions) || 10,
          startDate: contractStartDate,
          expirationDate: contractEndDate,
          status: 'ACTIVE',
          trainerId: member.trainerId || currentUser.trainerId || 'trainer-default'
        },
        currentUser.role,
        currentUser.trainerId
      );
      setIsContractModalOpen(false);
      setContractNotes('');
      await refreshTimelineAndGoals();
    } catch (err: any) {
      console.error('Failed to create contract:', err);
      alert(err?.message || '이용권 등록에 실패했습니다.');
    } finally {
      setIsSavingContract(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-stone-400">
        <Clock className="w-6 h-6 animate-spin mb-2" />
        <p className="text-sm">회원 상세 정보를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          회원 목록으로 돌아가기
        </button>

        <EmptyState
          id="member-access-denied"
          icon={ShieldAlert}
          title="회원 정보에 접근할 수 없습니다"
          description={error || '접근 권한이 없거나 회원이 존재하지 않습니다.'}
          actionText="회원 목록으로 이동"
          onAction={onBack}
        />
      </div>
    );
  }

  return (
    <div id="member-detail-view" className="space-y-6">
      {/* Back button */}
      <div>
        <button
          id="back-to-member-list-btn"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>회원 목록으로 돌아가기</span>
        </button>
      </div>

      {/* Account Action Notification Banner */}
      {accountActionError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start justify-between gap-3 animate-in fade-in shadow-2xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-900">계정 작업 안내</p>
              <p className="mt-0.5 text-rose-700 leading-relaxed">{accountActionError}</p>
              {(accountActionError.includes('다른 트레이너') || accountActionError.includes('다른 회원') || accountActionError.includes('이메일')) && (
                <p className="mt-1 text-[11px] text-rose-600 font-medium">
                  * 동일한 이메일은 중복 등록될 수 없습니다. 아래 [회원 정보 수정] 버튼을 눌러 다른 고유한 이메일로 변경한 후 다시 발급을 시도해주세요.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(accountActionError.includes('다른 트레이너') || accountActionError.includes('다른 회원') || accountActionError.includes('이메일')) && (
              <button
                type="button"
                id="btn-resolve-email-conflict"
                onClick={() => {
                  setAccountActionError(null);
                  setIsEditMemberModalOpen(true);
                }}
                className="px-2.5 py-1 bg-white hover:bg-stone-50 text-rose-700 border border-rose-300 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs active:scale-95"
              >
                회원 정보 수정
              </button>
            )}
            <button
              type="button"
              onClick={() => setAccountActionError(null)}
              className="text-rose-400 hover:text-rose-700 p-1 cursor-pointer"
              title="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top Header Card */}
      <div
        id="member-detail-header-card"
        className="bg-white rounded-2xl border border-stone-200 shadow-xs p-4 sm:p-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
          {/* Member Name and Identity */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-stone-900 text-white font-bold text-lg sm:text-xl flex items-center justify-center shadow-xs shrink-0">
              {member.name.slice(0, 1)}
            </div>
            <div>
              <div className="flex items-center gap-2 sm:gap-3">
                <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
                  {member.name}
                </h1>
                <span className="text-xs text-stone-400 font-mono">
                  {member.memberId}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs text-stone-500">
                <span>
                  {member.gender === 'MALE' ? '남성' : member.gender === 'FEMALE' ? '여성' : '기타'}
                </span>
                <span>•</span>
                <span>생년월일: {member.birthDate}</span>
                <span>•</span>
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3 h-3" />
                  {member.phone}
                </span>
                {member.email && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-mono text-stone-600">
                      <Mail className="w-3 h-3" />
                      {member.email}
                    </span>
                  </>
                )}
                <span>•</span>
                {member.uid ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <KeyRound className="w-3 h-3 text-emerald-600" />
                    <span>계정 연동됨</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                    <span>로그인 계정 미연결</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* PT Contract Summary & Status */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 pt-3 sm:pt-4 lg:pt-0 border-t lg:border-t-0 border-stone-100">
            {/* Active Contract Remaining Sessions */}
            {sessionSummary.hasActiveContracts ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="flex-1 sm:flex-none px-3.5 sm:px-4 py-2.5 bg-stone-50 rounded-xl border border-stone-200 min-w-0 sm:min-w-[190px]">
                  <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
                    <span>PT 이용권 현황</span>
                    <span
                      className={
                        remainingSessions !== null && remainingSessions <= 5
                          ? 'text-rose-600 font-bold shrink-0'
                          : 'text-emerald-700 font-bold shrink-0'
                      }
                    >
                      잔여 {remainingSessions}회
                    </span>
                  </div>
                  <div className="text-xs font-bold text-stone-900 mb-1.5 flex items-center justify-between gap-1.5 min-w-0">
                    <span className="truncate">
                      {activeContract?.title || 'PT 정기 회원권'}
                    </span>
                    {sessionSummary.activeContractsCount > 1 && (
                      <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded shrink-0">
                        {sessionSummary.activeContractsCount}건 합산
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-stone-900 h-full rounded-full transition-all"
                      style={{
                        width: `${sessionSummary.completionRate}%`
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-stone-400 mt-1 gap-1">
                    <span>완료 {sessionSummary.activeUsedSessions}회</span>
                    <span>총 {sessionSummary.activeTotalSessions}회</span>
                  </div>
                </div>
                <button
                  type="button"
                  id="btn-register-additional-contract"
                  onClick={() => setIsContractModalOpen(true)}
                  title="이용권 추가"
                  className="p-2 bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-xl text-xs flex items-center justify-center transition-colors cursor-pointer shrink-0 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                id="btn-register-contract-header"
                onClick={() => setIsContractModalOpen(true)}
                className="w-full sm:w-auto justify-center px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                <span>PT 이용권 등록</span>
              </button>
            )}

            {/* Trainer */}
            <div className="flex-1 sm:flex-none px-3 py-2 bg-stone-50 rounded-xl border border-stone-200">
              <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block">
                담당 트레이너
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <UserCheck className="w-3.5 h-3.5 text-stone-700" />
                <span className="text-xs font-bold text-stone-900">
                  {assignedTrainer?.name || '미지정'}
                </span>
              </div>
            </div>

            {/* Current Status selector */}
            <div className="flex-1 sm:flex-none px-3 py-2 bg-stone-50 rounded-xl border border-stone-200">
              <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block">
                회원 상태
              </span>
              <div className="mt-0.5">
                <select
                  id="member-status-selector"
                  value={member.status}
                  onChange={(e) => handleStatusChange(e.target.value as MemberStatus)}
                  className={`w-full text-xs font-bold px-2 py-0.5 rounded cursor-pointer border ${
                    member.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : member.status === 'PAUSED'
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-stone-100 text-stone-800 border-stone-300'
                  }`}
                >
                  <option value="ACTIVE">활성 (ACTIVE)</option>
                  <option value="PAUSED">일시정지 (PAUSED)</option>
                  <option value="ENDED">종료 (ENDED)</option>
                </select>
              </div>
            </div>

            {currentUser?.role === 'CENTER_ADMIN' && <KakaoInvite key={member.memberId} memberId={member.memberId} />}
            {/* Actions: Member Edit & Mobile Portal Preview */}
            <div className="w-full sm:w-auto flex flex-wrap items-center gap-2">
              {/* Phase 10A: 파일럿 기간 임시 비활성화 (향후 전용 인증 백엔드 도입 시 재활성화) */}
              {IS_AUTO_PROVISIONING_ENABLED && member && currentUser?.role === 'CENTER_ADMIN' && (
                member.uid ? (
                  <button
                    type="button"
                    id="btn-member-reset-password"
                    onClick={handleResetPasswordLink}
                    disabled={isAccountActionLoading}
                    className="w-full sm:w-auto justify-center px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                  >
                    {isAccountActionLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5 text-stone-600" />
                    )}
                    <span>비밀번호 재설정 링크</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    id="btn-member-provision-account"
                    onClick={handleProvisionAccount}
                    disabled={isAccountActionLoading || !member.email}
                    title={!member.email ? '회원 정보 수정에서 이메일을 먼저 등록해주세요' : 'Firebase 로그인 계정 자동 발급'}
                    className={`w-full sm:w-auto justify-center px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 ${
                      member.email
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-stone-100 text-stone-400 border border-stone-200 cursor-not-allowed'
                    }`}
                  >
                    {isAccountActionLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5" />
                    )}
                    <span>로그인 계정 발급</span>
                  </button>
                )
              )}

              <button
                type="button"
                id="btn-edit-member-detail"
                onClick={() => setIsEditMemberModalOpen(true)}
                className="w-full sm:w-auto justify-center px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs active:scale-95"
              >
                <Edit2 className="w-3.5 h-3.5 text-stone-600" />
                <span>회원 정보 수정</span>
              </button>
              <button
                type="button"
                id="btn-preview-member-portal"
                onClick={() => setIsMemberPortalPreviewOpen(true)}
                className="w-full sm:w-auto justify-center px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs active:scale-95"
              >
                <Smartphone className="w-4 h-4 text-purple-600" />
                <span>회원 모바일 화면 미리보기</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-stone-200 bg-white rounded-t-xl px-2 sm:px-4 pt-2 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth pb-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`member-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2.5 sm:py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-stone-900 text-stone-900'
                    : 'border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-stone-900' : 'text-stone-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-b-xl border border-stone-200 border-t-0 p-4 sm:p-6 shadow-xs min-h-[400px]">
        {/* TAB 1: 개요 (Overview) */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* STEP 9: Recent Progress Section (최근 변화) */}
            <div className="p-5 rounded-2xl border border-stone-200/90 bg-stone-50/50 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-teal-600" />
                    신체 및 운동 최근 변화 요약
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    기록된 실제 데이터를 기반으로 산출된 시작점 대비 현재 진행 상태입니다.
                  </p>
                </div>
                <button
                  id="btn-goto-body-changes"
                  type="button"
                  onClick={() => setActiveTab('body-changes')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-900 bg-white hover:bg-stone-100 rounded-xl border border-stone-300 shadow-xs transition shrink-0"
                >
                  <span>전체 변화 보기</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {measurements.length === 0 ? (
                <div className="py-6 text-center bg-white rounded-xl border border-dashed border-stone-200 text-xs text-stone-500">
                  <p className="font-medium text-stone-700">측정 기록 없음</p>
                  <p className="text-stone-400 mt-0.5">
                    아직 등록된 신체 측정 기록이 없습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('body-changes')}
                    className="mt-2.5 px-3 py-1 bg-stone-900 text-white rounded-lg text-xs"
                  >
                    신체변화 탭에서 측정 기록하기
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Weight */}
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200/80 shadow-xs">
                    <span className="text-[11px] text-stone-500 font-medium block">체중</span>
                    {overviewWeightComp.hasData ? (
                      <div className="mt-1">
                        <div className="flex items-baseline justify-between">
                          <span className="font-mono text-base font-bold text-stone-900">
                            {overviewWeightComp.currentValue} kg
                          </span>
                          {overviewWeightComp.count > 1 && (
                            <span className="text-xs font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                              {overviewWeightComp.deltaFormatted} kg
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-stone-400 mt-1 font-mono">
                          시작: {overviewWeightComp.startValue} kg
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-stone-400 mt-1 block">기록 없음</span>
                    )}
                  </div>

                  {/* Muscle Mass */}
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200/80 shadow-xs">
                    <span className="text-[11px] text-stone-500 font-medium block">골격근량</span>
                    {overviewMuscleComp.hasData ? (
                      <div className="mt-1">
                        <div className="flex items-baseline justify-between">
                          <span className="font-mono text-base font-bold text-stone-900">
                            {overviewMuscleComp.currentValue} kg
                          </span>
                          {overviewMuscleComp.count > 1 && (
                            <span className="text-xs font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                              {overviewMuscleComp.deltaFormatted} kg
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-stone-400 mt-1 font-mono">
                          시작: {overviewMuscleComp.startValue} kg
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-stone-400 mt-1 block">기록 없음</span>
                    )}
                  </div>

                  {/* Body Fat % */}
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200/80 shadow-xs">
                    <span className="text-[11px] text-stone-500 font-medium block">체지방률</span>
                    {overviewFatComp.hasData ? (
                      <div className="mt-1">
                        <div className="flex items-baseline justify-between">
                          <span className="font-mono text-base font-bold text-stone-900">
                            {overviewFatComp.currentValue} %
                          </span>
                          {overviewFatComp.count > 1 && (
                            <span className="text-xs font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                              {overviewFatComp.deltaFormatted} %p
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-stone-400 mt-1 font-mono">
                          시작: {overviewFatComp.startValue} %
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-stone-400 mt-1 block">기록 없음</span>
                    )}
                  </div>

                  {/* Key Exercise Performance Highlight */}
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200/80 shadow-xs">
                    <span className="text-[11px] text-stone-500 font-medium block">
                      주요 운동 ({overviewExSummary.availableExercises[0] || '운동 일지'})
                    </span>
                    {overviewExSummary.availableExercises.length > 0 ? (
                      (() => {
                        const topExName = overviewExSummary.availableExercises[0];
                        const exData = calculateExerciseProgress(sessions, topExName).summary;
                        return (
                          <div className="mt-1">
                            <div className="flex items-baseline justify-between">
                              <span className="font-mono text-base font-bold text-stone-900">
                                {exData?.overallMaxWeight} kg
                              </span>
                              {exData?.weightDelta !== undefined && exData.sessionRecords.length > 1 && (
                                <span className="text-xs font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                                  {exData.weightDeltaFormatted} kg
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-stone-400 mt-1">
                              최고 {exData?.overallMaxReps}회 / 누적 {exData?.overallTotalVolume.toLocaleString()}kg
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <span className="text-xs text-stone-400 mt-1 block">운동 기록 없음</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Phase 9D Requirement 6: 회원별 PT 이용권 및 재등록 히스토리 */}
            <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                      PT 이용권 및 재등록 히스토리
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                        총 {sortedContracts.length}건
                      </span>
                    </h3>
                  </div>
                </div>
                <span className="text-xs text-stone-500 font-mono">
                  누적 등록 <strong>{sortedContracts.reduce((acc, c) => acc + c.totalSessions, 0)}회</strong>
                </span>
              </div>

              {sortedContracts.length === 0 ? (
                <div className="py-4 text-center text-xs text-stone-400">
                  등록된 이용권 이력이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Sequence Flow (최초 PT 20회 → 1차 재등록 30회 → 2차 재등록 20회) */}
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-stone-50/80 rounded-xl border border-stone-200 text-xs">
                    {sortedContracts.map((c, idx) => {
                      const stageLabel =
                        idx === 0 ? `최초 PT ${c.totalSessions}회` : `${idx}차 재등록 ${c.totalSessions}회`;
                      const isLatest = idx === sortedContracts.length - 1;
                      const isActive = c.status === 'ACTIVE';

                      return (
                        <React.Fragment key={`seq-${c.contractId}`}>
                          <div
                            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 ${
                              isActive
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs'
                                : 'bg-white text-stone-700 border border-stone-200'
                            }`}
                          >
                            <span>{stageLabel}</span>
                            {isActive && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            )}
                          </div>
                          {!isLatest && (
                            <span className="text-stone-400 font-bold">→</span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Detailed Contract Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {sortedContracts.map((c, idx) => {
                      const stageName = idx === 0 ? '최초 등록' : `${idx}차 재등록`;
                      const remaining = c.totalSessions - c.usedSessions;
                      const isZero = remaining <= 0;

                      return (
                        <div
                          key={`card-${c.contractId}`}
                          className={`p-3 rounded-xl border transition-all ${
                            c.status === 'ACTIVE'
                              ? 'bg-emerald-50/20 border-emerald-200'
                              : 'bg-stone-50/50 border-stone-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-bold text-stone-900 truncate flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-stone-200/80 text-stone-800 text-[10px] font-bold shrink-0">
                                {stageName}
                              </span>
                              <span className="truncate">{c.title}</span>
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border shrink-0 ${
                                c.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-stone-100 text-stone-500 border-stone-200'
                              }`}
                            >
                              {c.status === 'ACTIVE'
                                ? '이용중'
                                : c.status === 'COMPLETED'
                                ? '완료'
                                : c.status}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-stone-500">
                            <span>
                              완료 {c.usedSessions}회 / 총 {c.totalSessions}회
                            </span>
                            <span
                              className={`font-semibold ${
                                isZero ? 'text-stone-400' : 'text-amber-700'
                              }`}
                            >
                              {remaining}회 잔여
                            </span>
                          </div>

                          <div className="text-[10px] text-stone-400 font-mono pt-1 border-t border-stone-100 mt-1 flex justify-between">
                            <span>시작: {c.startDate}</span>
                            <span>만료: {c.expirationDate}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Goals and activity timeline are hidden in the simplified layout (data kept). */}
            {SHOW_LEGACY_SECTIONS && (<>
            {/* 1. Member Goals Section (Phase 2 Goal Management) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <Target className="w-4 h-4 text-stone-800" />
                    회원 목표 관리 ({goals.length}개)
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    체성분, 운동 수행능력, 운동 습관 등 정량/정성 목표를 수립하고 달성 과정을 추적합니다.
                  </p>
                </div>
                <button
                  id="btn-add-goal"
                  onClick={() => setIsGoalModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  새 목표 등록
                </button>
              </div>

              {goals.length === 0 ? (
                <div className="p-6 bg-stone-50 rounded-xl border border-stone-200 text-center">
                  <Target className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-stone-700">등록된 목표가 없습니다.</p>
                  <p className="text-[11px] text-stone-500 mb-3">
                    회원과 상담 후 체지방 감량, 중량 증진, 습관 형성 등의 목표를 등록해보세요.
                  </p>
                  <button
                    onClick={() => setIsGoalModalOpen(true)}
                    className="px-3 py-1.5 text-xs bg-stone-900 text-white rounded-lg hover:bg-stone-800"
                  >
                    목표 등록하기
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {goals.map((g) => {
                    const cat = GOAL_CATEGORY_MAP[g.category] || GOAL_CATEGORY_MAP.OTHER;
                    const isAchieved = g.status === 'ACHIEVED';
                    const prog = calculateGoalProgress(g, measurements, sessions);

                    return (
                      <div
                        key={g.goalId}
                        className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                          isAchieved
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : 'bg-white border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${cat.color}`}
                            >
                              {cat.label}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleToggleGoalStatus(g)}
                                className={`text-xs px-2 py-0.5 rounded font-medium border flex items-center gap-1 cursor-pointer transition-colors ${
                                  isAchieved
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 border-stone-300'
                                }`}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                {isAchieved ? '달성 완료' : '달성 완료하기'}
                              </button>
                              <button
                                onClick={() => handleDeleteGoal(g.goalId)}
                                className="text-stone-300 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                                title="삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <h4
                            className={`text-xs font-bold break-words ${
                              isAchieved ? 'text-stone-600 line-through' : 'text-stone-900'
                            }`}
                          >
                            {g.title}
                          </h4>

                          {g.description && (
                            <p className="text-[11px] text-stone-500 mt-1 break-words leading-relaxed">{g.description}</p>
                          )}

                          {/* Auto progress bar if quantitative measurement / session data is connected */}
                          {prog.canCalculate && (
                            <div className="mt-3 p-2.5 bg-stone-50/80 rounded-lg border border-stone-200/60 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] font-medium">
                                <span className="text-stone-600">진척률</span>
                                <span className="font-mono font-bold text-stone-900">{prog.progressPercent}%</span>
                              </div>
                              <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isAchieved || prog.progressPercent >= 100
                                      ? 'bg-emerald-500'
                                      : 'bg-stone-800'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(0, prog.progressPercent))}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-stone-500 font-mono">
                                <span>시작: {prog.startValue}{prog.unit}</span>
                                <span className="font-semibold text-stone-700">현재: {prog.currentValue}{prog.unit}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between text-[11px] text-stone-500 mt-3 pt-2 border-t border-stone-100 gap-2 min-w-0">
                          <span className="truncate">
                            목표치:{' '}
                            <strong className="text-stone-800">
                              {g.targetValue ? `${g.targetValue}${g.targetUnit || ''}` : '정성적 목표'}
                            </strong>
                          </span>
                          {g.targetDate && <span className="shrink-0 font-mono text-[10px]">기한: {g.targetDate}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Factual Activity Timeline (STEP 8) */}
            <div className="space-y-4 pt-6 border-t border-stone-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <History className="w-4 h-4 text-stone-800" />
                    PT 활동 히스토리 타임라인
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    최초 상담, 목표 등록/달성, 이용권 등록, 수업 완료 내역을 시간순으로 확인합니다.
                  </p>
                </div>
                <span className="text-xs text-stone-400 font-mono">
                  총 {timelineEvents.length}개 이벤트
                </span>
              </div>

              {timelineEvents.length === 0 ? (
                <div className="p-6 bg-stone-50 rounded-xl border border-stone-200 text-center text-xs text-stone-500">
                  기록된 활동 내역이 없습니다.
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
                  {timelineEvents.map((ev) => (
                    <div key={ev.id} className="relative group">
                      {/* Timeline Dot */}
                      <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-stone-900 ring-4 ring-white" />

                      <div className="bg-stone-50 hover:bg-stone-100/80 p-3.5 rounded-xl border border-stone-200 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-700">
                              {ev.badgeText || ev.type}
                            </span>
                            <h5 className="text-xs font-bold text-stone-900">{ev.title}</h5>
                          </div>
                          <span className="text-[11px] text-stone-400 font-mono">
                            {ev.date} {ev.time ? `(${ev.time})` : ''}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600">{ev.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            </>)}
            {/* 3. Basic Profile Details & Trainer Notes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t border-stone-200">
              {/* Left: Detailed Info */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                  회원 상세 메타데이터
                </h4>

                <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 divide-y divide-stone-200/70 text-xs">
                  <div className="py-2 flex justify-between">
                    <span className="text-stone-500">회원 식별 번호 (memberId)</span>
                    <span className="font-mono text-stone-900 font-medium">{member.memberId}</span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-stone-500">소속 센터 (centerId)</span>
                    <span className="font-mono text-stone-900 font-medium">{member.centerId}</span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-stone-500">성별</span>
                    <span className="text-stone-900 font-medium">
                      {member.gender === 'MALE' ? '남성' : member.gender === 'FEMALE' ? '여성' : '기타'}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-stone-500">생년월일</span>
                    <span className="text-stone-900 font-medium">{member.birthDate}</span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-stone-500">연락처</span>
                    <span className="font-mono text-stone-900 font-medium">{member.phone}</span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-stone-500">PT 등록 시작일</span>
                    <span className="text-stone-900 font-medium">{member.startDate}</span>
                  </div>
                </div>

                {/* Trainer card */}
                {assignedTrainer && (
                  <div className="p-4 bg-stone-50 rounded-xl border border-stone-200">
                    <h5 className="text-xs font-bold text-stone-900 mb-2 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-stone-700" />
                      담당 트레이너 프로필
                    </h5>
                    <div className="text-xs text-stone-600 space-y-1">
                      <p><strong>이름:</strong> {assignedTrainer.name}</p>
                      <p><strong>전문 분야:</strong> {assignedTrainer.specialty}</p>
                      <p><strong>연락처:</strong> {assignedTrainer.phone}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Goals & Trainer Notes */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                    트레이너 관리 노트
                  </h4>
                  {saveSuccess && (
                    <span className="text-emerald-700 text-xs font-medium flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> 저장 완료
                    </span>
                  )}
                </div>

                <div className="bg-stone-50 rounded-xl p-4 border border-stone-200">
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    회원의 일상 피드백, 일정 조율 사항, 특이사항을 기록하세요.
                  </label>
                  <textarea
                    id="member-detail-notes-textarea"
                    rows={6}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="예: 라운드숄더 개선, 체지방 5% 감량 목표. 좌측 무릎 통증 이력으로 스쿼트 시 무릎 각도 주의 필요."
                    className="w-full p-3 bg-white border border-stone-200 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900 resize-none leading-relaxed"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      id="save-member-notes-btn"
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                      className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingNotes ? '저장 중...' : '메모 저장'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: 최초 상담 (Consultation - Fully implemented in Phase 2) */}
        {activeTab === 'consultation' && (
          <ConsultationTab
            member={member}
            trainerName={assignedTrainer?.name}
            onConsultationSaved={refreshTimelineAndGoals}
          />
        )}

        {/* TAB 3: PT 수업 일지 (PtSessions - Fully implemented in Phase 2) */}
        {activeTab === 'pt-sessions' && (
          <SessionJournalTab
            member={member}
            sessions={sessions}
            contracts={contracts}
            trainerName={assignedTrainer?.name}
            onSessionUpdated={refreshJournal}
          />
        )}

        {activeTab === 'plan' && (
          <MemberPlanEditor
            memberId={member.memberId}
            canEdit={currentUser?.role === 'CENTER_ADMIN' || (currentUser?.role === 'TRAINER' && !!currentUser.trainerId && member.trainerId === currentUser.trainerId)}
            weightKg={[...measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)).find((m) => m.weightKg)?.weightKg}
          />
        )}

        {/* TAB 4: 신체변화 (Body Changes - Phase 3) */}
        {activeTab === 'body-changes' && (
          <BodyChangesTab
            member={member}
            measurements={measurements}
            goals={goals}
            sessions={sessions}
            userRole={currentUser?.role || 'MEMBER'}
            currentTrainerId={currentUser?.trainerId}
            onRefresh={refreshTimelineAndGoals}
          />
        )}

        {/* TAB 5: 사진 (Photos - Phase 4) */}
        {activeTab === 'photos' && (
          <PhotosTab
            member={member}
            userRole={currentUser?.role || 'MEMBER'}
            currentTrainerId={currentUser?.trainerId}
            onRefreshMember={fetchMember}
          />
        )}

        {/* TAB 8: 성과리포트 (Performance Report / Progress Review - Phase 4) */}
        {activeTab === 'performance-report' && (
          <PerformanceReportTab
            member={member}
            userRole={currentUser?.role || 'MEMBER'}
            currentTrainerId={currentUser?.trainerId}
            onRefresh={refreshTimelineAndGoals}
            onNavigateToGoal={() => setActiveTab('overview')}
          />
        )}

        {/* TAB 9: 개인운동 (Solo Workout / Plan & Logs - Phase 5) */}
        {activeTab === 'solo-workout' && (
          <SoloWorkoutTab
            member={member}
            onUpdated={refreshTimelineAndGoals}
          />
        )}
      </div>

      {/* CREATE GOAL MODAL */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-sm font-bold text-stone-900">새 운동 목표 등록</h3>
              <button
                onClick={() => setIsGoalModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  목표 카테고리
                </label>
                <select
                  value={newGoalCategory}
                  onChange={(e) => setNewGoalCategory(e.target.value as GoalCategory)}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800 bg-white"
                >
                  <option value="BODY_COMPOSITION">체성분 / 인바디 (체지방, 골격근량)</option>
                  <option value="PERFORMANCE">운동 수행능력 (중량, 횟수, 런닝)</option>
                  <option value="HABIT">운동 습관 형성 (출석 일수, 규칙성)</option>
                  <option value="REHAB_POSTURE">자세 교정 / 재활 (통증 개선, 가동범위)</option>
                  <option value="OTHER">기타 개인 목표</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  목표 제목
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 체지방률 25% 달성, Squat 70kg 리프팅"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  목표 상세 설명 (선택)
                </label>
                <textarea
                  rows={2}
                  placeholder="구체적인 실천 방안이나 세부 기준"
                  value={newGoalDescription}
                  onChange={(e) => setNewGoalDescription(e.target.value)}
                  className="w-full p-2.5 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    목표 수치 (정량치)
                  </label>
                  <input
                    type="text"
                    placeholder="예: 25, 70, 3"
                    value={newGoalTargetValue}
                    onChange={(e) => setNewGoalTargetValue(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    단위
                  </label>
                  <input
                    type="text"
                    placeholder="예: %, kg, 회/주"
                    value={newGoalTargetUnit}
                    onChange={(e) => setNewGoalTargetUnit(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>
              </div>

              {/* Metric & Exercise Auto-Progress Connection */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                <span className="text-[11px] font-semibold text-stone-700 block">
                  자동 진척률 계산 연동 (선택)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-stone-500 mb-0.5">신체 지표 연동</label>
                    <select
                      value={newGoalMetricKey}
                      onChange={(e) => setNewGoalMetricKey(e.target.value as GoalMetricKey | '')}
                      className="w-full p-1.5 text-xs bg-white border border-stone-200 rounded-lg"
                    >
                      <option value="">연동 안 함</option>
                      <option value="weightKg">체중 (kg)</option>
                      <option value="skeletalMuscleMassKg">골격근량 (kg)</option>
                      <option value="bodyFatPercentage">체지방률 (%)</option>
                      <option value="bodyFatMassKg">체지방량 (kg)</option>
                      <option value="waistCm">허리둘레 (cm)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-500 mb-0.5">운동 종목 연동</label>
                    <input
                      type="text"
                      placeholder="예: 스쿼트"
                      value={newGoalExerciseName}
                      onChange={(e) => setNewGoalExerciseName(e.target.value)}
                      className="w-full p-1.5 text-xs bg-white border border-stone-200 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-stone-500 mb-0.5">시작 기준값 (시작 수치)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="예: 75.5 (비워두면 첫 측정값/운동 기록 자동 적용)"
                    value={newGoalStartValue}
                    onChange={(e) => setNewGoalStartValue(e.target.value)}
                    className="w-full p-1.5 text-xs bg-white border border-stone-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="goal-target-date-input" className="block text-xs font-semibold text-stone-700 mb-1">
                  목표 달성 기한
                </label>
                <DateInputField
                  id="goal-target-date-input"
                  value={newGoalTargetDate}
                  onChange={setNewGoalTargetDate}
                  className="!text-xs !py-2"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsGoalModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg bg-white"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSavingGoal}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSavingGoal ? '등록 중...' : '목표 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE CONTRACT MODAL */}
      {isContractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-sm font-bold text-stone-900">PT 이용권 등록</h3>
              <button
                onClick={() => setIsContractModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                  이용권 명칭 *
                </label>
                <input
                  type="text"
                  required
                  value={contractTitle}
                  onChange={(e) => setContractTitle(e.target.value)}
                  placeholder="예: PT 10회 정규 코칭 패키지"
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    총 수업 횟수 (회) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    required
                    value={contractTotalSessions}
                    onChange={(e) => setContractTotalSessions(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    담당 트레이너
                  </label>
                  <input
                    type="text"
                    disabled
                    value={assignedTrainer?.name || '담당 트레이너 자동 배정'}
                    className="w-full px-3 py-2 text-xs border border-stone-200 bg-stone-50 rounded-lg text-stone-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="contract-start-date" className="block text-[11px] font-semibold text-stone-600 mb-1">
                    시작일 *
                  </label>
                  <DateInputField
                    id="contract-start-date"
                    value={contractStartDate}
                    onChange={setContractStartDate}
                    placeholder="YYYY-MM-DD"
                    required
                    className="text-xs"
                    aria-label="PT 이용권 시작일"
                  />
                </div>
                <div>
                  <label htmlFor="contract-end-date" className="block text-[11px] font-semibold text-stone-600 mb-1">
                    만료일 *
                  </label>
                  <DateInputField
                    id="contract-end-date"
                    value={contractEndDate}
                    onChange={setContractEndDate}
                    placeholder="YYYY-MM-DD"
                    required
                    className="text-xs"
                    aria-label="PT 이용권 만료일"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                  메모 / 특약사항 (선택)
                </label>
                <input
                  type="text"
                  value={contractNotes}
                  onChange={(e) => setContractNotes(e.target.value)}
                  placeholder="예: 주 2회 수/토 진행, 1회 연기 가능"
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsContractModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg bg-white"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSavingContract}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSavingContract ? '등록 중...' : '이용권 등록 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Portal Mobile Simulator Modal */}
      {isMemberPortalPreviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs"
          onClick={() => setIsMemberPortalPreviewOpen(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border-4 border-stone-800"
            onClick={(e) => e.stopPropagation()}
            id="member-portal-preview-modal"
          >
            {/* Top Device Header */}
            <div className="bg-stone-900 text-white px-4 py-2.5 flex items-center justify-between text-xs font-semibold shrink-0">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-purple-400" />
                <span>회원 모바일 포털 미리보기 ({member.name} 회원)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMemberPortalPreviewOpen(false)}
                className="p-1 hover:bg-stone-800 rounded text-stone-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Simulated Phone Content */}
            <div className="flex-1 overflow-y-auto bg-stone-100">
              <MemberPortal memberIdOverride={member.memberId} />
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {isEditMemberModalOpen && member && (
        <NewMemberModal
          isOpen={isEditMemberModalOpen}
          member={member}
          onClose={() => setIsEditMemberModalOpen(false)}
          onSuccess={() => {
            fetchMember();
            setIsEditMemberModalOpen(false);
          }}
        />
      )}

      {/* Phase 10A: Password Link Modal */}
      {passwordModalState.isOpen && (
        <PasswordLinkModal
          isOpen={passwordModalState.isOpen}
          onClose={() =>
            setPasswordModalState((prev) => ({ ...prev, isOpen: false }))
          }
          targetName={passwordModalState.targetName}
          targetEmail={passwordModalState.targetEmail}
          targetType="MEMBER"
          resetLink={passwordModalState.resetLink}
          isNewlyProvisioned={passwordModalState.isNewlyProvisioned}
        />
      )}
    </div>
  );
};
