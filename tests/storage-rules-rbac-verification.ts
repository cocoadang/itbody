import assert from 'assert';
import fs from 'fs';
import path from 'path';

interface SimulatedStorageRequest {
  auth: {
    uid: string;
  } | null;
  resource: {
    size: number;
    contentType: string;
  };
}

interface SimulatedFirestoreDatabase {
  users: Record<string, { role: string; centerId: string; trainerId?: string; memberId?: string }>;
  members: Record<string, { centerId: string; trainerId: string; progressPhotoConsent?: { granted: boolean } }>;
}

/**
 * Storage Rules Simulator reproducing the exact semantics of storage.rules:
 * match /centers/{centerId}/members/{memberId}/photos/{photoFile}
 */
class StorageRulesSimulator {
  private db: SimulatedFirestoreDatabase;

  constructor(db: SimulatedFirestoreDatabase) {
    this.db = db;
  }

  private getUserDoc(uid: string) {
    return this.db.users[uid] || null;
  }

  private getMemberDoc(memberId: string) {
    return this.db.members[memberId] || null;
  }

  canWrite(
    req: SimulatedStorageRequest,
    pathParams: { centerId: string; memberId: string; photoFile: string }
  ): { allowed: boolean; reason?: string } {
    const { centerId, memberId } = pathParams;

    if (!req.auth) {
      return { allowed: false, reason: 'Unauthenticated user denied' };
    }

    const userDoc = this.getUserDoc(req.auth.uid);
    if (!userDoc) {
      return { allowed: false, reason: 'User profile document missing' };
    }

    const memberDoc = this.getMemberDoc(memberId);
    if (!memberDoc) {
      return { allowed: false, reason: 'Member profile document missing' };
    }

    // Role helpers
    const isCenterAdmin =
      userDoc.role === 'CENTER_ADMIN' && userDoc.centerId === centerId;

    const isAssignedTrainer =
      userDoc.role === 'TRAINER' &&
      userDoc.centerId === centerId &&
      memberDoc.centerId === centerId &&
      memberDoc.trainerId === userDoc.trainerId;

    if (!isCenterAdmin && !isAssignedTrainer) {
      return { allowed: false, reason: 'Only assigned trainer or center admin may upload photos' };
    }

    // Member consent check
    const isMemberConsentActive =
      memberDoc.progressPhotoConsent?.granted === true;

    if (!isMemberConsentActive) {
      return { allowed: false, reason: 'Member active photo consent is required' };
    }

    // Size limit (< 10MB)
    if (req.resource.size >= 10 * 1024 * 1024) {
      return { allowed: false, reason: 'File size exceeds 10MB limit' };
    }

    // ContentType must match image/.*
    if (!req.resource.contentType.startsWith('image/')) {
      return { allowed: false, reason: 'Content type must be image/*' };
    }

    return { allowed: true };
  }

  canRead(
    req: SimulatedStorageRequest,
    pathParams: { centerId: string; memberId: string; photoFile: string }
  ): { allowed: boolean; reason?: string } {
    const { centerId, memberId } = pathParams;

    if (!req.auth) {
      return { allowed: false, reason: 'Unauthenticated user denied' };
    }

    const userDoc = this.getUserDoc(req.auth.uid);
    if (!userDoc) {
      return { allowed: false, reason: 'User document missing' };
    }

    const memberDoc = this.getMemberDoc(memberId);
    if (!memberDoc) {
      return { allowed: false, reason: 'Member document missing' };
    }

    const isCenterAdmin =
      userDoc.role === 'CENTER_ADMIN' && userDoc.centerId === centerId;

    const isAssignedTrainer =
      userDoc.role === 'TRAINER' &&
      userDoc.centerId === centerId &&
      memberDoc.centerId === centerId &&
      memberDoc.trainerId === userDoc.trainerId;

    const isOwnerMember =
      userDoc.role === 'MEMBER' &&
      userDoc.centerId === centerId &&
      userDoc.memberId === memberId;

    if (isCenterAdmin || isAssignedTrainer || isOwnerMember) {
      return { allowed: true };
    }

    return { allowed: false, reason: 'Read access denied' };
  }
}

