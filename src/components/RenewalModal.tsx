import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateRenewal, deleteRenewal } from '../services/dataService';
import type { Renewal, RenewalStatus, RenewalDeclineReason } from '../types';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import {
  X,
  Edit3,
  Calendar,
  AlertCircle,
  Loader2,
  Trash2,
  CheckCircle2,
  Check,
  XCircle,
  FileCheck,
  Eye,
  Lock
} from 'lucide-react';

export const RENEWAL_STATUS_CONFIG: Record<
  RenewalStatus,
  { label: string; bg: string; text: string; border: string; desc: string }
> = {
  TARGET: {
    label: '대상',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    desc: '재등록 대상 후보 발굴'
  },
  CONTACTED: {
    label: '상담예정',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    desc: '상담일정 조율 및 접촉'
  },
  CONSULTING: {
    label: '상담중',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    desc: '재등록 상담 진행중'
  },
  RENEWED: {
    label: '재등록완료',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    desc: '신규 PT 계약 등록 완료'
  },
  DECLINED: {
    label: '재등록거절',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    desc: '재등록 고사'
  },
  CLOSED: {
    label: '종료',
    bg: 'bg-stone-100',
    text: 'text-stone-600',
    border: 'border-stone-200',
    desc: '상담 종료'
  }
};

export const DECLINE_REASON_LABELS: Record<RenewalDeclineReason, { short: string; label: string }> = {
  PRICE: { short: '가격', label: '가격 부담' },
  TIME: { short: '시간', label: '시간/스케줄 불일치' },
  DISTANCE: { short: '거리', label: '거리/위치 문제' },
  TRAINER: { short: '트레이너', label: '트레이너 관련/변경 희망' },
  STOP_EXERCISE: { short: '운동중단', label: '개인 사정/운동 중단' },
  OTHER_CENTER: { short: '타센터', label: '타 피트니스/센터 이동' },
  OTHER: { short: '기타', label: '기타 사유' }
};

interface RenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onOpenContractModal?: (renewal: Renewal) => void;
  onViewContract?: (contractId: string, memberId: string) => void;
  renewal: Renewal | null;
  memberName?: string;
  trainerName?: string;
  contractTitle?: string;
}

