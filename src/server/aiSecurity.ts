import type { Request, Response, NextFunction } from 'express';
import { getFirebaseAdmin } from './adminAccountEndpoints';
import { consumeLimit } from './kakaoAuth';

export async function requireAiAccess(req: Request, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!bearer) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const admin = getFirebaseAdmin();
  if (!admin) return res.status(503).json({ error: '인증 서비스를 이용할 수 없습니다.' });
  try {
    const token = await admin.auth.verifyIdToken(bearer, true);
    const profile = (await admin.db.doc(`users/${token.uid}`).get()).data();
    if (!profile || !['CENTER_ADMIN', 'TRAINER'].includes(profile.role) || !profile.centerId) return res.status(403).json({ error: '접근 권한이 없습니다.' });
    const memberId = req.body.memberId;
    if (typeof memberId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(memberId)) return res.status(400).json({ error: '회원을 지정해주세요.' });
    const member = (await admin.db.doc(`members/${memberId}`).get()).data();
    if (!member || member.centerId !== profile.centerId || (profile.role === 'TRAINER' && member.trainerId !== profile.trainerId)) return res.status(403).json({ error: '접근 권한이 없습니다.' });
    if (JSON.stringify(req.body).length > 32_000 || (req.body.rawMemo?.length || 0) > 8_000 || (req.body.trainerNotes?.length || 0) > 8_000) return res.status(413).json({ error: '입력 내용이 너무 깁니다.' });
    if (!await consumeLimit('ai-minute:' + token.uid, 5) || !await consumeLimit('ai-day:' + token.uid, 50, 86_400_000)) return res.status(429).json({ error: '호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' });
    return next();
  } catch { return res.status(401).json({ error: '인증 또는 접근 권한을 확인할 수 없습니다.' }); }
}
