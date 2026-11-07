import { redirectForOrigin } from './kakaoHosting';
import type { Express, Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { getFirebaseAdmin, requireCenterAdmin } from './adminAccountEndpoints';
import { consumeLimit } from './securityRateLimit';
export const safeId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
const requestId = (uid: string, centerId: string) => createHash('sha256').update(JSON.stringify([uid, centerId])).digest('hex');
const fail = (res: Response, status = 400) => res.status(status).json({ error: '연결 정보를 확인할 수 없습니다. 관리자에게 문의해주세요.' });
const now = () => new Date().toISOString();
const bindingRef = (uid: string, centerId: string) => getFirebaseAdmin()!.db.doc(`memberAccounts/${uid}/centers/${centerId}`);

export async function requireMemberAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return fail(res, 401);
    const admin = getFirebaseAdmin()!;
    const decoded = await admin.auth.verifyIdToken(header.slice(7), true);
    let [profile, account] = await Promise.all([admin.db.doc(`users/${decoded.uid}`).get(), admin.db.doc(`memberAccounts/${decoded.uid}`).get()]);
    // A signed-in Kakao member whose account records were removed (e.g. data cleanup) gets
    // fresh, unlinked records instead of a dead end. The token proves the Kakao login.
    const kakaoId = /^kakao_(\d{1,20})$/.exec(decoded.uid)?.[1];
    if (kakaoId && decoded.portalAccount === true && !profile.exists && !account.exists) {
      await ensureKakaoAccount(kakaoId);
      [profile, account] = await Promise.all([admin.db.doc(`users/${decoded.uid}`).get(), admin.db.doc(`memberAccounts/${decoded.uid}`).get()]);
    }
    if (profile.data()?.role !== 'MEMBER' || !account.exists || account.data()?.status !== 'ACTIVE') return fail(res, 403);
    (req as any).memberUid = decoded.uid;
    return next();
  } catch { return fail(res, 401); }
}

// Upgrade only a previously verified legacy Kakao link. No name/email matching.
export async function ensureKakaoAccount(kakaoId: string) {
  const admin = getFirebaseAdmin()!;
  const identityRef = admin.db.doc(`kakaoIdentities/${kakaoId}`);
  let identity = (await identityRef.get()).data();
  const uid = identity?.uid || `kakao_${kakaoId}`;
  if (!safeId(uid)) throw new Error('Denied');
  if (!identity) {
    try { await admin.auth.createUser({ uid }); } catch (err: any) { if (err.code !== 'auth/uid-already-exists') throw err; }
  }
  if ((await admin.auth.getUser(uid)).disabled) throw new Error('Disabled');
  await admin.db.runTransaction(async tx => {
    const userRef = admin.db.doc(`users/${uid}`), accountRef = admin.db.doc(`memberAccounts/${uid}`);
    const [i, u, a] = await Promise.all([tx.get(identityRef), tx.get(userRef), tx.get(accountRef)]);
    const data = i.data(), profile = u.data();
    if ((data && data.uid !== uid) || (u.exists && profile?.role !== 'MEMBER') || (a.exists && (a.data()?.kakaoId !== kakaoId || a.data()?.status !== 'ACTIVE'))) throw new Error('Denied');
    let legacy: FirebaseFirestore.DocumentSnapshot | null = null;
    let binding: FirebaseFirestore.DocumentSnapshot | null = null;
    if (data?.memberId && data?.centerId && !a.exists) {
      if (!safeId(data.memberId) || !safeId(data.centerId)) throw new Error('Denied');
      [legacy, binding] = await Promise.all([tx.get(admin.db.doc(`members/${data.memberId}`)), tx.get(bindingRef(uid, data.centerId))]);
      const md = legacy.data();
      if (!md || md.uid !== uid || md.centerId !== data.centerId || profile?.memberId !== data.memberId || profile?.centerId !== data.centerId || (md.portalUid && md.portalUid !== uid)) throw new Error('Denied');
    }
    if (!i.exists) tx.create(identityRef, { uid, createdAt: now() });
    if (!u.exists) tx.create(userRef, { role: 'MEMBER', centerId: '', name: '회원', createdAt: now() });
    if (!a.exists) tx.create(accountRef, { kakaoId, status: 'ACTIVE', createdAt: now() });
    if (legacy && data) {
      if (!binding?.exists) tx.create(bindingRef(uid, data.centerId), { uid, role: 'MEMBER', centerId: data.centerId, memberId: data.memberId, status: 'ACTIVE', createdAt: now() });
      tx.update(legacy.ref, { portalUid: uid, kakaoLinked: true });
    }
  });
  return uid;
}

