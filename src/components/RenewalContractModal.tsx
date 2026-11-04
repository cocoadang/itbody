import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { completeRenewalWithContract, getContractById } from '../services/dataService';
import type { Renewal, PtContract } from '../types';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import {
  X,
  Dumbbell,
  Calendar,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Sparkles,
  FileCheck
} from 'lucide-react';
import { localToday } from '../utils/dateInputUtils';

interface RenewalContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newContract: PtContract) => void;
  renewal: Renewal | null;
  memberName?: string;
  trainerName?: string;
  initialContractTitle?: string;
}

export const RenewalContractModal: React.FC<RenewalContractModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  renewal,
  memberName = '회원',
  trainerName = '트레이너',
  initialContractTitle = '정규 1:1 PT'
}) => {
  const { currentUser } = useAuth();
  const currentCenterId = currentUser?.centerId || renewal?.centerId || 'center-main';

  // Form states
  const [title, setTitle] = useState('');
  const [totalSessions, setTotalSessions] = useState<number>(20);
  const [startDate, setStartDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize with sensible defaults based on existing contract
  useEffect(() => {
    if (isOpen && renewal) {
      setError(null);
      const today = localToday();
      setStartDate(today);

      // Default expiration date: 3 months from today
      const exp = new Date();
      exp.setMonth(exp.getMonth() + 3);
      setExpirationDate(exp.toISOString().split('T')[0]);

      // Check existing contract to prefill title and session counts
      getContractById(currentCenterId, renewal.contractId, currentUser?.role, currentUser?.trainerId)
        .then((existingContract) => {
          if (existingContract) {
            setTitle(
              existingContract.title.includes('재등록')
                ? existingContract.title
                : `${existingContract.title} [재등록]`
            );
            setTotalSessions(existingContract.totalSessions || 20);
          } else {
            setTitle(
              initialContractTitle.includes('재등록')
                ? initialContractTitle
                : `${initialContractTitle} [재등록]`
            );
            setTotalSessions(20);
          }
        })
        .catch(() => {
          setTitle(`${initialContractTitle} [재등록]`);
          setTotalSessions(20);
        });
    }
  }, [isOpen, renewal, currentCenterId, currentUser?.role, currentUser?.trainerId, initialContractTitle]);

  if (!isOpen || !renewal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setError(null);

    // 중복 방지 방어
    if (renewal.renewedContractId) {
      setError('이미 재등록 신규 계약이 등록된 상담입니다.');
      return;
    }

    if (!title.trim()) {
      setError('이용권 명칭을 입력해주세요.');
      return;
    }
    if (!totalSessions || totalSessions <= 0) {
      setError('PT 횟수는 1회 이상이어야 합니다.');
      return;
    }
    if (!startDate || !isValidDate(startDate)) {
      setError('유효한 시작일을 입력해주세요 (YYYY-MM-DD).');
      return;
    }
    if (!expirationDate || !isValidDate(expirationDate)) {
      setError('유효한 만료일을 입력해주세요 (YYYY-MM-DD).');
      return;
    }
    if (expirationDate < startDate) {
      setError('만료일은 시작일보다 이전일 수 없습니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. 신규 PT 계약 생성 성공 → 2. Renewal 상태 RENEWED 업데이트
      const result = await completeRenewalWithContract(
        currentCenterId,
        renewal.renewalId,
        {
          title: title.trim(),
          totalSessions: Number(totalSessions),
          startDate,
          expirationDate,
          notes: notes.trim() || undefined
        },
        currentUser.role,
        currentUser.trainerId
      );

      onSuccess(result.newContract);
      onClose();
    } catch (err: any) {
      console.error('[RenewalContractModal submit error]', err);
      // 계약 생성 실패 시 Renewal 상태 유지 (RENEWED 처리 금지)
      setError(err?.message || '신규 PT 계약 등록 중 오류가 발생했습니다. 기존 상담 상태가 유지됩니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-stone-200 transition-all animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="renewal-contract-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-stone-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 id="renewal-contract-modal-title" className="text-base font-bold text-stone-900">
                재등록 신규 PT 계약 등록
              </h2>
              <p className="text-xs text-stone-500">
                신규 계약이 등록되면 상담 상태가 &apos;재등록완료&apos;로 자동 연동됩니다.
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

        {/* Member & Trainer Info */}
        <div className="bg-emerald-50/60 px-5 py-3 border-b border-emerald-100 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-emerald-700 block text-[10px] font-semibold">회원</span>
            <span className="font-bold text-stone-900">{memberName}</span>
          </div>
          <div>
            <span className="text-emerald-700 block text-[10px] font-semibold">담당 트레이너</span>
            <span className="font-medium text-stone-800">{trainerName}</span>
          </div>
          <div>
            <span className="text-emerald-700 block text-[10px] font-semibold">시작 당시 잔여</span>
            <span className="font-bold text-amber-700">{renewal.remainingSessionsAtStart}회 잔여</span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 이용권 명칭 */}
          <div>
            <label className="block text-stone-700 font-semibold mb-1">
              신규 이용권 명칭 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 정규 1:1 PT 20회권 [재등록]"
              className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 font-medium"
            />
          </div>

          {/* PT 횟수 & 담당 트레이너 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                PT 등록 횟수 (회) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="300"
                required
                value={totalSessions}
                onChange={(e) => setTotalSessions(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 font-bold"
              />
            </div>
            <div>
              <label className="block text-stone-700 font-semibold mb-1">
                담당 트레이너
              </label>
              <input
                type="text"
                disabled
                value={trainerName}
                className="w-full px-3 py-2 rounded-lg bg-stone-100 border border-stone-200 text-stone-500 font-medium cursor-not-allowed"
              />
            </div>
          </div>

          {/* 시작일 & 만료일 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="renewal-contract-start-date" className="block text-stone-700 font-semibold mb-1 text-xs">
                시작일 <span className="text-rose-500">*</span>
              </label>
              <DateInputField
                id="renewal-contract-start-date"
                value={startDate}
                onChange={setStartDate}
                placeholder="YYYY-MM-DD"
                required
                aria-label="재등록 시작일"
              />
            </div>
            <div>
              <label htmlFor="renewal-contract-end-date" className="block text-stone-700 font-semibold mb-1 text-xs">
                만료일 <span className="text-rose-500">*</span>
              </label>
              <DateInputField
                id="renewal-contract-end-date"
                value={expirationDate}
                onChange={setExpirationDate}
                placeholder="YYYY-MM-DD"
                required
                aria-label="재등록 만료일"
              />
            </div>
          </div>

          {/* 메모 / 특약사항 */}
          <div>
            <label className="block text-stone-700 font-semibold mb-1">
              메모 / 특약사항 (선택)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="예: 재등록 프로모션 5% 할인 적용, 주 2회 화/목 진행"
              className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
            />
          </div>

          {/* 안내 배너 */}
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-stone-600 flex items-start gap-2 text-[11px] leading-relaxed">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              기존 PT 계약은 변경되지 않고 그대로 이력으로 보존됩니다. 신규 계약 생성이 완료되면 현재 재등록 상담 상태가 <strong>재등록완료(RENEWED)</strong>로 자동 변경됩니다.
            </span>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 font-medium transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              id="btn-confirm-renewal-contract"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>계약 생성 및 완료 처리 중...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>신규 계약 생성 및 완료</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
