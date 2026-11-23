import { TrainerJoinRequests } from './TrainerJoinRequests';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getTrainers, createTrainer, updateTrainer, getMembers } from '../services/dataService';
import type { Trainer, Member, TrainerStatus } from '../types';
import { sanitizePhoneNumber, isValidPhoneNumber, PHONE_ERROR_MESSAGE } from '../utils/phoneUtils';
import { EmptyState } from './EmptyState';
import {
  Dumbbell,
  UserPlus,
  Phone,
  Award,
  RefreshCw,
  X,
  Loader2,
  Users,
  Edit2,
  Mail,
  AlertCircle,
  KeyRound
} from 'lucide-react';
import { provisionAccount, generateResetPasswordLink } from '../services/adminAccountService';
import { PasswordLinkModal } from './PasswordLinkModal';

export const TrainerList: React.FC = () => {
  const { currentUser, currentCenterName } = useAuth();
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Trainer modal (Create or Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [bio, setBio] = useState('');
  const [status, setStatus] = useState<TrainerStatus>('ACTIVE');
  const [loginEmail, setLoginEmail] = useState('');

  // Phase 10B Account Provisioning & Password Reset Link Modal State (Firebase Functions 2nd Gen 활성화)
  const IS_AUTO_PROVISIONING_ENABLED = true;
  const [actionLoadingTrainerId, setActionLoadingTrainerId] = useState<string | null>(null);
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

  const fetchTrainers = useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setError(null);
      const [trainerData, memberData] = await Promise.all([
        getTrainers(currentUser.centerId),
        getMembers(
          currentUser.centerId,
          currentUser.role,
          currentUser.trainerId
        )
      ]);
      setTrainers(trainerData);
      setMembers(memberData);
    } catch (err) {
      console.error('[TrainerList fetch error]', err);
      setError('트레이너 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchTrainers();
  }, [fetchTrainers]);

  // Phase 10B: CENTER_ADMIN 트레이너 Firebase 계정 자동 발급
  const handleTrainerProvision = async (trainer: Trainer) => {
    if (!currentUser || currentUser.role !== 'CENTER_ADMIN') return;
    if (!trainer.loginEmail) {
      setAccountActionError('트레이너 정보 수정에서 로그인 이메일을 먼저 등록해주세요.');
      return;
    }
    try {
      setAccountActionError(null);
      setActionLoadingTrainerId(trainer.trainerId);
      const res = await provisionAccount('TRAINER', trainer.trainerId);
      if (res.success && res.uid) {
        setTrainers((prev) =>
          prev.map((t) => (t.trainerId === trainer.trainerId ? { ...t, uid: res.uid } : t))
        );
        setPasswordModalState({
          isOpen: true,
          targetName: trainer.name,
          targetEmail: res.email || trainer.loginEmail || '',
          resetLink: res.resetLink || '',
          isNewlyProvisioned: true
        });
      }
    } catch (err: any) {
      console.warn('[Trainer Provision Warning]', err?.message || err);
      setAccountActionError(err.message || '트레이너 계정 발급에 실패했습니다.');
    } finally {
      setActionLoadingTrainerId(null);
    }
  };

  // Phase 10B: 비밀번호 재설정 링크 생성
  const handleTrainerResetPassword = async (trainer: Trainer) => {
    if (!currentUser || currentUser.role !== 'CENTER_ADMIN') return;
    try {
      setAccountActionError(null);
      setActionLoadingTrainerId(trainer.trainerId);
      const res = await generateResetPasswordLink('TRAINER', trainer.trainerId);
      if (res.success) {
        setPasswordModalState({
          isOpen: true,
          targetName: trainer.name,
          targetEmail: res.email || trainer.loginEmail || '',
          resetLink: res.resetLink || '',
          isNewlyProvisioned: false
        });
      }
    } catch (err: any) {
      console.warn('[Trainer Reset Password Warning]', err?.message || err);
      setAccountActionError(err.message || '비밀번호 재설정 링크 생성에 실패했습니다.');
    } finally {
      setActionLoadingTrainerId(null);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingTrainer(null);
    setName('');
    setPhone('');
    setSpecialty('');
    setBio('');
    setStatus('ACTIVE');
    setLoginEmail('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (trainer: Trainer) => {
    setEditingTrainer(trainer);
    setName(trainer.name);
    setPhone(sanitizePhoneNumber(trainer.phone));
    setSpecialty(trainer.specialty || '');
    setBio(trainer.bio || '');
    setStatus(trainer.status);
    setLoginEmail(trainer.loginEmail || '');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSubmitTrainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!name.trim()) {
      setModalError('이름을 입력해주세요.');
      return;
    }
    if (!phone.trim()) {
      setModalError('연락처를 입력해주세요.');
      return;
    }
    if (!isValidPhoneNumber(phone, true)) {
      setModalError(PHONE_ERROR_MESSAGE);
      return;
    }

    if (currentUser.role === 'CENTER_ADMIN' && loginEmail.trim()) {
      const trimmedEmail = loginEmail.trim().toLowerCase();
      const dupOtherTrainer = trainers.find(
        (t) =>
          t.trainerId !== editingTrainer?.trainerId &&
          t.loginEmail &&
          t.loginEmail.trim().toLowerCase() === trimmedEmail
      );
      if (dupOtherTrainer) {
        setModalError(`해당 이메일은 이미 다른 트레이너(${dupOtherTrainer.name})의 로그인 계정으로 등록되어 있습니다.`);
        return;
      }
      const dupMember = members.find(
        (m) => m.email && m.email.trim().toLowerCase() === trimmedEmail
      );
      if (dupMember) {
        setModalError(`해당 이메일은 이미 회원(${dupMember.name})에게 등록된 이메일입니다. 다른 이메일을 입력해주세요.`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setModalError(null);
      if (editingTrainer) {
        if (currentUser.role === 'TRAINER') {
          // TRAINER self-update: only name, phone, specialty, bio allowed
          await updateTrainer(
            editingTrainer.trainerId,
            {
              name: name.trim(),
              phone: phone.trim(),
              specialty: specialty.trim() || '체형 교정 & 웨이트 트레이닝',
              bio: bio.trim() || undefined
            },
            'TRAINER',
            currentUser.trainerId
          );
        } else {
          // CENTER_ADMIN: full operational update
          await updateTrainer(
            editingTrainer.trainerId,
            {
              name: name.trim(),
              phone: phone.trim(),
              specialty: specialty.trim() || '체형 교정 & 웨이트 트레이닝',
              bio: bio.trim() || undefined,
              status,
              loginEmail: loginEmail.trim() || undefined,
              uid: editingTrainer.uid || undefined
            },
            'CENTER_ADMIN'
          );
        }
      } else {
        await createTrainer({
          centerId: currentUser.centerId,
          name: name.trim(),
          phone: phone.trim(),
          specialty: specialty.trim() || '체형 교정 & 웨이트 트레이닝',
          role: 'TRAINER',
          status: 'ACTIVE',
          loginEmail: loginEmail.trim() || undefined
        });
      }
      setIsModalOpen(false);
      setEditingTrainer(null);
      setName('');
      setPhone('');
      setSpecialty('');
      setBio('');
      setStatus('ACTIVE');
      setLoginEmail('');
      setModalError(null);
      fetchTrainers();
    } catch (err: any) {
      console.error('Failed to save trainer:', err);
      const message = err?.message || (editingTrainer ? '트레이너 수정 중 오류가 발생했습니다.' : '트레이너 등록 중 오류가 발생했습니다.');
      setModalError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="trainer-list-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-2 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              트레이너 목록
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 text-xs font-semibold">
              총 {trainers.length}명
            </span>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            {currentCenterName} 소속 전담 트레이너 및 담당 회원 현황입니다.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchTrainers}
            disabled={loading}
            className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>

          {currentUser?.role === 'CENTER_ADMIN' && (
            <button
              id="open-create-trainer-btn"
              onClick={handleOpenCreateModal}
              className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer active:scale-95 whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              트레이너 등록
            </button>
          )}
        </div>
      </div>

      {currentUser?.role === 'CENTER_ADMIN' && <TrainerJoinRequests onApproved={fetchTrainers} />}

      {/* Account Action Notification Banner */}
      {accountActionError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start justify-between gap-3 animate-in fade-in shadow-2xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-900">계정 작업 안내</p>
              <p className="mt-0.5 text-rose-700 leading-relaxed">{accountActionError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAccountActionError(null)}
            className="text-rose-400 hover:text-rose-700 p-1 cursor-pointer"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-stone-400">
          <RefreshCw className="w-6 h-6 animate-spin mb-2" />
          <p className="text-sm">트레이너 목록을 불러오는 중입니다...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          {error}
        </div>
      ) : trainers.length === 0 ? (
        <EmptyState
          id="empty-trainer-list"
          icon={Dumbbell}
          title="등록된 트레이너가 없습니다"
          description="현재 센터에 등록된 트레이너 정보가 없습니다. 상단의 '트레이너 등록' 또는 'Firestore 데이터 생성'을 진행하세요."
          actionText={currentUser?.role === 'CENTER_ADMIN' ? '트레이너 등록' : undefined}
          onAction={currentUser?.role === 'CENTER_ADMIN' ? handleOpenCreateModal : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {trainers.map((trainer) => {
            const assignedCount = members.filter((m) => m.trainerId === trainer.trainerId).length;
            const isMe = currentUser?.trainerId === trainer.trainerId;

            return (
              <div
                key={trainer.trainerId}
                className={`bg-white rounded-xl border p-5 shadow-xs transition-shadow hover:shadow-sm ${
                  isMe ? 'border-blue-400 ring-1 ring-blue-300' : 'border-stone-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-stone-100 flex items-center justify-center text-stone-800 font-bold text-base border border-stone-200">
                      {trainer.name.slice(0, 1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-stone-900 text-base">
                          {trainer.name}
                        </h3>
                        {isMe && (
                          <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">
                            본인
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-stone-400 font-mono">
                        {trainer.trainerId}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded font-semibold ${
                        trainer.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {trainer.status === 'ACTIVE' ? '재직 중' : '휴직'}
                    </span>
                    {currentUser?.role === 'CENTER_ADMIN' && (
                      <button
                        type="button"
                        id={`edit-trainer-btn-${trainer.trainerId}`}
                        onClick={() => handleOpenEditModal(trainer)}
                        className="p-1 rounded-md text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
                        title="트레이너 정보 수정"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {currentUser?.role === 'TRAINER' && isMe && (
                      <button
                        type="button"
                        id={`edit-trainer-btn-${trainer.trainerId}`}
                        onClick={() => handleOpenEditModal(trainer)}
                        className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                        title="내 프로필 수정"
                      >
                        <Edit2 className="w-3 h-3 text-stone-600" />
                        <span>프로필 수정</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-stone-100 space-y-2 text-xs text-stone-600">
                  <div className="flex items-center gap-2">
                    <Award className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span>전문 분야: <strong className="text-stone-800">{trainer.specialty}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="font-mono">{trainer.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="text-stone-500">로그인 계정:</span>
                    {trainer.loginEmail ? (
                      <span className="font-mono text-stone-800 inline-flex items-center gap-1.5 flex-wrap">
                        <span>{trainer.loginEmail}</span>
                        {trainer.uid ? (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            계정 연동됨
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                            <span>로그인 계정 미연결</span>
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-stone-400 italic">미등록 (로그인 불가)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span>배정 회원: <strong className="text-stone-900">{currentUser?.role === 'CENTER_ADMIN' || trainer.trainerId === currentUser?.trainerId ? `${assignedCount}명` : '-'}</strong></span>
                  </div>

                  {/* Phase 10A: 파일럿 기간 임시 비활성화 (향후 전용 인증 백엔드 도입 시 재활성화) */}
                  {IS_AUTO_PROVISIONING_ENABLED && currentUser?.role === 'CENTER_ADMIN' && (
                    <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-stone-500 font-medium">Firebase 계정:</span>
                      {trainer.uid ? (
                        <button
                          type="button"
                          id={`btn-trainer-reset-password-${trainer.trainerId}`}
                          onClick={() => handleTrainerResetPassword(trainer)}
                          disabled={actionLoadingTrainerId === trainer.trainerId}
                          className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          {actionLoadingTrainerId === trainer.trainerId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <KeyRound className="w-3 h-3 text-stone-600" />
                          )}
                          <span>비밀번호 재설정 링크</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          id={`btn-trainer-provision-${trainer.trainerId}`}
                          onClick={() => handleTrainerProvision(trainer)}
                          disabled={actionLoadingTrainerId === trainer.trainerId || !trainer.loginEmail}
                          title={!trainer.loginEmail ? '트레이너 수정에서 이메일을 먼저 등록해주세요' : 'Firebase 로그인 계정 자동 발급'}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer active:scale-95 disabled:opacity-50 ${
                            trainer.loginEmail
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-stone-100 text-stone-400 border border-stone-200 cursor-not-allowed'
                          }`}
                        >
                          {actionLoadingTrainerId === trainer.trainerId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <KeyRound className="w-3 h-3" />
                          )}
                          <span>로그인 계정 발급</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trainer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="font-bold text-stone-900 text-base">
                {currentUser?.role === 'TRAINER'
                  ? '내 프로필 수정'
                  : editingTrainer
                  ? '트레이너 정보 수정'
                  : '트레이너 등록'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTrainer} autoComplete="off" className="mt-4 space-y-3.5 text-xs">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="flex-1 leading-relaxed">{modalError}</span>
                </div>
              )}

              {currentUser?.role === 'TRAINER' && (
                <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-stone-600 text-[11px] leading-relaxed">
                  소속 센터, 권한, 로그인 계정 및 재직 상태는 센터 보안 정책에 따라 관리자만 변경 가능합니다.
                </div>
              )}

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  이름 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  id="trainer-modal-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 최서원"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  연락처 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  required
                  id="trainer-modal-phone"
                  value={phone}
                  onChange={(e) => setPhone(sanitizePhoneNumber(e.target.value))}
                  placeholder="01012345678"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  전문 분야 / 자격
                </label>
                <input
                  type="text"
                  id="trainer-modal-specialty"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="예: 체형교정, 바디프로필, 재활"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  한 줄 소개 / Bio (선택)
                </label>
                <textarea
                  rows={2}
                  id="trainer-modal-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="회원들에게 보여질 트레이너 소개글을 입력하세요."
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>

              {currentUser?.role === 'CENTER_ADMIN' ? (
                <>
                  <div className="pt-2 border-t border-stone-100">
                    <label className="block font-semibold text-stone-700 mb-1">
                      로그인 이메일 (계정 연결)
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="email"
                        id="trainer-modal-email"
                        autoComplete="off"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="trainer@itbody.com"
                        className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-stone-500">
                      Firebase 로그인 시 해당 트레이너로 자동 식별되는 계정 이메일입니다.
                    </p>
                  </div>

                  {editingTrainer && (
                    <div>
                      <label className="block font-semibold text-stone-700 mb-1">
                        재직 상태
                      </label>
                      <select
                        id="trainer-modal-status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as TrainerStatus)}
                        className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 cursor-pointer"
                      >
                        <option value="ACTIVE">재직 중 (ACTIVE)</option>
                        <option value="INACTIVE">휴직 / 퇴사 (INACTIVE)</option>
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <div className="pt-2 border-t border-stone-100 space-y-2">
                  <div>
                    <label className="block font-semibold text-stone-500 mb-0.5">
                      로그인 계정
                    </label>
                    <div className="px-3 py-2 bg-stone-100 rounded-lg text-xs text-stone-600 font-mono">
                      {loginEmail || '미등록'}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-2 border border-stone-300 text-stone-700 rounded-lg font-semibold hover:bg-stone-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{editingTrainer ? '수정 중...' : '등록 중...'}</span>
                    </>
                  ) : (
                    <span>{editingTrainer ? '수정 완료' : '등록 완료'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
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
          targetType="TRAINER"
          resetLink={passwordModalState.resetLink}
          isNewlyProvisioned={passwordModalState.isNewlyProvisioned}
        />
      )}
    </div>
  );
};

