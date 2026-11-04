import type { Express, Request, Response } from 'express';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { getFirebaseAdmin, requireCenterAdmin } from './adminAccountEndpoints';
import { consumeLimit } from './securityRateLimit';
export { consumeLimit } from './securityRateLimit';
import { ensureKakaoAccount, memberToken, bindMember, requireMemberAccount } from './memberAccess';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const random = () => randomBytes(24).toString('base64url');
const safeId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
const cookie = (req: Request, name: string) => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || '';
const setCookie = (res: Response, name: string, value: string, maxAge: number) => res.cookie(name, value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/kakao', maxAge });
// Log only bounded classifications. Never log request bodies, OAuth codes, cookies, tokens or raw SDK errors.
export function kakaoFailure(res: Response, stage: string, err?: any) {
  const reference = randomBytes(6).toString('hex');
  const cause = err?.cause || err;
  const message = typeof cause?.message === 'string' ? cause.message : '';
  const rawCode = cause?.code;
  const errorCode = typeof rawCode === 'string' && /^[A-Za-z0-9_/-]{1,64}$/.test(rawCode) ? rawCode : typeof rawCode === 'number' ? `grpc-${rawCode}` : 'UNKNOWN';
  const actualStage = ['MEMBERSHIPS', 'FIREBASE_TOKEN'].includes(err?.loginStage) ? err.loginStage : stage;
  const reason = /has not been used|SERVICE_DISABLED|is disabled.*API|API.*disabled/i.test(message) ? 'API_DISABLED' :
    actualStage === 'FIREBASE_TOKEN' && /iam\.serviceAccounts\.signBlob/i.test(message) ? 'TOKEN_SIGN_PERMISSION' :
    /permission|insufficient-permission|PERMISSION_DENIED/i.test(message + ' ' + errorCode) ? 'PERMISSION_DENIED' :
    /deadline|timeout|timed out/i.test(message) ? 'TIMEOUT' : 'FAILED';
  const code = reason === 'TOKEN_SIGN_PERMISSION' ? reason : `${actualStage}_${reason}`;
  console.error(JSON.stringify({ severity: 'ERROR', event: 'KAKAO_LOGIN_FAILURE', message: 'Kakao login failed', stage: actualStage, errorCode, reason, reference }));
  const description = actualStage === 'STATE' ? '카카오 로그인 세션을 확인할 수 없습니다. 로그인 버튼을 다시 눌러주세요.' :
    actualStage === 'KAKAO_TOKEN' || actualStage === 'KAKAO_PROFILE' ? '카카오 인증을 완료하지 못했습니다. 다시 로그인해주세요.' :
    actualStage === 'FIREBASE_TOKEN' ? '카카오 인증 후 로그인 토큰 발급에 실패했습니다. 관리자에게 아래 오류 코드를 전달해주세요.' :
    '로그인 계정 준비 중 오류가 발생했습니다. 관리자에게 아래 오류 코드를 전달해주세요.';
  return res.status(actualStage === 'STATE' ? 400 : 503).json({ error: `${description} (오류: ${code}, 확인번호: ${reference})`, code, reference });
}

const genericError = (res: Response) => res.status(400).json({ error: '인증 또는 초대 코드 확인에 실패했습니다. 다시 시도하거나 관리자에게 문의해주세요.' });

export function registerKakaoAuth(app: Express) {
  const settings = () => {
    const key = process.env.KAKAO_REST_API_KEY;
    const secret = process.env.KAKAO_CLIENT_SECRET;
    const uri = process.env.KAKAO_REDIRECT_URI;
    if (!key || !secret || !uri || !/^https:\/\//.test(uri)) return null;
    return { key, secret, uri };
  };
  app.use(['/api/auth/kakao/exchange', '/api/auth/kakao/link', '/api/admin/kakao-invite'], (req, res, next) => {
    if (req.method !== 'POST') return next();
    const config = settings();
    if (!config || req.headers.origin !== new URL(config.uri).origin) return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
    return next();
  });
  app.get('/api/auth/kakao/status', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ enabled: !!settings(), pending: !!cookie(req, 'pt_kakao_pending') });
  });
  app.post('/api/admin/kakao-invite', requireCenterAdmin, async (req, res) => {
    try {
      const admin = getFirebaseAdmin()!;
      const caller = (req as any).caller;
      const memberId = req.body.memberId;
      if (!safeId(memberId)) return genericError(res);
      if (!await consumeLimit('invite:' + caller.uid, 10)) return res.status(429).json({ error: '잠시 후 다시 시도해주세요.' });
      const code = random();
      const codeHash = hash(code);
      const expiresAt = Date.now() + 24 * 60 * 60_000;
      await admin.db.runTransaction(async tx => {
        const ref = admin.db.doc(`members/${memberId}`);
        const member = (await tx.get(ref)).data();
        if (!member || member.centerId !== caller.centerId || member.kakaoLinked) throw new Error('Denied');
        if (member.uid) {
          const profile = (await tx.get(admin.db.doc(`users/${member.uid}`))).data();
          if (!profile || profile.role !== 'MEMBER' || profile.memberId !== memberId || profile.centerId !== caller.centerId) throw new Error('Denied');
        }
        tx.set(admin.db.doc(`memberInvites/${codeHash}`), { memberId, centerId: caller.centerId, issuedBy: caller.uid, expiresAt, used: false });
        tx.update(ref, { activeInviteHash: codeHash });
        tx.set(admin.db.collection('securityAuditLogs').doc(), { action: 'KAKAO_INVITE', actor: caller.uid, memberId, centerId: caller.centerId, at: new Date().toISOString() });
      });
      return res.set('Cache-Control', 'no-store').json({ code, expiresAt });
    } catch { return genericError(res); }
  });
  app.get('/api/auth/kakao/start', async (req, res) => {
    try {
      const config = settings();
      if (!config) return res.status(503).send('카카오 로그인을 준비 중입니다. 이메일 로그인을 이용해주세요.');
      if (!await consumeLimit('oauth:' + req.ip, 30)) return res.status(429).send('잠시 후 다시 시도해주세요.');
      const state = random();
      await getFirebaseAdmin()!.db.doc(`kakaoOAuthStates/${hash(state)}`).set({ expiresAt: Date.now() + 10 * 60_000, used: false });
      setCookie(res, 'pt_kakao_state', state, 10 * 60_000);
      const params = new URLSearchParams({ client_id: config.key, redirect_uri: config.uri, response_type: 'code', state });
      return res.redirect('https://kauth.kakao.com/oauth/authorize?' + params);
    } catch { return res.status(503).send('로그인 서비스를 일시적으로 이용할 수 없습니다.'); }
  });
  app.post('/api/auth/kakao/exchange', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let stage = 'CONFIGURATION';
    try {
      const config = settings();
      const admin = getFirebaseAdmin();
      if (!config || !admin) return kakaoFailure(res, stage);
      stage = 'STATE';
      const { code, state } = req.body;
      const stored = cookie(req, 'pt_kakao_state');
      if (!config || !admin || typeof state !== 'string' || state.length > 100 || typeof code !== 'string' || code.length > 2048 || !stored || stored.length !== state.length || !timingSafeEqual(Buffer.from(stored), Buffer.from(state))) return kakaoFailure(res, stage);
      await admin.db.runTransaction(async tx => {
        const ref = admin.db.doc(`kakaoOAuthStates/${hash(state)}`);
        const data = (await tx.get(ref)).data();
        if (!data || data.used || data.expiresAt < Date.now()) throw new Error('State');
        tx.update(ref, { used: true });
      });
      setCookie(res, 'pt_kakao_state', '', 0);
      stage = 'KAKAO_TOKEN';
      const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.key, client_secret: config.secret, redirect_uri: config.uri, code }), signal: AbortSignal.timeout(10_000) });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.access_token) return kakaoFailure(res, stage);
      stage = 'KAKAO_PROFILE';
      const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', { headers: { Authorization: `Bearer ${tokenData.access_token}` }, signal: AbortSignal.timeout(10_000) });
      const userData = await userResponse.json();
      if (!userResponse.ok || !Number.isSafeInteger(userData.id) || userData.id <= 0) return kakaoFailure(res, stage);
      const kakaoId = String(userData.id);
      stage = 'FIREBASE_ACCOUNT';
      const uid = await ensureKakaoAccount(kakaoId);
      setCookie(res, 'pt_kakao_pending', '', 0);
      stage = 'FIREBASE_LOGIN';
      return res.json({ customToken: await memberToken(uid), memberAccount: true });
    } catch (err) { return kakaoFailure(res, stage, err); }
  });
  app.post('/api/auth/kakao/link', requireMemberAccount, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const uid = (req as any).memberUid, code = req.body.inviteCode;
      if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(code)) return genericError(res);
      if (!await consumeLimit('link:' + uid, 5, 10 * 60_000)) return res.status(429).json({ error: '잠시 후 다시 시도해주세요.' });
      const codeHash = hash(code), invite = (await getFirebaseAdmin()!.db.doc(`memberInvites/${codeHash}`).get()).data();
      if (!invite) return genericError(res);
      await bindMember(uid, invite.memberId, invite.centerId, uid, { inviteHash: codeHash });
      return res.json({ customToken: await memberToken(uid, invite.centerId) });
    } catch { return genericError(res); }
  });
}
