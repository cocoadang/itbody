import type { Express, Request, Response, NextFunction } from 'express';
import { getFirebaseAdmin, requireCenterAdmin } from './adminAccountEndpoints';
import { consumeLimit } from './securityRateLimit';

const safeId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const emailOf = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const fail = (res: Response, status: number, message: string) => res.status(status).json({ error: message });

export function validateTrainerApplication(body: any) {
  if (!body || Object.keys(body).some((key) => !['centerId', 'name', 'phone'].includes(key))) throw new Error('신청 정보를 확인해주세요.');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
  if (!safeId(body.centerId) || !name || name.length > 100 || !/^01\d{8,9}$/.test(phone)) throw new Error('센터, 이름, 휴대폰 번호를 확인해주세요.');
  return { centerId: body.centerId, name, phone };
}

/** Match an existing staff row; never replace an identity already linked to someone else. */
export function selectTrainerForApproval(rows: any[], applicant: { uid: string; email: string; name: string }) {
  const matches = rows.filter((t) => t.uid === applicant.uid || emailOf(t.loginEmail) === applicant.email || t.name?.trim() === applicant.name);
  const eligible = matches.filter((t) => (!t.uid || t.uid === applicant.uid) && (!t.loginEmail || emailOf(t.loginEmail) === applicant.email));
  if (matches.length !== eligible.length || eligible.length > 1) throw new Error('동일 이름 또는 이메일의 기존 계정 연결을 관리자에게 확인해주세요.');
  if (eligible[0]?.status === 'INACTIVE') throw new Error('퇴사 처리된 트레이너입니다. 재직 상태를 먼저 확인해주세요.');
  return eligible[0] || null;
}