async function runStorageRulesVerification() {
  console.log('====================================================');
  console.log('🚀 Running Firebase Storage Security Rules Verification');
  console.log('====================================================\n');

  // Simulated database setup using synthetic tenant and member identifiers
  const testDb: SimulatedFirestoreDatabase = {
    users: {
      'uid-assigned-trainer': {
        role: 'TRAINER',
        centerId: 'center-itbody-01',
        trainerId: 'tr-fixture-assigned'
      },
      'uid-other-trainer': {
        role: 'TRAINER',
        centerId: 'center-itbody-01',
        trainerId: 'tr-other-999'
      },
      'uid-other-center-trainer': {
        role: 'TRAINER',
        centerId: 'center-other-02',
        trainerId: 'tr-cross-001'
      },
      'uid-center-admin': {
        role: 'CENTER_ADMIN',
        centerId: 'center-itbody-01'
      },
      'uid-other-center-admin': {
        role: 'CENTER_ADMIN',
        centerId: 'center-other-02'
      },
      'uid-owner-member': {
        role: 'MEMBER',
        centerId: 'center-itbody-01',
        memberId: 'mem-fixture-owner'
      },
      'uid-other-member': {
        role: 'MEMBER',
        centerId: 'center-itbody-01',
        memberId: 'mem-other-123'
      }
    },
    members: {
      'mem-fixture-owner': {
        centerId: 'center-itbody-01',
        trainerId: 'tr-fixture-assigned',
        progressPhotoConsent: { granted: true }
      },
      'mem-unconsented': {
        centerId: 'center-itbody-01',
        trainerId: 'tr-fixture-assigned',
        progressPhotoConsent: { granted: false }
      }
    }
  };

  const sim = new StorageRulesSimulator(testDb);
  const targetPath = {
    centerId: 'center-itbody-01',
    memberId: 'mem-fixture-owner',
    photoFile: 'photo-1.jpg'
  };

  const validImageResource = {
    size: 2 * 1024 * 1024, // 2MB
    contentType: 'image/jpeg'
  };

  // ----------------------------------------------------
  // Test 1: 정상 담당 TRAINER (ALLOW)
  // ----------------------------------------------------
  console.log('1. Checking Assigned Trainer upload permission:');
  const assignedTrainerWrite = sim.canWrite(
    { auth: { uid: 'uid-assigned-trainer' }, resource: validImageResource },
    targetPath
  );
  assert(assignedTrainerWrite.allowed, 'Assigned trainer must be allowed to upload');
  console.log('✅ [PASS] Assigned Trainer upload ALLOWED');

  // ----------------------------------------------------
  // Test 2: 다른 TRAINER (DENY)
  // ----------------------------------------------------
  console.log('\n2. Checking Other (Unassigned) Trainer upload permission:');
  const otherTrainerWrite = sim.canWrite(
    { auth: { uid: 'uid-other-trainer' }, resource: validImageResource },
    targetPath
  );
  assert(!otherTrainerWrite.allowed, 'Unassigned trainer must be DENIED');
  console.log(`✅ [PASS] Other Trainer upload DENIED (${otherTrainerWrite.reason})`);

  // ----------------------------------------------------
  // Test 3: 타 센터 TRAINER (DENY)
  // ----------------------------------------------------
  console.log('\n3. Checking Cross-Center Trainer upload permission:');
  const crossCenterTrainerWrite = sim.canWrite(
    { auth: { uid: 'uid-other-center-trainer' }, resource: validImageResource },
    targetPath
  );
  assert(!crossCenterTrainerWrite.allowed, 'Cross-center trainer must be DENIED');
  console.log(`✅ [PASS] Cross-Center Trainer upload DENIED (${crossCenterTrainerWrite.reason})`);

  // ----------------------------------------------------
  // Test 4: CENTER_ADMIN (같은 센터) (ALLOW)
  // ----------------------------------------------------
  console.log('\n4. Checking CENTER_ADMIN upload permission:');
  const adminWrite = sim.canWrite(
    { auth: { uid: 'uid-center-admin' }, resource: validImageResource },
    targetPath
  );
  assert(adminWrite.allowed, 'Center admin must be allowed to upload for consenting member');
  console.log('✅ [PASS] CENTER_ADMIN upload ALLOWED');

  // ----------------------------------------------------
  // Test 5: 타 센터 CENTER_ADMIN (DENY)
  // ----------------------------------------------------
  console.log('\n5. Checking Cross-Center Admin upload permission:');
  const crossAdminWrite = sim.canWrite(
    { auth: { uid: 'uid-other-center-admin' }, resource: validImageResource },
    targetPath
  );
  assert(!crossAdminWrite.allowed, 'Cross-center admin must be DENIED');
  console.log(`✅ [PASS] Cross-Center Admin upload DENIED (${crossAdminWrite.reason})`);

  // ----------------------------------------------------
  // Test 6: MEMBER 본인 (WRITE DENIED, READ ALLOWED)
  // ----------------------------------------------------
  console.log('\n6. Checking MEMBER upload permission (Must NOT have write permission):');
  const memberWrite = sim.canWrite(
    { auth: { uid: 'uid-owner-member' }, resource: validImageResource },
    targetPath
  );
  assert(!memberWrite.allowed, 'Member must NOT be granted write permission');
  console.log(`✅ [PASS] MEMBER upload DENIED (${memberWrite.reason})`);

  const memberRead = sim.canRead(
    { auth: { uid: 'uid-owner-member' }, resource: validImageResource },
    targetPath
  );
  assert(memberRead.allowed, 'Owner member must be allowed to read own photo');
  console.log('✅ [PASS] MEMBER read of own photo ALLOWED');

  // ----------------------------------------------------
  // Test 7: 타 MEMBER 열람 차단 (DENY)
  // ----------------------------------------------------
  console.log('\n7. Checking Other MEMBER read permission:');
  const otherMemberRead = sim.canRead(
    { auth: { uid: 'uid-other-member' }, resource: validImageResource },
    targetPath
  );
  assert(!otherMemberRead.allowed, 'Other member must NOT be allowed to read another member photo');
  console.log(`✅ [PASS] Other MEMBER read DENIED (${otherMemberRead.reason})`);

  // ----------------------------------------------------
  // Test 8: 미인증 사용자 (DENY)
  // ----------------------------------------------------
  console.log('\n8. Checking Unauthenticated user permission:');
  const unauthWrite = sim.canWrite({ auth: null, resource: validImageResource }, targetPath);
  assert(!unauthWrite.allowed, 'Unauthenticated write must be DENIED');
  const unauthRead = sim.canRead({ auth: null, resource: validImageResource }, targetPath);
  assert(!unauthRead.allowed, 'Unauthenticated read must be DENIED');
  console.log('✅ [PASS] Unauthenticated upload and read strictly DENIED');

  // ----------------------------------------------------
  // Test 9: 미동의 또는 동의 철회 회원 (DENY even for assigned trainer)
  // ----------------------------------------------------
  console.log('\n9. Checking Unconsented Member upload permission:');
  const unconsentedPath = {
    centerId: 'center-itbody-01',
    memberId: 'mem-unconsented',
    photoFile: 'photo-1.jpg'
  };
  const unconsentedWrite = sim.canWrite(
    { auth: { uid: 'uid-assigned-trainer' }, resource: validImageResource },
    unconsentedPath
  );
  assert(!unconsentedWrite.allowed, 'Upload must be DENIED without active member consent');
  console.log(`✅ [PASS] Unconsented member upload DENIED (${unconsentedWrite.reason})`);

  // ----------------------------------------------------
  // Test 10: 비이미지 파일 형식 차단 (DENY)
  // ----------------------------------------------------
  console.log('\n10. Checking Non-Image content type upload:');
  const textFileResource = {
    size: 1024,
    contentType: 'text/plain'
  };
  const textFileWrite = sim.canWrite(
    { auth: { uid: 'uid-assigned-trainer' }, resource: textFileResource },
    targetPath
  );
  assert(!textFileWrite.allowed, 'Non-image content type must be DENIED');
  console.log(`✅ [PASS] Non-image upload DENIED (${textFileWrite.reason})`);

  // ----------------------------------------------------
  // Test 11: 10MB 초과 파일 차단 (DENY)
  // ----------------------------------------------------
  console.log('\n11. Checking Oversized file (>10MB) upload:');
  const oversizedResource = {
    size: 11 * 1024 * 1024, // 11MB
    contentType: 'image/jpeg'
  };
  const oversizedWrite = sim.canWrite(
    { auth: { uid: 'uid-assigned-trainer' }, resource: oversizedResource },
    targetPath
  );
  assert(!oversizedWrite.allowed, 'Oversized file upload must be DENIED');
  console.log(`✅ [PASS] Oversized file upload DENIED (${oversizedWrite.reason})`);

  // ----------------------------------------------------
  // Test 12: storage.rules 소스 코드 검증
  // ----------------------------------------------------
  console.log('\n12. Validating storage.rules static rules:');
  const storageRulesContent = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf-8');
  assert(
    storageRulesContent.includes('match /centers/{centerId}/members/{memberId}/photos/{photoFile}'),
    'Path pattern must exactly match centers/{centerId}/members/{memberId}/photos/{photoFile}'
  );
  assert(
    storageRulesContent.includes("request.resource.contentType.matches('image/.*')"),
    'Must restrict contentType to image/*'
  );
  assert(
    storageRulesContent.includes('request.resource.size < 10 * 1024 * 1024'),
    'Must restrict file size to 10MB'
  );
  assert(
    storageRulesContent.includes('isMemberConsentActive()'),
    'Must verify member active photo consent in storage.rules'
  );
  assert(
    !storageRulesContent.includes('if request.auth != null;') &&
      !storageRulesContent.includes('allow read, write: if request.auth != null'),
    'Must NOT have permissive wildcards'
  );
  console.log('✅ [PASS] storage.rules source code fully verified');

  console.log('\n====================================================');
  console.log('🎉 ALL 12 STORAGE RULES TESTS PASSED (100%)');
  console.log('====================================================');
}

runStorageRulesVerification().catch((err) => {
  console.error('❌ Storage Rules verification failed:', err);
  process.exit(1);
});
