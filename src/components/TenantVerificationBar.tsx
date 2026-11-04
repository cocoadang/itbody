import React, { useState } from 'react';
import { isDevSandbox } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { initializeDevSandbox } from '../services/dataService';
import type { UserRole } from '../types';

interface TenantVerificationBarProps { onDataChanged?: () => void; }
export const TenantVerificationBar: React.FC<TenantVerificationBarProps> = ({ onDataChanged }) => {
  const { selectDevRole, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewWidth, setPreviewWidth] = useState(375);
  const [showPreview, setShowPreview] = useState(false);
  const nestedPreview = isDevSandbox && new URLSearchParams(window.location.search).get('devViewport') === '1';
  if (!isDevSandbox) return null;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '테스트 작업 실패'); }
    finally { setBusy(false); }
  };
  return <aside aria-label="개발 테스트 도구" className="bg-amber-100 border-b border-amber-300 p-3 text-xs">
    <p className="font-bold mb-2">개발 테스트 · 가상 데이터 · Firebase 연결 없음</p>
    <div className="flex flex-wrap gap-2">
      {([['CENTER_ADMIN', '관리자'], ['TRAINER', '트레이너'], ['MEMBER', '회원 A']] as [UserRole, string][]).map(([role, name]) =>
        <button key={role} disabled={busy} className="border rounded bg-white px-3 py-2" onClick={() => run(() => selectDevRole(role))}>{name} 테스트</button>)}
      <button disabled={busy} className="border rounded bg-white px-3 py-2" onClick={() => run(() => selectDevRole('MEMBER', 2))}>회원 B 테스트</button>
      <button disabled={busy} className="border rounded bg-white px-3 py-2" onClick={() => run(logout)}>테스트 로그아웃</button>
      <button disabled={busy} className="border rounded bg-white px-3 py-2" onClick={() => run(async () => { await initializeDevSandbox(true); onDataChanged?.(); })}>가상 데이터 초기화</button>
    </div>
    {!nestedPreview && <div className="flex flex-wrap items-center gap-2 mt-2">
      <label>화면폭 검증 <select aria-label="테스트 화면폭" value={previewWidth} onChange={e => setPreviewWidth(Number(e.target.value))} className="bg-white border rounded p-1">
        {[320, 375, 390, 768, 1280].map(width => <option key={width} value={width}>{width}px</option>)}
      </select></label>
      <button className="border rounded bg-white px-3 py-2" onClick={() => setShowPreview(true)}>화면폭 미리보기 열기</button>
    </div>}
    {showPreview && <section aria-label="개발 화면폭 검증" className="fixed inset-2 z-[100] rounded-xl border bg-white shadow-xl flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <strong>가상 화면폭 {previewWidth}px</strong>
        <select aria-label="미리보기 화면폭" value={previewWidth} onChange={e => setPreviewWidth(Number(e.target.value))}>
          {[320, 375, 390, 768, 1280].map(width => <option key={width} value={width}>{width}px</option>)}
        </select>
        <button className="border rounded px-3 py-2" onClick={() => setShowPreview(false)}>화면폭 미리보기 닫기</button>
      </div>
      <div className="overflow-auto flex-1 bg-stone-200">
        <iframe title="개발 화면폭 미리보기" src={`${window.location.pathname}?devViewport=1`} style={{ width: previewWidth, height: '100%', minHeight: 500, border: 0 }} />
      </div>
    </section>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
  </aside>;
};