export function registerTrainerRegistration(app: Express, deps = { getAdmin: getFirebaseAdmin, limit: consumeLimit, adminGuard: requireCenterAdmin }) {
  const applicant = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization || '';
      if (!header.startsWith('Bearer ')) return fail(res, 401, '로그인이 필요합니다.');
      const admin = deps.getAdmin();
      if (!admin) return fail(res, 503, '가입 서비스를 준비 중입니다.');
      const token = await admin.auth.verifyIdToken(header.slice(7), true);
      if (!safeId(token.uid) || token.portalAccount || token.firebase?.sign_in_provider !== 'password' || !token.email) return fail(res, 403, '직원 이메일 계정으로 로그인해주세요.');
      if (!await deps.limit('trainer-join:' + token.uid, 30)) return fail(res, 429, '잠시 후 다시 시도해주세요.');
      (req as any).applicant = { uid: token.uid, email: emailOf(token.email), verified: token.email_verified === true };
      next();
    } catch { return fail(res, 401, '로그인 상태를 다시 확인해주세요.'); }
  };

  const reviewerSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization || '';
      if (!header.startsWith('Bearer ')) return fail(res, 401, '로그인이 필요합니다.');
      const token = await deps.getAdmin()!.auth.verifyIdToken(header.slice(7), true);
      if (!await deps.limit('trainer-review:' + token.uid, 60)) return fail(res, 429, '잠시 후 다시 시도해주세요.');
      return deps.adminGuard(req, res, next);
    } catch { return fail(res, 401, '관리자 로그인 상태를 확인해주세요.'); }
  };

  app.get('/api/trainer-registration/centers', applicant, async (_req, res) => {
    try {
      const snap = await deps.getAdmin()!.db.collection('centers').limit(100).get();
      return res.json({ centers: snap.docs.filter((d) => d.data().trainerRegistrationEnabled !== false && d.data().name).map((d) => ({ centerId: d.id, name: String(d.data().name).slice(0, 100) })) });
    } catch { return fail(res, 503, '센터 목록을 불러오지 못했습니다.'); }
  });
  app.get('/api/trainer-registration/status', applicant, async (req, res) => {
    try {
      const { uid, verified } = (req as any).applicant;
      const db = deps.getAdmin()!.db;
      const [profile, request] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`trainerJoinRequests/${uid}`).get()]);
      return res.json({ verified, status: profile.exists ? 'ACTIVE' : request.data()?.status || 'NONE' });
    } catch { return fail(res, 503, '신청 상태를 확인하지 못했습니다.'); }
  });
  app.post('/api/trainer-registration/request', applicant, async (req, res) => {
    const actor = (req as any).applicant;
    if (!actor.verified) return fail(res, 403, '이메일 인증을 먼저 완료해주세요.');
    let input: ReturnType<typeof validateTrainerApplication>;
    try { input = validateTrainerApplication(req.body); } catch (err: any) { return fail(res, 400, err.message); }
    try {
      const db = deps.getAdmin()!.db;
      const result = await db.runTransaction(async (tx) => {
        const requestRef = db.doc(`trainerJoinRequests/${actor.uid}`);
        const [profile, center, existing] = await Promise.all([tx.get(db.doc(`users/${actor.uid}`)), tx.get(db.doc(`centers/${input.centerId}`)), tx.get(requestRef)]);
        if (profile.exists) throw new Error('이미 승인된 계정입니다. 로그인해주세요.');
        if (!center.exists || center.data()?.trainerRegistrationEnabled === false) throw new Error('가입 가능한 센터를 선택해주세요.');
        if (existing.data()?.status === 'PENDING') {
          if (existing.data()?.centerId !== input.centerId) throw new Error('이미 다른 센터에 승인 대기 중인 신청이 있습니다.');
          return 'PENDING';
        }
        tx.set(requestRef, { ...input, uid: actor.uid, email: actor.email, status: 'PENDING', createdAt: new Date().toISOString() });
        return 'PENDING';
      });
      return res.json({ status: result });
    } catch (err: any) { return fail(res, 409, err.message || '신청을 저장하지 못했습니다.'); }
  });

  app.get('/api/admin/trainer-requests', reviewerSession, async (req, res) => {
    try {
      const centerId = (req as any).caller.centerId;
      const snap = await deps.getAdmin()!.db.collection('trainerJoinRequests').where('centerId', '==', centerId).limit(200).get();
      return res.json({ requests: snap.docs.filter((d) => d.data().status === 'PENDING').map((d) => { const r = d.data(); return { id: d.id, name: r.name, email: r.email, phone: r.phone, createdAt: r.createdAt }; }) });
    } catch { return fail(res, 503, '승인 대기 목록을 불러오지 못했습니다.'); }
  });
  app.post('/api/admin/trainer-requests/:uid/review', reviewerSession, async (req, res) => {
    const { uid } = req.params;
    if (!safeId(uid) || !['APPROVED', 'REJECTED'].includes(req.body?.decision)) return fail(res, 400, '승인 요청을 확인해주세요.');
    try {
      const admin = deps.getAdmin()!;
      const caller = (req as any).caller;
      // Re-check the current Auth identity (not applicant-supplied data) before granting access.
      const identity = req.body.decision === 'APPROVED' ? await admin.auth.getUser(uid) : null;
      if (identity && (identity.disabled || !identity.emailVerified || !identity.email)) return fail(res, 409, '본인 이메일 인증 상태를 확인해주세요.');
      const db = admin.db;
      const result = await db.runTransaction(async (tx) => {
        const requestRef = db.doc(`trainerJoinRequests/${uid}`);
        const userRef = db.doc(`users/${uid}`);
        const [request, profile, reviewer] = await Promise.all([tx.get(requestRef), tx.get(userRef), tx.get(db.doc(`users/${caller.uid}`))]);
        const data = request.data();
        if (!data || data.centerId !== caller.centerId || reviewer.data()?.role !== 'CENTER_ADMIN' || reviewer.data()?.centerId !== caller.centerId) throw new Error('승인 권한이 없습니다.');
        if (data.status !== 'PENDING') return { status: data.status };
        if (profile.exists) throw new Error('이미 다른 계정 권한이 연결되어 있습니다.');
        if (data.uid !== uid || (identity && emailOf(identity.email) !== data.email)) throw new Error('신청 계정 정보가 변경되었습니다. 다시 신청해주세요.');
        const reviewedAt = new Date().toISOString();
        if (req.body.decision === 'REJECTED') {
          tx.update(requestRef, { status: 'REJECTED', reviewedByUid: caller.uid, reviewedAt });
          return { status: 'REJECTED' };
        }
        const trainers = await tx.get(db.collection('trainers').where('centerId', '==', caller.centerId));
        const existing = selectTrainerForApproval(trainers.docs.map((d) => ({ ...d.data(), id: d.id })), { uid, email: data.email, name: data.name });
        const trainerRef = existing ? db.doc(`trainers/${existing.id}`) : db.collection('trainers').doc();
        const trainerId = existing?.trainerId || trainerRef.id;
        if (existing && existing.trainerId !== trainerRef.id) throw new Error('기존 트레이너 식별 정보를 확인해주세요.');
        tx.set(trainerRef, { ...(existing ? {} : { trainerId, centerId: caller.centerId, name: data.name, phone: data.phone, specialty: '', role: 'TRAINER', status: 'ACTIVE', createdAt: reviewedAt }), uid, loginEmail: data.email, updatedAt: reviewedAt }, { merge: true });
        tx.set(userRef, { uid, role: 'TRAINER', centerId: caller.centerId, trainerId, email: data.email, name: existing?.name || data.name, createdAt: reviewedAt, updatedAt: reviewedAt });
        tx.update(requestRef, { status: 'APPROVED', trainerId, reviewedByUid: caller.uid, reviewedAt });
        return { status: 'APPROVED' };
      });
      return res.json(result);
    } catch (err: any) { return fail(res, 409, err.message || '승인 처리를 완료하지 못했습니다.'); }
  });
}
