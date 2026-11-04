import { auth } from '../firebase/config';
export interface CenterMembership { centerId: string; memberId: string; centerName: string; name: string }
export interface MemberJoinRequest { id: string; centerId: string; centerName: string; status: string }
export async function memberApi(path: string, body?: unknown) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('카카오로 로그인해주세요.');
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
}
// The Kakao exchange already returns the member's centers; keep it for the sign-in that
// follows so the app does not ask the server for the same list again.
let prefetchedSession: { uid: string; data: { memberships: CenterMembership[]; requests: MemberJoinRequest[] }; at: number } | null = null;
export function setPrefetchedSession(uid: unknown, data: unknown) {
  const d = data as any;
  prefetchedSession = typeof uid === 'string' && d && Array.isArray(d.memberships) && Array.isArray(d.requests) ? { uid, data: d, at: Date.now() } : null;
}
export function takePrefetchedSession(uid: string) {
  const s = prefetchedSession;
  prefetchedSession = null;
  return s && s.uid === uid && Date.now() - s.at < 60_000 ? s.data : null;
}
const INVITE_KEY = 'pt_kakao_invite';
export function readInvite() {
  try { const s = JSON.parse(sessionStorage.getItem(INVITE_KEY) || 'null'); return s && /^[A-Za-z0-9_-]{32}$/.test(s.code) && s.expiresAt > Date.now() ? s.code as string : ''; } catch { return ''; }
}
export function clearInvite() { try { sessionStorage.removeItem(INVITE_KEY); } catch {} }
export function captureInvite() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get('invite');
  if (code === null) return;
  window.history.replaceState({}, '', window.location.pathname + window.location.search);
  clearInvite();
  if (!/^[A-Za-z0-9_-]{32}$/.test(code)) throw new Error('올바른 초대 링크가 아닙니다.');
  try { sessionStorage.setItem(INVITE_KEY, JSON.stringify({ code, expiresAt: Date.now() + 24 * 60 * 60_000 })); }
  catch { throw new Error('초대 링크를 이용하려면 브라우저 저장 기능을 허용해주세요.'); }
}
