import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { createMember, updateMember, getTrainers, checkMemberEmailExists } from '../services/dataService';
import type { Member, Trainer, Gender, MemberStatus } from '../types';
import { X, UserPlus, AlertCircle, Loader2, Edit2 } from 'lucide-react';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import { sanitizePhoneNumber, isValidPhoneNumber, PHONE_ERROR_MESSAGE } from '../utils/phoneUtils';
import { localToday } from '../utils/dateInputUtils';

interface NewMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (memberId: string) => void;
  member?: Member | null;
  initialLeadData?: {
    leadId: string;
    name: string;
    phone: string;
    trainerId?: string;
    notes?: string;
  } | null;
}

export const NewMemberModal: React.FC<NewMemberModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  member,
  initialLeadData
}) => {
  const isEditMode = Boolean(member);
  const isLeadConversion = Boolean(initialLeadData && !member);
  const { currentUser } = useAuth();
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loadingTrainers, setLoadingTrainers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('MALE');
  const [birthDate, setBirthDate] = useState('1995-01-01');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [startDate, setStartDate] = useState(() => localToday());
  const [status, setStatus] = useState<MemberStatus>('ACTIVE');
  const [trainerId, setTrainerId] = useState('');
  const [notes, setNotes] = useState('');

  // Pre-populate or reset form when modal opens or member/lead prop changes
  useEffect(() => {
    if (!isOpen) return;

    if (member) {
      setName(member.name);
      setGender(member.gender);
      setBirthDate(member.birthDate);
      setPhone(sanitizePhoneNumber(member.phone));
      setEmail(member.email || '');
      setStartDate(member.startDate);
      setStatus(member.status);
      setTrainerId(member.trainerId);
      setNotes(member.notes || '');
    } else if (initialLeadData) {
      setName(initialLeadData.name || '');
      setGender('MALE');
      setBirthDate('1995-01-01');
      setPhone(sanitizePhoneNumber(initialLeadData.phone || ''));
      setEmail('');
      setStartDate(localToday());
      setStatus('ACTIVE');
      setTrainerId(initialLeadData.trainerId || '');
      setNotes(initialLeadData.notes ? `[신규문의 인계 메모]: ${initialLeadData.notes}` : '');
    } else {
      setName('');
      setGender('MALE');
      setBirthDate('1995-01-01');
      setPhone('');
      setEmail('');
      setStartDate(localToday());
      setStatus('ACTIVE');
      setNotes('');
    }
  }, [isOpen, member, initialLeadData]);

  // Fetch trainers for selection
  useEffect(() => {
    if (!isOpen || !currentUser) return;
    const fetchCenterTrainers = async () => {
      try {
        setLoadingTrainers(true);
        const data = await getTrainers(currentUser.centerId);
        setTrainers(data);
        if (!member) {
          if (initialLeadData?.trainerId) {
            setTrainerId(initialLeadData.trainerId);
          } else if (currentUser.role === 'TRAINER' && currentUser.trainerId) {
            setTrainerId(currentUser.trainerId);
          } else {
            setTrainerId('');
          }
        }
      } catch (err) {
        console.error('Error fetching trainers for member modal:', err);
      } finally {
        setLoadingTrainers(false);
      }
    };
    fetchCenterTrainers();
  }, [isOpen, currentUser, member, initialLeadData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!name.trim()) {
      setError('회원 이름을 입력해주세요.');
      return;
    }
    if (!isValidDate(birthDate)) {
      setError('생년월일을 올바른 날짜 형식(YYYY-MM-DD)으로 입력해주세요.');
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
    if (!isEditMode && trainers.length === 0) {
      setError('등록된 트레이너가 없습니다. 먼저 트레이너를 등록해주세요.');
      return;
    }
    if (!trainerId) {
      setError('담당 트레이너를 지정해주세요.');
      return;
    }
    if (!isValidDate(startDate)) {
      setError('PT 시작일을 올바른 날짜 형식(YYYY-MM-DD)으로 입력해주세요.');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('이메일을 입력해주세요.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('올바른 이메일 형식을 입력해주세요. (예: user@example.com)');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Check duplicate email in center
      const isDuplicate = await checkMemberEmailExists(
        currentUser.centerId,
        trimmedEmail,
        isEditMode && member ? member.memberId : undefined
      );
      if (isDuplicate) {
        setError('동일 센터 내에 이미 등록된 이메일입니다. 다른 이메일을 입력해주세요.');
        setIsSubmitting(false);
        return;
      }

      // Check duplicate against trainers in same center
      const dupTrainer = trainers.find(
        (t) => t.loginEmail && t.loginEmail.trim().toLowerCase() === trimmedEmail
      );
      if (dupTrainer) {
        setError(`해당 이메일은 이미 트레이너(${dupTrainer.name})의 로그인 계정으로 등록되어 있습니다. 다른 이메일을 입력해주세요.`);
        setIsSubmitting(false);
        return;
      }

      if (isEditMode && member) {
        const updatePayload: any = {
          trainerId,
          name: name.trim(),
          gender,
          birthDate,
          phone: phone.trim(),
          email: trimmedEmail,
          startDate,
          status,
          notes: notes.trim() || undefined
        };

        const updated = await updateMember(member.memberId, updatePayload);
        onSuccess(updated.memberId);
      } else {
        const createPayload: any = {
          centerId: currentUser.centerId,
          trainerId,
          name: name.trim(),
          gender,
          birthDate,
          phone: phone.trim(),
          email: trimmedEmail,
          startDate,
          status: 'ACTIVE',
          notes: notes.trim() || undefined,
          sourceLeadId: initialLeadData?.leadId || null
        };

        const created = await createMember(createPayload);
        onSuccess(created.memberId);
      }

      onClose();
    } catch (err) {
      console.error('Failed to save member:', err);
      setError(isEditMode ? '회원 정보 수정 중 오류가 발생했습니다.' : '회원 등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="new-member-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        id="new-member-modal-content"
        className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 relative my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-800">
              {isEditMode ? <Edit2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900 leading-tight">
                {isEditMode
                  ? '회원 정보 수정'
                  : isLeadConversion
                  ? 'OT 완료 고객 → 신규 회원 등록'
                  : '신규 회원 등록'}
              </h2>
              <p className="text-xs text-stone-500">
                {isEditMode
                  ? '회원의 기본 인적사항 및 담당 트레이너를 수정합니다.'
                  : isLeadConversion
                  ? '문의 고객 정보가 자동 채워졌습니다. 필요한 정보만 추가 입력해주세요.'
                  : '새로운 회원의 기본 정보 및 담당 트레이너를 지정합니다.'}
              </p>
            </div>
          </div>
          <button
            id="close-new-member-modal-btn"
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lead Conversion Info Banner */}
        {isLeadConversion && initialLeadData && (
          <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              신규문의(ID: <strong>{initialLeadData.leadId}</strong>) 고객의 이름과 연락처가 자동으로 연동되었습니다.
            </span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Member Name */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              회원 이름 <span className="text-rose-500">*</span>
            </label>
            <input
              id="new-member-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 홍길동"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent"
            />
          </div>

          {/* Gender & BirthDate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                성별 <span className="text-rose-500">*</span>
              </label>
              <select
                id="new-member-gender-select"
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent cursor-pointer"
              >
                <option value="MALE">남성</option>
                <option value="FEMALE">여성</option>
                <option value="OTHER">기타</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                생년월일 <span className="text-rose-500">*</span>
              </label>
              <DateInputField
                id="new-member-birthdate-input"
                required
                value={birthDate}
                onChange={setBirthDate}
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              연락처 (휴대전화) <span className="text-rose-500">*</span>
            </label>
            <input
              id="new-member-phone-input"
              type="tel"
              inputMode="numeric"
              maxLength={11}
              required
              value={phone}
              onChange={(e) => setPhone(sanitizePhoneNumber(e.target.value))}
              placeholder="01012345678"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent"
            />
          </div>

          {/* Email (Required - Login Account) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="new-member-email-input" className="block text-xs font-semibold text-stone-700">
                이메일 (로그인 계정) <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-stone-400">회원 포털 로그인용</span>
            </div>
            <input
              id="new-member-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="예: member@example.com"
              autoComplete="email"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent"
            />
          </div>

          {/* Trainer assignment & Start Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                담당 트레이너 <span className="text-rose-500">*</span>
              </label>
              <select
                id="new-member-trainer-select"
                value={trainerId}
                disabled={currentUser?.role === 'TRAINER' || (!isEditMode && trainers.length === 0)}
                onChange={(e) => setTrainerId(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent cursor-pointer disabled:bg-stone-100 disabled:text-stone-500"
              >
                {loadingTrainers ? (
                  <option value="">트레이너 목록 불러오는 중...</option>
                ) : trainers.length === 0 ? (
                  isEditMode && trainerId ? (
                    <option value={trainerId}>기존 담당 트레이너</option>
                  ) : (
                    <option value="">등록된 트레이너가 없습니다</option>
                  )
                ) : (
                  <>
                    <option value="">담당 트레이너 선택</option>
                    {isEditMode && trainerId && !trainers.some((t) => t.trainerId === trainerId) && (
                      <option value={trainerId}>기존 담당 트레이너</option>
                    )}
                    {trainers.map((t) => (
                      <option key={t.trainerId} value={t.trainerId}>
                        {t.name} ({t.specialty || '전담'})
                      </option>
                    ))}
                  </>
                )}
              </select>
              {currentUser?.role === 'TRAINER' ? (
                <span className="text-[11px] text-stone-400 mt-0.5 block">
                  트레이너 계정은 본인으로 자동 지정됩니다.
                </span>
              ) : !isEditMode && trainers.length === 0 && !loadingTrainers ? (
                <span className="text-[11px] text-rose-500 mt-0.5 block">
                  등록된 트레이너가 없습니다. 먼저 트레이너를 등록해주세요.
                </span>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                시작일 (PT 시작일) <span className="text-rose-500">*</span>
              </label>
              <DateInputField
                id="new-member-startdate-input"
                required
                value={startDate}
                onChange={setStartDate}
              />
            </div>
          </div>

          {/* Status (수정 모드에서만 표시) */}
          {isEditMode && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                상태 (Status)
              </label>
              <div className="flex gap-4">
                {(['ACTIVE', 'PAUSED', 'ENDED'] as MemberStatus[]).map((st) => (
                  <label key={st} className="flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer">
                    <input
                      type="radio"
                      name="memberStatus"
                      value={st}
                      checked={status === st}
                      onChange={() => setStatus(st)}
                      className="accent-stone-900"
                    />
                    <span>
                      {st === 'ACTIVE' ? '활성 (ACTIVE)' : st === 'PAUSED' ? '일시정지 (PAUSED)' : '종료 (ENDED)'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Initial Notes / Goals */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              초기 상담 메모 및 목표 (선택)
            </label>
            <textarea
              id="new-member-notes-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="예: 체지방 감량, 라운드숄더 교정 목적, 주 2회 수강 희망"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100">
            <button
              id="cancel-new-member-btn"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-stone-300 text-stone-700 rounded-lg text-xs font-semibold hover:bg-stone-50 transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              id="submit-new-member-btn"
              type="submit"
              disabled={isSubmitting || (!isEditMode && trainers.length === 0)}
              className="flex items-center gap-1.5 px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEditMode ? '수정 중...' : '등록 중...'}</span>
                </>
              ) : (
                <span>{isEditMode ? '회원 정보 수정 완료' : '회원 등록 완료'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
