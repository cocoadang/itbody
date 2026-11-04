/**
 * Phase 4 Automated Verification Test Suite:
 * 19 Rigorous Scenarios for Before/After Photos, Consent & Progress Reviews
 */
import {
  seedInitialCenterData,
  createMember,
  createContract,
  createPtSession,
  updatePtSession,
  createGoal,
  createBodyMeasurement,
  updateMemberPhotoConsent,
  createProgressPhoto,
  getProgressPhotos,
  deleteProgressPhoto,
  createProgressReview,
  getProgressReviews,
  deleteProgressReview,
  getMemberTimeline,
  getAttentionMembers,
  clearCenterData
} from '../src/services/dataService';
import type {
  Member,
  ProgressPhoto,
  ProgressReview,
  UserRole
} from '../src/types';

interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, testName: string, failureMessage: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${testName}: ${failureMessage}`);
    results.push({ name: testName, passed: false, message: failureMessage });
    throw new Error(`Assertion failed in ${testName}: ${failureMessage}`);
  } else {
    console.log(`✅ [PASS] ${testName}`);
    results.push({ name: testName, passed: true });
  }
}

async function runPhase4Tests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 4 Verification Test Suite');
  console.log('====================================================\n');

  const centerAId = 'center-phase4-alpha';
  const centerBId = 'center-phase4-beta';
  const trainerAId = 'tr-p4-a1';
  const trainerBId = 'tr-p4-b1';

  // Seed baseline data
  await seedInitialCenterData(centerAId, '알파 피트니스', [
    { id: trainerAId, name: '이준호 트레이너', phone: '010-1111-2222', specialty: '웨이트' }
  ]);
  await seedInitialCenterData(centerBId, '베타 피트니스', [
    { id: trainerBId, name: '박서준 트레이너', phone: '010-3333-4444', specialty: '필라테스' }
  ]);

  // Create member in Center A
  const memberA = await createMember({
    centerId: centerAId,
    name: '강다니엘',
    phone: '010-5555-6666',
    gender: 'MALE',
    birthDate: '1996-12-10',
    trainerId: trainerAId,
    startDate: '2026-08-01',
    status: 'ACTIVE',
    notes: '체형 개선 및 어깨 밸런스 점검 희망'
  });

  // ----------------------------------------------------
  // Scenario 1: Photo Consent Validation (Must block upload without consent)
  // ----------------------------------------------------
  let blockedWithoutConsent = false;
  try {
    await createProgressPhoto(
      {
        centerId: centerAId,
        memberId: memberA.memberId,
        trainerId: trainerAId,
        takenAt: '2026-08-05',
        viewType: 'FRONT',
        photoUrl: 'data:image/png;base64,sample1',
        storagePath: `centers/${centerAId}/members/${memberA.memberId}/photos/p1.png`
      },
      'TRAINER',
      trainerAId
    );
  } catch (err: any) {
    blockedWithoutConsent = true;
  }
  assert(
    blockedWithoutConsent,
    'Scenario 1: Photo Consent Validation',
    'Upload was permitted without prior member photo consent!'
  );

  // ----------------------------------------------------
  // Scenario 2: Member-Only Photo Consent Verification
  // ----------------------------------------------------
  // 2.1 TRAINER cannot grant consent
  let trainerConsentBlocked = false;
  try {
    await updateMemberPhotoConsent(centerAId, memberA.memberId, true, 'TRAINER', trainerAId);
  } catch (err: any) {
    trainerConsentBlocked = true;
  }
  assert(
    trainerConsentBlocked,
    'Scenario 2.1: Trainer cannot grant consent directly',
    'Trainer was able to grant member photo consent directly'
  );

  // 2.2 CENTER_ADMIN cannot grant consent
  let adminConsentBlocked = false;
  try {
    await updateMemberPhotoConsent(centerAId, memberA.memberId, true, 'CENTER_ADMIN');
  } catch (err: any) {
    adminConsentBlocked = true;
  }
  assert(
    adminConsentBlocked,
    'Scenario 2.2: Center Admin cannot grant consent directly',
    'Admin was able to grant member photo consent directly'
  );

  // 2.3 Other member cannot grant consent
  let otherMemberConsentBlocked = false;
  try {
    await updateMemberPhotoConsent(centerAId, memberA.memberId, true, 'MEMBER', null, 'other-member-id');
  } catch (err: any) {
    otherMemberConsentBlocked = true;
  }
  assert(
    otherMemberConsentBlocked,
    'Scenario 2.3: Other member cannot grant consent',
    'Another member was able to alter photo consent'
  );

  // 2.4 MEMBER herself grants photo consent
  const consentRes = await updateMemberPhotoConsent(
    centerAId,
    memberA.memberId,
    true,
    'MEMBER',
    null,
    memberA.memberId
  );
  assert(
    consentRes.progressPhotoConsent?.granted === true &&
      consentRes.progressPhotoConsent?.consentedBy === memberA.memberId &&
      typeof consentRes.progressPhotoConsent?.consentedAt === 'string',
    'Scenario 2.4: Member herself grants photo consent',
    'Member photo consent failed to grant properly'
  );

  // ----------------------------------------------------
  // Scenario 3: Upload Progress Photo (Success with consent)
  // ----------------------------------------------------
  const photo1 = await createProgressPhoto(
    {
      centerId: centerAId,
      memberId: memberA.memberId,
      trainerId: trainerAId,
      takenAt: '2026-08-05',
      viewType: 'FRONT',
      photoUrl: 'data:image/png;base64,sample1_front',
      storagePath: `centers/${centerAId}/members/${memberA.memberId}/photos/p1.png`,
      caption: '시작 시점 정면 체형'
    },
    'TRAINER',
    trainerAId
  );
  assert(
    photo1.photoId !== undefined && photo1.viewType === 'FRONT',
    'Scenario 3: Upload Progress Photo with Consent',
    'Failed to create progress photo after consent granted'
  );

  // ----------------------------------------------------
  // Scenario 4: Upload Multiple Photos (Various views & dates)
  // ----------------------------------------------------
  const photo2 = await createProgressPhoto(
    {
      centerId: centerAId,
      memberId: memberA.memberId,
      trainerId: trainerAId,
      takenAt: '2026-08-05',
      viewType: 'SIDE',
      photoUrl: 'data:image/png;base64,sample1_side',
      storagePath: `centers/${centerAId}/members/${memberA.memberId}/photos/p2.png`,
      caption: '시작 시점 측면 체형'
    },
    'TRAINER',
    trainerAId
  );

  const photo3 = await createProgressPhoto(
    {
      centerId: centerAId,
      memberId: memberA.memberId,
      trainerId: trainerAId,
      takenAt: '2026-09-15',
      viewType: 'FRONT',
      photoUrl: 'data:image/png;base64,sample2_front',
      storagePath: `centers/${centerAId}/members/${memberA.memberId}/photos/p3.png`,
      caption: '10회차 후 정면 체형'
    },
    'TRAINER',
    trainerAId
  );

  assert(
    photo2.viewType === 'SIDE' && photo3.takenAt === '2026-09-15',
    'Scenario 4: Upload Multiple Photos with Views and Dates',
    'Failed to save multiple photos'
  );

  // ----------------------------------------------------
  // Scenario 5: Retrieve Progress Photos sorted ascending by takenAt
  // ----------------------------------------------------
  const retrievedPhotos = await getProgressPhotos(
    centerAId,
    memberA.memberId,
    'TRAINER',
    trainerAId
  );
  assert(
    retrievedPhotos.length === 3 &&
      retrievedPhotos[0].takenAt <= retrievedPhotos[retrievedPhotos.length - 1].takenAt,
    'Scenario 5: Retrieve Photos Sorted Ascending',
    `Expected 3 photos sorted ascending, received ${retrievedPhotos.length}`
  );

  // ----------------------------------------------------
  // Scenario 6: Delete Progress Photo
  // ----------------------------------------------------
  await deleteProgressPhoto(centerAId, photo2.photoId, 'TRAINER', trainerAId);
  const afterDeletePhotos = await getProgressPhotos(
    centerAId,
    memberA.memberId,
    'TRAINER',
    trainerAId
  );
  assert(
    afterDeletePhotos.length === 2 && !afterDeletePhotos.some((p) => p.photoId === photo2.photoId),
    'Scenario 6: Delete Progress Photo',
    'Deleted photo still exists in retrieved list'
  );

  // ----------------------------------------------------
  // Scenario 7: Photo Consent Revocation (Member Only & Photo Preservation)
  // ----------------------------------------------------
  // 7.1 Trainer cannot revoke member consent directly
  let trainerRevokeBlocked = false;
  try {
    await updateMemberPhotoConsent(centerAId, memberA.memberId, false, 'TRAINER', trainerAId);
  } catch (err: any) {
    trainerRevokeBlocked = true;
  }
  assert(
    trainerRevokeBlocked,
    'Scenario 7.1: Trainer cannot revoke member consent directly',
    'Trainer was able to revoke consent directly'
  );

  // 7.2 Member herself revokes photo consent
  const revokedMember = await updateMemberPhotoConsent(
    centerAId,
    memberA.memberId,
    false,
    'MEMBER',
    null,
    memberA.memberId
  );
  assert(
    revokedMember.progressPhotoConsent?.granted === false &&
      revokedMember.progressPhotoConsent?.revokedBy === memberA.memberId &&
      typeof revokedMember.progressPhotoConsent?.revokedAt === 'string' &&
      typeof revokedMember.progressPhotoConsent?.consentedAt === 'string',
    'Scenario 7.2: Member revokes consent (preserves consentedAt, stores revokedBy)',
    'Consent revocation failed to update member properly'
  );

  // 7.3 New photo upload must be blocked after revocation
  let uploadBlockedAfterRevocation = false;
  try {
    await createProgressPhoto(
      {
        centerId: centerAId,
        memberId: memberA.memberId,
        trainerId: trainerAId,
        takenAt: '2026-09-20',
        viewType: 'FRONT',
        photoUrl: 'data:image/png;base64,sample_revoked',
        storagePath: `centers/${centerAId}/members/${memberA.memberId}/photos/p_revoked.png`
      },
      'TRAINER',
      trainerAId
    );
  } catch (err) {
    uploadBlockedAfterRevocation = true;
  }
  assert(
    uploadBlockedAfterRevocation,
    'Scenario 7.3: New photo upload blocked after consent revocation',
    'Trainer was able to upload photo after consent was revoked'
  );

  // 7.4 Existing photos must be preserved (not deleted)
  const preservedPhotos = await getProgressPhotos(centerAId, memberA.memberId, 'TRAINER', trainerAId);
  assert(
    preservedPhotos.length === 2,
    'Scenario 7.4: Existing photos preserved after revocation',
    `Expected 2 preserved photos, received ${preservedPhotos.length}`
  );

  // Re-grant by member herself for subsequent tests
  await updateMemberPhotoConsent(centerAId, memberA.memberId, true, 'MEMBER', null, memberA.memberId);

  // ----------------------------------------------------
  // Scenario 8: Tenant Isolation for Progress Photos
  // ----------------------------------------------------
  let crossCenterPhotoAccessBlocked = false;
  try {
    await getProgressPhotos(centerBId, memberA.memberId, 'CENTER_ADMIN');
  } catch (err) {
    crossCenterPhotoAccessBlocked = true;
  }
  const centerBPhotos = crossCenterPhotoAccessBlocked
    ? []
    : await getProgressPhotos(centerBId, memberA.memberId, 'CENTER_ADMIN');
  assert(
    crossCenterPhotoAccessBlocked || centerBPhotos.length === 0,
    'Scenario 8: Tenant Isolation for Progress Photos',
    'Center B was able to access Center A member photos!'
  );

  // ----------------------------------------------------
  // Scenario 9: Trainer RBAC for Progress Photos
  // ----------------------------------------------------
  const unassignedPhotos = await getProgressPhotos(
    centerAId,
    memberA.memberId,
    'TRAINER',
    'tr-p4-other'
  );
  assert(
    unassignedPhotos.length === 0,
    'Scenario 9: Trainer RBAC for Progress Photos',
    `Expected 0 photos for unassigned trainer, got ${unassignedPhotos.length}`
  );

  // ----------------------------------------------------
  // Scenario 10: Create Progress Review (10회차 중간 점검)
  // ----------------------------------------------------
  const review10 = await createProgressReview(
    {
      centerId: centerAId,
      memberId: memberA.memberId,
      trainerId: trainerAId,
      reviewType: 'TEN_SESSION',
      reviewDate: '2026-09-16',
      periodStart: '2026-08-01',
      periodEnd: '2026-09-15',
      summary: '10회차 완료 체형 정렬 개선 및 스쿼트 60kg 달성',
      trainerFeedback:
        '초기 고관절 뻣뻣함이 크게 완화되었으며, 상체 프레스 운동 시 견갑골 안정성이 눈에 띄게 좋아졌습니다.',
      nextGoals: ['체지방률 2% 추가 감량', '데드리프트 70kg 풀 가동범위 습득'],
      milestoneSessionCount: 10,
      completedSessionCountAtReview: 10
    },
    'TRAINER',
    trainerAId
  );
  assert(
    review10.reviewId !== undefined &&
      review10.reviewType === 'TEN_SESSION' &&
      review10.milestoneSessionCount === 10,
    'Scenario 10: Create 10-Session Progress Review',
    'Failed to create 10-session progress review'
  );

  // ----------------------------------------------------
  // Scenario 11: Create Progress Review (20회차 & 계약 종료)
  // ----------------------------------------------------
  const review20 = await createProgressReview(
    {
      centerId: centerAId,
      memberId: memberA.memberId,
      trainerId: trainerAId,
      reviewType: 'TWENTY_SESSION',
      reviewDate: '2026-10-30',
      periodStart: '2026-09-16',
      periodEnd: '2026-10-30',
      summary: '20회차 완료 체중 4kg 감량 및 전신 근력 균형 확보',
      trainerFeedback: '독립적으로 워밍업과 메인 리프팅을 완벽하게 수행할 수 있는 수준에 도달함.',
      milestoneSessionCount: 20,
      completedSessionCountAtReview: 20
    },
    'TRAINER',
    trainerAId
  );
  assert(
    review20.reviewType === 'TWENTY_SESSION',
    'Scenario 11: Create 20-Session Review',
    'Failed to create 20-session progress review'
  );

  // ----------------------------------------------------
  // Scenario 12: Retrieve Progress Reviews Sorted Descending by Date
  // ----------------------------------------------------
  const retrievedReviews = await getProgressReviews(
    centerAId,
    memberA.memberId,
    'TRAINER',
    trainerAId
  );
  assert(
    retrievedReviews.length === 2 &&
      retrievedReviews[0].reviewDate >= retrievedReviews[1].reviewDate,
    'Scenario 12: Retrieve Reviews Sorted Descending',
    'Reviews not returned in descending order'
  );

  // ----------------------------------------------------
  // Scenario 13: Delete Progress Review
  // ----------------------------------------------------
  await deleteProgressReview(centerAId, review20.reviewId, 'TRAINER', trainerAId);
  const remainingReviews = await getProgressReviews(
    centerAId,
    memberA.memberId,
    'TRAINER',
    trainerAId
  );
  assert(
    remainingReviews.length === 1 && remainingReviews[0].reviewId === review10.reviewId,
    'Scenario 13: Delete Progress Review',
    'Review deletion failed'
  );

  // ----------------------------------------------------
  // Scenario 14: Tenant Isolation for Progress Reviews
  // ----------------------------------------------------
  let crossCenterReviewBlocked = false;
  try {
    await getProgressReviews(centerBId, memberA.memberId, 'CENTER_ADMIN');
  } catch (err) {
    crossCenterReviewBlocked = true;
  }
  const centerBReviews = crossCenterReviewBlocked
    ? []
    : await getProgressReviews(centerBId, memberA.memberId, 'CENTER_ADMIN');
  assert(
    crossCenterReviewBlocked || centerBReviews.length === 0,
    'Scenario 14: Tenant Isolation for Progress Reviews',
    'Center B was able to read Center A progress reviews!'
  );

  // ----------------------------------------------------
  // Scenario 15: Trainer RBAC for Progress Reviews
  // ----------------------------------------------------
  const unassignedReviews = await getProgressReviews(
    centerAId,
    memberA.memberId,
    'TRAINER',
    'tr-unassigned-xyz'
  );
  assert(
    unassignedReviews.length === 0,
    'Scenario 15: Trainer RBAC for Progress Reviews',
    `Expected 0 reviews for unassigned trainer, got ${unassignedReviews.length}`
  );

  // ----------------------------------------------------
  // Scenario 16: Timeline Integration (PROGRESS_REVIEW event exists)
  // ----------------------------------------------------
  const timelineEvents = await getMemberTimeline(
    centerAId,
    memberA.memberId,
    'TRAINER',
    trainerAId
  );
  const reviewEvents = timelineEvents.filter((ev) => ev.type === 'PROGRESS_REVIEW');
  assert(
    reviewEvents.length > 0 && reviewEvents[0].badgeText === '성과리뷰',
    'Scenario 16: Timeline Integration for Progress Reviews',
    'PROGRESS_REVIEW event not populated in member timeline'
  );

  // ----------------------------------------------------
  // Scenario 17: Attention Notification - PROGRESS_REVIEW_DUE Trigger
  // ----------------------------------------------------
  // Create a new member B with 10 completed sessions and NO review
  const memberAttention = await createMember({
    centerId: centerAId,
    name: '송중기',
    phone: '010-7777-8888',
    gender: 'MALE',
    birthDate: '1985-09-19',
    trainerId: trainerAId,
    startDate: '2026-08-01',
    status: 'ACTIVE'
  });

  // Create contract for memberAttention
  const contractAttention = await createContract({
    centerId: centerAId,
    memberId: memberAttention.memberId,
    trainerId: trainerAId,
    title: '1:1 정규 PT 20회',
    totalSessions: 20,
    startDate: '2026-08-01',
    expirationDate: '2026-11-01',
    status: 'ACTIVE'
  });

  // Create 10 completed sessions for memberAttention
  for (let i = 1; i <= 10; i++) {
    const dStr = i < 10 ? `2026-08-0${i}` : `2026-08-${i}`;
    await createPtSession({
      centerId: centerAId,
      memberId: memberAttention.memberId,
      memberName: memberAttention.name,
      trainerId: trainerAId,
      contractId: contractAttention.contractId,
      date: dStr,
      time: '14:00',
      status: 'COMPLETED',
      sessionNumber: i,
      exercises: [
        {
          exerciseName: '스쿼트',
          sets: [{ setNumber: 1, weight: 50, reps: 10 }]
        }
      ]
    });
  }

  const attentionListBefore = await getAttentionMembers(centerAId, 'TRAINER', trainerAId);
  const songAttention = attentionListBefore.find((it) => it.member.memberId === memberAttention.memberId);
  assert(
    songAttention !== undefined && songAttention.reasonCodes.includes('PROGRESS_REVIEW_DUE'),
    'Scenario 17: Attention Notification - PROGRESS_REVIEW_DUE Trigger',
    'Member with 10 completed sessions did not trigger PROGRESS_REVIEW_DUE'
  );

  // ----------------------------------------------------
  // Scenario 18: Attention Notification - PROGRESS_REVIEW_DUE Clearance
  // ----------------------------------------------------
  // Submit review for 10 sessions milestone
  await createProgressReview(
    {
      centerId: centerAId,
      memberId: memberAttention.memberId,
      trainerId: trainerAId,
      reviewType: 'TEN_SESSION',
      reviewDate: '2026-08-11',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-10',
      summary: '10회차 완료 성과 점검',
      trainerFeedback: '성실한 출석으로 기본자세 완성',
      milestoneSessionCount: 10,
      completedSessionCountAtReview: 10
    },
    'TRAINER',
    trainerAId
  );

  const attentionListAfter = await getAttentionMembers(centerAId, 'TRAINER', trainerAId);
  const songAttentionAfter = attentionListAfter.find((it) => it.member.memberId === memberAttention.memberId);
  const hasReviewDue = songAttentionAfter?.reasonCodes.includes('PROGRESS_REVIEW_DUE') || false;
  assert(
    !hasReviewDue,
    'Scenario 18: Attention Notification - PROGRESS_REVIEW_DUE Clearance',
    'PROGRESS_REVIEW_DUE flag did not clear after review was completed!'
  );

  // ----------------------------------------------------
  // Scenario 19: Clear Center Data (Cleans up photos and reviews)
  // ----------------------------------------------------
  await clearCenterData(centerAId);
  const photosAfterClear = await getProgressPhotos(centerAId, memberA.memberId, 'CENTER_ADMIN');
  const reviewsAfterClear = await getProgressReviews(centerAId, memberA.memberId, 'CENTER_ADMIN');
  assert(
    photosAfterClear.length === 0 && reviewsAfterClear.length === 0,
    'Scenario 19: Clear Center Data Cleanup',
    'Photos or reviews remained after clearCenterData was executed'
  );

  console.log('\n====================================================');
  console.log(`🎉 ALL 19 PHASE 4 TEST SCENARIOS PASSED (${results.filter((r) => r.passed).length}/19)`);
  console.log('====================================================\n');
}

runPhase4Tests().catch((err) => {
  console.error('Fatal error in Phase 4 tests:', err);
  process.exit(1);
});
