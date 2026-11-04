import assert from 'assert';
import fs from 'fs';
import path from 'path';
import type { ProgressPhoto, PhotoViewType } from '../src/types';

/**
 * Pure Before & After Comparison Resolver Simulator
 * Reproducing the exact logic implemented in PhotosTab.tsx
 */
class BeforeAfterComparisonSimulator {
  private photos: ProgressPhoto[];
  private angleSelections: Record<PhotoViewType, { beforePhotoId: string; afterPhotoId: string }>;

  constructor(initialPhotos: ProgressPhoto[] = []) {
    this.photos = [...initialPhotos];
    this.angleSelections = {
      FRONT: { beforePhotoId: '', afterPhotoId: '' },
      SIDE: { beforePhotoId: '', afterPhotoId: '' },
      BACK: { beforePhotoId: '', afterPhotoId: '' },
      OTHER: { beforePhotoId: '', afterPhotoId: '' }
    };
  }

  setPhotos(newPhotos: ProgressPhoto[]) {
    this.photos = [...newPhotos];
  }

  getAnglePhotos(viewType: PhotoViewType): ProgressPhoto[] {
    return this.photos
      .filter((p) => p.viewType === viewType)
      .sort((a, b) => {
        const dateCmp = a.takenAt.localeCompare(b.takenAt);
        if (dateCmp !== 0) return dateCmp;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
  }

  getPhotoOptionLabels(viewType: PhotoViewType): Map<string, string> {
    const anglePhotos = this.getAnglePhotos(viewType);
    const labels = new Map<string, string>();
    const byDate = new Map<string, ProgressPhoto[]>();

    for (const p of anglePhotos) {
      if (!byDate.has(p.takenAt)) {
        byDate.set(p.takenAt, []);
      }
      byDate.get(p.takenAt)!.push(p);
    }

    for (const [, list] of byDate.entries()) {
      if (list.length === 1) {
        const p = list[0];
        const captionSuffix = p.caption ? ` · "${p.caption.slice(0, 15)}"` : '';
        labels.set(p.photoId, `${p.takenAt}${captionSuffix}`);
      } else {
        list.forEach((p, idx) => {
          const captionSuffix = p.caption ? ` · "${p.caption.slice(0, 15)}"` : '';
          labels.set(p.photoId, `${p.takenAt} · #${idx + 1}${captionSuffix}`);
        });
      }
    }

    return labels;
  }

  resolveComparison(viewType: PhotoViewType): {
    currentAnglePhotos: ProgressPhoto[];
    resolvedBeforeId: string;
    resolvedAfterId: string;
    beforePhoto?: ProgressPhoto;
    afterPhoto?: ProgressPhoto;
    beforeOptions: ProgressPhoto[];
    afterOptions: ProgressPhoto[];
    afterEmptyNoticeRequired: boolean;
  } {
    const currentAnglePhotos = this.getAnglePhotos(viewType);
    const count = currentAnglePhotos.length;

    if (count === 0) {
      return {
        currentAnglePhotos,
        resolvedBeforeId: '',
        resolvedAfterId: '',
        beforePhoto: undefined,
        afterPhoto: undefined,
        beforeOptions: [],
        afterOptions: [],
        afterEmptyNoticeRequired: false
      };
    }

    if (count === 1) {
      // Rule 2: Exactly 1 photo -> Before gets it, After is completely empty
      const onlyPhoto = currentAnglePhotos[0];
      return {
        currentAnglePhotos,
        resolvedBeforeId: onlyPhoto.photoId,
        resolvedAfterId: '',
        beforePhoto: onlyPhoto,
        afterPhoto: undefined,
        beforeOptions: [onlyPhoto],
        afterOptions: [],
        afterEmptyNoticeRequired: true
      };
    }

    // Rule 3: 2 or more photos -> Default Before = oldest, After = newest
    const saved = this.angleSelections[viewType];
    const oldestId = currentAnglePhotos[0].photoId;
    const newestId = currentAnglePhotos[count - 1].photoId;

    let bId = saved?.beforePhotoId;
    let aId = saved?.afterPhotoId;

    const bValid = bId && currentAnglePhotos.some((p) => p.photoId === bId);
    if (!bValid) {
      bId = oldestId;
    }

    const aValid = aId && aId !== bId && currentAnglePhotos.some((p) => p.photoId === aId);
    if (!aValid) {
      if (newestId !== bId) {
        aId = newestId;
      } else {
        const alt = currentAnglePhotos.find((p) => p.photoId !== bId);
        aId = alt ? alt.photoId : '';
      }
    }

    const beforePhoto = currentAnglePhotos.find((p) => p.photoId === bId);
    const afterPhoto = currentAnglePhotos.find((p) => p.photoId === aId);

    // Rule 5: Mutual exclusion
    const beforeOptions = currentAnglePhotos.filter((p) => p.photoId !== aId);
    const afterOptions = currentAnglePhotos.filter((p) => p.photoId !== bId);

    return {
      currentAnglePhotos,
      resolvedBeforeId: bId,
      resolvedAfterId: aId,
      beforePhoto,
      afterPhoto,
      beforeOptions,
      afterOptions,
      afterEmptyNoticeRequired: false
    };
  }

  selectBefore(viewType: PhotoViewType, newBeforeId: string) {
    const anglePhotos = this.getAnglePhotos(viewType);
    let currentAfterId = this.angleSelections[viewType].afterPhotoId;
    if (newBeforeId && newBeforeId === currentAfterId) {
      const fallback = anglePhotos.find((p) => p.photoId !== newBeforeId);
      currentAfterId = fallback ? fallback.photoId : '';
    }
    this.angleSelections[viewType] = {
      beforePhotoId: newBeforeId,
      afterPhotoId: currentAfterId
    };
  }

  selectAfter(viewType: PhotoViewType, newAfterId: string) {
    const anglePhotos = this.getAnglePhotos(viewType);
    let currentBeforeId = this.angleSelections[viewType].beforePhotoId;
    if (newAfterId && newAfterId === currentBeforeId) {
      const fallback = anglePhotos.find((p) => p.photoId !== newAfterId);
      currentBeforeId = fallback ? fallback.photoId : '';
    }
    this.angleSelections[viewType] = {
      beforePhotoId: currentBeforeId,
      afterPhotoId: newAfterId
    };
  }
}

async function runBeforeAfterVerification() {
  console.log('====================================================');
  console.log('🚀 Before & After Comparison Logic Verification');
  console.log('====================================================\n');

  const sim = new BeforeAfterComparisonSimulator();

  // ----------------------------------------------------
  // Test 1: 사진 0장 (0 Photos)
  // ----------------------------------------------------
  console.log('1. Testing 0 Photos (Empty state):');
  const res0 = sim.resolveComparison('FRONT');
  assert.strictEqual(res0.currentAnglePhotos.length, 0, 'Must have 0 photos');
  assert.strictEqual(res0.resolvedBeforeId, '', 'Before ID must be empty');
  assert.strictEqual(res0.resolvedAfterId, '', 'After ID must be empty');
  assert.strictEqual(res0.beforePhoto, undefined, 'Before photo must be undefined');
  assert.strictEqual(res0.afterPhoto, undefined, 'After photo must be undefined');
  assert.strictEqual(res0.beforeOptions.length, 0, 'No before options');
  assert.strictEqual(res0.afterOptions.length, 0, 'No after options');
  assert.strictEqual(res0.afterEmptyNoticeRequired, false);
  console.log('✅ [PASS] 0 Photos: Clean empty state on both Before and After');

  // ----------------------------------------------------
  // Test 2: 사진 1장 (Single Photo - Core Bug Scenario)
  // ----------------------------------------------------
  console.log('\n2. Testing 1 Photo (Single photo - No duplicate display):');
  const photo1: ProgressPhoto = {
    photoId: 'photo-front-001',
    centerId: 'c1',
    memberId: 'm1',
    trainerId: 't1',
    viewType: 'FRONT',
    takenAt: '2026-10-01',
    photoUrl: 'https://storage.googleapis.com/test/photo1.jpg',
    storagePath: 'centers/c1/members/m1/photos/p1.jpg',
    caption: '첫 측정 사진',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z'
  };
  sim.setPhotos([photo1]);

  const res1 = sim.resolveComparison('FRONT');
  assert.strictEqual(res1.currentAnglePhotos.length, 1, 'Must have 1 photo');
  assert.strictEqual(res1.resolvedBeforeId, 'photo-front-001', 'Before must be photo-front-001');
  assert.strictEqual(res1.resolvedAfterId, '', 'After ID must be EMPTY');
  assert.strictEqual(res1.beforePhoto?.photoId, 'photo-front-001', 'Before photo displayed');
  assert.strictEqual(res1.afterPhoto, undefined, 'After photo MUST be undefined (NOT duplicated)');
  assert.strictEqual(res1.afterEmptyNoticeRequired, true, 'After empty notice must be triggered');
  assert.strictEqual(res1.afterOptions.length, 0, 'After options must have 0 choices (photo1 excluded)');
  assert(!res1.afterPhoto || res1.beforePhoto.photoId !== (res1.afterPhoto as any).photoId, 'Same photo must NEVER appear on both sides');
  console.log('✅ [PASS] 1 Photo: Displayed in Before ONLY; After shows "비교할 이후 사진이 없습니다" notice without duplication');

  // ----------------------------------------------------
  // Test 3: 사진 2장 (2 Photos - Different Dates)
  // ----------------------------------------------------
  console.log('\n3. Testing 2 Photos (Different dates):');
  const photo2: ProgressPhoto = {
    photoId: 'photo-front-002',
    centerId: 'c1',
    memberId: 'm1',
    trainerId: 't1',
    viewType: 'FRONT',
    takenAt: '2026-10-06',
    photoUrl: 'https://storage.googleapis.com/test/photo2.jpg',
    storagePath: 'centers/c1/members/m1/photos/p2.jpg',
    caption: '중간 점검',
    createdAt: '2026-10-06T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z'
  };
  sim.setPhotos([photo1, photo2]);

  const res2 = sim.resolveComparison('FRONT');
  assert.strictEqual(res2.currentAnglePhotos.length, 2);
  assert.strictEqual(res2.resolvedBeforeId, 'photo-front-001', 'Before default = oldest (2026-10-01)');
  assert.strictEqual(res2.resolvedAfterId, 'photo-front-002', 'After default = newest (2026-10-06)');
  assert.strictEqual(res2.beforePhoto?.photoId, 'photo-front-001');
  assert.strictEqual(res2.afterPhoto?.photoId, 'photo-front-002');
  assert.notStrictEqual(res2.beforePhoto?.photoId, res2.afterPhoto?.photoId, 'Before and After must differ');

  // Exclusion check: Before options cannot contain After ID; After options cannot contain Before ID
  assert.deepStrictEqual(
    res2.beforeOptions.map((p) => p.photoId),
    ['photo-front-001'],
    'Before options must exclude After photo (photo-front-002)'
  );
  assert.deepStrictEqual(
    res2.afterOptions.map((p) => p.photoId),
    ['photo-front-002'],
    'After options must exclude Before photo (photo-front-001)'
  );
  console.log('✅ [PASS] 2 Photos: Oldest set to Before, Newest set to After; Mutual exclusion active');

  // ----------------------------------------------------
  // Test 4: 사진 3장 이상 (Multiple Photos & Dynamic Selection)
  // ----------------------------------------------------
  console.log('\n4. Testing 3+ Photos (4 photos with selection switching):');
  const photo3: ProgressPhoto = {
    photoId: 'photo-front-003',
    centerId: 'c1',
    memberId: 'm1',
    trainerId: 't1',
    viewType: 'FRONT',
    takenAt: '2026-10-15',
    photoUrl: 'https://storage.googleapis.com/test/photo3.jpg',
    storagePath: 'centers/c1/members/m1/photos/p3.jpg',
    caption: '3주차 점검',
    createdAt: '2026-10-15T10:00:00Z',
    updatedAt: '2026-10-15T10:00:00Z'
  };
  const photo4: ProgressPhoto = {
    photoId: 'photo-front-004',
    centerId: 'c1',
    memberId: 'm1',
    trainerId: 't1',
    viewType: 'FRONT',
    takenAt: '2026-10-25',
    photoUrl: 'https://storage.googleapis.com/test/photo4.jpg',
    storagePath: 'centers/c1/members/m1/photos/p4.jpg',
    caption: '최종 점검',
    createdAt: '2026-10-25T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z'
  };
  sim.setPhotos([photo1, photo2, photo3, photo4]);

  const res4Default = sim.resolveComparison('FRONT');
  assert.strictEqual(res4Default.resolvedBeforeId, 'photo-front-001', 'Default Before = photo-front-001');
  assert.strictEqual(res4Default.resolvedAfterId, 'photo-front-004', 'Default After = photo-front-004');

  // User changes Before to photo3 (2026-10-15)
  sim.selectBefore('FRONT', 'photo-front-003');
  const res4ChangedBefore = sim.resolveComparison('FRONT');
  assert.strictEqual(res4ChangedBefore.resolvedBeforeId, 'photo-front-003');
  assert.strictEqual(res4ChangedBefore.resolvedAfterId, 'photo-front-004');
  assert(
    !res4ChangedBefore.afterOptions.some((p) => p.photoId === 'photo-front-003'),
    'After options must exclude currently selected Before (photo-front-003)'
  );
  assert(
    res4ChangedBefore.afterOptions.some((p) => p.photoId === 'photo-front-001'),
    'After options must allow earlier photo-front-001 if different'
  );

  // User tries to select the same photo for After
  sim.selectAfter('FRONT', 'photo-front-003');
  const res4CollisionHandled = sim.resolveComparison('FRONT');
  assert.notStrictEqual(
    res4CollisionHandled.resolvedBeforeId,
    res4CollisionHandled.resolvedAfterId,
    'Collision must be resolved to distinct photoIds'
  );
  console.log('✅ [PASS] 4 Photos: Selection switching respects mutual exclusion and prevents duplicate selection');

  // ----------------------------------------------------
  // Test 5: 같은 날짜 2장 (Same Date Multiple Photos)
  // ----------------------------------------------------
  console.log('\n5. Testing 2 Photos on the Same Date (Same takenAt, distinct photoId):');
  const sameDate1: ProgressPhoto = {
    photoId: 'photo-same-date-A',
    centerId: 'c1',
    memberId: 'm1',
    trainerId: 't1',
    viewType: 'SIDE',
    takenAt: '2026-10-06',
    photoUrl: 'https://storage.googleapis.com/test/sameA.jpg',
    storagePath: 'centers/c1/members/m1/photos/sameA.jpg',
    caption: '오전 공복 측면',
    createdAt: '2026-10-06T09:00:00Z',
    updatedAt: '2026-10-06T09:00:00Z'
  };
  const sameDate2: ProgressPhoto = {
    photoId: 'photo-same-date-B',
    centerId: 'c1',
    memberId: 'm1',
    trainerId: 't1',
    viewType: 'SIDE',
    takenAt: '2026-10-06',
    photoUrl: 'https://storage.googleapis.com/test/sameB.jpg',
    storagePath: 'centers/c1/members/m1/photos/sameB.jpg',
    caption: '운동 후 측면',
    createdAt: '2026-10-06T15:00:00Z',
    updatedAt: '2026-10-06T15:00:00Z'
  };
  sim.setPhotos([sameDate1, sameDate2]);

  const resSameDate = sim.resolveComparison('SIDE');
  assert.strictEqual(resSameDate.currentAnglePhotos.length, 2);
  assert.strictEqual(resSameDate.resolvedBeforeId, 'photo-same-date-A', 'Before = morning photo');
  assert.strictEqual(resSameDate.resolvedAfterId, 'photo-same-date-B', 'After = afternoon photo');
  assert((resSameDate.resolvedBeforeId as string) !== (resSameDate.resolvedAfterId as string), 'Photos on same date must be comparable');

  // Label formatting check
  const sideLabels = sim.getPhotoOptionLabels('SIDE');
  const labelA = sideLabels.get('photo-same-date-A');
  const labelB = sideLabels.get('photo-same-date-B');
  assert(labelA && labelA.includes('2026-10-06 · #1'), `Label A must include #1: ${labelA}`);
  assert(labelB && labelB.includes('2026-10-06 · #2'), `Label B must include #2: ${labelB}`);
  console.log(`✅ [PASS] Same Date Photos: Label A: "${labelA}", Label B: "${labelB}". Properly indexed and compared.`);

  // ----------------------------------------------------
  // Test 6: 각도별 (FRONT, SIDE, BACK, OTHER) 독립성
  // ----------------------------------------------------
  console.log('\n6. Testing Independence of FRONT/SIDE/BACK/OTHER angles:');
  const mixedPhotos: ProgressPhoto[] = [
    // FRONT: 2 photos
    {
      photoId: 'f-1',
      centerId: 'c1',
      memberId: 'm1',
      trainerId: 't1',
      viewType: 'FRONT',
      takenAt: '2026-09-01',
      photoUrl: 'url',
      storagePath: 'p',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z'
    },
    {
      photoId: 'f-2',
      centerId: 'c1',
      memberId: 'm1',
      trainerId: 't1',
      viewType: 'FRONT',
      takenAt: '2026-10-01',
      photoUrl: 'url',
      storagePath: 'p',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z'
    },
    // SIDE: 1 photo
    {
      photoId: 's-1',
      centerId: 'c1',
      memberId: 'm1',
      trainerId: 't1',
      viewType: 'SIDE',
      takenAt: '2026-09-15',
      photoUrl: 'url',
      storagePath: 'p',
      createdAt: '2026-09-15T00:00:00Z',
      updatedAt: '2026-09-15T00:00:00Z'
    },
    // BACK: 0 photos
    // OTHER: 3 photos
    {
      photoId: 'o-1',
      centerId: 'c1',
      memberId: 'm1',
      trainerId: 't1',
      viewType: 'OTHER',
      takenAt: '2026-08-01',
      photoUrl: 'url',
      storagePath: 'p',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z'
    },
    {
      photoId: 'o-2',
      centerId: 'c1',
      memberId: 'm1',
      trainerId: 't1',
      viewType: 'OTHER',
      takenAt: '2026-09-01',
      photoUrl: 'url',
      storagePath: 'p',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z'
    },
    {
      photoId: 'o-3',
      centerId: 'c1',
      memberId: 'm1',
      trainerId: 't1',
      viewType: 'OTHER',
      takenAt: '2026-10-01',
      photoUrl: 'url',
      storagePath: 'p',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z'
    }
  ];
  sim.setPhotos(mixedPhotos);

  const frontRes = sim.resolveComparison('FRONT');
  assert.strictEqual(frontRes.currentAnglePhotos.length, 2);
  assert.strictEqual(frontRes.resolvedBeforeId, 'f-1');
  assert.strictEqual(frontRes.resolvedAfterId, 'f-2');

  const sideRes = sim.resolveComparison('SIDE');
  assert.strictEqual(sideRes.currentAnglePhotos.length, 1);
  assert.strictEqual(sideRes.resolvedBeforeId, 's-1');
  assert.strictEqual(sideRes.resolvedAfterId, '');
  assert.strictEqual(sideRes.afterEmptyNoticeRequired, true);

  const backRes = sim.resolveComparison('BACK');
  assert.strictEqual(backRes.currentAnglePhotos.length, 0);
  assert.strictEqual(backRes.resolvedBeforeId, '');
  assert.strictEqual(backRes.resolvedAfterId, '');

  const otherRes = sim.resolveComparison('OTHER');
  assert.strictEqual(otherRes.currentAnglePhotos.length, 3);
  assert.strictEqual(otherRes.resolvedBeforeId, 'o-1');
  assert.strictEqual(otherRes.resolvedAfterId, 'o-3');
  console.log('✅ [PASS] FRONT(2장), SIDE(1장), BACK(0장), OTHER(3장) each strictly isolated');

  // ----------------------------------------------------
  // Test 7: Static Source Code Verification
  // ----------------------------------------------------
  console.log('\n7. Static Source Code Verification in PhotosTab.tsx & MemberPhotosTab.tsx:');
  const photosTabCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/PhotosTab.tsx'), 'utf-8');
  assert(
    photosTabCode.includes('currentAnglePhotos.filter((p) => p.photoId !== resolvedAfterId)'),
    'PhotosTab must exclude resolvedAfterId from beforeOptions'
  );
  assert(
    photosTabCode.includes('currentAnglePhotos.filter((p) => p.photoId !== resolvedBeforeId)'),
    'PhotosTab must exclude resolvedBeforeId from afterOptions'
  );
  assert(
    photosTabCode.includes('비교할 이후 사진이 없습니다'),
    'PhotosTab must display notice when 1 photo exists'
  );
  assert(
    !photosTabCode.includes('setBeforeDate(uniqueDates[0]);\n        setAfterDate(uniqueDates[0])'),
    'PhotosTab must NOT set identical date for before and after on single photo'
  );

  const memberTabCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/member/MemberPhotosTab.tsx'), 'utf-8');
  assert(
    memberTabCode.includes('sortedChronological.filter((p: ProgressPhoto) => p.photoId !== resolvedAfterId)'),
    'MemberPhotosTab must exclude resolvedAfterId from beforeOptions'
  );
  assert(
    memberTabCode.includes('sortedChronological.filter((p: ProgressPhoto) => p.photoId !== resolvedBeforeId)'),
    'MemberPhotosTab must exclude resolvedBeforeId from afterOptions'
  );
  console.log('✅ [PASS] Static code checks verified in PhotosTab.tsx & MemberPhotosTab.tsx');

  console.log('\n====================================================');
  console.log('🎉 ALL 7 BEFORE/AFTER COMPARISON TESTS PASSED (100%)');
  console.log('====================================================');
}

runBeforeAfterVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
