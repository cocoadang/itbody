import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdmin } from './adminAccountEndpoints';
import { safeId } from './memberAccess';
import { consumeLimit } from './securityRateLimit';
import { redirectForOrigin } from './kakaoHosting';

// Session journal: member/trainer comments and session photos/videos.
// All access goes through the Admin SDK after an explicit role check here, so these
// features do not depend on client-side Firestore or Storage rules.

export type CallerRole = 'CENTER_ADMIN' | 'TRAINER' | 'MEMBER';
export interface Caller { uid: string; role: CallerRole; centerId: string; trainerId?: string; memberId?: string; name: string }

export const MEDIA_LIMITS = { image: 15 * 1024 * 1024, video: 300 * 1024 * 1024 } as const;
export const MAX_MEDIA_PER_SESSION = 12;
export const MAX_COMMENT_LENGTH = 1000;

const now = () => new Date().toISOString();
const deny = (res: Response, status = 403, error = '접근 권한이 없습니다.') => res.status(status).json({ error });

export function mediaKind(contentType: unknown): 'image' | 'video' | null {
  if (typeof contentType !== 'string') return null;
  if (/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(contentType)) return 'image';
  if (/^video\/(mp4|quicktime|webm|3gpp|x-m4v)$/.test(contentType)) return 'video';
  return null;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp', 'video/x-m4v': 'm4v'
};

export function cleanText(value: unknown, max = MAX_COMMENT_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return text && text.length <= max ? text : null;
}

/** Pure permission check shared by every endpoint (unit-tested without a database). */
export function canAccessSession(caller: Caller, session: { centerId?: string; memberId?: string; trainerId?: string } | undefined, write: boolean): boolean {
  if (!session || session.centerId !== caller.centerId) return false;
  if (caller.role === 'CENTER_ADMIN') return true;
  if (caller.role === 'TRAINER') return !!caller.trainerId && session.trainerId === caller.trainerId;
  return !write && !!caller.memberId && session.memberId === caller.memberId;
}

export function canAccessMember(caller: Caller, member: { centerId?: string; trainerId?: string; memberId?: string } | undefined, memberId: string): boolean {
  if (!member || member.centerId !== caller.centerId) return false;
  if (caller.role === 'CENTER_ADMIN') return true;
  if (caller.role === 'TRAINER') return !!caller.trainerId && member.trainerId === caller.trainerId;
  return caller.memberId === memberId;
}

let bucketName: string | null | undefined;
function bucket() {
  if (bucketName === undefined) {
    try {
      const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));
      bucketName = typeof config.storageBucket === 'string' ? config.storageBucket : null;
    } catch { bucketName = null; }
  }
  const admin = getFirebaseAdmin();
  if (!admin || !bucketName) throw new Error('Storage unavailable');
  return getStorage(admin.app).bucket(bucketName);
}

async function resolveCaller(req: Request): Promise<Caller | null> {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const admin = getFirebaseAdmin();
  if (!bearer || !admin) return null;
  try {
    // Writes also check token revocation (an extra Auth API call); reads rely on the
    // signature/expiry plus the live account and binding checks below.
    const token = await admin.auth.verifyIdToken(bearer, req.method !== 'GET');
    if (token.portalAccount) {
      const centerId = token.portalCenterId, memberId = token.portalMemberId;
      if (!safeId(centerId) || !safeId(memberId)) return null;
      const [account, binding, member] = await Promise.all([
        admin.db.doc(`memberAccounts/${token.uid}`).get(),
        admin.db.doc(`memberAccounts/${token.uid}/centers/${centerId}`).get(),
        admin.db.doc(`members/${memberId}`).get()
      ]);
      const b = binding.data(), m = member.data();
      if (account.data()?.status !== 'ACTIVE' || b?.status !== 'ACTIVE' || b.uid !== token.uid || b.memberId !== memberId ||
        b.centerId !== centerId || m?.portalUid !== token.uid || m?.centerId !== centerId) return null;
      return { uid: token.uid, role: 'MEMBER', centerId, memberId, name: m?.name || '회원' };
    }
    const profile = (await admin.db.doc(`users/${token.uid}`).get()).data();
    if (!profile || !safeId(profile.centerId) || !['CENTER_ADMIN', 'TRAINER', 'MEMBER'].includes(profile.role)) return null;
    if (profile.role === 'MEMBER' && !safeId(profile.memberId)) return null;
    return { uid: token.uid, role: profile.role, centerId: profile.centerId, trainerId: profile.trainerId, memberId: profile.memberId, name: profile.name || '' };
  } catch { return null; }
}

