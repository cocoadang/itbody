import React, { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth } from '../firebase/config';
import { trainerRegistrationApi } from '../services/trainerRegistrationService';

export const TrainerSignup: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [centerId, setCenterId] = useState('');
  const [centers, setCenters] = useState<{ centerId: string; name: string }[]>([]);
  const [status, setStatus] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh(identity: User) {
    await identity.reload();
    const state = await trainerRegistrationApi('/api/trainer-registration/status', undefined, identity);
    setStatus(state.status); setVerified(state.verified);
    if (state.status === 'NONE' || state.status === 'REJECTED') {
      const result = await trainerRegistrationApi('/api/trainer-registration/centers', undefined, identity);
      setCenters(result.centers);
      if (result.centers.length === 1) setCenterId(result.centers[0].centerId);
    }
  }
  useEffect(() => {
    if (!auth) { setError('가입 서비스를 준비하지 못했습니다.'); return; }
    return onAuthStateChanged(auth, (identity) => {
      setUser(identity); setStatus('');
      if (identity) refresh(identity).catch((err) => setError(err.message));
    });
  }, []);
  const action = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); } catch (err: any) {
      setError(err?.code?.startsWith('auth/') ? '이메일과 비밀번호를 확인해주세요. 기존 가입자는 가입할 때 사용한 비밀번호를 입력해주세요.' : err.message || '처리하지 못했습니다.');
    } finally { setBusy(false); }
  };
  const openAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    await action(async () => {
      if (!auth) throw new Error('가입 서비스를 준비하지 못했습니다.');
      let identity: User;
      let created = false;
      try { identity = (await createUserWithEmailAndPassword(auth, email.trim(), password)).user; created = true; }
      catch (err: any) {
        if (err.code !== 'auth/email-already-in-use') throw err;
        identity = (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
      }
      setPassword('');
      if (created) { await sendEmailVerification(identity); setNotice('인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 아래에서 인증 상태를 확인해주세요.'); }
      await refresh(identity);
    });
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await action(async () => {
      if (!user) return;
      const result = await trainerRegistrationApi('/api/trainer-registration/request', { centerId, name: name.trim(), phone }, user);
      setStatus(result.status);
    });
  };
  const field = 'w-full mt-1 p-3 border border-stone-300 rounded-xl text-base';
  return (
    <main className="min-h-screen bg-stone-100 p-5 flex justify-center items-center">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 space-y-5">
        <h1 className="text-xl font-bold">트레이너 가입 신청</h1>
        <p className="text-sm text-stone-600">이메일 인증 → 센터 선택·신청 → 관리자 승인 후 이용할 수 있습니다.</p>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        {!user ? (
          <form onSubmit={openAccount} className="space-y-4">
            <label className="block text-sm">본인 이메일<input className={field} type="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="block text-sm">비밀번호<input className={field} type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <button disabled={busy} className="w-full bg-stone-900 text-white rounded-xl p-3 disabled:opacity-50">{busy ? '확인 중…' : '계정 만들기 / 신청 이어하기'}</button>
          </form>
        ) : (
          <>
            <p className="text-sm break-all">{user.email}</p>
            {status === 'PENDING' ? <p className="p-4 rounded-xl bg-amber-50 text-amber-900">센터 관리자 승인 대기 중입니다. 승인 전에는 회원·OT 정보에 접근할 수 없습니다.</p>
              : status === 'ACTIVE' || status === 'APPROVED' ? <div className="space-y-3"><p>승인되었습니다. 센터 업무를 시작할 수 있습니다.</p><a className="block text-center p-3 bg-stone-900 text-white rounded-xl" href="/">ITBODY 시작하기</a></div>
              : !status ? <p>신청 상태를 확인하고 있습니다.</p>
              : !verified ? <div className="space-y-3"><p className="text-sm">이메일 인증을 먼저 완료해주세요.</p><button disabled={busy} className="underline text-sm" onClick={() => action(async () => { await sendEmailVerification(user); setNotice('인증 메일을 다시 보냈습니다.'); })}>인증 메일 다시 받기</button></div>
              : <form onSubmit={submit} className="space-y-4">
                  {status === 'REJECTED' && <p className="text-sm text-rose-700">가입 신청이 반려되었습니다. 센터에 확인한 뒤 다시 신청할 수 있습니다.</p>}
                  <label className="block text-sm">이름<input required maxLength={100} className={field} value={name} onChange={(e) => setName(e.target.value)} /></label>
                  <label className="block text-sm">휴대폰 번호<input required type="tel" autoComplete="tel" maxLength={15} className={field} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
                  <label className="block text-sm">센터<select required className={field} value={centerId} onChange={(e) => setCenterId(e.target.value)}><option value="">센터 선택</option>{centers.map((center) => <option key={center.centerId} value={center.centerId}>{center.name}</option>)}</select></label>
                  <button disabled={busy} className="w-full bg-stone-900 text-white rounded-xl p-3 disabled:opacity-50">승인 신청</button>
                </form>}
            <button disabled={busy} className="w-full border border-stone-300 rounded-xl p-3 text-sm" onClick={() => action(() => refresh(user))}>인증·승인 상태 새로고침</button>
            <button disabled={busy} className="text-sm underline" onClick={() => action(async () => { await signOut(auth); setStatus(''); setVerified(false); })}>다른 이메일로 신청</button>
          </>
        )}
        <a className="block text-sm text-stone-500 underline" href="/">로그인 화면으로</a>
      </div>
    </main>
  );
};
