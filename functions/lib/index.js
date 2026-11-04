"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordLink = exports.provisionAccount = exports.FIRESTORE_DATABASE_ID = void 0;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
// 1. Firebase Admin Initialization with Named Firestore Database
const app = (0, app_1.getApps)().length === 0 ? (0, app_1.initializeApp)() : (0, app_1.getApps)()[0];
const auth = (0, auth_1.getAuth)(app);
// Critical: ITBODY uses the dedicated named database, NEVER (default)
exports.FIRESTORE_DATABASE_ID = 'ai-studio-e4e8fbca-f678-44f7-a410-4cb94740b469';
const db = (0, firestore_1.getFirestore)(app, exports.FIRESTORE_DATABASE_ID);
/**
 * Phase 10B: HTTPS Callable - provisionAccount
 * 센터 관리자(CENTER_ADMIN)가 소속 센터의 회원 또는 트레이너에게
 * Firebase Authentication 계정을 발급하고 named Firestore에 프로필을 원자적으로 연동합니다.
 */
exports.provisionAccount = (0, https_1.onCall)({
    region: 'asia-northeast1'
}, async (request) => {
    // 1. Authentication check
    if (!request.auth || !request.auth.uid) {
        throw new https_1.HttpsError('unauthenticated', '인증이 필요합니다. 로그인 후 다시 시도해주세요.');
    }
    const callerUid = request.auth.uid;
    const { targetType, targetId } = request.data || {};
    if (!targetType || !['MEMBER', 'TRAINER'].includes(targetType)) {
        throw new https_1.HttpsError('invalid-argument', 'targetType은 MEMBER 또는 TRAINER이어야 합니다.');
    }
    if (!targetId || typeof targetId !== 'string' || !targetId.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'targetId가 입력되지 않았습니다.');
    }
    const cleanTargetId = targetId.trim();
    // 2. Verify Caller Role & Tenant Boundary from named Firestore
    const callerDoc = await db.doc(`users/${callerUid}`).get();
    if (!callerDoc.exists) {
        throw new https_1.HttpsError('permission-denied', '사용자 프로필(users/{uid})이 존재하지 않습니다.');
    }
    const callerData = callerDoc.data();
    if (!callerData || callerData.role !== 'CENTER_ADMIN') {
        throw new https_1.HttpsError('permission-denied', '접근 권한이 없습니다. 센터 관리자(CENTER_ADMIN)만 계정을 발급할 수 있습니다.');
    }
    const callerCenterId = (callerData.centerId || '').trim();
    if (!callerCenterId) {
        throw new https_1.HttpsError('permission-denied', '관리자 계정에 소속 센터(centerId)가 지정되지 않았습니다.');
    }
    // 3. Read target member/trainer directly from named Firestore
    // 클라이언트가 전달한 개인정보/centerId는 신뢰하지 않고 DB에서 직접 조회
    let targetDocRef;
    let targetCenterId = '';
    let targetName = '';
    let targetEmail = '';
    let targetExistingUid = null;
    if (targetType === 'MEMBER') {
        targetDocRef = db.doc(`members/${cleanTargetId}`);
        const memberDoc = await targetDocRef.get();
        if (!memberDoc.exists) {
            throw new https_1.HttpsError('not-found', `해당 회원(${cleanTargetId})을 찾을 수 없습니다.`);
        }
        const data = memberDoc.data();
        targetCenterId = data.centerId || '';
        targetName = data.name || '회원';
        targetEmail = (data.email || '').trim().toLowerCase();
        targetExistingUid = data.uid ? data.uid.trim() : null;
    }
    else {
        targetDocRef = db.doc(`trainers/${cleanTargetId}`);
        const trainerDoc = await targetDocRef.get();
        if (!trainerDoc.exists) {
            throw new https_1.HttpsError('not-found', `해당 트레이너(${cleanTargetId})를 찾을 수 없습니다.`);
        }
        const data = trainerDoc.data();
        targetCenterId = data.centerId || '';
        targetName = data.name || '트레이너';
        targetEmail = (data.loginEmail || data.email || '').trim().toLowerCase();
        targetExistingUid = data.uid ? data.uid.trim() : null;
    }
    // 4. Target Validation
    // (a) Tenant boundary check
    if (targetCenterId !== callerCenterId) {
        throw new https_1.HttpsError('permission-denied', '소속 센터의 대상에 대해서만 계정을 발급할 수 있습니다.');
    }
    // (b) Email presence check
    if (!targetEmail) {
        throw new https_1.HttpsError('failed-precondition', `계정을 발급하려면 먼저 ${targetType === 'MEMBER' ? '회원의' : '트레이너의'} 이메일이 등록되어야 합니다.`);
    }
    // (c) Already provisioned check
    if (targetExistingUid) {
        throw new https_1.HttpsError('already-exists', `이미 로그인 계정(UID: ${targetExistingUid})이 발급된 ${targetType === 'MEMBER' ? '회원' : '트레이너'}입니다. 비밀번호 재설정 링크 생성을 이용해주세요.`);
    }
    // (d) Duplicate email in same center check
    const dupMemberSnap = await db
        .collection('members')
        .where('centerId', '==', callerCenterId)
        .where('email', '==', targetEmail)
        .get();
    for (const doc of dupMemberSnap.docs) {
        if (targetType === 'MEMBER' && doc.id === cleanTargetId)
            continue;
        throw new https_1.HttpsError('already-exists', `이미 다른 회원(${doc.data().name || doc.id})에 등록된 이메일(${targetEmail})입니다.`);
    }
    const dupTrainerSnap = await db
        .collection('trainers')
        .where('centerId', '==', callerCenterId)
        .where('loginEmail', '==', targetEmail)
        .get();
    for (const doc of dupTrainerSnap.docs) {
        if (targetType === 'TRAINER' && doc.id === cleanTargetId)
            continue;
        throw new https_1.HttpsError('already-exists', `이미 다른 트레이너(${doc.data().name || doc.id})에 등록된 이메일(${targetEmail})입니다.`);
    }
    // (e) Duplicate in Firebase Auth check
    try {
        const existingAuthUser = await auth.getUserByEmail(targetEmail);
        if (existingAuthUser) {
            throw new https_1.HttpsError('already-exists', `해당 이메일(${targetEmail})을 사용하는 계정이 이미 Firebase Auth에 존재합니다 (UID: ${existingAuthUser.uid}). 중복 생성이 차단되었습니다.`);
        }
    }
    catch (authLookupErr) {
        if (authLookupErr.code !== 'auth/user-not-found') {
            throw authLookupErr;
        }
    }
    // 5. Create Firebase Auth user
    let newUid;
    try {
        const newAuthUser = await auth.createUser({
            email: targetEmail,
            displayName: targetName,
            emailVerified: false
        });
        newUid = newAuthUser.uid;
    }
    catch (createAuthErr) {
        console.error('[Provision] Firebase Auth createUser error:', createAuthErr);
        throw new https_1.HttpsError('internal', `Firebase Auth 계정 생성 실패: ${createAuthErr.message || createAuthErr.code}`);
    }
    // 6. Atomic Firestore Batch: users/{uid} set & target update with uid
    const now = new Date().toISOString();
    try {
        const batch = db.batch();
        const userDocRef = db.doc(`users/${newUid}`);
        if (targetType === 'MEMBER') {
            batch.set(userDocRef, {
                role: 'MEMBER',
                centerId: callerCenterId,
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
        }
        else {
            batch.set(userDocRef, {
                role: 'TRAINER',
                centerId: callerCenterId,
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
    }
    catch (batchErr) {
        console.error('[Provision] Firestore batch error. Rolling back Auth user...', batchErr);
        // Compensating Transaction: Roll back created Auth user immediately
        try {
            await auth.deleteUser(newUid);
            console.log(`[Provision] Rollback successful: deleted Auth user ${newUid}`);
        }
        catch (rollbackErr) {
            console.error(`[Provision] Critical: Failed to rollback Auth user ${newUid}:`, rollbackErr);
        }
        throw new https_1.HttpsError('internal', `데이터베이스 저장 실패로 계정 생성이 롤백되었습니다: ${batchErr.message || 'Batch commit error'}`);
    }
    // 7. Generate password setup/reset link
    let resetLink = '';
    try {
        resetLink = await auth.generatePasswordResetLink(targetEmail);
    }
    catch (linkErr) {
        console.warn('[Provision] generatePasswordResetLink warning:', linkErr);
    }
    return {
        success: true,
        uid: newUid,
        email: targetEmail,
        name: targetName,
        resetLink,
        message: `${targetType === 'MEMBER' ? '회원' : '트레이너'} 로그인 계정이 성공적으로 발급되었습니다.`
    };
});
/**
 * Phase 10B: HTTPS Callable - resetPasswordLink
 * 센터 관리자(CENTER_ADMIN)가 이미 UID가 발급된 회원 또는 트레이너의 비밀번호 재설정 링크를 생성합니다.
 */
exports.resetPasswordLink = (0, https_1.onCall)({
    region: 'asia-northeast1'
}, async (request) => {
    // 1. Authentication check
    if (!request.auth || !request.auth.uid) {
        throw new https_1.HttpsError('unauthenticated', '인증이 필요합니다. 로그인 후 다시 시도해주세요.');
    }
    const callerUid = request.auth.uid;
    const { targetType, targetId } = request.data || {};
    if (!targetType || !['MEMBER', 'TRAINER'].includes(targetType)) {
        throw new https_1.HttpsError('invalid-argument', 'targetType은 MEMBER 또는 TRAINER이어야 합니다.');
    }
    if (!targetId || typeof targetId !== 'string' || !targetId.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'targetId가 입력되지 않았습니다.');
    }
    const cleanTargetId = targetId.trim();
    // 2. Verify Caller Role & Tenant Boundary
    const callerDoc = await db.doc(`users/${callerUid}`).get();
    if (!callerDoc.exists) {
        throw new https_1.HttpsError('permission-denied', '사용자 프로필(users/{uid})이 존재하지 않습니다.');
    }
    const callerData = callerDoc.data();
    if (!callerData || callerData.role !== 'CENTER_ADMIN') {
        throw new https_1.HttpsError('permission-denied', '접근 권한이 없습니다. 센터 관리자만 비밀번호 재설정 링크를 생성할 수 있습니다.');
    }
    const callerCenterId = (callerData.centerId || '').trim();
    if (!callerCenterId) {
        throw new https_1.HttpsError('permission-denied', '관리자 계정에 소속 센터(centerId)가 지정되지 않았습니다.');
    }
    // 3. Read target
    let targetCenterId = '';
    let targetEmail = '';
    let targetUid = null;
    let targetName = '';
    if (targetType === 'MEMBER') {
        const doc = await db.doc(`members/${cleanTargetId}`).get();
        if (!doc.exists) {
            throw new https_1.HttpsError('not-found', '해당 회원을 찾을 수 없습니다.');
        }
        const data = doc.data();
        targetCenterId = data.centerId || '';
        targetEmail = (data.email || '').trim().toLowerCase();
        targetUid = data.uid ? data.uid.trim() : null;
        targetName = data.name || '회원';
    }
    else {
        const doc = await db.doc(`trainers/${cleanTargetId}`).get();
        if (!doc.exists) {
            throw new https_1.HttpsError('not-found', '해당 트레이너를 찾을 수 없습니다.');
        }
        const data = doc.data();
        targetCenterId = data.centerId || '';
        targetEmail = (data.loginEmail || data.email || '').trim().toLowerCase();
        targetUid = data.uid ? data.uid.trim() : null;
        targetName = data.name || '트레이너';
    }
    if (targetCenterId !== callerCenterId) {
        throw new https_1.HttpsError('permission-denied', '소속 센터의 대상에 대해서만 링크를 생성할 수 있습니다.');
    }
    if (!targetEmail) {
        throw new https_1.HttpsError('failed-precondition', '등록된 이메일이 없습니다.');
    }
    if (!targetUid) {
        throw new https_1.HttpsError('failed-precondition', '아직 로그인 계정이 발급되지 않았습니다. 먼저 계정 발급을 진행해주세요.');
    }
    try {
        const resetLink = await auth.generatePasswordResetLink(targetEmail);
        return {
            success: true,
            email: targetEmail,
            name: targetName,
            resetLink,
            message: '비밀번호 재설정 링크가 성공적으로 생성되었습니다.'
        };
    }
    catch (err) {
        console.error('[Reset Password Link Error]', err);
        throw new https_1.HttpsError('internal', `비밀번호 재설정 링크 생성 중 오류가 발생했습니다: ${err.message || err.code}`);
    }
});
//# sourceMappingURL=index.js.map