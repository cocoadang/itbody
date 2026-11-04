import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  createLead,
  updateLead,
  deleteLead,
  convertLeadToRegistration
} from '../services/dataService';
import type { Lead, Trainer, LeadStatus, LeadSource, LeadLostReason } from '../types';
import { NewMemberModal } from './NewMemberModal';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import { sanitizePhoneNumber, isValidPhoneNumber, PHONE_ERROR_MESSAGE } from '../utils/phoneUtils';
import {
  X,
  UserPlus,
  Edit2,
  AlertCircle,
  Loader2,
  Trash2,
  Calendar,
  Phone,
  User,
  CheckCircle2,
  HelpCircle,
  FileText,
  Clock,
  ArrowRight,
  Check,
  UserCheck,
  UserX,
  CalendarCheck,
  ChevronRight,
  Sparkles,
  Info,
  ExternalLink
} from 'lucide-react';
import { localToday } from '../utils/dateInputUtils';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lead?: Lead | null;
  trainers: Trainer[];
  onNavigateToMember?: (memberId: string) => void;
}

const ALL_STATUS_OPTIONS: { value: LeadStatus; label: string; desc: string }[] = [
  { value: 'NEW', label: '신규', desc: '문의 접수' },
  { value: 'CONSULTING', label: '상담중', desc: '상담 진행' },
  { value: 'OT_SCHEDULED', label: 'OT예정', desc: 'OT 일정 조율됨' },
  { value: 'OT_COMPLETED', label: 'OT완료', desc: 'OT 수업 완료' },
  { value: 'REGISTERED', label: '등록', desc: 'PT 정식 등록' },
  { value: 'LOST', label: '미등록', desc: '등록 취소/보류' }
];

const SOURCE_OPTIONS: LeadSource[] = ['방문', '전화', '소개', '온라인', '기타'];

const LOST_REASON_OPTIONS: { value: LeadLostReason; label: string }[] = [
  { value: '가격', label: '가격 부담' },
  { value: '시간', label: '시간/스케줄 불일치' },
  { value: '거리', label: '거리/위치 문제' },
  { value: '운동중단', label: '개인 사정/운동 중단' },
  { value: '타센터', label: '타 센터 등록' },
  { value: '기타', label: '기타 사유' }
];

// Workflow step definition for the progress bar
export type StepState = 'COMPLETED' | 'CURRENT' | 'SKIPPED' | 'PENDING' | 'LOST';

export interface WorkflowStep {
  key: string;
  label: string;
  desc: string;
  state: StepState;
}

