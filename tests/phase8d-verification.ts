/**
 * Phase 8D Automated Verification Test Suite:
 * Validates OT 완료 -> PT 등록 -> 회원 등록 (NewMember) -> Member 생성 -> Lead 연결 (REGISTERED)
 * Validates:
 * 1. sourceLeadId stored on Member
 * 2. convertedMemberId and registeredAt stored on Lead
 * 3. Bidirectional linkage (Lead <-> Member)
 * 4. Duplicate conversion prevention (safe if already converted)
 * 5. General 회원목록 -> 신규회원 등록 regression
 * 6. RBAC permissions (CENTER_ADMIN, TRAINER, MEMBER isolation)
 */
import {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  convertLeadToRegistration,
  createMember,
  getMemberById,
  getMembers,
  clearCenterData
} from '../src/services/dataService';
import type { Lead, Member } from '../src/types';

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

async function runPhase8dTests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 8D Lead-to-Member Conversion Test Suite');
  console.log('====================================================\n');

  const centerId = 'center-conversion-test';
  const trainerAId = 'tr-kim-conv';
  const trainerBId = 'tr-lee-conv';

  await clearCenterData(centerId);

  // ----------------------------------------------------
  // Scenario 1: Create Lead and reach OT_COMPLETED
  // ----------------------------------------------------
  const initialLead = await createLead(
    {
      centerId,
      name: '최민준',
      phone: '010-8899-1122',
      inquiryDate: '2026-09-27',
      source: '방문',
      status: 'OT_SCHEDULED',
      assignedTrainerId: trainerAId,
      assignedTrainerName: '김트레이너',
      otDate: '2026-09-28',
      memo: '체지방 감량 및 기초 근력 증진 목표'
    },
    'CENTER_ADMIN'
  );

  const completedLead = await updateLead(
    centerId,
    initialLead.leadId,
    {
      status: 'OT_COMPLETED',
      otCompletedAt: '2026-09-28T14:30:00.000Z'
    },
    'TRAINER',
    trainerAId
  );

  assert(
    completedLead.status === 'OT_COMPLETED' && Boolean(completedLead.otCompletedAt),
    'Scenario 1: Lead successfully reaches OT_COMPLETED',
    'Lead is not in OT_COMPLETED status'
  );

  // ----------------------------------------------------
  // Scenario 2: Convert to Member via NewMember creation with sourceLeadId
  // ----------------------------------------------------
  const newMember = await createMember({
    centerId,
    trainerId: completedLead.assignedTrainerId || trainerAId,
    name: completedLead.name,
    gender: 'MALE',
    birthDate: '1992-05-15',
    phone: completedLead.phone,
    startDate: '2026-10-01',
    status: 'ACTIVE',
    notes: `[신규문의 인계 메모]: ${completedLead.memo}`,
    sourceLeadId: completedLead.leadId // Bi-directional link from Member to Lead
  });

  assert(
    Boolean(newMember.memberId && newMember.memberId.startsWith('mem-')),
    'Scenario 2A: Member successfully created with memberId',
    `Invalid memberId: ${newMember.memberId}`
  );
  assert(
    newMember.sourceLeadId === completedLead.leadId,
    'Scenario 2B: Member correctly stores sourceLeadId',
    `Expected ${completedLead.leadId}, got ${newMember.sourceLeadId}`
  );
  assert(
    newMember.name === '최민준' && newMember.phone === '010-8899-1122',
    'Scenario 2C: Member pre-filled information correctly stored',
    'Member info mismatch'
  );

  // ----------------------------------------------------
  // Scenario 3: Update Lead to REGISTERED linking convertedMemberId
  // ----------------------------------------------------
  const registeredTime = new Date().toISOString();
  const convertedLead = await convertLeadToRegistration(
    centerId,
    completedLead.leadId,
    {
      convertedMemberId: newMember.memberId,
      registeredAt: registeredTime
    },
    'CENTER_ADMIN'
  );

  assert(
    convertedLead.status === 'REGISTERED',
    'Scenario 3A: Lead status transitioned to REGISTERED',
    `Expected 'REGISTERED', got '${convertedLead.status}'`
  );
  assert(
    convertedLead.convertedMemberId === newMember.memberId,
    'Scenario 3B: Lead correctly links convertedMemberId',
    `Expected '${newMember.memberId}', got '${convertedLead.convertedMemberId}'`
  );
  assert(
    convertedLead.registeredAt === registeredTime,
    'Scenario 3C: Lead recorded registeredAt timestamp',
    `Expected '${registeredTime}', got '${convertedLead.registeredAt}'`
  );

  // ----------------------------------------------------
  // Scenario 4: Bi-directional link verification
  // ----------------------------------------------------
  const fetchedMember = await getMemberById(centerId, newMember.memberId, 'CENTER_ADMIN');
  const fetchedLead = await getLeadById(centerId, initialLead.leadId, 'CENTER_ADMIN');

  assert(
    fetchedMember !== null && fetchedMember.sourceLeadId === initialLead.leadId,
    'Scenario 4A: Member points back to Lead via sourceLeadId',
    'Member sourceLeadId mismatch'
  );
  assert(
    fetchedLead !== null && fetchedLead.convertedMemberId === newMember.memberId,
    'Scenario 4B: Lead points to Member via convertedMemberId',
    'Lead convertedMemberId mismatch'
  );

  // ----------------------------------------------------
  // Scenario 5: Duplicate conversion protection
  // If convertLeadToRegistration is called again, existing lead should safely be returned
  // ----------------------------------------------------
  const reConvertedLead = await convertLeadToRegistration(
    centerId,
    initialLead.leadId,
    {
      convertedMemberId: 'mem-duplicate-attempt',
      registeredAt: new Date().toISOString()
    },
    'CENTER_ADMIN'
  );

  assert(
    reConvertedLead.convertedMemberId === newMember.memberId,
    'Scenario 5: Duplicate conversion blocked; original convertedMemberId is preserved',
    `Expected '${newMember.memberId}', got '${reConvertedLead.convertedMemberId}'`
  );

  // ----------------------------------------------------
  // Scenario 6: Standard Member registration without Lead (Regression Check)
  // ----------------------------------------------------
  const standardMember = await createMember({
    centerId,
    trainerId: trainerBId,
    name: '일반회원',
    gender: 'FEMALE',
    birthDate: '1998-11-20',
    phone: '010-0000-1111',
    startDate: '2026-09-27',
    status: 'ACTIVE'
  });

  assert(
    standardMember.sourceLeadId === undefined || standardMember.sourceLeadId === null,
    'Scenario 6A: Standard member has no sourceLeadId',
    `Expected null/undefined, got ${standardMember.sourceLeadId}`
  );

  const allMembers = await getMembers(centerId, 'CENTER_ADMIN');
  assert(
    allMembers.length === 2,
    'Scenario 6B: All members retrieved properly in center',
    `Expected 2, got ${allMembers.length}`
  );

  // ----------------------------------------------------
  // Scenario 7: MEMBER cannot convert leads or create members
  // ----------------------------------------------------
  let memberConversionBlocked = false;
  try {
    await convertLeadToRegistration(
      centerId,
      initialLead.leadId,
      { convertedMemberId: 'mem-hack' },
      'MEMBER'
    );
  } catch (err: any) {
    memberConversionBlocked = true;
  }
  assert(
    memberConversionBlocked,
    'Scenario 7: MEMBER is blocked from converting leads',
    'MEMBER was permitted to convert lead'
  );

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  const passedCount = results.filter((r) => r.passed).length;
  console.log('\n====================================================');
  console.log(`🎉 Phase 8D Test Results: ${passedCount}/${results.length} PASSED`);
  console.log('====================================================\n');
}

runPhase8dTests().catch((e) => {
  console.error('Fatal error during Phase 8D tests:', e);
  process.exit(1);
});
