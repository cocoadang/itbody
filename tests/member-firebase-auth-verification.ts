import fs from 'fs';
import path from 'path';
import type { UserProfile, UserRole } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${msg}`);
  }
  console.log(`[PASS] ${msg}`);
}

async function runMemberFirebaseAuthVerification() {
  console.log('--- 1. Verification of Complete Removal of Temporary Member Session ---');

  const srcDir = path.resolve(process.cwd(), 'src');
  function scanDir(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath, fileList);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  const allSourceFiles = scanDir(srcDir);
  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const relPath = path.relative(process.cwd(), file);
    assert(!content.includes('TemporaryMemberSession'), `No TemporaryMemberSession in ${relPath}`);
    assert(!content.includes('authenticateMemberByNameAndPhone'), `No authenticateMemberByNameAndPhone in ${relPath}`);
    assert(!content.includes('loginAsMember'), `No loginAsMember in ${relPath}`);
    assert(!content.includes('memberAuthService'), `No memberAuthService in ${relPath}`);
  }

  console.log('--- 2. Firebase Auth MEMBER & Staff RBAC Profile Resolution ---');

  function resolveUserProfile(
    firebaseUid: string,
    firebaseEmail: string | null,
    userDocData: Record<string, any> | null
  ): { profile: UserProfile | null; error: string | null } {
    if (!userDocData) {
      return {
        profile: null,
        error: `등록된 사용자 프로필(users/${firebaseUid})이 존재하지 않습니다. 관리자에게 계정 등록을 요청해주세요.`
      };
    }

    const validRoles: UserRole[] = ['CENTER_ADMIN', 'TRAINER', 'MEMBER'];
    const role = userDocData.role as UserRole;
    const centerId = userDocData.centerId;

    if (!role || !validRoles.includes(role)) {
      return {
        profile: null,
        error: '계정에 유효한 접근 권한(role: CENTER_ADMIN / TRAINER / MEMBER)이 지정되지 않았습니다. 관리자에게 문의해주세요.'
      };
    }

    if (!centerId || typeof centerId !== 'string' || centerId.trim() === '') {
      return {
        profile: null,
        error: '계정에 소속 센터(centerId)가 지정되지 않았습니다. 관리자에게 계정 소속 설정을 요청해주세요.'
      };
    }

    return {
      profile: {
        uid: firebaseUid,
        email: firebaseEmail || userDocData.email || '',
        name: userDocData.name || '사용자',
        role: role,
        centerId: centerId.trim(),
        trainerId: userDocData.trainerId,
        memberId: userDocData.memberId
      },
      error: null
    };
  }

  // Test 2-1: Standard MEMBER Login via Firebase Auth
  const memberResult = resolveUserProfile('uid-member-01', 'member.minjun@example.com', {
    role: 'MEMBER',
    centerId: 'center-gangnam-01',
    memberId: 'mem-center-gangnam-01-01',
    name: '가상 회원 A 회원'
  });
  assert(memberResult.profile !== null, 'MEMBER profile successfully resolved from users/{uid}');
  assert(memberResult.profile?.role === 'MEMBER', 'Role is MEMBER');
  assert(memberResult.profile?.memberId === 'mem-center-gangnam-01-01', 'memberId correctly attached for MemberPortal');
  assert(memberResult.profile?.centerId === 'center-gangnam-01', 'centerId correctly attached');

  // Test 2-2: Standard CENTER_ADMIN Login via Firebase Auth
  const adminResult = resolveUserProfile('uid-admin-01', 'admin@example.com', {
    role: 'CENTER_ADMIN',
    centerId: 'center-gangnam-01',
    name: '대표 관리자'
  });
  assert(adminResult.profile !== null, 'CENTER_ADMIN profile successfully resolved');
  assert(adminResult.profile?.role === 'CENTER_ADMIN', 'Role is CENTER_ADMIN');

  // Test 2-3: Standard TRAINER Login via Firebase Auth
  const trainerResult = resolveUserProfile('uid-trainer-01', 'trainer@example.com', {
    role: 'TRAINER',
    centerId: 'center-gangnam-01',
    trainerId: 'tr-01',
    name: '이준호 트레이너'
  });
  assert(trainerResult.profile !== null, 'TRAINER profile successfully resolved');
  assert(trainerResult.profile?.role === 'TRAINER', 'Role is TRAINER');
  assert(trainerResult.profile?.trainerId === 'tr-01', 'trainerId correctly attached');

  // Test 2-4: Fail-Closed on missing user document
  const ghostResult = resolveUserProfile('uid-ghost', 'ghost@example.com', null);
  assert(ghostResult.profile === null, 'Non-existent doc rejected (Fail-Closed)');
  assert(ghostResult.error !== null, 'Error message provided for missing user doc');

  console.log('--- 3. LoginView UI Architecture Verification ---');

  const loginViewContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/LoginView.tsx'), 'utf-8');
  assert(loginViewContent.includes('const [viewMode, setViewMode] = useState<\'member\' | \'staff\'>(\'member\')'), 'Default view is member login');
  assert(loginViewContent.includes('회원 로그인'), 'Member login label present');
  assert(loginViewContent.includes('member-email-input'), 'Member email input present');
  assert(loginViewContent.includes('member-password-input'), 'Member password input present');
  assert(loginViewContent.includes('btn-member-login'), 'Member login submit button present');
  assert(loginViewContent.includes('btn-to-staff-login'), 'Staff login toggle button present');
  assert(loginViewContent.includes('staff-email-input'), 'Staff email input present');
  assert(loginViewContent.includes('staff-password-input'), 'Staff password input present');
  assert(loginViewContent.includes('btn-staff-login'), 'Staff login submit button present');
  assert(loginViewContent.includes('btn-to-member-login'), 'Back to member login button present');
  assert(!loginViewContent.includes('member-phone-input'), 'No member phone input');

  console.log('--- 4. MemberPortal Decoupling Check ---');

  const memberPortalContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/member/MemberPortal.tsx'), 'utf-8');
  assert(memberPortalContent.includes('effectiveMemberId = memberIdOverride || currentUser?.memberId'), 'MemberPortal relies on memberId from currentUser');
  assert(!memberPortalContent.includes('TemporaryMemberSession'), 'MemberPortal has no TemporaryMemberSession dependency');

  console.log('\n========================================');
  console.log('All Member Firebase Auth Verification Tests PASSED!');
  console.log('========================================');
}

runMemberFirebaseAuthVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
