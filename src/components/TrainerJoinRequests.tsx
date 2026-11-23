import React, { useCallback, useEffect, useState } from 'react';
import { trainerRegistrationApi } from '../services/trainerRegistrationService';

interface PendingRequest { id: string; name: string; email: string; phone: string; createdAt: string }
export const TrainerJoinRequests: React.FC<{ onApproved: () => void }> = ({ onApproved }) => {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setError(''); const result = await trainerRegistrationApi('/api/admin/trainer-requests'); setRequests(result.requests); }
    catch (err: any) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const review = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setBusy(id); setError('');
    try { await trainerRegistrationApi(`/api/admin/trainer-requests/${encodeURIComponent(id)}/review`, { decision }); await load(); if (decision === 'APPROVED') onApproved(); }
    catch (err: any) { setError(err.message); }
    finally { setBusy(''); }
  };
  return <section className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
    <div className="flex justify-between items-center"><h2 className="font-semibold text-sm">트레이너 가입 승인 ({requests.length})</h2><button onClick={load} className="text-xs underline">새로고침</button></div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {!error && requests.length === 0 && <p className="text-xs text-stone-500">승인 대기 중인 신청이 없습니다.</p>}
    {requests.map((request) => <div key={request.id} className="flex flex-wrap justify-between gap-3 border-t border-stone-100 pt-3">
      <div className="min-w-0 text-sm"><strong>{request.name}</strong><p className="break-all text-xs text-stone-500">{request.email} · {request.phone}</p></div>
      <div className="flex gap-2"><button disabled={!!busy} onClick={() => review(request.id, 'REJECTED')} className="px-3 py-2 border rounded-lg text-xs disabled:opacity-50">반려</button><button disabled={!!busy} onClick={() => review(request.id, 'APPROVED')} className="px-3 py-2 bg-stone-900 text-white rounded-lg text-xs disabled:opacity-50">승인</button></div>
    </div>)}
  </section>;
};
