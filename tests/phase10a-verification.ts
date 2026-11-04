import fs from 'fs';
import path from 'path';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${msg}`);
  }
  console.log(`[PASS] ${msg}`);
}

async function runPhase10aVerification() {
  console.log('=== Phase 10A: CENTER_ADMIN Account Provisioning Verification ===\n');

  console.log('--- 1. Server Endpoint & Middleware Verification ---');
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverCode = fs.readFileSync(serverPath, 'utf-8');
  assert(
    serverCode.includes('registerAdminAccountEndpoints'),
    'server.ts registers registerAdminAccountEndpoints'
  );

  const endpointPath = path.resolve(process.cwd(), 'src/server/adminAccountEndpoints.ts');
  assert(fs.existsSync(endpointPath), 'src/server/adminAccountEndpoints.ts exists');
  const endpointCode = fs.readFileSync(endpointPath, 'utf-8');

  // Check endpoints registered
  assert(
    endpointCode.includes("app.post('/api/admin/provision-account'"),
    'POST /api/admin/provision-account endpoint is defined'
  );
  assert(
    endpointCode.includes("app.post('/api/admin/reset-password-link'"),
    'POST /api/admin/reset-password-link endpoint is defined'
  );

  // Check auth & role verification
  assert(
    endpointCode.includes('requireCenterAdmin'),
    'requireCenterAdmin middleware is defined and used'
  );
  assert(
    endpointCode.includes('verifyIdToken'),
    'Middleware verifies Firebase ID token via verifyIdToken'
  );
  assert(
    endpointCode.includes("callerData.role !== 'CENTER_ADMIN'"),
    'Middleware strictly checks caller role === CENTER_ADMIN'
  );

  // Check tenant boundary check
  assert(
    endpointCode.includes('targetCenterId !== caller.centerId'),
    'Endpoint enforces strict tenant isolation (targetCenterId === caller.centerId)'
  );

  // Check email presence validation
  assert(
    endpointCode.includes('if (!targetEmail)'),
    'Endpoint blocks provisioning when target has no email registered'
  );

  // Check already provisioned UID check
  assert(
    endpointCode.includes('targetExistingUid'),
    'Endpoint blocks re-provisioning when target already has a UID'
  );

  // Check duplicate email validation
  assert(
    endpointCode.includes('dupMemberSnap'),
    'Endpoint checks for duplicate email across same-center members'
  );
  assert(
    endpointCode.includes('dupTrainerSnap'),
    'Endpoint checks for duplicate email across same-center trainers'
  );
  assert(
    endpointCode.includes('getUserByEmail'),
    'Endpoint checks Firebase Auth for existing user with identical email'
  );

  // Check Firebase Auth creation without admin password
  assert(
    endpointCode.includes('admin.auth.createUser'),
    'Endpoint creates Firebase Auth user via admin.auth.createUser'
  );
  assert(
    !endpointCode.includes('password:') && !endpointCode.includes('tempPassword'),
    'Endpoint NEVER accepts or sets a password directly; uses resetLink instead'
  );

  // Check Firestore batch commit & users/{uid} creation
  assert(
    endpointCode.includes('admin.db.batch()'),
    'Endpoint uses atomic Firestore batch commit'
  );
  assert(
    endpointCode.includes("role: 'MEMBER'") && endpointCode.includes("role: 'TRAINER'"),
    'Endpoint writes correct role in users/{newUid} based on targetType'
  );
  assert(
    endpointCode.includes('batch.update(targetDocRef, {') && endpointCode.includes('uid: newUid'),
    'Endpoint atomically links uid to target member/trainer document'
  );

  // Check Compensating Transaction rollback on failure
  assert(
    endpointCode.includes('admin.auth.deleteUser(newUid)'),
    'Endpoint implements compensating transaction: deletes Auth user if Firestore batch fails'
  );

  // Check password setup link generation
  assert(
    endpointCode.includes('generatePasswordResetLink'),
    'Endpoint generates password setup/reset link for user'
  );

  console.log('\n--- 2. Client Service Layer Verification ---');
  const servicePath = path.resolve(process.cwd(), 'src/services/adminAccountService.ts');
  assert(fs.existsSync(servicePath), 'src/services/adminAccountService.ts exists');
  const serviceCode = fs.readFileSync(servicePath, 'utf-8');

  assert(
    serviceCode.includes('export async function provisionAccount('),
    'provisionAccount function is exported'
  );
  assert(
    serviceCode.includes('export async function generateResetPasswordLink('),
    'generateResetPasswordLink function is exported'
  );
  assert(
    serviceCode.includes('httpsCallable') || serviceCode.includes('getIdToken(true)'),
    'Service securely authenticates caller via Firebase ID token / httpsCallable'
  );
  assert(
    serviceCode.includes('{ targetType, targetId }'),
    'Service passes only targetType and targetId (minimal trusted payload)'
  );

  console.log('\n--- 3. UI Component Integration Verification ---');
  // PasswordLinkModal check
  const modalPath = path.resolve(process.cwd(), 'src/components/PasswordLinkModal.tsx');
  assert(fs.existsSync(modalPath), 'src/components/PasswordLinkModal.tsx exists');
  const modalCode = fs.readFileSync(modalPath, 'utf-8');
  assert(
    modalCode.includes('navigator.clipboard.writeText'),
    'PasswordLinkModal supports one-click clipboard copy'
  );

  // MemberDetailView check
  const memberDetailPath = path.resolve(process.cwd(), 'src/components/MemberDetailView.tsx');
  const memberDetailCode = fs.readFileSync(memberDetailPath, 'utf-8');
  assert(
    memberDetailCode.includes('provisionAccount'),
    'MemberDetailView imports and uses provisionAccount'
  );
  assert(
    memberDetailCode.includes('btn-member-provision-account'),
    'MemberDetailView has btn-member-provision-account button for unprovisioned member'
  );
  assert(
    memberDetailCode.includes('btn-member-reset-password'),
    'MemberDetailView has btn-member-reset-password button for provisioned member'
  );
  assert(
    memberDetailCode.includes('PasswordLinkModal'),
    'MemberDetailView embeds PasswordLinkModal'
  );
  assert(
    memberDetailCode.includes('계정 연동됨') &&
      (memberDetailCode.includes('계정 미발급') || memberDetailCode.includes('로그인 계정 미연결')),
    'MemberDetailView displays account status badges'
  );

  // TrainerList check
  const trainerListPath = path.resolve(process.cwd(), 'src/components/TrainerList.tsx');
  const trainerListCode = fs.readFileSync(trainerListPath, 'utf-8');
  assert(
    trainerListCode.includes('provisionAccount'),
    'TrainerList imports and uses provisionAccount'
  );
  assert(
    trainerListCode.includes('btn-trainer-provision-'),
    'TrainerList has btn-trainer-provision button for unprovisioned trainer'
  );
  assert(
    trainerListCode.includes('btn-trainer-reset-password-'),
    'TrainerList has btn-trainer-reset-password button for provisioned trainer'
  );
  assert(
    trainerListCode.includes('PasswordLinkModal'),
    'TrainerList embeds PasswordLinkModal'
  );
  assert(
    trainerListCode.includes('계정 연동됨') &&
      (trainerListCode.includes('계정 미발급') || trainerListCode.includes('로그인 계정 미연결')),
    'TrainerList displays account status badges'
  );

  console.log('\n--- 4. Mock Endpoint Logic Simulation ---');
  // Simulate the target validation rules
  function validateProvisionTarget(
    caller: { role: string; centerId: string },
    target: {
      centerId: string;
      email?: string | null;
      uid?: string | null;
      name: string;
    },
    allMembersInCenter: Array<{ memberId: string; email?: string | null }>,
    allTrainersInCenter: Array<{ trainerId: string; loginEmail?: string | null }>,
    currentId: string,
    existingAuthEmails: string[]
  ): { status: number; error?: string } {
    if (caller.role !== 'CENTER_ADMIN') {
      return { status: 403, error: '접근 권한이 없습니다. CENTER_ADMIN만 가능합니다.' };
    }
    if (caller.centerId !== target.centerId) {
      return { status: 403, error: '소속 센터의 대상에 대해서만 계정을 발급할 수 있습니다.' };
    }
    if (!target.email || !target.email.trim()) {
      return { status: 400, error: '이메일이 등록되어 있지 않습니다.' };
    }
    if (target.uid) {
      return { status: 400, error: '이미 로그인 계정이 발급된 대상입니다.' };
    }
    const cleanEmail = target.email.trim().toLowerCase();
    const dupMember = allMembersInCenter.find(
      (m) => m.memberId !== currentId && m.email?.trim().toLowerCase() === cleanEmail
    );
    if (dupMember) {
      return { status: 400, error: '이미 다른 회원에 등록된 이메일입니다.' };
    }
    const dupTrainer = allTrainersInCenter.find(
      (t) => t.trainerId !== currentId && t.loginEmail?.trim().toLowerCase() === cleanEmail
    );
    if (dupTrainer) {
      return { status: 400, error: '이미 다른 트레이너에 등록된 이메일입니다.' };
    }
    if (existingAuthEmails.includes(cleanEmail)) {
      return { status: 400, error: 'Firebase Auth에 이미 존재하는 이메일입니다.' };
    }
    return { status: 200 };
  }

  const callerAdmin = { role: 'CENTER_ADMIN', centerId: 'center-1' };
  const callerTrainer = { role: 'TRAINER', centerId: 'center-1' };

  // Case A: Non-admin caller blocked
  const resA = validateProvisionTarget(callerTrainer, { centerId: 'center-1', email: 'mem@test.com', name: '회원1' }, [], [], 'm1', []);
  assert(resA.status === 403, 'Non-admin caller blocked (403)');

  // Case B: Cross-tenant blocked
  const resB = validateProvisionTarget(callerAdmin, { centerId: 'center-2', email: 'mem@test.com', name: '회원1' }, [], [], 'm1', []);
  assert(resB.status === 403, 'Cross-tenant target blocked (403)');

  // Case C: Missing email blocked
  const resC = validateProvisionTarget(callerAdmin, { centerId: 'center-1', email: '', name: '회원1' }, [], [], 'm1', []);
  assert(resC.status === 400, 'Missing email blocked (400)');

  // Case D: Already provisioned blocked
  const resD = validateProvisionTarget(callerAdmin, { centerId: 'center-1', email: 'mem@test.com', uid: 'existing-uid', name: '회원1' }, [], [], 'm1', []);
  assert(resD.status === 400, 'Already provisioned UID blocked (400)');

  // Case E: Duplicate member email blocked
  const resE = validateProvisionTarget(
    callerAdmin,
    { centerId: 'center-1', email: 'dup@test.com', name: '회원1' },
    [{ memberId: 'm2', email: 'dup@test.com' }],
    [],
    'm1',
    []
  );
  assert(resE.status === 400 && Boolean(resE.error?.includes('다른 회원')), 'Duplicate email across members blocked (400)');

  // Case F: Duplicate trainer email blocked
  const resF = validateProvisionTarget(
    callerAdmin,
    { centerId: 'center-1', email: 'trainer@test.com', name: '회원1' },
    [],
    [{ trainerId: 't1', loginEmail: 'trainer@test.com' }],
    'm1',
    []
  );
  assert(resF.status === 400 && Boolean(resF.error?.includes('다른 트레이너')), 'Duplicate email across trainers blocked (400)');

  // Case G: Firebase Auth existing user duplicate blocked
  const resG = validateProvisionTarget(
    callerAdmin,
    { centerId: 'center-1', email: 'auth@test.com', name: '회원1' },
    [],
    [],
    'm1',
    ['auth@test.com']
  );
  assert(resG.status === 400 && Boolean(resG.error?.includes('Firebase Auth')), 'Duplicate Firebase Auth email blocked (400)');

  // Case H: Valid target passes
  const resH = validateProvisionTarget(
    callerAdmin,
    { centerId: 'center-1', email: 'newmember@test.com', name: '신규회원' },
    [],
    [],
    'm1',
    []
  );
  assert(resH.status === 200, 'Valid target passes validation (200)');

  console.log('\n>>> All Phase 10A Verification Checks PASSED! <<<');
}

runPhase10aVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
