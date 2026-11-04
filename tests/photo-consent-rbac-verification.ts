import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  createCenter,
  createTrainer,
  createMember,
  updateMemberPhotoConsent,
  createProgressPhoto,
  getProgressPhotos,
  clearCenterData
} from '../src/services/dataService';

async function runPhotoConsentVerification() {
  console.log('====================================================');
  console.log('🚀 Running Photo Consent & RBAC Verification Test Suite');
  console.log('====================================================\n');

  const testCenterId = `center-consent-test-${Date.now()}`;
  const now = new Date().toISOString();
  await createCenter({
    centerId: testCenterId,
    name: 'Consent Test Fitness',
    address: 'Seoul Gangnam',
    phone: '02-1111-2222',
    businessNumber: '123-45-67890',
    createdAt: now,
    updatedAt: now
  });

  const trainer = await createTrainer({
    centerId: testCenterId,
    name: '홍길동 트레이너',
    phone: '010-1111-2222',
    specialty: '체형 교정',
    role: 'TRAINER',
    status: 'ACTIVE'
  });

  const member = await createMember({
    centerId: testCenterId,
    trainerId: trainer.trainerId,
    name: '김회원',
    gender: 'FEMALE',
    birthDate: '1995-05-15',
    phone: '010-3333-4444',
    startDate: '2026-09-01',
    status: 'ACTIVE'
  });

  // -----------------------------------------------------------------
  // 1. Initial State: Unconsented
  // -----------------------------------------------------------------
  console.log('1. Initial Unconsented State Verification');
  assert(!member.progressPhotoConsent || !member.progressPhotoConsent.granted, 'Initial state must be unconsented');

  // Attempt to upload photo without consent -> MUST FAIL
  let blockedWithoutConsent = false;
  try {
    await createProgressPhoto(
      {
        centerId: testCenterId,
        memberId: member.memberId,
        trainerId: trainer.trainerId,
        takenAt: '2026-09-01',
        viewType: 'FRONT',
        photoUrl: 'data:image/png;base64,initial_photo',
        storagePath: `centers/${testCenterId}/members/${member.memberId}/photos/p1.png`,
        caption: '미동의 상태 업로드 시도'
      },
      'TRAINER',
      trainer.trainerId
    );
  } catch (err: any) {
    blockedWithoutConsent = true;
    assert(
      err.message.includes('회원 동의가 필요합니다'),
      `Expected consent error message, got: ${err.message}`
    );
  }
  assert(blockedWithoutConsent, 'Photo upload without consent must be strictly blocked');
  console.log('✅ [PASS] Photo upload blocked without consent');

  // -----------------------------------------------------------------
  // 2. Strict RBAC: TRAINER / CENTER_ADMIN Cannot Grant or Revoke Consent
  // -----------------------------------------------------------------
  console.log('\n2. RBAC Enforcement: Only MEMBER can update consent');

  // 2.1 TRAINER attempt
  let trainerBlocked = false;
  try {
    await updateMemberPhotoConsent(testCenterId, member.memberId, true, 'TRAINER', trainer.trainerId);
  } catch (err: any) {
    trainerBlocked = true;
    assert(
      err.message.includes('회원 본인만 설정하거나 철회'),
      `Expected role error message, got: ${err.message}`
    );
  }
  assert(trainerBlocked, 'TRAINER must be blocked from granting photo consent');
  console.log('✅ [PASS] TRAINER direct consent manipulation blocked');

  // 2.2 CENTER_ADMIN attempt
  let adminBlocked = false;
  try {
    await updateMemberPhotoConsent(testCenterId, member.memberId, true, 'CENTER_ADMIN');
  } catch (err: any) {
    adminBlocked = true;
    assert(
      err.message.includes('회원 본인만 설정하거나 철회'),
      `Expected role error message, got: ${err.message}`
    );
  }
  assert(adminBlocked, 'CENTER_ADMIN must be blocked from granting photo consent');
  console.log('✅ [PASS] CENTER_ADMIN direct consent manipulation blocked');

  // 2.3 Different member attempt
  let otherMemberBlocked = false;
  try {
    await updateMemberPhotoConsent(testCenterId, member.memberId, true, 'MEMBER', null, 'other-member-uid');
  } catch (err: any) {
    otherMemberBlocked = true;
    assert(
      err.message.includes('본인의 체형 사진 동의 상태만'),
      `Expected member mismatch error, got: ${err.message}`
    );
  }
  assert(otherMemberBlocked, 'Different member must be blocked from altering consent');
  console.log('✅ [PASS] Cross-member consent alteration blocked');

  // -----------------------------------------------------------------
  // 3. MEMBER Herself Grants Consent
  // -----------------------------------------------------------------
  console.log('\n3. MEMBER Self-Consent & Data Model Verification');
  const consentedMember = await updateMemberPhotoConsent(
    testCenterId,
    member.memberId,
    true,
    'MEMBER',
    null,
    member.memberId
  );

  const consent = consentedMember.progressPhotoConsent;
  assert(consent, 'progressPhotoConsent must exist after grant');
  assert(consent.granted === true, 'granted must be true');
  assert(consent.consentedBy === member.memberId, 'consentedBy must equal memberId');
  assert(typeof consent.consentedAt === 'string', 'consentedAt timestamp must be recorded');
  assert(typeof consent.grantedAt === 'string', 'grantedAt timestamp must be recorded');
  assert(!consent.revokedAt, 'revokedAt must be undefined on grant');
  console.log('✅ [PASS] MEMBER self-consent recorded with consentedBy and consentedAt');

  // -----------------------------------------------------------------
  // 4. Photo Upload Succeeds After Consent
  // -----------------------------------------------------------------
  console.log('\n4. Photo Upload With Active Consent');
  const uploadedPhoto = await createProgressPhoto(
    {
      centerId: testCenterId,
      memberId: member.memberId,
      trainerId: trainer.trainerId,
      takenAt: '2026-09-02',
      viewType: 'FRONT',
      photoUrl: 'data:image/png;base64,valid_photo_data',
      storagePath: `centers/${testCenterId}/members/${member.memberId}/photos/p1.png`,
      caption: '첫 정면 눈바디'
    },
    'TRAINER',
    trainer.trainerId
  );
  assert(uploadedPhoto && uploadedPhoto.photoId, 'Photo should be successfully created');
  console.log('✅ [PASS] Trainer successfully created photo under active member consent');

  // -----------------------------------------------------------------
  // 5. MEMBER Herself Revokes Consent
  // -----------------------------------------------------------------
  console.log('\n5. MEMBER Consent Revocation & Photo Preservation');

  // 5.1 Trainer attempt to revoke -> MUST FAIL
  let trainerRevokeBlocked = false;
  try {
    await updateMemberPhotoConsent(testCenterId, member.memberId, false, 'TRAINER', trainer.trainerId);
  } catch (err: any) {
    trainerRevokeBlocked = true;
  }
  assert(trainerRevokeBlocked, 'Trainer cannot revoke consent directly');
  console.log('✅ [PASS] Trainer direct revocation blocked');

  // 5.2 Member self-revocation -> MUST SUCCEED
  const revokedMember = await updateMemberPhotoConsent(
    testCenterId,
    member.memberId,
    false,
    'MEMBER',
    null,
    member.memberId
  );

  const revokedConsent = revokedMember.progressPhotoConsent;
  assert(revokedConsent, 'Consent object must exist');
  assert(revokedConsent.granted === false, 'granted must be false after revocation');
  assert(revokedConsent.revokedBy === member.memberId, 'revokedBy must equal memberId');
  assert(typeof revokedConsent.revokedAt === 'string', 'revokedAt timestamp must be recorded');
  assert(revokedConsent.consentedBy === member.memberId, 'original consentedBy must be preserved');
  assert(typeof revokedConsent.consentedAt === 'string', 'original consentedAt must be preserved');
  console.log('✅ [PASS] Member self-revocation succeeded, preserving prior consent history');

  // 5.3 Attempt to upload NEW photo while revoked -> MUST BE BLOCKED
  let newUploadBlocked = false;
  try {
    await createProgressPhoto(
      {
        centerId: testCenterId,
        memberId: member.memberId,
        trainerId: trainer.trainerId,
        takenAt: '2026-09-03',
        viewType: 'SIDE',
        photoUrl: 'data:image/png;base64,revoked_photo_attempt',
        storagePath: `centers/${testCenterId}/members/${member.memberId}/photos/p2.png`,
        caption: '철회 후 업로드 시도'
      },
      'TRAINER',
      trainer.trainerId
    );
  } catch (err: any) {
    newUploadBlocked = true;
    assert(
      err.message.includes('회원 동의가 필요합니다'),
      `Expected consent error message, got: ${err.message}`
    );
  }
  assert(newUploadBlocked, 'New photo upload must be strictly blocked after consent revocation');
  console.log('✅ [PASS] New photo upload blocked after consent revocation');

  // 5.4 Existing photos must NOT be deleted (Preservation Policy)
  const existingPhotos = await getProgressPhotos(
    testCenterId,
    member.memberId,
    'TRAINER',
    trainer.trainerId
  );
  assert(existingPhotos.length === 1, 'Existing photo must remain preserved after revocation');
  assert(existingPhotos[0].photoId === uploadedPhoto.photoId, 'Existing photo ID must match');
  console.log('✅ [PASS] Existing photos safely preserved after revocation (not deleted)');

  // -----------------------------------------------------------------
  // 6. Full State Transition Lifecycle: 동의 -> 철회 -> 즉시 UI 반영 -> 업로드 차단 -> 재동의
  // -----------------------------------------------------------------
  console.log('\n6. Full State Transition Lifecycle Verification (Grant -> Revoke -> Upload Block -> Re-grant)');

  // Step 6.1: Initial Grant
  const grantStep = await updateMemberPhotoConsent(testCenterId, member.memberId, true, 'MEMBER', null, member.memberId);
  assert(grantStep.progressPhotoConsent?.granted === true, 'Step 6.1: granted must be true');
  assert(grantStep.progressPhotoConsent?.consentedBy === member.memberId, 'Step 6.1: consentedBy must be memberId');
  const firstConsentedAt = grantStep.progressPhotoConsent?.consentedAt;
  assert(typeof firstConsentedAt === 'string', 'Step 6.1: consentedAt must be string');
  console.log('✅ [PASS] Step 6.1: Grant active (granted === true)');

  // Step 6.2: Immediate Revocation & State Sync
  const revokeStep = await updateMemberPhotoConsent(testCenterId, member.memberId, false, 'MEMBER', null, member.memberId);
  assert(revokeStep.progressPhotoConsent?.granted === false, 'Step 6.2: granted must be false');
  assert(revokeStep.progressPhotoConsent?.revokedBy === member.memberId, 'Step 6.2: revokedBy must be memberId');
  assert(typeof revokeStep.progressPhotoConsent?.revokedAt === 'string', 'Step 6.2: revokedAt must be recorded');
  assert(revokeStep.progressPhotoConsent?.consentedAt === firstConsentedAt, 'Step 6.2: prior consentedAt preserved');
  console.log('✅ [PASS] Step 6.2: Immediate Revoke (granted === false, history preserved)');

  // Step 6.3: Verify Trainer Upload Blocked while Revoked
  let uploadBlockedStep = false;
  try {
    await createProgressPhoto(
      {
        centerId: testCenterId,
        memberId: member.memberId,
        trainerId: trainer.trainerId,
        takenAt: '2026-09-04',
        viewType: 'BACK',
        photoUrl: 'data:image/png;base64,back_photo',
        storagePath: `centers/${testCenterId}/members/${member.memberId}/photos/p_step.png`,
        caption: '철회 상태 업로드 차단 확인'
      },
      'TRAINER',
      trainer.trainerId
    );
  } catch (err: any) {
    uploadBlockedStep = true;
  }
  assert(uploadBlockedStep, 'Step 6.3: Upload must be blocked while in revoked state');
  console.log('✅ [PASS] Step 6.3: Trainer upload strictly blocked during revocation');

  // Step 6.4: Re-grant (다시 동의하기)
  const regrantStep = await updateMemberPhotoConsent(testCenterId, member.memberId, true, 'MEMBER', null, member.memberId);
  assert(regrantStep.progressPhotoConsent?.granted === true, 'Step 6.4: granted must be true on re-grant');
  assert(regrantStep.progressPhotoConsent?.consentedBy === member.memberId, 'Step 6.4: new consentedBy recorded');
  assert(typeof regrantStep.progressPhotoConsent?.consentedAt === 'string', 'Step 6.4: new consentedAt recorded');
  assert(!regrantStep.progressPhotoConsent?.revokedAt, 'Step 6.4: revokedAt cleared on active re-grant');
  console.log('✅ [PASS] Step 6.4: Re-grant succeeded with fresh consentedAt and active status');

  // Step 6.5: Trainer Upload Resumes After Re-grant
  const resumePhoto = await createProgressPhoto(
    {
      centerId: testCenterId,
      memberId: member.memberId,
      trainerId: trainer.trainerId,
      takenAt: '2026-09-05',
      viewType: 'BACK',
      photoUrl: 'data:image/png;base64,resume_photo',
      storagePath: `centers/${testCenterId}/members/${member.memberId}/photos/p_resumed.png`,
      caption: '재동의 후 업로드 성공'
    },
    'TRAINER',
    trainer.trainerId
  );
  assert(resumePhoto && resumePhoto.photoId, 'Step 6.5: Upload should succeed after re-grant');
  console.log('✅ [PASS] Step 6.5: Photo upload resumed normally after re-grant');

  // -----------------------------------------------------------------
  // 7. UI Structure & Firestore Rules Integrity Verification
  // -----------------------------------------------------------------
  console.log('\n7. UI & Firestore Security Rules Code Verification');

  // 6.1 Check PhotosTab.tsx for no [동의], [동의 철회] buttons
  const photosTabContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/PhotosTab.tsx'),
    'utf-8'
  );
  assert(
    !photosTabContent.includes('btn-grant-consent') &&
      !photosTabContent.includes('btn-revoke-consent') &&
      !photosTabContent.includes('handleGrantConsent') &&
      !photosTabContent.includes('handleRevokeConsent'),
    'PhotosTab.tsx must not contain consent mutation action buttons or handlers'
  );
  assert(
    photosTabContent.includes('badge-photo-consent-status') &&
      photosTabContent.includes('photo-consent-status-banner') &&
      photosTabContent.includes('notice-photo-consent-required') &&
      photosTabContent.includes('회원의 사진 촬영·보관 동의가 필요합니다'),
    'PhotosTab.tsx must display read-only status and disable add button with notice'
  );
  console.log('✅ [PASS] PhotosTab.tsx verified (read-only consent banner, action buttons removed)');

  // 6.2 Check MemberPhotosTab.tsx for member-only consent UI
  const memberPhotosTabContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/member/MemberPhotosTab.tsx'),
    'utf-8'
  );
  assert(
    memberPhotosTabContent.includes('member-photo-consent-card') &&
      memberPhotosTabContent.includes('btn-member-grant-consent') &&
      memberPhotosTabContent.includes('btn-member-revoke-consent') &&
      memberPhotosTabContent.includes('btn-confirm-revoke-consent'),
    'MemberPhotosTab.tsx must provide member consent grant and revoke UI'
  );
  console.log('✅ [PASS] MemberPhotosTab.tsx verified (member-only consent management UI)');

  // 6.3 Check firestore.rules
  const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');
  assert(
    rulesContent.includes("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['progressPhotoConsent', 'updatedAt'])"),
    'firestore.rules must restrict MEMBER update to progressPhotoConsent and updatedAt'
  );
  assert(
    rulesContent.includes("!request.resource.data.diff(resource.data).affectedKeys().hasAny(['progressPhotoConsent'])"),
    'firestore.rules must forbid ADMIN and TRAINER from modifying progressPhotoConsent'
  );
  assert(
    rulesContent.includes('progressPhotoConsent.granted == true'),
    'firestore.rules must enforce active consent for progressPhotos create'
  );
  console.log('✅ [PASS] firestore.rules verified (server-side protection against unauthorized consent changes)');

  // Cleanup
  await clearCenterData(testCenterId);

  console.log('\n====================================================');
  console.log('🎉 ALL PHOTO CONSENT & RBAC VERIFICATIONS PASSED (100%)');
  console.log('====================================================');
}

runPhotoConsentVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
