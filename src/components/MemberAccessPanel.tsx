import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { memberApi } from '../services/memberAccessService';
export const MemberAccessPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { memberships, memberRequests, refreshMemberSession, selectMemberCenter, logout, profileError } = useAuth();
  const [centers, setCenters] = useState<{centerId: string; name: string; address: string}[]>([]);
  const [search, setSearch] = useState(''), [centerId, setCenterId] = useState('');
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [consent, setConsent] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const loadCenters = async () => {
    try { const data = await memberApi('/api/member/centers?q=' + encodeURIComponent(search)); setCenters(data.centers); }
    catch (err: any) { setError(err.message); }
  };
  useEffect(() => { loadCenters(); }, []);
  const choose = async (id: string) => {
    setBusy(true); setError('');
    try { await selectMemberCenter(id); onClose?.(); }
    catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  const request = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await memberApi('/api/member/request-link', { centerId, name, phone, consent });
      if (result.linked) { await selectMemberCenter(centerId); onClose?.(); return; }
      await refreshMemberSession();
      setNotice('이미 센터에 등록된 번호입니다. 센터에서 본인 확인 후 연결해 드립니다.');
    }
    catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return <main className="max-w-lg mx-auto p-5 space-y-5 min-h-screen bg-stone-50">
    <div className="flex justify-between items-center"><h1 className="text-xl font-bold">내 센터 연결</h1><button onClick={logout} className="text-sm underline">로그아웃</button></div>
    <p className="text-sm text-stone-600">카카오 로그인은 완료됐습니다. 초대 링크를 받았다면 링크를 열어 바로 연결하고, 링크가 없다면 센터를 선택해 연결을 요청해주세요.</p>
    {memberships.length > 0 && <section className="bg-white p-4 rounded-xl space-y-3"><h2 className="font-semibold">연결된 센터</h2>{memberships.map(m => <button key={m.centerId} disabled={busy} onClick={() => choose(m.centerId)} className="block w-full text-left p-3 border rounded-lg">{m.centerName} <span className="text-xs text-stone-500">{m.name} · 입장하기</span></button>)}</section>}
    {memberRequests.length > 0 && <section className="bg-white p-4 rounded-xl space-y-2"><div className="flex justify-between"><h2 className="font-semibold">내 연결 요청</h2><button disabled={busy} className="text-sm underline" onClick={async () => {setBusy(true); try {await refreshMemberSession();} catch (err: any) {setError(err.message);} finally {setBusy(false);}}}>승인 상태 새로고침</button></div>{memberRequests.map(r => <p key={r.id} className="text-sm">{r.centerName} · {r.status === 'PENDING' ? '승인 대기' : r.status === 'APPROVED' ? '승인 완료 — 연결된 센터에서 입장해주세요' : '연결 거절 — 센터에 문의해주세요'}</p>)}</section>}
    <form onSubmit={request} className="bg-white p-4 rounded-xl space-y-3">
      <h2 className="font-semibold">다른 센터 연결 요청</h2>
      <div className="flex gap-2"><input aria-label="센터 검색" value={search} onChange={e => setSearch(e.target.value)} placeholder="센터 이름 또는 주소" className="w-full border p-2 rounded-lg" /><button type="button" onClick={loadCenters} className="shrink-0 border p-2 rounded-lg">검색</button></div>
      <label className="block text-sm">이용 중인 센터<select required aria-label="이용 중인 센터" value={centerId} onChange={e => setCenterId(e.target.value)} className="w-full border p-2 rounded-lg mt-1"><option value="">센터를 선택해주세요</option>{centers.filter(c => !memberships.some(m => m.centerId === c.centerId)).map(c => <option key={c.centerId} value={c.centerId}>{c.name}{c.address ? ' · ' + c.address : ''}</option>)}</select></label>
      {!centers.length && <p className="text-xs text-stone-500">검색되는 센터가 없다면 관리자에게 초대 링크를 요청해주세요.</p>}
      <label className="block text-sm">회원 이름<input required maxLength={60} value={name} onChange={e => setName(e.target.value)} className="w-full border p-2 rounded-lg mt-1" /></label>
      <label className="block text-sm">센터에 등록한 휴대폰 번호<input required type="tel" maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} className="w-full border p-2 rounded-lg mt-1" /></label>
      <label className="flex gap-2 text-xs text-stone-600"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />선택한 센터에 이름과 휴대폰 번호를 전달하고 회원으로 가입합니다.</label>
      <p className="text-xs text-stone-500">처음 등록하는 분은 바로 가입됩니다. 센터에 이미 등록된 번호라면 기존 기록 보호를 위해 센터 확인 후 연결됩니다.</p>
      <button disabled={busy || !consent || !centerId} className="w-full bg-stone-900 text-white p-3 rounded-lg disabled:opacity-50">{busy ? '처리 중…' : '회원 연결 요청'}</button>
    </form>
    {(error || profileError) && <p role="alert" className="text-sm text-rose-700">{error || profileError}</p>}{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {onClose && <button onClick={onClose} className="w-full border p-3 rounded-lg">현재 센터로 돌아가기</button>}
  </main>;
};
