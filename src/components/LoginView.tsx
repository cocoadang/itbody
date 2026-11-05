import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase/config';
import { KakaoLogin } from './KakaoLogin';
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  AlertCircle,
  LogIn,
  Dumbbell,
  LogOut,
  Loader2,
  ArrowLeft,
  User,
  Shield
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const {
    loginWithFirebase,
    logout,
    firebaseAuthUser,
    profileError
  } = useAuth();

  // Mode: Default is 'member' (회원 로그인), can toggle to 'staff' (관리자/트레이너 로그인)
  const [viewMode, setViewMode] = useState<'member' | 'staff'>('member');

  // Form states (Both modes use standard Firebase Authentication)
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleResetPassword = async () => {
    if (resetBusy) return;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setResetMessage('이메일 칸에 올바른 이메일 주소를 입력해주세요.'); return; }
    if (!auth) { setResetMessage('로그인 서비스를 준비하지 못했습니다. 새로고침해주세요.'); return; }
    setResetBusy(true); setResetMessage('');
    const notice = '등록된 이메일이라면 재설정 안내가 발송됩니다. 메일함과 스팸함을 확인해주세요.';
    try { await sendPasswordResetEmail(auth, email.trim()); setResetMessage(notice); }
    catch (err: any) { setResetMessage(err?.code === 'auth/user-not-found' ? notice : '메일을 보내지 못했습니다. 잠시 후 다시 시도하거나 센터에 문의해주세요.'); }
    finally { setResetBusy(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setAuthError(null);
    setIsSubmitting(true);
    try {
      await loginWithFirebase(email.trim(), password);
    } catch (err: any) {
      const code = err?.code || '';
      const isExpectedAuthFailure = [
        'auth/invalid-credential',
        'auth/wrong-password',
        'auth/user-not-found',
        'auth/too-many-requests',
        'auth/invalid-email',
        'auth/operation-not-allowed'
      ].includes(code);

      if (isExpectedAuthFailure) {
        console.warn(`[Firebase Auth] Login failed: ${code}`);
      } else {
        console.error('[Firebase Auth Login Error]', err);
      }

      if (err.code === 'auth/operation-not-allowed') {
        setAuthError('Firebase Console에서 Email/Password 로그인 공급자가 아직 활성화되지 않았습니다.');
      } else if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        setAuthError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (err.code === 'auth/too-many-requests') {
        setAuthError('로그인 시도가 너무 많아 일시적으로 차단되었습니다. 잠시 후 다시 시도해주세요.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('올바른 이메일 형식을 입력해주세요.');
      } else {
        setAuthError(err.message || '로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (mode: 'member' | 'staff') => {
    setViewMode(mode);
    setResetMessage('');
    setEmailExpanded(false);
    setEmail('');
    setPassword('');
    setAuthError(null);
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans selection:bg-stone-900 selection:text-white">
      <div className="max-w-md w-full my-auto">
        {/* Brand & App Title Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-stone-900 text-white shadow-md mb-3">
            <Dumbbell className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">ITBODY</h1>
          <p className="text-xs text-stone-600 mt-1">
            {viewMode === 'member'
              ? 'PT 회원 전용 포털 로그인'
              : '센터 관리자 및 트레이너 로그인'}
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-stone-200/80 p-6 sm:p-8">
          {/* Security Gate / Profile Error Display */}
          {profileError ? (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5">
                <div className="flex items-start gap-2.5 text-rose-900 text-xs leading-relaxed">
                  <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-sm text-rose-900 mb-1">
                      계정 접근 차단 안내
                    </h3>
                    <p className="text-rose-800">{profileError}</p>
                    {firebaseAuthUser && (
                      <p className="mt-2 text-[11px] font-mono text-rose-700 bg-rose-100/60 px-2 py-1 rounded">
                        인증 계정: {firebaseAuthUser.email} (UID: {firebaseAuthUser.uid})
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-rose-600 pt-1 border-t border-rose-200/60 leading-normal">
                  운영 보안 정책상 Firestore <code>users/&#123;uid&#125;</code>에 소속 센터 및 승인된 역할(CENTER_ADMIN / TRAINER / MEMBER)이 등록되지 않은 계정은 시스템 접근이 엄격히 차단됩니다.
                </p>
              </div>

              <button
                type="button"
                onClick={logout}
                className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.99]"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>로그아웃 후 다른 계정으로 로그인</span>
              </button>
            </div>
          ) : viewMode === 'member' ? (
            /* ========================================================= */
            /* 1. 회원 로그인 화면 (Firebase Auth 이메일/비밀번호) */
            /* ========================================================= */
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
                <div className="w-7 h-7 rounded-lg bg-stone-100 text-stone-800 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-stone-900 leading-tight">
                    회원 로그인
                  </h2>
                  <p className="text-[11px] text-stone-500">
                    카카오로 간편하게 시작하세요
                  </p>
                </div>
              </div>

              <KakaoLogin />


              {/* Bottom Switcher: To Staff Login */}
              <div className="pt-3 border-t border-stone-200">
                <button
                  type="button"
                  id="btn-to-staff-login"
                  onClick={() => switchMode('staff')}
                  className="w-full py-2.5 px-4 bg-stone-100 hover:bg-stone-200/80 text-stone-700 hover:text-stone-900 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5 text-stone-500" />
                  <span>관리자/트레이너 로그인</span>
                </button>
                <p className="text-[11px] text-stone-400 text-center mt-2.5">
                  회원 연결이 어려우면 이용 중인 센터에 문의해주세요.
                </p>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* 2. 관리자/트레이너 로그인 화면 (Firebase Auth 이메일/비밀번호) */
            /* ========================================================= */
            <div className="space-y-4">
              <button
                type="button"
                id="btn-to-member-login"
                onClick={() => switchMode('member')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 cursor-pointer transition-colors pb-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>회원 로그인으로 돌아가기</span>
              </button>

              <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
                <div className="w-7 h-7 rounded-lg bg-stone-900 text-white flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-stone-900 leading-tight">
                    관리자/트레이너 로그인
                  </h2>
                  <p className="text-[11px] text-stone-500">
                    센터 관리자 및 트레이너 전용 계정으로 로그인하세요
                  </p>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4 pt-1">
                <div>
                  <label
                    htmlFor="staff-email-input"
                    className="block font-semibold text-xs text-stone-700 mb-1.5"
                  >
                    직원 이메일
                  </label>
                  <input
                    id="staff-email-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="직원 이메일을 입력하세요"
                    autoComplete="username"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label
                    htmlFor="staff-password-input"
                    className="block font-semibold text-xs text-stone-700 mb-1.5"
                  >
                    비밀번호
                  </label>
                  <input
                    id="staff-password-input"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all"
                  />
                </div>

                {authError && (
                  <div
                    id="staff-auth-error"
                    className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs leading-relaxed"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  id="btn-staff-login"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-xs active:scale-[0.99] mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>로그인 확인 중...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>관리자/트레이너 로그인</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Security / Tenant Notice Footer */}
        <div className="mt-6 text-center text-xs text-stone-500 space-y-1">

          <p className="text-[11px] text-stone-400">
            {viewMode === 'member'
              ? '등록된 회원 계정으로 나의 PT 성장 여정 및 수업 일지를 확인할 수 있습니다.'
              : '관리자에게 승인된 계정만 내부 시스템에 접근할 수 있습니다.'}
          </p>
        </div>
      </div>
    </div>
  );
};
