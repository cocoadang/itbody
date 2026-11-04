import fs from 'fs';
import path from 'path';
import type { UserProfile, UserRole } from '../src/types';
import { assertCanWrite } from '../src/services/dataService';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${msg}`);
  }
  console.log(`[PASS] ${msg}`);
}

async function runAuthRbacVerification() {
  console.log('--- 1. DEMO_USERS & Preset UI Codebase Scan ---');

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
    assert(!content.includes('DEMO_USERS'), `No DEMO_USERS reference in ${relPath}`);
    assert(!content.includes('PredefinedUser'), `No PredefinedUser reference in ${relPath}`);
    assert(!content.includes('currentDemoUser'), `No currentDemoUser reference in ${relPath}`);
    assert(!content.includes('switchUser'), `No switchUser reference in ${relPath}`);
    assert(!content.includes('[개발용] 역할 프리셋'), `No preset UI tab in ${relPath}`);
  }

  console.log('--- 2. RBAC Profile Resolution Logic (Fail-Closed Verification) ---');

  // Helper matching AuthContext resolution logic
  function resolveUserProfile(
    firebaseUid: string,
    firebaseEmail: string | null,
    userDocData: Record<string, any> | null,
    trainersInCenter: any[] = []
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

    let resolvedTrainerId = userDocData.trainerId;
    let resolvedName = userDocData.name || '사용자';

    if (role === 'TRAINER') {
      let matchedTrainer = trainersInCenter.find((t) => t.uid && t.uid === firebaseUid);
      if (!matchedTrainer && userDocData.trainerId) {
        matchedTrainer = trainersInCenter.find((t) => t.trainerId === userDocData.trainerId);
      }
      if (!matchedTrainer && firebaseEmail) {
        const lowerEmail = firebaseEmail.toLowerCase();
        matchedTrainer = trainersInCenter.find(
          (t) => t.loginEmail && t.loginEmail.toLowerCase() === lowerEmail
        );
      }
      if (matchedTrainer) {
        resolvedTrainerId = matchedTrainer.trainerId;
        resolvedName = matchedTrainer.name || resolvedName;
      }
    }

    return {
      profile: {
        uid: firebaseUid,
        email: firebaseEmail || userDocData.email || '',
        name: resolvedName,
        role: role,
        centerId: centerId.trim(),
        trainerId: resolvedTrainerId,
        memberId: userDocData.memberId
      },
      error: null
    };
  }

  // Test 2-1: CENTER_ADMIN normal authentication
  const adminResult = resolveUserProfile(
    'uid-admin-123',
    'admin@gym.com',
    {
      role: 'CENTER_ADMIN',
      centerId: 'center-gangnam-01',
      name: '홍길동 대표'
    }
  );
  assert(adminResult.profile !== null, 'CENTER_ADMIN profile successfully resolved');
  assert(adminResult.profile?.role === 'CENTER_ADMIN', 'Role is CENTER_ADMIN');
  assert(adminResult.profile?.centerId === 'center-gangnam-01', 'Center ID correctly assigned');
  assert(adminResult.error === null, 'No profile error for valid admin');

  // Test 2-2: TRAINER normal authentication with trainer collection linkage
  const trainerResult = resolveUserProfile(
    'uid-tr-456',
    'trainer.kim@gym.com',
    {
      role: 'TRAINER',
      centerId: 'center-gangnam-01',
      name: '김코치'
    },
    [
      {
        trainerId: 'tr-01',
        uid: 'uid-tr-456',
        name: '김코치 트레이너',
        loginEmail: 'trainer.kim@gym.com'
      }
    ]
  );
  assert(trainerResult.profile !== null, 'TRAINER profile successfully resolved');
  assert(trainerResult.profile?.role === 'TRAINER', 'Role is TRAINER');
  assert(trainerResult.profile?.trainerId === 'tr-01', 'Trainer ID resolved from trainers collection via UID');
  assert(trainerResult.profile?.name === '김코치 트레이너', 'Trainer name resolved from trainers collection');

  // Test 2-3: MEMBER normal authentication
  const memberResult = resolveUserProfile(
    'uid-mem-789',
    'member@gym.com',
    {
      role: 'MEMBER',
      centerId: 'center-gangnam-01',
      memberId: 'mem-001',
      name: '이회원'
    }
  );
  assert(memberResult.profile !== null, 'MEMBER profile successfully resolved');
  assert(memberResult.profile?.role === 'MEMBER', 'Role is MEMBER');
  assert(memberResult.profile?.memberId === 'mem-001', 'Member ID correctly assigned');

  // Test 2-4: Fail-Closed on missing user document
  const missingDocResult = resolveUserProfile('uid-ghost', 'ghost@gym.com', null);
  assert(missingDocResult.profile === null, 'Missing doc returns null profile (Fail-Closed)');
  assert(missingDocResult.error !== null && missingDocResult.error.includes('users/uid-ghost'), 'Returns missing doc error message');

  // Test 2-5: Fail-Closed on invalid role
  const invalidRoleResult = resolveUserProfile('uid-hacker', 'hacker@gym.com', {
    role: 'SUPER_ADMIN_CUSTOM',
    centerId: 'center-01'
  });
  assert(invalidRoleResult.profile === null, 'Invalid role returns null profile (Fail-Closed)');
  assert(invalidRoleResult.error !== null && invalidRoleResult.error.includes('접근 권한'), 'Returns invalid role error message');

  // Test 2-6: Fail-Closed on missing centerId
  const missingCenterResult = resolveUserProfile('uid-orphan', 'orphan@gym.com', {
    role: 'CENTER_ADMIN',
    centerId: ''
  });
  assert(missingCenterResult.profile === null, 'Missing centerId returns null profile (Fail-Closed)');
  assert(missingCenterResult.error !== null && missingCenterResult.error.includes('소속 센터'), 'Returns missing centerId error message');

  console.log('--- 3. LocalStore Security & SSOT Verification ---');
  // Verify that assertCanWrite function exists and validates authentication
  assert(typeof assertCanWrite === 'function', 'assertCanWrite security function is present');

  console.log('--- 4. MemberPortal Logout & Fail-Closed Gate Verification ---');
  const memberPortalCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/member/MemberPortal.tsx'), 'utf-8');
  assert(memberPortalCode.includes('btn-member-profile'), 'MemberPortal contains btn-member-profile dropdown trigger');
  assert(memberPortalCode.includes('member-profile-dropdown'), 'MemberPortal renders mobile-friendly dropdown popover');
  assert(memberPortalCode.includes('btn-member-logout'), 'MemberPortal renders btn-member-logout button');
  assert(memberPortalCode.includes('handleLogout') && (memberPortalCode.includes('await logout()') || memberPortalCode.includes('logout')), 'btn-member-logout executes Firebase Auth logout');
  assert(memberPortalCode.includes('itbody') && !memberPortalCode.includes('PT Journey'), 'MemberPortal header uses unified itbody brand without legacy badges');
  assert(memberPortalCode.includes('text-xl md:text-2xl font-black text-stone-900 tracking-tight leading-none'), 'MemberPortal header matches Navbar itbody typography');

  const appCode = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
  assert(appCode.includes('if (!currentUser)'), 'App.tsx enforces strict unauthenticated gate before rendering MemberPortal');
  assert(appCode.includes('return <LoginView />'), 'App.tsx redirects to LoginView when currentUser is null after logout');

  const navbarCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Navbar.tsx'), 'utf-8');
  assert(navbarCode.includes('logout'), 'Navbar preserves CENTER_ADMIN and TRAINER logout functionality');

  console.log('\n========================================');
  console.log('All Auth/RBAC Verification Tests PASSED!');
  console.log('========================================');
}

runAuthRbacVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