export async function listMemberships(uid: string) {
  const admin = getFirebaseAdmin()!;
  const snap = await admin.db.collection(`memberAccounts/${uid}/centers`).limit(50).get();
  const results = await Promise.all(snap.docs.map(async d => {
    const b = d.data();
    if (b.status !== 'ACTIVE' || b.uid !== uid || !safeId(b.memberId) || b.centerId !== d.id) return null;
    const [member, center] = await Promise.all([admin.db.doc(`members/${b.memberId}`).get(), admin.db.doc(`centers/${d.id}`).get()]);
    const md = member.data();
    if (!md || md.portalUid !== uid || md.centerId !== d.id) return null;
    return { centerId: d.id, memberId: b.memberId, centerName: center.data()?.name || d.id, name: md.name || '회원' };
  }));
  return results.filter((v): v is NonNullable<typeof v> => v !== null);
}
export async function memberSession(uid: string) {
  const db = getFirebaseAdmin()!.db;
  const [requests, memberships] = await Promise.all([
    db.collection('memberJoinRequests').where('uid', '==', uid).limit(50).get(),
    listMemberships(uid)
  ]);
  const safeRequests = await Promise.all(requests.docs.map(async d => { const r = d.data(); return { id: d.id, centerId: r.centerId, centerName: (await db.doc(`centers/${r.centerId}`).get()).data()?.name || r.centerId, status: r.status }; }));
  return { memberships, requests: safeRequests };
}

export async function memberToken(uid: string, centerId?: string, known?: Awaited<ReturnType<typeof listMemberships>>) {
  let memberships: Awaited<ReturnType<typeof listMemberships>>;
  try { memberships = known || await listMemberships(uid); }
  catch (cause) { throw Object.assign(new Error('Membership lookup failed'), { loginStage: 'MEMBERSHIPS', cause }); }
  const chosen = centerId ? memberships.find(m => m.centerId === centerId) : memberships.length === 1 ? memberships[0] : undefined;
  if (centerId && !chosen) throw new Error('Denied');
  try {
    return await getFirebaseAdmin()!.auth.createCustomToken(uid, { portalAccount: true, portalCenterId: chosen?.centerId || '', portalMemberId: chosen?.memberId || '' });
  } catch (cause) { throw Object.assign(new Error('Token signing failed'), { loginStage: 'FIREBASE_TOKEN', cause }); }
}

// Invite and approval share the same atomic binding invariants.
export async function bindMember(uid: string, memberId: string, centerId: string, actor: string, source: { inviteHash?: string; requestId?: string }) {
  const admin = getFirebaseAdmin()!;
  if (!safeId(uid) || !safeId(memberId) || !safeId(centerId)) throw new Error('Denied');
  if ((await admin.auth.getUser(uid)).disabled) throw new Error('Disabled');
  await admin.db.runTransaction(async tx => {
    const memberRef = admin.db.doc(`members/${memberId}`), accountRef = admin.db.doc(`memberAccounts/${uid}`), userRef = admin.db.doc(`users/${uid}`);
    const evidenceRef = source.inviteHash ? admin.db.doc(`memberInvites/${source.inviteHash}`) : admin.db.doc(`memberJoinRequests/${source.requestId}`);
    const [m, a, u, binding, evidence] = await Promise.all([tx.get(memberRef), tx.get(accountRef), tx.get(userRef), tx.get(bindingRef(uid, centerId)), tx.get(evidenceRef)]);
    const md = m.data(), ed = evidence.data();
    if (!md || md.centerId !== centerId || !a.exists || a.data()?.status !== 'ACTIVE' || u.data()?.role !== 'MEMBER' || (binding.exists && binding.data()?.memberId !== memberId) || (md.portalUid && md.portalUid !== uid) || (md.kakaoLinked && !md.portalUid)) throw new Error('Denied');
    if (source.inviteHash) {
      if (!ed || ed.used || ed.expiresAt < Date.now() || ed.memberId !== memberId || ed.centerId !== centerId || md.activeInviteHash !== source.inviteHash) throw new Error('Denied');
    } else if (!ed || ed.status !== 'PENDING' || ed.uid !== uid || ed.centerId !== centerId) throw new Error('Denied');
    // Existing email account remains intact and cannot be a staff account.
    if (md.uid) {
      if (!safeId(md.uid)) throw new Error('Denied');
      const old = (await tx.get(admin.db.doc(`users/${md.uid}`))).data();
      if (!old || old.role !== 'MEMBER' || old.memberId !== memberId || old.centerId !== centerId) throw new Error('Denied');
    }
    if (binding.exists && binding.data()?.status !== 'ACTIVE') throw new Error('Denied');
    tx.set(bindingRef(uid, centerId), { uid, role: 'MEMBER', centerId, memberId, status: 'ACTIVE', createdAt: binding.data()?.createdAt || now(), updatedAt: now() });
    tx.update(memberRef, { portalUid: uid, kakaoLinked: true, activeInviteHash: null, updatedAt: now() });
    tx.update(evidenceRef, source.inviteHash ? { used: true, usedBy: uid } : { status: 'APPROVED', memberId, reviewedBy: actor, reviewedAt: now() });
    if (source.requestId) tx.set(admin.db.doc(`centers/${centerId}/memberJoinRequests/${source.requestId}`), { status: 'APPROVED', reviewedAt: now() }, { merge: true });
    tx.set(admin.db.collection('securityAuditLogs').doc(), { action: source.inviteHash ? 'KAKAO_LINK' : 'MEMBER_REQUEST_APPROVED', uid, memberId, centerId, actor, at: now() });
  });
}

