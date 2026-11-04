import express from 'express';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export interface FirebaseAdminInstance {
  app: App;
  auth: Auth;
  db: Firestore;
}

let adminInstance: FirebaseAdminInstance | null = null;

export function getFirebaseAdmin(): FirebaseAdminInstance | null {
  if (adminInstance) return adminInstance;

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    let config = {
      projectId: 'gen-lang-client-0064554427',
      firestoreDatabaseId: 'ai-studio-e4e8fbca-f678-44f7-a410-4cb94740b469'
    };
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    let app: App;
    if (getApps().length === 0) {
      app = initializeApp({
        projectId: config.projectId
      });
    } else {
      app = getApps()[0];
    }

    const auth = getAuth(app);
    const dbId =
      config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
        ? config.firestoreDatabaseId
        : '(default)';
    const db = getFirestore(app, dbId);

    adminInstance = { app, auth, db };
    return adminInstance;
  } catch (err) {
    console.error('[Firebase Admin Init Error]', err);
    return null;
  }
}

/**
 * Middleware: Verify that the request includes a valid Firebase ID Token
 * and that the caller has role === 'CENTER_ADMIN' in users/{uid}.
 */
export async function requireCenterAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: '인증 토큰이 제공되지 않았습니다. (Authorization: Bearer <token> 필요)'
    });
  }

  const idToken = authHeader.split('Bearer ')[1].trim();
  if (!idToken) {
    return res.status(401).json({
      success: false,
      error: '유효한 Bearer 토큰이 없습니다.'
    });
  }

  const admin = getFirebaseAdmin();
  if (!admin) {
    return res.status(503).json({
      success: false,
      error: 'Firebase Admin 서비스에 연결할 수 없습니다.'
    });
  }

  try {
    const decodedToken = await admin.auth.verifyIdToken(idToken);
    const callerUid = decodedToken.uid;

    const callerDoc = await admin.db.doc(`users/${callerUid}`).get();
    if (!callerDoc.exists) {
      return res.status(403).json({
        success: false,
        error: '사용자 프로필(users/{uid})이 존재하지 않습니다.'
      });
    }

    const callerData = callerDoc.data();
    if (!callerData || callerData.role !== 'CENTER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: '접근 권한이 없습니다. 센터 관리자(CENTER_ADMIN)만 계정을 발급할 수 있습니다.'
      });
    }

    if (!callerData.centerId || typeof callerData.centerId !== 'string') {
      return res.status(403).json({
        success: false,
        error: '관리자 계정에 소속 센터(centerId)가 지정되지 않았습니다.'
      });
    }

    (req as any).caller = {
      uid: callerUid,
      role: callerData.role,
      centerId: callerData.centerId.trim(),
      name: callerData.name || '관리자'
    };

    next();
  } catch (err: any) {
    console.error('[requireCenterAdmin Error]', err?.message || err);
    return res.status(401).json({
      success: false,
      error: '인증 토큰 검증에 실패했습니다.'
    });
  }
}

/**
 * Register Admin Account Provisioning Endpoints
 */
