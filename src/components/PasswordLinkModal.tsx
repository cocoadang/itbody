import React, { useState } from 'react';
import { X, KeyRound, Copy, Check, ExternalLink, ShieldCheck } from 'lucide-react';

interface PasswordLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  targetEmail: string;
  targetType: 'MEMBER' | 'TRAINER';
  resetLink: string;
  isNewlyProvisioned?: boolean;
}

export const PasswordLinkModal: React.FC<PasswordLinkModalProps> = ({
  isOpen,
  onClose,
  targetName,
  targetEmail,
  targetType,
  resetLink,
  isNewlyProvisioned = true
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(resetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const typeLabel = targetType === 'MEMBER' ? '회원' : '트레이너';

  return (
    <div
      id="password-link-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        id="password-link-modal-content"
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 relative my-8"
      >
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 leading-tight">
                {isNewlyProvisioned ? `${typeLabel} 로그인 계정 발급 완료` : '비밀번호 재설정 링크 생성 완료'}
              </h2>
              <p className="text-xs text-stone-500">
                {targetName} ({targetEmail})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-700 leading-relaxed">
            <p className="font-semibold text-stone-900 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>안내</span>
            </p>
            <p>
              {typeLabel}에게 아래의 보안 링크를 전달해주세요. {typeLabel}이 직접 링크를 열어 본인의 비밀번호를 안전하게 설정할 수 있습니다.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              비밀번호 설정 링크
            </label>
            <div className="flex items-center gap-2">
              <input
                id="password-reset-link-input"
                type="text"
                readOnly
                value={resetLink}
                className="flex-1 px-3 py-2 bg-stone-100 border border-stone-300 rounded-lg text-xs font-mono text-stone-800 select-all focus:outline-none"
              />
              <button
                type="button"
                id="btn-copy-password-link"
                onClick={handleCopy}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs active:scale-95 ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-stone-900 hover:bg-stone-800 text-white'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>복사됨</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>링크 복사</span>
                  </>
                )}
              </button>
            </div>
            {copied && (
              <p className="text-[11px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>클립보드에 복사되었습니다. {typeLabel}에게 전달하세요.</span>
              </p>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-stone-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