const digits = (v: unknown) => String(v || '').replace(/\D/g, '');
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** Creates a fresh member record from a join request (nothing existing is exposed). */
async function createMemberFromRequest(centerId: string, name: string, phone: string, source: string) {
  const db = getFirebaseAdmin()!.db;
  const memberId = 'mem-' + randomBytes(6).toString('hex');
  await db.doc(`members/${memberId}`).set({
    memberId, centerId, trainerId: '', name, gender: 'OTHER', birthDate: '', phone, email: null, uid: null,
    startDate: todayKst(), status: 'ACTIVE', notes: '', selfRegistered: source === 'SELF', createdAt: now(), updatedAt: now()
  });
  return memberId;
}

/**
 * Self sign-up: when no member of the center has this phone number, the requester gets a new,
 * empty member record and is linked at once. If the number already belongs to a member, the
 * request waits for staff approval (the number is not verified, so existing records stay protected).
 */
async function autoRegister(uid: string, centerId: string, requestId: string, name: string, phone: string) {
  const db = getFirebaseAdmin()!.db;
  const members = await db.collection('members').where('centerId', '==', centerId).limit(5000).get();
  const match = members.docs.find(d => digits(d.data().phone) === digits(phone));
  if (match) {
    const patch = { matchMemberId: match.id };
    await Promise.all([db.doc(`memberJoinRequests/${requestId}`).set(patch, { merge: true }), db.doc(`centers/${centerId}/memberJoinRequests/${requestId}`).set(patch, { merge: true })]);
    return false;
  }
  const memberId = await createMemberFromRequest(centerId, name, phone, 'SELF');
  try {
    await bindMember(uid, memberId, centerId, uid, { requestId });
  } catch (err) {
    await db.doc(`members/${memberId}`).delete();
    throw err;
  }
  await db.collection('securityAuditLogs').add({ action: 'MEMBER_SELF_REGISTERED', uid, memberId, centerId, at: now() });
  return true;
}