export const RenewalModal: React.FC<RenewalModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onOpenContractModal,
  onViewContract,
  renewal,
  memberName = '회원',
  trainerName = '트레이너',
  contractTitle = 'PT 이용권'
}) => {
  const { currentUser } = useAuth();
  const currentCenterId = currentUser?.centerId || renewal?.centerId || 'center-main';
  const isCenterAdmin = currentUser?.role === 'CENTER_ADMIN';

  // Form states
  const [status, setStatus] = useState<RenewalStatus>('TARGET');
  const [consultationDate, setConsultationDate] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [declineReason, setDeclineReason] = useState<RenewalDeclineReason | ''>('');
  const [declineMemo, setDeclineMemo] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (renewal && isOpen) {
      setStatus(renewal.status);
      setConsultationDate(renewal.consultationDate || '');
      setMemo(renewal.memo || '');
      setDeclineReason(renewal.declineReason || '');
      setDeclineMemo(renewal.declineMemo || '');
      setError(null);
    }
  }, [renewal, isOpen]);

  if (!isOpen || !renewal) return null;

  const isAlreadyRenewed = renewal.status === 'RENEWED' || !!renewal.renewedContractId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setError(null);

    // Phase 9C: RENEWED는 신규 계약 생성을 통해서만 정상 처리
    // 기존에 RENEWED가 아닌데 일반 사용자가 RENEWED를 임의 선택하는 것을 방어 (CENTER_ADMIN 데이터 복구 예외 제외)
    if (status === 'RENEWED' && !isAlreadyRenewed && !isCenterAdmin) {
      setError('재등록 완료 처리는 [재등록 계약 등록] 버튼을 통해 신규 PT 계약을 등록해야 완료됩니다.');
      return;
    }

    // Validation: DECLINED requires declineReason
    if (status === 'DECLINED' && !declineReason) {
      setError('재등록 거절 시 거절 사유를 반드시 선택해주세요.');
      return;
    }

    if (consultationDate.trim() && !isValidDate(consultationDate.trim())) {
      setError('유효한 상담일/예정일을 입력해주세요 (YYYY-MM-DD).');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateRenewal(
        currentCenterId,
        renewal.renewalId,
        {
          status,
          consultationDate: consultationDate.trim() ? consultationDate.trim() : null,
          memo: memo.trim() ? memo.trim() : null,
          declineReason: status === 'DECLINED' ? (declineReason as RenewalDeclineReason) : null,
          declineMemo: status === 'DECLINED' ? (declineMemo.trim() || null) : null,
          renewedAt: status === 'RENEWED' ? (renewal.renewedAt || new Date().toISOString()) : null
        },
        currentUser.role,
        currentUser.trainerId
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[RenewalModal update error]', err);
      setError(err?.message || '재등록 정보 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isCenterAdmin) return;
    if (!window.confirm('정말 이 재등록 상담 기록을 삭제하시겠습니까?')) return;

    setIsDeleting(true);
    setError(null);
    try {
      await deleteRenewal(
        currentCenterId,
        renewal.renewalId,
        currentUser?.role
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[RenewalModal delete error]', err);
      setError(err?.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-stone-200 transition-all animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="renewal-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-stone-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center shadow-xs">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="renewal-modal-title" className="text-base font-bold text-stone-900">
                재등록 상담 상세 및 수정
              </h2>
              <p className="text-xs text-stone-500">
                회원의 재등록 상담 상태와 결과를 기록합니다
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Member & Contract summary banner */}
        <div className="bg-stone-100/70 px-5 py-3 border-b border-stone-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div>
            <span className="text-stone-400 block text-[10px] font-semibold">회원명</span>
            <span className="font-bold text-stone-900 truncate block">{memberName}</span>
          </div>
          <div>
            <span className="text-stone-400 block text-[10px] font-semibold">담당 트레이너</span>
            <span className="font-medium text-stone-800 truncate block">{trainerName}</span>
          </div>
          <div>
            <span className="text-stone-400 block text-[10px] font-semibold">이용권</span>
            <span className="font-medium text-stone-800 truncate block">{contractTitle}</span>
          </div>
          <div>
            <span className="text-stone-400 block text-[10px] font-semibold">시작 당시 잔여</span>
            <span className="font-bold text-amber-700 block">
              {renewal.remainingSessionsAtStart}회 잔여
            </span>
          </div>
        </div>

        {/* Phase 9C: Top Action Card (재등록 계약 등록 OR 계약 보기) */}
        <div className="px-5 py-3.5 bg-stone-50 border-b border-stone-200">
          {isAlreadyRenewed ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-emerald-950 block">
                    재등록 계약 체결 완료
                  </span>
                  <span className="text-[11px] text-emerald-700">
                    신규 PT 계약이 정상적으로 생성되어 연동되었습니다.
                  </span>
                </div>
              </div>

              {onViewContract && renewal.renewedContractId && (
                <button
                  type="button"
                  id="btn-view-renewed-contract"
                  onClick={() => {
                    onViewContract(renewal.renewedContractId!, renewal.memberId);
                    onClose();
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs transition-colors shadow-2xs cursor-pointer self-start sm:self-auto shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>계약 보기</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
              <div>
                <span className="text-xs font-bold text-stone-900 block flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                  재등록 상담이 성사되었나요?
                </span>
                <span className="text-[11px] text-stone-600">
                  신규 PT 계약을 등록하면 상담이 &apos;재등록완료&apos;로 즉시 완료 처리됩니다.
                </span>
              </div>

              {onOpenContractModal && (
                <button
                  type="button"
                  id="btn-open-renewal-contract"
                  onClick={() => {
                    onOpenContractModal(renewal);
                    onClose();
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer self-start sm:self-auto shrink-0"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>재등록 계약 등록</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. 상태 선택 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-stone-800">
                상담 진행 상태 <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-stone-400">
                (재등록완료는 신규 계약 등록 시 자동 연동)
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {(
                [
                  'TARGET',
                  'CONTACTED',
                  'CONSULTING',
                  'RENEWED',
                  'DECLINED',
                  'CLOSED'
                ] as RenewalStatus[]
              ).map((st) => {
                const cfg = RENEWAL_STATUS_CONFIG[st];
                const isSelected = status === st;
                // RENEWED button is disabled for direct click if contract not created yet, unless admin recovering data
                const isDirectRenewedBlocked =
                  st === 'RENEWED' && !isAlreadyRenewed && !isCenterAdmin;

                return (
                  <button
                    key={st}
                    type="button"
                    disabled={isDirectRenewedBlocked}
                    onClick={() => {
                      if (isDirectRenewedBlocked) return;
                      setStatus(st);
                      if (st !== 'DECLINED') {
                        setDeclineReason('');
                        setDeclineMemo('');
                      }
                    }}
                    title={
                      isDirectRenewedBlocked
                        ? '상단의 [재등록 계약 등록]을 통해 신규 계약 생성 후 자동 전환됩니다.'
                        : cfg.desc
                    }
                    className={`py-2 px-1 rounded-lg text-center font-semibold transition-all border cursor-pointer relative ${
                      isSelected
                        ? `${cfg.bg} ${cfg.text} ${cfg.border} ring-2 ring-stone-900/10 shadow-xs font-bold`
                        : isDirectRenewedBlocked
                        ? 'bg-stone-50 text-stone-300 border-stone-200 cursor-not-allowed'
                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    {isDirectRenewedBlocked && (
                      <Lock className="w-2.5 h-2.5 text-stone-400 absolute top-1 right-1" />
                    )}
                    <div className="truncate">{cfg.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notice when RENEWED is selected directly by Admin */}
          {status === 'RENEWED' && !isAlreadyRenewed && isCenterAdmin && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-900">
                  관리자 수동 상태 변경 안내
                </p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  신규 PT 계약 등록 없이 상태만 변경합니다. 일반적으로는 상단의 <strong>[재등록 계약 등록]</strong> 버튼을 통해 신규 이용권을 생성하여 완료하는 것을 권장합니다.
                </p>
              </div>
            </div>
          )}

          {/* Notice & fields when DECLINED is selected */}
          {status === 'DECLINED' && (
            <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 space-y-3">
              <div className="flex items-center gap-1.5 text-rose-800 font-bold">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>재등록 거절 사유 입력</span>
                <span className="text-rose-500 font-bold">*</span>
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">
                  거절 사유 선택 <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(
                    [
                      'PRICE',
                      'TIME',
                      'DISTANCE',
                      'TRAINER',
                      'STOP_EXERCISE',
                      'OTHER_CENTER',
                      'OTHER'
                    ] as RenewalDeclineReason[]
                  ).map((key) => {
                    const info = DECLINE_REASON_LABELS[key];
                    const isSelected = declineReason === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDeclineReason(key)}
                        className={`p-2 rounded-lg text-left text-xs font-medium border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        <div className="font-semibold">{info.short}</div>
                        <div className={`text-[10px] truncate ${isSelected ? 'text-rose-100' : 'text-stone-400'}`}>
                          {info.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">
                  거절 상세 메모 (선택)
                </label>
                <input
                  type="text"
                  value={declineMemo}
                  onChange={(e) => setDeclineMemo(e.target.value)}
                  placeholder="예: 타 지역으로 이사 예정, 이직으로 인한 시간 변동 등"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
            </div>
          )}

          {/* 2. 상담일 */}
          <div>
            <label htmlFor="renewal-consultation-date" className="block font-semibold text-stone-800 mb-1">
              상담일 / 예정일 (선택)
            </label>
            <DateInputField
              id="renewal-consultation-date"
              value={consultationDate}
              onChange={setConsultationDate}
              className="!bg-white"
            />
            <p className="text-[11px] text-stone-500 mt-1">
              재등록 상담을 진행했거나 진행할 날짜를 입력합니다.
            </p>
          </div>

          {/* 3. 메모 */}
          <div>
            <label className="block font-semibold text-stone-800 mb-1">
              상담 메모 (선택)
            </label>
            <textarea
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="회원의 운동 목표, 추가 세션 희망 여부, 할인 프로모션 안내 등 상담 내용을 기록해주세요."
              className="w-full p-3 rounded-lg bg-white border border-stone-300 text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 resize-none"
            />
          </div>

          {/* Timestamps */}
          <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
            <span>상담 시작일: {renewal.startedAt ? renewal.startedAt.split('T')[0] : renewal.createdAt.split('T')[0]}</span>
            <span>최근 수정: {renewal.updatedAt ? renewal.updatedAt.split('T')[0] : '-'}</span>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-between gap-2">
            <div>
              {isCenterAdmin && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting || isSubmitting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-300 text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors disabled:opacity-50 cursor-pointer font-medium"
                >
                  {isDeleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>삭제</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting || isDeleting}
                className="px-4 py-2 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 font-medium transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isDeleting}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-semibold transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>저장 중...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>저장하기</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
