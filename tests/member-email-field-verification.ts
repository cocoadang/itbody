import { createMember, updateMember, getMemberById, checkMemberEmailExists } from '../src/services/dataService';
import type { Member } from '../src/types';
import fs from 'fs';
import path from 'path';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${msg}`);
  }
  console.log(`[PASS] ${msg}`);
}

async function runMemberEmailFieldVerification() {
  console.log('--- 1. Member Type & Legacy Data Retrieval Verification ---');

  // Case 1: Existing member without email (Legacy)
  const legacyMember = await createMember({
    centerId: 'center-test-01',
    trainerId: 'tr-test-01',
    name: '기존회원',
    gender: 'MALE',
    birthDate: '1990-01-01',
    phone: '01011112222',
    startDate: '2026-01-01',
    status: 'ACTIVE'
  });

  const fetchedLegacy = await getMemberById('center-test-01', legacyMember.memberId, 'CENTER_ADMIN');
  assert(fetchedLegacy !== null, 'Legacy member fetched successfully');
  assert(fetchedLegacy?.email === undefined, 'Legacy member has undefined email and works normally');

  console.log('--- 2. Required Email & Trim + Lowercase & Duplicate Check ---');

  // Case 2: Create new member with trim + lowercase
  const memberA = await createMember({
    centerId: 'center-test-01',
    trainerId: 'tr-test-01',
    name: '김회원',
    gender: 'FEMALE',
    birthDate: '1995-05-15',
    phone: '01033334444',
    email: '  MemberA.Test@Example.COM  ',
    startDate: '2026-10-01',
    status: 'ACTIVE'
  });

  assert(memberA.email === 'membera.test@example.com', 'Email trimmed and lowercased upon creation');

  // Case 3: Duplicate email in the same center must be blocked
  let duplicateBlocked = false;
  try {
    await createMember({
      centerId: 'center-test-01',
      trainerId: 'tr-test-01',
      name: '이회원',
      gender: 'MALE',
      birthDate: '1998-03-20',
      phone: '01055556666',
      email: 'membera.test@example.com', // Duplicate in center-test-01
      startDate: '2026-10-02',
      status: 'ACTIVE'
    });
  } catch (err: any) {
    duplicateBlocked = true;
    assert(err.message.includes('이미 등록된 이메일'), 'Duplicate error message returned');
  }
  assert(duplicateBlocked, 'Duplicate email in the same center was blocked');

  // Case 4: Same email in a DIFFERENT center is allowed
  const memberDifferentCenter = await createMember({
    centerId: 'center-test-02', // Different center
    trainerId: 'tr-test-02',
    name: '박회원',
    gender: 'MALE',
    birthDate: '1994-07-07',
    phone: '01077778888',
    email: 'membera.test@example.com',
    startDate: '2026-10-02',
    status: 'ACTIVE'
  });
  assert(memberDifferentCenter.email === 'membera.test@example.com', 'Same email in different center is allowed');

  // Case 5: Update existing member with new email
  const updatedLegacy = await updateMember(legacyMember.memberId, {
    email: '  Legacy.Member@Example.com '
  });
  assert(updatedLegacy.email === 'legacy.member@example.com', 'Existing member updated with valid trimmed email');

  // Case 6: Update member to an email that is already used in the same center must be blocked
  let updateDuplicateBlocked = false;
  try {
    await updateMember(legacyMember.memberId, {
      email: 'membera.test@example.com' // Already used by memberA in center-test-01
    });
  } catch (err: any) {
    updateDuplicateBlocked = true;
    assert(err.message.includes('이미 등록된 이메일'), 'Update duplicate error message returned');
  }
  assert(updateDuplicateBlocked, 'Updating to an already used email in same center was blocked');

  // Case 7: Update member with their own email must succeed
  const ownEmailUpdate = await updateMember(memberA.memberId, {
    name: '김회원(이름변경)',
    email: 'membera.test@example.com'
  });
  assert(ownEmailUpdate.name === '김회원(이름변경)', 'Updating with own email succeeds without false duplicate error');

  console.log('--- 3. NewMemberModal.tsx Inspection ---');

  const modalContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/NewMemberModal.tsx'), 'utf-8');
  assert(modalContent.includes('new-member-email-input'), 'new-member-email-input field exists');
  assert(modalContent.includes('이메일 (로그인 계정)'), 'Label includes 이메일 (로그인 계정)');
  assert(modalContent.includes('text-rose-500">*</span>'), 'Label has red asterisk indicating required');
  assert(modalContent.includes('checkMemberEmailExists'), 'checkMemberEmailExists is invoked before saving');
  assert(modalContent.includes('setError(\'이메일을 입력해주세요.\')'), 'Empty email is blocked with error');
  assert(!modalContent.includes('createUserWithEmailAndPassword'), 'No automatic Firebase Auth account creation');

  console.log('\n========================================');
  console.log('All Member Email Required Field Tests PASSED!');
  console.log('========================================');
}

runMemberEmailFieldVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
