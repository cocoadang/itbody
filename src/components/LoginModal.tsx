import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Lock, AlertCircle, LogIn } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { loginWithFirebase } = useAuth();

  // Firebase Auth login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleFirebaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setAuthError(null);
    setIsSubmitting(true);
    try {
      await loginWithFirebase(email.trim(), password);
      onClose();
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
        console.warn(`[Firebase Auth] Modal login failed: ${code}`);
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

  return (
    <div
      id="login-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        id="login-modal-content"
        className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 relative my-8"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-stone-900 flex items-center justify-center text-white">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 leading-tight">
                ITBODY 로그인
              </h2>
              <p className="text-xs text-stone-500">
                실제 Firebase Authentication 계정 로그인
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFirebaseLogin} className="space-y-4 pt-4">
          <div>
            <label className="block font-semibold text-xs text-stone-700 mb-1">
              이메일
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trainer@example.com"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:outline-none focus:border-stone-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-xs text-stone-700 mb-1">
              비밀번호
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:outline-none focus:border-stone-900"
            />
          </div>

          {authError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-rose-700 text-xs leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{authError}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-stone-300 text-stone-700 rounded-lg text-xs font-semibold hover:bg-stone-50 cursor-pointer"
            >
              닫기
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isSubmitting ? '로그인 중...' : '로그인'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