export const LeadModal: React.FC<LeadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  lead,
  trainers,
  onNavigateToMember
}) => {
  const { currentUser } = useAuth();
  const isEditMode = Boolean(lead);
  const isCenterAdmin = currentUser?.role === 'CENTER_ADMIN';
  const isTrainer = currentUser?.role === 'TRAINER';

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [inquiryDate, setInquiryDate] = useState(() => localToday());
  const [source, setSource] = useState<LeadSource>('방문');
  const [status, setStatus] = useState<LeadStatus>('NEW');
  const [assignedTrainerId, setAssignedTrainerId] = useState<string>('');
  const [otDate, setOtDate] = useState<string>('');
  const [otCompletedAt, setOtCompletedAt] = useState<string>('');
  const [memo, setMemo] = useState('');
  const [lostReason, setLostReason] = useState<LeadLostReason>('가격');
  const [lostMemo, setLostMemo] = useState('');

  // OT Flow quick action inputs
  const [assignOtTrainerId, setAssignOtTrainerId] = useState('');
  const [assignOtDate, setAssignOtDate] = useState(() => localToday());
  const [lostReasonInput, setLostReasonInput] = useState<LeadLostReason>('가격');
  const [lostMemoInput, setLostMemoInput] = useState('');
  const [showLostForm, setShowLostForm] = useState(false);
  const [showManualStatusChange, setShowManualStatusChange] = useState(false);

  // Phase 8D: Member conversion modal state
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActionProcessing, setIsActionProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset form fields
  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setShowLostForm(false);
    setShowManualStatusChange(false);
    setIsMemberModalOpen(false);

    if (lead) {
      setName(lead.name || '');
      setPhone(sanitizePhoneNumber(lead.phone || ''));
      setInquiryDate(lead.inquiryDate || localToday());
      setSource((lead.source as LeadSource) || '방문');
      setStatus(lead.status || 'NEW');
      setAssignedTrainerId(lead.assignedTrainerId || '');
      setOtDate(lead.otDate || '');
      setOtCompletedAt(lead.otCompletedAt || '');
      setMemo(lead.memo || '');
      setLostReason((lead.lostReason as LeadLostReason) || '가격');
      setLostMemo(lead.lostMemo || '');

      setAssignOtTrainerId(lead.assignedTrainerId || '');
      setAssignOtDate(lead.otDate || localToday());
      setLostReasonInput((lead.lostReason as LeadLostReason) || '가격');
      setLostMemoInput(lead.lostMemo || '');
    } else {
      setName('');
      setPhone('');
      setInquiryDate(localToday());
      setSource('방문');
      setStatus('NEW');
      setAssignedTrainerId('');
      setOtDate('');
      setOtCompletedAt('');
      setMemo('');
      setLostReason('가격');
      setLostMemo('');

      setAssignOtTrainerId('');
      setAssignOtDate(localToday());
      setLostReasonInput('가격');
      setLostMemoInput('');
    }
  }, [isOpen, lead]);

  if (!isOpen) return null;

  // Calculate workflow progress steps according to rigorous state transition model
  // 신규 → 상담 → OT예정 → OT완료 → 등록/미등록
  const hasOtDate = Boolean(lead?.otDate || assignOtDate);
  const hasOtCompleted = Boolean(lead?.otCompletedAt || status === 'OT_COMPLETED');
  const hasRegistered = status === 'REGISTERED' || Boolean(lead?.convertedMemberId);
  const isLost = status === 'LOST';

  const determineConsultingState = (): StepState => {
    if (status === 'CONSULTING') return 'CURRENT';
    if (status === 'NEW') return 'PENDING';
    if (['OT_SCHEDULED', 'OT_COMPLETED', 'REGISTERED'].includes(status) || hasOtDate || hasOtCompleted || Boolean(memo || lead?.memo)) {
      return 'COMPLETED';
    }
    if (isLost) {
      return (Boolean(memo || lead?.memo) || hasOtDate || hasOtCompleted) ? 'COMPLETED' : 'SKIPPED';
    }
    return 'PENDING';
  };

  const determineOtScheduledState = (): StepState => {
    if (status === 'OT_SCHEDULED') return 'CURRENT';
    if (hasOtCompleted || status === 'OT_COMPLETED') return 'COMPLETED';
    if (hasRegistered) {
      return hasOtDate ? 'COMPLETED' : 'SKIPPED';
    }
    if (isLost) {
      return (hasOtDate || hasOtCompleted) ? 'COMPLETED' : 'SKIPPED';
    }
    if (status === 'NEW' || status === 'CONSULTING') return 'PENDING';
    return hasOtDate ? 'COMPLETED' : 'SKIPPED';
  };

  const determineOtCompletedState = (): StepState => {
    if (status === 'OT_COMPLETED') return 'CURRENT';
    if (hasOtCompleted) return 'COMPLETED';
    if (hasRegistered) {
      return hasOtCompleted ? 'COMPLETED' : 'SKIPPED';
    }
    if (isLost) {
      return hasOtCompleted ? 'COMPLETED' : 'SKIPPED';
    }
    if (['NEW', 'CONSULTING', 'OT_SCHEDULED'].includes(status)) return 'PENDING';
    return 'PENDING';
  };

  const determineResultState = (): StepState => {
    if (status === 'REGISTERED') return 'COMPLETED';
    if (isLost) return 'LOST';
    return 'PENDING';
  };

  const steps: WorkflowStep[] = [
    {
      key: 'NEW',
      label: '신규문의',
      desc: '접수',
      state: status === 'NEW' ? 'CURRENT' : 'COMPLETED'
    },
    {
      key: 'CONSULTING',
      label: '상담',
      desc: '진행',
      state: determineConsultingState()
    },
    {
      key: 'OT_SCHEDULED',
      label: 'OT예정',
      desc: '일정배정',
      state: determineOtScheduledState()
    },
    {
      key: 'OT_COMPLETED',
      label: 'OT완료',
      desc: '수업완료',
      state: determineOtCompletedState()
    },
    {
      key: 'RESULT',
      label: isLost ? '미등록' : status === 'REGISTERED' ? '정식등록' : '등록/미등록',
      desc: isLost ? '종료' : status === 'REGISTERED' ? '전환성공' : '최종결정',
      state: determineResultState()
    }
  ];

  // ==========================================
  // OT Workflow Actions
  // ==========================================

  // 1. OT 배정 처리 (CENTER_ADMIN만 가능)
  const handleAssignOt = async () => {
    if (!lead || !currentUser || !isCenterAdmin) return;
    if (!assignOtTrainerId) {
      setError('OT를 배정할 담당 트레이너를 선택해주세요.');
      return;
    }
    if (!assignOtDate || !isValidDate(assignOtDate)) {
      setError('유효한 OT 예정일을 입력해주세요 (YYYY-MM-DD).');
      return;
    }

    try {
      setIsActionProcessing(true);
      setError(null);

      const trainerObj = trainers.find((t) => t.trainerId === assignOtTrainerId);
      const trainerName = trainerObj ? trainerObj.name : null;

      await updateLead(
        currentUser.centerId,
        lead.leadId,
        {
          status: 'OT_SCHEDULED',
          assignedTrainerId: assignOtTrainerId,
          assignedTrainerName: trainerName,
          otDate: assignOtDate
        },
        currentUser.role,
        currentUser.trainerId
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[handleAssignOt error]', err);
      setError(err?.message || 'OT 배정 중 오류가 발생했습니다.');
    } finally {
      setIsActionProcessing(false);
    }
  };

  // 2. OT 완료 처리 (CENTER_ADMIN 또는 배정된 TRAINER)
  const handleCompleteOt = async () => {
    if (!lead || !currentUser) return;
    if (!isCenterAdmin && isTrainer && lead.assignedTrainerId !== currentUser.trainerId) {
      setError('본인에게 배정된 OT만 완료 처리할 수 있습니다.');
      return;
    }

    try {
      setIsActionProcessing(true);
      setError(null);

      const now = new Date().toISOString();
      await updateLead(
        currentUser.centerId,
        lead.leadId,
        {
          status: 'OT_COMPLETED',
          otCompletedAt: now
        },
        currentUser.role,
        currentUser.trainerId
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[handleCompleteOt error]', err);
      setError(err?.message || 'OT 완료 처리 중 오류가 발생했습니다.');
    } finally {
      setIsActionProcessing(false);
    }
  };

  // 3. Phase 8D: PT 정식 등록 클릭 시 (회원등록 모달 오픈)
  const handleOpenMemberModal = () => {
    if (!lead) return;

    // Check duplicate conversion safeguard
    if (lead.convertedMemberId || lead.status === 'REGISTERED') {
      setError('이미 정식 회원으로 등록 전환된 문의입니다.');
      return;
    }

    // Role check: CENTER_ADMIN or assigned TRAINER (trainers have create member permission in current rules)
    if (!isCenterAdmin && isTrainer && lead.assignedTrainerId !== currentUser?.trainerId) {
      setError('본인에게 배정된 문의만 회원 등록 전환을 진행할 수 있습니다.');
      return;
    }

    setError(null);
    setIsMemberModalOpen(true);
  };

  // 3-1. Phase 8D: NewMemberModal 저장 성공 시 Lead 업데이트 (REGISTERED)
  const handleMemberCreatedSuccess = async (createdMemberId: string) => {
    if (!lead || !currentUser) return;

    try {
      setIsActionProcessing(true);
      setError(null);

      const now = new Date().toISOString();
      await convertLeadToRegistration(
        currentUser.centerId,
        lead.leadId,
        {
          convertedMemberId: createdMemberId,
          registeredAt: now
        },
        currentUser.role,
        currentUser.trainerId
      );

      setIsMemberModalOpen(false);
      onSuccess();
      onClose();
      if (onNavigateToMember && createdMemberId) {
        onNavigateToMember(createdMemberId);
      }
    } catch (err: any) {
      console.error('[handleMemberCreatedSuccess error]', err);
      setError(err?.message || '회원은 생성되었으나 문의 상태를 갱신하지 못했습니다.');
    } finally {
      setIsActionProcessing(false);
    }
  };

  // 4. 미등록 처리 (CENTER_ADMIN 또는 배정된 TRAINER)
  const handleMarkLost = async () => {
    if (!lead || !currentUser) return;
    if (!isCenterAdmin && isTrainer && lead.assignedTrainerId !== currentUser.trainerId) {
      setError('본인에게 배정된 문의만 미등록 처리할 수 있습니다.');
      return;
    }

    if (!lostReasonInput) {
      setError('미등록 사유를 선택해주세요.');
      return;
    }

    try {
      setIsActionProcessing(true);
      setError(null);

      await updateLead(
        currentUser.centerId,
        lead.leadId,
        {
          status: 'LOST',
          lostReason: lostReasonInput,
          lostMemo: lostMemoInput.trim() || null
        },
        currentUser.role,
        currentUser.trainerId
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[handleMarkLost error]', err);
      setError(err?.message || '미등록 처리 중 오류가 발생했습니다.');
    } finally {
      setIsActionProcessing(false);
    }
  };

  // 5. 일반 폼 저장 (신규 등록 및 전체/기본 정보 저장)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    // Validation
    if (!name.trim()) {
      setError('문의자 이름을 입력해주세요.');
      return;
    }
    if (!phone.trim()) {
      setError('연락처를 입력해주세요.');
      return;
    }
    if (!isValidPhoneNumber(phone, true)) {
      setError(PHONE_ERROR_MESSAGE);
      return;
    }
    if (!inquiryDate || !isValidDate(inquiryDate)) {
      setError('유효한 문의일을 입력해주세요 (YYYY-MM-DD).');
      return;
    }
    if (otDate && !isValidDate(otDate)) {
      setError('유효한 OT 예정일을 입력해주세요 (YYYY-MM-DD).');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const assignedTrainerObj = trainers.find((t) => t.trainerId === assignedTrainerId);
      const assignedTrainerName = assignedTrainerObj ? assignedTrainerObj.name : null;

      if (!isEditMode) {
        // Create Mode (CENTER_ADMIN only)
        if (!isCenterAdmin) {
          throw new Error('신규문의 등록은 센터 관리자만 가능합니다.');
        }

        await createLead(
          {
            centerId: currentUser.centerId,
            name: name.trim(),
            phone: phone.trim(),
            inquiryDate,
            source,
            status: 'NEW',
            assignedTrainerId: assignedTrainerId || null,
            assignedTrainerName,
            memo: memo.trim() || undefined
          },
          currentUser.role
        );
      } else if (lead) {
        // Edit Mode
        const updatePayload: Partial<Omit<Lead, 'leadId' | 'centerId' | 'createdAt'>> = {
          status,
          memo: memo.trim(),
          otDate: (status === 'OT_SCHEDULED' || status === 'OT_COMPLETED' || otDate) ? (otDate || null) : null,
          otCompletedAt: (status === 'OT_COMPLETED' || otCompletedAt) ? (otCompletedAt || null) : null,
          lostReason: status === 'LOST' ? (lostReason || null) : null,
          lostMemo: status === 'LOST' ? (lostMemo.trim() || null) : null
        };

        // If Center Admin, they can also update name, phone, date, source, and assigned trainer
        if (isCenterAdmin) {
          updatePayload.name = name.trim();
          updatePayload.phone = phone.trim();
          updatePayload.inquiryDate = inquiryDate;
          updatePayload.source = source;
          updatePayload.assignedTrainerId = assignedTrainerId || null;
          updatePayload.assignedTrainerName = assignedTrainerName;
        }

        await updateLead(
          currentUser.centerId,
          lead.leadId,
          updatePayload,
          currentUser.role,
          currentUser.trainerId
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[LeadModal submit error]', err);
      setError(err?.message || '처리 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!lead || !currentUser || !isCenterAdmin) return;
    if (!window.confirm(`'${lead.name}' 님의 신규문의 데이터를 완전히 삭제하시겠습니까?`)) {
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);
      await deleteLead(currentUser.centerId, lead.leadId, currentUser.role);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[LeadModal delete error]', err);
      setError(err?.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div
        id="lead-modal-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 backdrop-blur-xs p-4 overflow-y-auto"
      >
        <div
          id="lead-modal-content"
          className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-stone-200 relative my-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-800">
                {isEditMode ? <Edit2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-900 leading-tight">
                  {isEditMode ? `${lead?.name} 님 신규문의 상세 및 OT 관리` : '신규문의 등록'}
                </h2>
                <p className="text-xs text-stone-500">
                  {isEditMode
                    ? '신규문의 접수 → OT 배정 → OT 완료 → PT 등록/미등록 전환 흐름을 관리합니다.'
                    : '새로운 문의 고객의 기본 정보 및 유입 경로를 등록합니다.'}
                </p>
              </div>
            </div>
            <button
              id="close-lead-modal-btn"
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Error Notification */}
          {error && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Workflow Progress Indicator (Edit Mode) */}
          {isEditMode && (
            <div className="mt-4 p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-stone-700 uppercase tracking-wider">
                  현재 진행 단계
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-800">
                  {ALL_STATUS_OPTIONS.find((s) => s.value === status)?.label || status}
                </span>
              </div>

              {/* Stepper Bar */}
              <div className="grid grid-cols-5 gap-1 pt-1">
                {steps.map((st, idx) => {
                  const state = st.state;

                  let circleClasses = 'bg-stone-100 text-stone-400 border border-stone-200';
                  let labelClasses = 'text-stone-400';
                  let descDisplay = st.desc;
                  let iconNode: React.ReactNode = idx + 1;

                  if (state === 'COMPLETED') {
                    circleClasses = 'bg-emerald-600 text-white shadow-xs';
                    labelClasses = 'text-emerald-700 font-semibold';
                    iconNode = <Check className="w-3 h-3 stroke-[3]" />;
                  } else if (state === 'CURRENT') {
                    circleClasses = 'bg-blue-600 text-white ring-2 ring-blue-600/25 shadow-xs font-bold';
                    labelClasses = 'text-blue-950 font-bold';
                    iconNode = idx + 1;
                  } else if (state === 'SKIPPED') {
                    circleClasses = 'bg-stone-200 text-stone-600';
                    labelClasses = 'text-stone-500 font-medium';
                    descDisplay = '건너뜀';
                    iconNode = '-';
                  } else if (state === 'LOST') {
                    circleClasses = 'bg-rose-600 text-white shadow-xs';
                    labelClasses = 'text-rose-700 font-bold';
                    descDisplay = '미등록';
                    iconNode = <X className="w-3 h-3 stroke-[3]" />;
                  }

                  return (
                    <div key={st.key} className="flex flex-col items-center text-center">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${circleClasses}`}
                      >
                        {iconNode}
                      </div>
                      <span
                        className={`mt-1 text-[11px] font-medium leading-tight ${labelClasses}`}
                      >
                        {st.label}
                      </span>
                      <span className={`text-[9px] hidden sm:block ${state === 'SKIPPED' ? 'text-stone-500 bg-stone-100 px-1 rounded' : state === 'LOST' ? 'text-rose-600 font-medium' : 'text-stone-400'}`}>
                        {descDisplay}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Flow Panels (Based on Current Step) */}
          {isEditMode && lead && (
            <div className="mt-4 space-y-3">
              {/* Step A: NEW or CONSULTING -> OT 배정 액션 (CENTER_ADMIN만 가능) */}
              {(status === 'NEW' || status === 'CONSULTING') && (
                <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                        <CalendarCheck className="w-4 h-4 text-indigo-600" />
                        다음 추천 액션: OT 배정
                      </h3>
                      <p className="text-[11px] text-indigo-800 mt-0.5">
                        담당 트레이너와 OT 일시를 지정하여 무료/체험 OT 수업을 확정합니다.
                      </p>
                    </div>
                    {isCenterAdmin && status === 'NEW' && (
                      <button
                        type="button"
                        onClick={() => setStatus('CONSULTING')}
                        className="text-[11px] px-2 py-1 bg-white hover:bg-stone-50 border border-indigo-200 text-indigo-800 rounded-md font-medium cursor-pointer"
                      >
                        상담 진행으로 변경
                      </button>
                    )}
                  </div>

                  {isCenterAdmin ? (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-indigo-950 mb-1">
                            담당 트레이너 <span className="text-rose-500">*</span>
                          </label>
                          <select
                            id="action-ot-trainer-select"
                            value={assignOtTrainerId}
                            onChange={(e) => setAssignOtTrainerId(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-indigo-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          >
                            <option value="">트레이너 선택</option>
                            {trainers.map((t) => (
                              <option key={t.trainerId} value={t.trainerId}>
                                {t.name} 트레이너 ({t.specialty || '전문'})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="action-ot-date-input" className="block text-[11px] font-semibold text-indigo-950 mb-1">
                            OT 예정일 <span className="text-rose-500">*</span>
                          </label>
                          <DateInputField
                            id="action-ot-date-input"
                            value={assignOtDate}
                            onChange={setAssignOtDate}
                            className="!px-2.5 !py-1.5 !text-xs !bg-white border-indigo-300"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          id="btn-assign-ot"
                          onClick={handleAssignOt}
                          disabled={isActionProcessing || !assignOtTrainerId || !assignOtDate}
                          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isActionProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CalendarCheck className="w-3.5 h-3.5" />
                          )}
                          <span>OT 배정 완료</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-indigo-700">
                      * 신규 문의의 OT 배정 및 트레이너 지정은 센터 관리자만 진행할 수 있습니다.
                    </p>
                  )}
                </div>
              )}

              {/* Step B: OT_SCHEDULED -> OT 완료 액션 */}
              {status === 'OT_SCHEDULED' && (
                <div className="p-4 bg-teal-50/80 border border-teal-200 rounded-xl space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-teal-600" />
                        다음 추천 액션: OT 완료
                      </h3>
                      <p className="text-[11px] text-teal-800 mt-0.5">
                        예정된 OT 수업({lead.otDate || '일정 미지정'})을 정상적으로 진행 완료했으면 `OT 완료`를 눌러주세요.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-teal-200/60">
                    <div className="text-xs text-teal-900">
                      <span className="font-semibold">담당:</span>{' '}
                      {lead.assignedTrainerName || (lead.assignedTrainerId ? trainers.find(t => t.trainerId === lead.assignedTrainerId)?.name : '배정됨')} 트레이너
                      {lead.otDate && <span className="ml-2 font-semibold">예정일: {lead.otDate}</span>}
                    </div>

                    <button
                      type="button"
                      id="btn-complete-ot"
                      onClick={handleCompleteOt}
                      disabled={isActionProcessing}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isActionProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>OT 완료 처리</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Step C: OT_COMPLETED -> OT 결과 액션 (PT 등록 vs 미등록) */}
              {status === 'OT_COMPLETED' && (
                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      OT 완료 후 최종 결과 처리
                    </h3>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      체험 수업 이후 정식 PT 회원으로 등록되었는지, 혹은 미등록 사유가 있는지 기록합니다.
                      {lead.otCompletedAt && (
                        <span className="ml-1 text-stone-500 font-mono">
                          (완료일시: {new Date(lead.otCompletedAt).toLocaleString('ko-KR')})
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Two main result actions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {/* Phase 8D: PT 등록 클릭 시 기존 회원등록 모달 오픈 (중복 방지 방어) */}
                    <button
                      type="button"
                      id="btn-register-pt-result"
                      onClick={handleOpenMemberModal}
                      disabled={isActionProcessing || Boolean(lead.convertedMemberId)}
                      className="flex items-center justify-center gap-2 p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isActionProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserCheck className="w-4 h-4" />
                      )}
                      <span>PT 정식 등록 (회원 등록 화면으로 이동)</span>
                    </button>

                    <button
                      type="button"
                      id="btn-mark-lost-toggle"
                      onClick={() => setShowLostForm(!showLostForm)}
                      className="flex items-center justify-center gap-2 p-3 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      <UserX className="w-4 h-4 text-stone-600" />
                      <span>미등록 (사유 입력)</span>
                    </button>
                  </div>

                  {/* Sub-form: Lost Reason & Memo */}
                  {showLostForm && (
                    <div className="mt-3 p-3 bg-white border border-amber-300 rounded-xl space-y-2.5">
                      <div>
                        <label className="block text-xs font-bold text-stone-800 mb-1">
                          미등록 사유 <span className="text-rose-500">*</span>
                        </label>
                        <select
                          id="action-lost-reason-select"
                          value={lostReasonInput}
                          onChange={(e) => setLostReasonInput(e.target.value as LeadLostReason)}
                          className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                        >
                          {LOST_REASON_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          상세 사유 및 피드백 (선택)
                        </label>
                        <input
                          id="action-lost-memo-input"
                          type="text"
                          value={lostMemoInput}
                          onChange={(e) => setLostMemoInput(e.target.value)}
                          placeholder="예: 타 헬스장 1년권 결제 완료, 3개월 후 재연락 희망"
                          className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowLostForm(false)}
                          className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 rounded-lg"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          id="btn-confirm-lost"
                          onClick={handleMarkLost}
                          disabled={isActionProcessing}
                          className="px-4 py-1.5 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          미등록 처리 완료
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step D: REGISTERED Status banner & Member Navigation (Requirement 4) */}
              {status === 'REGISTERED' && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-emerald-950">
                        <p className="font-bold">PT 정식 등록 전환이 완료된 회원입니다</p>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          {lead.registeredAt
                            ? `등록일시: ${new Date(lead.registeredAt).toLocaleString('ko-KR')}`
                            : '정식 회원으로 전환 완료'}
                          {lead.convertedMemberId && (
                            <span className="ml-2 font-mono text-[10px] text-emerald-800 font-semibold">
                              (연결회원 ID: {lead.convertedMemberId})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Phase 8D: 회원 보기 버튼 */}
                    {lead.convertedMemberId && onNavigateToMember && (
                      <button
                        type="button"
                        id="btn-view-converted-member"
                        onClick={() => {
                          onClose();
                          onNavigateToMember(lead.convertedMemberId!);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>회원 보기</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Step E: LOST Status banner */}
              {status === 'LOST' && (
                <div className="p-3.5 bg-stone-100 border border-stone-300 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-800">
                      미등록 종결 ({lead.lostReason || lostReason || '사유 미지정'})
                    </span>
                    <span className="text-[10px] text-stone-500">
                      업데이트: {new Date(lead.updatedAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  {(lead.lostMemo || lostMemo) && (
                    <p className="text-xs text-stone-600">
                      {lead.lostMemo || lostMemo}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* General Form */}
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Admin Manual Status Override toggle (Data recovery safeguard) */}
            {isEditMode && isCenterAdmin && (
              <div className="pt-2 border-t border-stone-100">
                <button
                  type="button"
                  id="toggle-manual-status-btn"
                  onClick={() => setShowManualStatusChange(!showManualStatusChange)}
                  className="text-[11px] text-stone-500 hover:text-stone-800 flex items-center gap-1 font-medium cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>관리자 전용: 상태 수동 강제 변경 {showManualStatusChange ? '접기 ▲' : '열기 ▼'}</span>
                </button>

                {showManualStatusChange && (
                  <div className="mt-2 p-2 bg-stone-100 rounded-lg space-y-1">
                    <p className="text-[10px] text-stone-500 mb-1">
                      * 데이터 복구 또는 예외 상황 시에만 사용하세요. (정상적인 OT 완료 및 결과 액션은 상단 버튼 권장)
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                      {ALL_STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setStatus(opt.value)}
                          className={`py-1 px-1 rounded text-[11px] font-semibold transition-all cursor-pointer text-center ${
                            status === opt.value
                              ? 'bg-white text-stone-900 shadow-xs ring-1 ring-stone-900/10'
                              : 'text-stone-500 hover:text-stone-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Customer Name & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  문의자 이름 <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
                  <input
                    id="lead-name-input"
                    type="text"
                    required
                    disabled={isEditMode && !isCenterAdmin}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예: 홍길동"
                    className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent disabled:opacity-75 disabled:bg-stone-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  연락처 <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
                  <input
                    id="lead-phone-input"
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    required
                    disabled={isEditMode && !isCenterAdmin}
                    value={phone}
                    onChange={(e) => setPhone(sanitizePhoneNumber(e.target.value))}
                    placeholder="01012345678"
                    className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent disabled:opacity-75 disabled:bg-stone-100"
                  />
                </div>
              </div>
            </div>

            {/* Inquiry Date & Source */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="lead-inquiry-date-input" className="block text-xs font-semibold text-stone-700 mb-1">
                  문의일 <span className="text-rose-500">*</span>
                </label>
                <DateInputField
                  id="lead-inquiry-date-input"
                  required
                  disabled={isEditMode && !isCenterAdmin}
                  value={inquiryDate}
                  onChange={setInquiryDate}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  유입경로 <span className="text-rose-500">*</span>
                </label>
                <select
                  id="lead-source-select"
                  disabled={isEditMode && !isCenterAdmin}
                  value={source}
                  onChange={(e) => setSource(e.target.value as LeadSource)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent disabled:opacity-75 disabled:bg-stone-100 cursor-pointer"
                >
                  {SOURCE_OPTIONS.map((src) => (
                    <option key={src} value={src}>
                      {src}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Assigned Trainer */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                담당 트레이너
                {isTrainer && <span className="ml-1 text-[11px] font-normal text-stone-500">(트레이너는 변경 불가)</span>}
              </label>
              <select
                id="lead-trainer-select"
                disabled={!isCenterAdmin}
                value={assignedTrainerId}
                onChange={(e) => setAssignedTrainerId(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent disabled:opacity-75 disabled:bg-stone-100 cursor-pointer"
              >
                <option value="">미지정 (배정 대기)</option>
                {trainers.map((t) => (
                  <option key={t.trainerId} value={t.trainerId}>
                    {t.name} 트레이너 ({t.specialty || '전문'})
                  </option>
                ))}
              </select>
            </div>

            {/* OT Date (Visible if assigned or scheduled) */}
            {(status === 'OT_SCHEDULED' || status === 'OT_COMPLETED' || otDate) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="lead-ot-date-input" className="block text-xs font-semibold text-stone-700 mb-1">
                    OT 예정일
                  </label>
                  <DateInputField
                    id="lead-ot-date-input"
                    value={otDate || ''}
                    onChange={setOtDate}
                    disabled={!isCenterAdmin && status !== 'OT_SCHEDULED'}
                  />
                </div>

                {otCompletedAt && (
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      OT 완료 시각 (otCompletedAt)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={new Date(otCompletedAt).toLocaleString('ko-KR')}
                      className="w-full px-3 py-2 bg-stone-100 border border-stone-200 rounded-lg text-xs text-stone-600 font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Memo / Notes */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                상담 및 관리 메모
              </label>
              <textarea
                id="lead-memo-input"
                rows={3}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 바디프로필 목표, 무릎 수술 이력 있음, 퇴근 후 저녁 7시 수업 선호"
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent resize-none"
              />
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-stone-100">
              {/* Delete button (CENTER_ADMIN only, edit mode only) */}
              {isEditMode && isCenterAdmin ? (
                <button
                  id="delete-lead-btn"
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting || isSubmitting || isActionProcessing}
                  className="inline-flex items-center gap-1 px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>삭제</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  id="cancel-lead-modal-btn"
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting || isDeleting || isActionProcessing}
                  className="px-4 py-2 border border-stone-300 text-stone-700 rounded-lg text-xs font-semibold hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  닫기
                </button>
                <button
                  id="submit-lead-modal-btn"
                  type="submit"
                  disabled={isSubmitting || isDeleting || isActionProcessing}
                  className="flex items-center gap-1.5 px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{isEditMode ? '저장 중...' : '등록 중...'}</span>
                    </>
                  ) : (
                    <span>{isEditMode ? '기본정보 저장' : '신규문의 등록'}</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Phase 8D: Reused NewMemberModal for Lead to Member conversion */}
      {isMemberModalOpen && lead && (
        <NewMemberModal
          isOpen={isMemberModalOpen}
          initialLeadData={{
            leadId: lead.leadId,
            name: lead.name,
            phone: lead.phone,
            trainerId: lead.assignedTrainerId || undefined,
            notes: lead.memo
          }}
          onClose={() => setIsMemberModalOpen(false)}
          onSuccess={handleMemberCreatedSuccess}
        />
      )}
    </>
  );
};
