import React, { useEffect, useState } from 'react';
import { memberApi } from '../services/memberAccessService';
import type { Member } from '../types';
export const MemberJoinRequests: React.FC<{members: Member[]; onApproved: () => void}> = ({ members, onApproved }) => {
  const [requests, setRequests] = useState<{id: string; name: string; phone: string; createdAt: string}[]>([]);
  const [selected, setSelected] = useState<Record<string,string>>({}), [confirmed, setConfirmed] = useState<Record<string,boolean>>({});
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = async () => {try {setRequests((await memberApi('/api/admin/member-requests')).requests);} catch (err: any) {setError(err.message);}};
  useEffect(() => {load();}, []);
  const review = async (id: string, action: 'APPROVE' | 'REJECT') => {
    setBusy(true); setError('');
    try {await memberApi('/api/admin/review-member-request', {id, action, memberId: selected[id], confirmed: confirmed[id] === true}); await load(); if (action === 'APPROVE') onApproved();}
    catch (err: any) {setError(err.message);} finally {setBusy(false);}
  };
  return <section className="bg-white border rounded-xl p-4 space-y-3">
    <div className="flex justify-between"><h2 className="font-bold">카카오 회원 연결 요청 ({requests.length})</h2><button type="button" disabled={busy} onClick={load} className="text-sm underline">새로고침</button></div>
    <p className="text-xs text-stone-500">요청자가 입력한 이름·번호입니다. 자동 인증된 정보가 아니므로 기존 등록 정보와 본인을 확인한 뒤 승인해주세요.</p>
    {requests.length === 0 && <p className="text-sm text-stone-500">승인 대기 중인 요청이 없습니다.</p>}
    {requests.map(r => <div key={r.id} className="border rounded-lg p-3 space-y-2">
      <p className="font-semibold">{r.name} · {r.phone}</p><p className="text-xs text-stone-500">{new Date(r.createdAt).toLocaleString('ko-KR')}</p>
      <select aria-label={`${r.name} 연결할 기존 회원`} value={selected[r.id] || ''} onChange={e => {setSelected({...selected,[r.id]:e.target.value});setConfirmed({...confirmed,[r.id]:false});}} className="w-full border rounded-lg p-2"><option value="">연결할 기존 회원을 직접 선택해주세요</option>{members.filter(m => !(m as any).kakaoLinked).map(m => <option key={m.memberId} value={m.memberId}>{m.name} · {m.phone}</option>)}</select>
      <label className="flex gap-2 text-xs"><input type="checkbox" checked={confirmed[r.id] || false} onChange={e => setConfirmed({...confirmed,[r.id]:e.target.checked})} />선택한 회원과 요청자의 본인 확인을 완료했습니다.</label>
      <div className="flex gap-2"><button type="button" disabled={busy || !selected[r.id] || !confirmed[r.id]} onClick={() => review(r.id,'APPROVE')} className="bg-stone-900 text-white px-3 py-2 rounded-lg disabled:opacity-50">회원 연결 승인</button><button type="button" disabled={busy} onClick={() => review(r.id,'REJECT')} className="border px-3 py-2 rounded-lg">거절</button></div>
    </div>)}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </section>;
};