export function registerAdminAccountEndpoints(app: express.Express) {
  // 1. POST /api/admin/provision-account
  app.post('/api/admin/provision-account', requireCenterAdmin, async (req, res) => {
    const { targetType, targetId } = req.body;
    const caller = (req as any).caller;
    const admin = getFirebaseAdmin()!;

    if (!targetType || !['MEMBER', 'TRAINER'].includes(targetType)) {
      return res.status(400).json({
        success: false,
        error: 'targetType은 MEMBER 또는 TRAINER이어야 합니다.'
      });
    }

    if (!targetId || typeof targetId !== 'string' || !targetId.trim() || !/^[A-Za-z0-9_-]{1,128}$/.test(targetId.trim())) {
      return res.status(400).json({
        success: false,
        error: 'targetId가 입력되지 않았습니다.'
      });
    }

    const cleanTargetId = targetId.trim();

    try {
      let targetCenterId = '';
      let targetName = '';
      let targetEmail = '';
      let targetExistingUid: string | null = null;
      let targetDocRef: FirebaseFirestore.DocumentReference;

      if (targetType === 'MEMBER') {
        targetDocRef = admin.db.doc(`members/${cleanTargetId}`);
        const memberDoc = await targetDocRef.get();
        if (!memberDoc.exists) {
          return res.status(404).json({
            success: false,
            error: `해당 회원(${cleanTargetId})을 찾을 수 없습니다.`
          });
        }
        const data = memberDoc.data()!;
        targetCenterId = data.centerId || '';
        targetName = data.name || '회원';
        targetEmail = (data.email || '').trim().toLowerCase();
        targetExistingUid = data.uid ? data.uid.trim() : null;
      } else {
        targetDocRef = admin.db.doc(`trainers/${cleanTargetId}`);
        const trainerDoc = await targetDocRef.get();
        if (!trainerDoc.exists) {
          return res.status(404).json({
            success: false,
            error: `해당 트레이너(${cleanTargetId})를 찾을 수 없습니다.`
          });
        }
        const data = trainerDoc.data()!;
        targetCenterId = data.centerId || '';
        targetName = data.name || '트레이너';
        targetEmail = (data.loginEmail || data.email || '').trim().toLowerCase();
        targetExistingUid = data.uid ? data.uid.trim() : null;
      }

      // Step 2 & 3: Target Validation
      // (a) Tenant boundary check
      if (targetCenterId !== caller.centerId) {
        return res.status(403).json({
          success: false,
          error: '소속 센터의 대상에 대해서만 계정을 발급할 수 있습니다.'
        });
      }

      // (b) Email presence check
      if (!targetEmail) {
        return res.status(400).json({
          success: false,
          error: `계정을 발급하려면 먼저 ${targetType === 'MEMBER' ? '회원의' : '트레이너의'} 이메일이 등록되어야 합니다.`
        });
      }

      // (c) Already provisioned check
      if (targetExistingUid) {
        return res.status(400).json({
          success: false,
          error: `이미 로그인 계정(UID: ${targetExistingUid})이 발급된 ${targetType === 'MEMBER' ? '회원' : '트레이너'}입니다. 비밀번호 재설정 링크 생성을 이용해주세요.`
        });
      }

      // (d) Duplicate email in same center check
      const dupMemberSnap = await admin.db
        .collection('members')
        .where('centerId', '==', caller.centerId)
        .where('email', '==', targetEmail)
        .get();
      for (const doc of dupMemberSnap.docs) {
        if (targetType === 'MEMBER' && doc.id === cleanTargetId) continue;
        return res.status(400).json({
          success: false,
          error: `이미 다른 회원(${doc.data().name || doc.id})에 등록된 이메일(${targetEmail})입니다.`
        });
      }

      const dupTrainerSnap = await admin.db
        .collection('trainers')
        .where('centerId', '==', caller.centerId)
        .where('loginEmail', '==', targetEmail)
        .get();
      for (const doc of dupTrainerSnap.docs) {
        if (targetType === 'TRAINER' && doc.id === cleanTargetId) continue;
        return res.status(400).json({
          success: false,
          error: `이미 다른 트레이너(${doc.data().name || doc.id})에 등록된 이메일(${targetEmail})입니다.`
        });
      }

      // (e) Duplicate in Firebase Auth check
      try {
        const existingAuthUser = await admin.auth.getUserByEmail(targetEmail);
        if (existingAuthUser) {
          return res.status(400).json({
            success: false,
            error: `해당 이메일(${targetEmail})을 사용하는 계정이 이미 Firebase Auth에 존재합니다 (UID: ${existingAuthUser.uid}). 중복 생성이 차단되었습니다.`
          });
        }
      } catch (authLookupErr: any) {
        if (authLookupErr.code !== 'auth/user-not-found') {
          throw authLookupErr;
        }
      }

      // Step 4: Create Firebase Auth user
      let newAuthUser: UserRecord;
      try {
        newAuthUser = await admin.auth.createUser({
          email: targetEmail,
          displayName: targetName,
          emailVerified: false
        });
      } catch (createAuthErr: any) {
        console.error('[Provision] Firebase Auth createUser error:', createAuthErr);
        return res.status(400).json({
          success: false,
          error: `Firebase Auth 계정 생성 실패: ${createAuthErr.message || createAuthErr.code}`
        });
      }

      const newUid = newAuthUser.uid;

      // Step 5: Atomic Firestore Batch: users/{uid} set & target update with uid
      const now = new Date().toISOString();
      try {
        const batch = admin.db.batch();
        const userDocRef = admin.db.doc(`users/${newUid}`);

        if (targetType === 'MEMBER') {
          batch.set(userDocRef, {
            role: 'MEMBER',
            centerId: caller.centerId,
            memberId: cleanTargetId,
            name: targetName,
            email: targetEmail,
            createdAt: now,
            updatedAt: now
          });
          batch.update(targetDocRef, {
            uid: newUid,
            updatedAt: now
          });
        } else {
          batch.set(userDocRef, {
            role: 'TRAINER',
            centerId: caller.centerId,
            trainerId: cleanTargetId,
            name: targetName,
            email: targetEmail,
            createdAt: now,
            updatedAt: now
          });
          batch.update(targetDocRef, {
            uid: newUid,
            updatedAt: now
          });
        }

        await batch.commit();
      } catch (batchErr: any) {
        console.error('[Provision] Firestore batch commit error. Rolling back Auth user...', batchErr);
        // Compensating Transaction: Roll back created Auth user immediately
        try {
          await admin.auth.deleteUser(newUid);
          console.log(`[Provision] Rollback successful: deleted Auth user ${newUid}`);
        } catch (rollbackErr) {
          console.error(`[Provision] Critical: Failed to rollback Auth user ${newUid}:`, rollbackErr);
        }

        return res.status(500).json({
          success: false,
          error: `데이터베이스 저장 실패로 계정 생성이 롤백되었습니다: ${batchErr.message || 'Batch commit error'}`
        });
      }

      // Step 6: Generate password setup/reset link
      let resetLink = '';
      try {
        resetLink = await admin.auth.generatePasswordResetLink(targetEmail);
      } catch (linkErr: any) {
        console.warn('[Provision] generatePasswordResetLink warning:', linkErr);
      }

      return res.json({
        success: true,
        uid: newUid,
        email: targetEmail,
        name: targetName,
        resetLink,
        message: `${targetType === 'MEMBER' ? '회원' : '트레이너'} 로그인 계정이 성공적으로 발급되었습니다.`
      });
    } catch (err: any) {
      console.error('[Provision Error]', err);
      return res.status(500).json({
        success: false,
        error: err.message || '계정 발급 처리 중 서버 오류가 발생했습니다.'
      });
    }
  });

  // 2. POST /api/admin/reset-password-link
  app.post('/api/admin/reset-password-link', requireCenterAdmin, async (req, res) => {
    const { targetType, targetId } = req.body;
    const caller = (req as any).caller;
    const admin = getFirebaseAdmin()!;

    if (!targetType || !['MEMBER', 'TRAINER'].includes(targetType)) {
      return res.status(400).json({
        success: false,
        error: 'targetType은 MEMBER 또는 TRAINER이어야 합니다.'
      });
    }

    if (!targetId || typeof targetId !== 'string' || !targetId.trim() || !/^[A-Za-z0-9_-]{1,128}$/.test(targetId.trim())) {
      return res.status(400).json({
        success: false,
        error: 'targetId가 입력되지 않았습니다.'
      });
    }

    const cleanTargetId = targetId.trim();

    try {
      let targetCenterId = '';
      let targetEmail = '';
      let targetUid: string | null = null;
      let targetName = '';

      if (targetType === 'MEMBER') {
        const doc = await admin.db.doc(`members/${cleanTargetId}`).get();
        if (!doc.exists) {
          return res.status(404).json({ success: false, error: '해당 회원을 찾을 수 없습니다.' });
        }
        const data = doc.data()!;
        targetCenterId = data.centerId || '';
        targetEmail = (data.email || '').trim().toLowerCase();
        targetUid = data.uid ? data.uid.trim() : null;
        targetName = data.name || '회원';
      } else {
        const doc = await admin.db.doc(`trainers/${cleanTargetId}`).get();
        if (!doc.exists) {
          return res.status(404).json({ success: false, error: '해당 트레이너를 찾을 수 없습니다.' });
        }
        const data = doc.data()!;
        targetCenterId = data.centerId || '';
        targetEmail = (data.loginEmail || data.email || '').trim().toLowerCase();
        targetUid = data.uid ? data.uid.trim() : null;
        targetName = data.name || '트레이너';
      }

      if (targetCenterId !== caller.centerId) {
        return res.status(403).json({
          success: false,
          error: '소속 센터의 대상에 대해서만 링크를 생성할 수 있습니다.'
        });
      }


      if (!targetUid) {
        return res.status(400).json({
          success: false,
          error: '아직 로그인 계정이 발급되지 않았습니다. 먼저 계정 발급을 진행해주세요.'
        });
      }

      const profile = (await admin.db.doc(`users/${targetUid}`).get()).data();
      const expectedRole = targetType;
      const expectedField = targetType === 'MEMBER' ? 'memberId' : 'trainerId';
      if (!profile || profile.role !== expectedRole || profile.centerId !== caller.centerId || profile[expectedField] !== cleanTargetId) {
        return res.status(403).json({ success: false, error: '계정 연결 정보를 확인할 수 없습니다.' });
      }
      const account = await admin.auth.getUser(targetUid);
      if (account.disabled || !account.email) {
        return res.status(400).json({ success: false, error: '사용 가능한 이메일 계정이 없습니다.' });
      }
      targetEmail = account.email;
      const resetLink = await admin.auth.generatePasswordResetLink(targetEmail);
      await admin.db.collection('securityAuditLogs').add({ action: 'PASSWORD_RESET_LINK', actor: caller.uid, targetUid, centerId: caller.centerId, at: new Date().toISOString() });
      return res.json({
        success: true,
        email: targetEmail,
        name: targetName,
        resetLink,
        message: '비밀번호 재설정 링크가 성공적으로 생성되었습니다.'
      });
    } catch (err: any) {
      console.error('[Reset Password Link Error]', err);
      return res.status(500).json({
        success: false,
        error: '비밀번호 재설정 링크 생성 중 서버 오류가 발생했습니다.'
      });
    }
  });
}
