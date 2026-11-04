import React, { useEffect, useRef, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase/config';
import { captureInvite, readInvite } from '../services/memberAccessService';

export const KakaoLogin: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);
  const complete = async (data: any) => {
    if (!data.customToken || !auth) throw new Error(data.error || '카카오 로그인에 실패했습니다.');
    await signInWithCustomToken(auth, data.customToken);
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    try { captureInvite(); } catch (err: any) { setError(err.message); }
    setInvite(readInvite());
    const params = new URLSearchParams(window.location.search);
    const callback = params.get('kakao_callback') === '1';
    const authCode = params.get('code');
    const state = params.get('state');
    if (callback) {
      window.history.replaceState({}, '', window.location.pathname);
      setBusy(true);
      if (!authCode || !state) { setError('카카오 로그인이 취소되었거나 실패했습니다.'); setBusy(false); }
      else fetch('/api/auth/kakao/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: authCode, state }) })
        .then(r => r.json()).then(complete).catch((err: Error) => setError(err.message || '카카오 로그인에 실패했습니다. 다시 시도해주세요.')).finally(() => setBusy(false));
    }
    fetch('/api/auth/kakao/status').then(r => r.json()).then(data => { setEnabled(data.enabled === true); if (!callback) setPending(data.pending === true); }).catch(() => setEnabled(false));
  }, []);
  return <div className="space-y-3">
    <button type="button" disabled={!enabled || busy} onClick={() => window.location.assign('/api/auth/kakao/start')} className="w-full rounded-xl bg-[#FEE500] text-[#191919] py-3 font-semibold text-sm disabled:opacity-50">{busy ? '로그인 확인 중…' : enabled ? '카카오로 로그인' : '카카오 로그인 준비 중'}</button>
    {invite && <p className="text-xs text-stone-600 bg-stone-50 p-3 rounded-xl">초대 링크를 확인했습니다. 카카오로 로그인하면 내 회원 정보가 자동으로 연결됩니다.</p>}
    {!invite && <p className="text-xs text-stone-600 bg-stone-50 p-3 rounded-xl">처음 이용하시나요? 카카오 로그인 → 센터 선택 → 회원 연결 요청 → 센터 승인 순서로 시작하세요. 초대 링크가 있으면 바로 연결됩니다.</p>}
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}

  </div>;
};

export const KakaoInvite: React.FC<{ memberId: string }> = ({ memberId }) => {
  const [result, setResult] = useState<{code: string; expiresAt: number} | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const issue = async () => {
    setBusy(true); setResult(null); setCopied(false); setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('다시 로그인해주세요.');
      const response = await fetch('/api/admin/kakao-invite', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ memberId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '초대 링크 발급에 실패했습니다.');
      setResult(data);
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <div className="w-full text-xs space-y-2">
    <button type="button" onClick={issue} disabled={busy} className="px-3 py-2 rounded-xl bg-[#FEE500] text-[#191919] font-semibold disabled:opacity-50">{busy ? '발급 중…' : '카카오 로그인 초대 링크 발급'}</button>
    {result && <div className="p-3 bg-yellow-50 rounded-xl space-y-2">
      <p>아래 링크를 해당 회원 본인에게 전달해주세요. 회원은 링크를 열고 카카오로 로그인하면 됩니다. 재발급하면 이전 링크는 사용할 수 없습니다.</p>
      <input aria-label="발급된 카카오 초대 링크" readOnly value={`${window.location.origin}/#invite=${result.code}`} className="w-full p-2 border rounded font-mono" onFocus={e => e.target.select()} />
      <button type="button" className="px-3 py-2 bg-stone-900 text-white rounded-lg" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/#invite=${result.code}`); setCopied(true); } catch { setError('복사하지 못했습니다. 위 링크를 선택해 복사해주세요.'); } }}>{copied ? '복사 완료' : '초대 링크 복사'}</button>
      <p>만료: {new Date(result.expiresAt).toLocaleString('ko-KR')} · 1회 사용</p>
    </div>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
  </div>;
};