export function registerMemberAccess(app: Express) {
  app.use('/api/member', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST') {
      const uri = process.env.KAKAO_REDIRECT_URI;
      if (!uri || !redirectForOrigin(req.headers.origin)) return fail(res, 403);
    }
    return next();
  }, requireMemberAccount);
  app.get('/api/member/session', async (req, res) => {
    try {
      return res.json(await memberSession((req as any).memberUid));
    } catch { return fail(res, 503); }
  });
  app.get('/api/member/centers', async (req, res) => {
    try {
      if (!await consumeLimit('directory:' + (req as any).memberUid, 20)) return fail(res, 429);
      const q = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
      const snap = await getFirebaseAdmin()!.db.collection('centers').limit(100).get();
      const centers = snap.docs.filter(d => d.data().memberRegistrationEnabled !== false && d.data().name).map(d => ({ centerId: d.id, name: String(d.data().name).slice(0, 100), address: typeof d.data().address === 'string' ? d.data().address.slice(0, 200) : '' })).filter(c => !q || c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)).slice(0, 20);
      return res.json({ centers });
    } catch { return fail(res, 503); }
  });
  app.post('/api/member/select-center', async (req, res) => {
    try {
      if (!safeId(req.body.centerId)) return fail(res);
      return res.json({ customToken: await memberToken((req as any).memberUid, req.body.centerId) });
    } catch { return fail(res, 403); }
  });
  app.post('/api/member/request-link', async (req, res) => {
    try {
      const uid = (req as any).memberUid, { centerId, name, phone, consent } = req.body;
      const cleanName = typeof name === 'string' ? name.trim() : '';
      const cleanPhone = typeof phone === 'string' ? phone.replace(/[ -]/g, '') : '';
      if (!safeId(centerId) || cleanName.length < 2 || cleanName.length > 60 || !/^\+?[0-9]{8,15}$/.test(cleanPhone) || consent !== true) return fail(res);
      if (!await consumeLimit('join:' + uid, 5, 60 * 60_000)) return fail(res, 429);
      const admin = getFirebaseAdmin()!, id = requestId(uid, centerId);
      await admin.db.runTransaction(async tx => {
        const ref = admin.db.doc(`memberJoinRequests/${id}`);
        const [center, binding, existing] = await Promise.all([tx.get(admin.db.doc(`centers/${centerId}`)), tx.get(bindingRef(uid, centerId)), tx.get(ref)]);
        if (!center.exists || center.data()?.memberRegistrationEnabled === false || binding.exists) throw new Error('Denied');
        if (existing.data()?.status === 'PENDING') return;
        const data = { uid, centerId, name: cleanName, phone: cleanPhone, status: 'PENDING', createdAt: now(), consentAt: now() };
        tx.set(ref, data);
        tx.set(admin.db.doc(`centers/${centerId}/memberJoinRequests/${id}`), data);
        tx.set(admin.db.collection('securityAuditLogs').doc(), { action: 'MEMBER_LINK_REQUEST', uid, centerId, at: now() });
      });
      if (await autoRegister(uid, centerId, id, cleanName, cleanPhone)) {
        return res.json({ ok: true, linked: true, customToken: await memberToken(uid, centerId) });
      }
      return res.json({ ok: true, linked: false });
    } catch { return fail(res); }
  });
  app.get('/api/admin/member-requests', requireCenterAdmin, async (req, res) => {
    try {
      const snap = await getFirebaseAdmin()!.db.collection(`centers/${(req as any).caller.centerId}/memberJoinRequests`).where('status', '==', 'PENDING').limit(200).get();
      return res.set('Cache-Control', 'no-store').json({ requests: snap.docs.filter(d => d.data().status === 'PENDING').sort((a,b) => String(b.data().createdAt).localeCompare(String(a.data().createdAt))).slice(0,200).map(d => ({ id: d.id, name: d.data().name, phone: d.data().phone, createdAt: d.data().createdAt, matchMemberId: d.data().matchMemberId || null })) });
    } catch { return fail(res, 503); }
  });
  app.post('/api/admin/review-member-request', requireCenterAdmin, async (req, res) => {
    try {
      const uri = process.env.KAKAO_REDIRECT_URI;
      if (!uri || !redirectForOrigin(req.headers.origin)) return fail(res, 403);
      const caller = (req as any).caller, { id, action, memberId, confirmed } = req.body;
      if (!safeId(id) || !['APPROVE', 'REJECT', 'CREATE'].includes(action)) return fail(res);
      if (!await consumeLimit('review:' + caller.uid, 20)) return fail(res, 429);
      const admin = getFirebaseAdmin()!, ref = admin.db.doc(`memberJoinRequests/${id}`), request = (await ref.get()).data();
      if (!request || request.centerId !== caller.centerId || request.status !== 'PENDING') return fail(res, 403);
      if (action === 'CREATE') {
        // Staff registers the requester as a new member and links them in one step.
        const newId = await createMemberFromRequest(caller.centerId, String(request.name || '회원').slice(0, 60), String(request.phone || ''), 'STAFF');
        try { await bindMember(request.uid, newId, caller.centerId, caller.uid, { requestId: id }); }
        catch (err) { await admin.db.doc(`members/${newId}`).delete(); throw err; }
      } else if (action === 'APPROVE') {
        if (!safeId(memberId) || confirmed !== true) return fail(res);
        await bindMember(request.uid, memberId, caller.centerId, caller.uid, { requestId: id });
      } else {
        await admin.db.runTransaction(async tx => {
          const data = (await tx.get(ref)).data();
          if (!data || data.centerId !== caller.centerId || data.status !== 'PENDING') throw new Error('Denied');
          tx.update(ref, { status: 'REJECTED', reviewedBy: caller.uid, reviewedAt: now() });
          tx.set(admin.db.doc(`centers/${caller.centerId}/memberJoinRequests/${id}`), { status: 'REJECTED', reviewedAt: now() }, { merge: true });
          tx.set(admin.db.collection('securityAuditLogs').doc(), { action: 'MEMBER_REQUEST_REJECTED', uid: data.uid, centerId: caller.centerId, actor: caller.uid, at: now() });
        });
      }
      return res.json({ ok: true });
    } catch { return fail(res); }
  });
}
