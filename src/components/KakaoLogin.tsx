import React, { useEffect, useRef, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase/config';
import { captureInvite, readInvite, setPrefetchedSession } from '../services/memberAccessService';

export const KakaoLogin: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);
  const complete = async (data: any) => {
    if (!data.customToken || !auth) throw new Error(data.error || '카카오 로그인에 실패했습니다.');
    setPrefetchedSession(data.uid, data.session);
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
      // Fetch the member screen code while the login is being verified.
      import('./member/MemberPortal').catch(() => undefined);
      setBusy(true);
      if (!authCode || !state) { setError('카카오 로그인이 취소되었거나 실패했습니다.'); setBusy(false); }
      else fetch('/api/auth/kakao/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: authCode, state }) })
        .then(r => r.json()).then(complete).catch((err: Error) => setError(err.message || '카카오 로그인에 실패했습니다. 다시 시도해주세요.')).finally(() => setBusy(false));
    }
    fetch('/api/auth/kakao/status').then(r => r.json()).then(data => { setEnabled(data.enabled === true); if (!callback) setPending(data.pending === true); }).catch(() => setEnabled(false));
  }, []);
  return <div className="space-y-3">
    <button type="button" disabled={!enabled || busy} onClick={() => window.location.assign('/api/auth/kakao/start?origin=' + encodeURIComponent(window.location.origin))} className="w-full rounded-xl bg-[#FEE500] text-[#191919] py-3 font-semibold text-sm disabled:opacity-50">{busy ? '로그인 확인 중…' : enabled ? '카카오로 로그인' : '카카오 로그인 준비 중'}</button>
    {invite && <p className="text-xs text-stone-600 bg-stone-50 p-3 rounded-xl">초대 링크를 확인했습니다. 카카오로 로그인하면 내 회원 정보가 자동으로 연결됩니다.</p>}
    {!invite && <p className="text-xs text-stone-600 bg-stone-50 p-3 rounded-xl">처음 이용하시나요? 카카오 로그인 → 센터 선택 → 회원 연결 요청 → 센터 승인 순서로 시작하세요. 초대 링크가 있으면 바로 연결됩니다.</p>}
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}

  </div>;
};

export const KakaoInvite: React.FC<{ memberId: string; memberName?: string; centerName?: string; linked?: boolean }> = ({ memberId, memberName, centerName, linked }) => {
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (linked) {
    return <span className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200">카카오 연결됨</span>;
  }

  const message = (url: string) =>
    `${memberName ? `${memberName}님, ` : ''}${centerName || '센터'} 수업 일지 초대입니다.\n아래 링크를 열고 카카오로 로그인하면 수업 기록을 볼 수 있어요. (7일간 유효)\n${url}`;

  const issue = async () => {
    setBusy(true); setNotice(''); setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('다시 로그인해주세요.');
      const response = await fetch('/api/admin/kakao-invite', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ memberId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '초대 링크를 만들지 못했습니다.');
      setLink({ url: `${window.location.origin}/#invite=${data.code}`, expiresAt: data.expiresAt });
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  // Phones: the share sheet lists KakaoTalk. PCs (Windows/Mac) show the OS share panel,
  // which has no KakaoTalk, so on PC the invite text is copied for pasting into a chat.
  const isPhone = typeof navigator !== 'undefined' && !!navigator.share &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const copyMessage = async () => {
    if (!link) return;
    setNotice(''); setError('');
    try { await navigator.clipboard.writeText(message(link.url)); setNotice('초대 문구를 복사했습니다. 카카오톡 대화방에 붙여넣기(Ctrl+V) 해서 보내주세요.'); }
    catch { setError('복사하지 못했습니다. 아래 링크를 선택해 복사해주세요.'); }
  };

  const share = async () => {
    if (!link) return;
    setNotice(''); setError('');
    if (!isPhone) return copyMessage();
    try {
      await navigator.share({ title: 'itbody 초대', text: message(link.url) });
    } catch (err: any) {
      if (err?.name !== 'AbortError') await copyMessage();
    }
  };

  const canShare = isPhone;
  return <div className="w-full text-xs space-y-2">
    {!link ? (
      <button type="button" onClick={issue} disabled={busy} className="px-4 py-2.5 rounded-xl bg-[#FEE500] text-[#191919] text-sm font-semibold disabled:opacity-50">{busy ? '만드는 중…' : '회원 초대 링크 만들기'}</button>
    ) : (
      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl space-y-2 max-w-md">
        <p className="text-stone-700">회원이 링크를 열고 카카오로 로그인하면 바로 연결됩니다. 1회용 · {new Date(link.expiresAt).toLocaleDateString('ko-KR')}까지 유효</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={share} className="px-4 py-2.5 rounded-xl bg-[#FEE500] text-[#191919] text-sm font-semibold">{canShare ? '카카오톡으로 보내기' : '카톡용 초대 문구 복사'}</button>
          {canShare && <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link.url); setNotice('링크를 복사했습니다.'); } catch { setError('복사하지 못했습니다.'); } }} className="px-3 py-2.5 rounded-xl border border-stone-300 bg-white text-sm">링크 복사</button>}
        </div>
        <input aria-label="초대 링크" readOnly value={link.url} className="w-full p-2 border rounded font-mono text-[11px] bg-white" onFocus={e => e.target.select()} />
      </div>
    )}
    {notice && <p className="text-emerald-700">{notice}</p>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
  </div>;
};