async function withCaller(req: Request, res: Response, run: (caller: Caller) => Promise<unknown>) {
  const caller = await resolveCaller(req);
  if (!caller) return deny(res, 401, '로그인이 필요합니다.');
  try {
    // Reads are cheap and already scoped to the caller; only writes are rate limited.
    if (req.method !== 'GET' && !await consumeLimit('journal-minute:' + caller.uid, 60)) return deny(res, 429, '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
    await run(caller);
  } catch (err) {
    console.error('[journal]', (err as Error)?.message);
    if (!res.headersSent) res.status(500).json({ error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
}

const sessionRef = (id: string) => getFirebaseAdmin()!.db.doc(`ptSessions/${id}`);

export const PLAN_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Normalises a management plan from the trainer. Generous limits; nothing reasonable is rejected. */
export function cleanPlan(input: any) {
  if (!input || typeof input !== 'object') return null;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '');
  const weekly: Record<string, string> = {};
  for (const d of PLAN_DAYS) weekly[d] = text(input.weekly?.[d], 40);
  const p = typeof input.proteinPerKg === 'number' ? input.proteinPerKg : NaN;
  return {
    goals: text(input.goals, 5000),
    weekly,
    proteinPerKg: p >= 0.5 && p <= 3 ? Math.round(p * 10) / 10 : null, // optional legacy field
    cardio: text(input.cardio, 5000),
    notes: text(input.notes, 10000)
  };
}

function commentView(id: string, c: any) {
  return { commentId: id, sessionId: c.sessionId, sessionNumber: c.sessionNumber, memberId: c.memberId, authorRole: c.authorRole,
    authorName: c.authorName, text: c.text, createdAt: c.createdAt, readByStaffAt: c.readByStaffAt || null };
}

export function registerJournal(app: Express) {
  // Comments for every session of one member.
  app.get('/api/journal/comments', (req, res) => withCaller(req, res, async caller => {
    const memberId = req.query.memberId;
    if (!safeId(memberId)) return deny(res, 400, '회원을 지정해주세요.');
    const db = getFirebaseAdmin()!.db;
    const member = (await db.doc(`members/${memberId}`).get()).data();
    if (!canAccessMember(caller, member, memberId)) return deny(res);
    const snap = await db.collection('sessionComments').where('centerId', '==', caller.centerId).where('memberId', '==', memberId).limit(500).get();
    const comments = snap.docs.map(d => commentView(d.id, d.data())).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    res.json({ comments });
  }));

  app.post('/api/journal/comments', (req, res) => withCaller(req, res, async caller => {
    const { sessionId } = req.body || {};
    const text = cleanText(req.body?.text);
    if (!safeId(sessionId) || !text) return deny(res, 400, `댓글은 1~${MAX_COMMENT_LENGTH}자로 입력해주세요.`);
    const session = (await sessionRef(sessionId).get()).data();
    if (!canAccessSession(caller, session, false)) return deny(res);
    if (!await consumeLimit('journal-comment-day:' + caller.uid, 200, 86_400_000)) return deny(res, 429, '오늘 작성할 수 있는 댓글 수를 넘었습니다.');
    const isMember = caller.role === 'MEMBER';
    const data = {
      centerId: session!.centerId, memberId: session!.memberId, trainerId: session!.trainerId || '', sessionId,
      sessionNumber: session!.sessionNumber || 0, authorRole: isMember ? 'MEMBER' : 'STAFF', authorUid: caller.uid,
      authorName: isMember ? (session!.memberName || caller.name || '회원') : (caller.name || '트레이너'), text,
      createdAt: now(), readByStaffAt: isMember ? null : now()
    };
    const ref = await getFirebaseAdmin()!.db.collection('sessionComments').add(data);
    res.json({ comment: commentView(ref.id, data) });
  }));

  // Staff opened the member's journal: clear the "new comment" badge.
  app.post('/api/journal/comments/read', (req, res) => withCaller(req, res, async caller => {
    const { memberId } = req.body || {};
    if (caller.role === 'MEMBER' || !safeId(memberId)) return deny(res);
    const db = getFirebaseAdmin()!.db;
    const member = (await db.doc(`members/${memberId}`).get()).data();
    if (!canAccessMember(caller, member, memberId)) return deny(res);
    const snap = await db.collection('sessionComments').where('centerId', '==', caller.centerId).where('memberId', '==', memberId)
      .where('readByStaffAt', '==', null).limit(200).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { readByStaffAt: now() }));
    if (!snap.empty) await batch.commit();
    res.json({ updated: snap.size });
  }));

  // New member comments for the staff dashboard.
  app.get('/api/journal/unread', (req, res) => withCaller(req, res, async caller => {
    if (caller.role === 'MEMBER') return deny(res);
    const db = getFirebaseAdmin()!.db;
    let q = db.collection('sessionComments').where('centerId', '==', caller.centerId).where('readByStaffAt', '==', null);
    if (caller.role === 'TRAINER') {
      if (!caller.trainerId) return res.json({ comments: [] });
      q = q.where('trainerId', '==', caller.trainerId);
    }
    const snap = await q.limit(100).get();
    const items = snap.docs.map(d => ({ ...commentView(d.id, d.data()), memberName: d.data().authorName }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ comments: items });
  }));

  // Per-member management plan (goals, weekly split, nutrition, cardio).
  app.get('/api/journal/plan', (req, res) => withCaller(req, res, async caller => {
    const memberId = req.query.memberId;
    if (!safeId(memberId)) return deny(res, 400, '회원을 지정해주세요.');
    const db = getFirebaseAdmin()!.db;
    const [member, plan] = await Promise.all([db.doc(`members/${memberId}`).get(), db.doc(`memberPlans/${memberId}`).get()]);
    if (!canAccessMember(caller, member.data(), memberId)) return deny(res);
    const data = plan.data();
    res.json({ plan: data && data.centerId === caller.centerId ? data : null });
  }));

  app.post('/api/journal/plan', (req, res) => withCaller(req, res, async caller => {
    const { memberId } = req.body || {};
    if (caller.role === 'MEMBER' || !safeId(memberId)) return deny(res);
    const clean = cleanPlan(req.body?.plan);
    if (!clean) return deny(res, 400, '입력 내용을 확인해주세요.');
    const db = getFirebaseAdmin()!.db;
    const member = (await db.doc(`members/${memberId}`).get()).data();
    if (!canAccessMember(caller, member, memberId)) return deny(res);
    const plan = { ...clean, memberId, centerId: caller.centerId, updatedAt: now(), updatedByName: caller.name || '트레이너', updatedBy: caller.uid };
    await db.doc(`memberPlans/${memberId}`).set(plan);
    res.json({ plan });
  }));

  // Photos/videos: the browser uploads straight to Cloud Storage through a one-time resumable
  // session created here, so large videos never pass through Hosting/Cloud Run request limits.
  app.post('/api/journal/media/start', (req, res) => withCaller(req, res, async caller => {
    const { sessionId, contentType, size } = req.body || {};
    const kind = mediaKind(contentType);
    const origin = redirectForOrigin(req.headers.origin) ? new URL(redirectForOrigin(req.headers.origin)!).origin : null;
    if (!safeId(sessionId) || !kind || typeof size !== 'number' || size <= 0) return deny(res, 400, '사진 또는 영상 파일만 올릴 수 있습니다.');
    if (size > MEDIA_LIMITS[kind]) return deny(res, 413, kind === 'image' ? '사진은 15MB 이하만 올릴 수 있습니다.' : '영상은 300MB 이하만 올릴 수 있습니다.');
    if (!origin) return deny(res);
    const session = (await sessionRef(sessionId).get()).data();
    if (!canAccessSession(caller, session, true)) return deny(res);
    if ((session!.media || []).length >= MAX_MEDIA_PER_SESSION) return deny(res, 400, `한 회차에 최대 ${MAX_MEDIA_PER_SESSION}개까지 올릴 수 있습니다.`);
    if (!await consumeLimit('journal-upload-day:' + caller.uid, 300, 86_400_000)) return deny(res, 429, '오늘 올릴 수 있는 파일 수를 넘었습니다.');
    const mediaId = 'm' + randomUUID().replace(/-/g, '');
    const storagePath = `centers/${session!.centerId}/members/${session!.memberId}/sessions/${sessionId}/${mediaId}.${EXT[contentType]}`;
    const [uploadUrl] = await bucket().file(storagePath).createResumableUpload({ origin, metadata: { contentType, metadata: { sessionId, uploadedBy: caller.uid } } });
    await getFirebaseAdmin()!.db.doc(`journalUploads/${mediaId}`).set({ sessionId, storagePath, kind, contentType, uid: caller.uid, createdAt: now() });
    res.json({ mediaId, uploadUrl });
  }));

  app.post('/api/journal/media/finish', (req, res) => withCaller(req, res, async caller => {
    const { sessionId, mediaId } = req.body || {};
    const name = cleanText(req.body?.name, 200) || '';
    if (!safeId(sessionId) || !safeId(mediaId)) return deny(res, 400, '파일 정보를 확인할 수 없습니다.');
    const db = getFirebaseAdmin()!.db;
    const uploadRef = db.doc(`journalUploads/${mediaId}`);
    const [upload, session] = await Promise.all([uploadRef.get(), sessionRef(sessionId).get()]);
    const u = upload.data();
    if (!u || u.uid !== caller.uid || u.sessionId !== sessionId || !canAccessSession(caller, session.data(), true)) return deny(res);
    const file = bucket().file(u.storagePath);
    const [exists] = await file.exists();
    if (!exists) return deny(res, 400, '업로드가 완료되지 않았습니다. 다시 시도해주세요.');
    const [meta] = await file.getMetadata();
    const size = Number(meta.size || 0);
    if (meta.contentType !== u.contentType || size <= 0 || size > MEDIA_LIMITS[u.kind as 'image' | 'video']) {
      await file.delete({ ignoreNotFound: true });
      await uploadRef.delete();
      return deny(res, 400, '파일 형식이나 크기를 확인해주세요.');
    }
    const token = randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    const url = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(u.storagePath)}?alt=media&token=${token}`;
    const item = { mediaId, kind: u.kind, contentType: u.contentType, url, storagePath: u.storagePath, name, size, createdAt: now() };
    await sessionRef(sessionId).update({ media: FieldValue.arrayUnion(item), updatedAt: now() });
    await uploadRef.delete();
    res.json({ media: item });
  }));

  app.post('/api/journal/media/remove', (req, res) => withCaller(req, res, async caller => {
    const { sessionId, mediaId } = req.body || {};
    if (!safeId(sessionId) || !safeId(mediaId)) return deny(res, 400, '파일 정보를 확인할 수 없습니다.');
    const ref = sessionRef(sessionId);
    const session = (await ref.get()).data();
    if (!canAccessSession(caller, session, true)) return deny(res);
    const item = (session!.media || []).find((m: any) => m?.mediaId === mediaId);
    if (!item) return res.json({ removed: false });
    await ref.update({ media: FieldValue.arrayRemove(item), updatedAt: now() });
    await bucket().file(item.storagePath).delete({ ignoreNotFound: true });
    res.json({ removed: true });
  }));
}
