import React, { useEffect, useState } from 'react';
import { memberApi } from '../services/memberAccessService';
import type { Member } from '../types';
export const MemberJoinRequests: React.FC<{members: Member[]; onApproved: () => void}> = ({ members, onApproved }) => {
  const [requests, setRequests] = useState<{id: string; name: string; phone: string; createdAt: string; matchMemberId?: string | null}[]>([]);
  const [selected, setSelected] = useState<Record<string,string>>({}), [confirmed, setConfirmed] = useState<Record<string,boolean>>({});
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = async () => {try {
    const list = (await memberApi('/api/admin/member-requests')).requests;
    setRequests(list);
    // Pre-select the member whose phone number matches the request.
    setSelected(prev => ({ ...Object.fromEntries(list.filter((r: any) => r.matchMemberId).map((r: any) => [r.id, r.matchMemberId])), ...prev }));
  } catch (err: any) {setError(err.message);}};
  useEffect(() => {load();}, []);
  const review = async (id: string, action: 'APPROVE' | 'REJECT' | 'CREATE') => {
    setBusy(true); setError('');
    try {await memberApi('/api/admin/review-member-request', {id, action, memberId: selected[id], confirmed: confirmed[id] === true}); await load(); if (action !== 'REJECT') onApproved();}
    catch (err: any) {setError(err.message);} finally {setBusy(false);}
  };
  if (requests.length === 0 && !error) return null;
  return <section className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2.5">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-amber-900">가입 확인 요청 {requests.length}건</h2><button type="button" disabled={busy} onClick={load} className="text-xs text-amber-800 underline">새로고침</button></div>
    <p className="text-xs text-amber-800">이미 등록된 번호로 가입 신청이 들어왔습니다. 본인이 맞으면 연결해주세요.</p>
    {requests.map(r => <div key={r.id} className="bg-white border border-stone-200 rounded-lg p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2"><p className="font-semibold text-stone-900">{r.name} <span className="font-normal text-stone-600 text-sm">{r.phone}</span></p><p className="text-[11px] text-stone-400 shrink-0">{new Date(r.createdAt).toLocaleDateString('ko-KR')}</p></div>
      <select aria-label={`${r.name} 연결할 기존 회원`} value={selected[r.id] || ''} onChange={e => {setSelected({...selected,[r.id]:e.target.value});setConfirmed({...confirmed,[r.id]:false});}} className="w-full border border-stone-300 rounded-lg px-2 py-2 text-sm bg-white"><option value="">연결할 회원 선택</option>{members.filter(m => !(m as any).kakaoLinked).map(m => <option key={m.memberId} value={m.memberId}>{m.name} · {m.phone}</option>)}</select>
      <label className="flex items-center gap-2 text-xs text-stone-700"><input type="checkbox" checked={confirmed[r.id] || false} onChange={e => setConfirmed({...confirmed,[r.id]:e.target.checked})} />본인 확인했습니다</label>
      <div className="grid grid-cols-3 gap-2 text-sm"><button type="button" disabled={busy || !selected[r.id] || !confirmed[r.id]} onClick={() => review(r.id,'APPROVE')} className="bg-stone-900 text-white py-2 rounded-lg font-semibold disabled:opacity-40">연결</button>{r.matchMemberId ? <span /> : <button type="button" disabled={busy} onClick={() => review(r.id,'CREATE')} className="border border-stone-900 py-2 rounded-lg font-semibold">새 회원 등록</button>}<button type="button" disabled={busy} onClick={() => review(r.id,'REJECT')} className="border border-stone-300 text-stone-600 py-2 rounded-lg">거절</button></div>
    </div>)}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </section>;
};
