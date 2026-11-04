/**
 * Phase 8C Automated Verification Test Suite:
 * Validates OT Workflow (신규문의 -> OT 배정 -> OT 완료 -> PT 등록 / 미등록)
 * Tests field persistence (otCompletedAt, otDate, assignedTrainerId),
 * RBAC permissions (CENTER_ADMIN vs TRAINER vs MEMBER), and data integrity.
 */
import {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  updateLeadStatus,
  convertLeadToRegistration,
  deleteLead,
  clearCenterData
} from '../src/services/dataService';
import type { Lead, LeadStatus, LeadSource, LeadLostReason } from '../src/types';

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

async function runPhase8cTests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 8C OT Workflow Test Suite');
  console.log('====================================================\n');

  const centerId = 'center-ot-flow-test';
  const trainerAId = 'tr-kim-ot';
  const trainerBId = 'tr-park-ot';

  await clearCenterData(centerId);

  // ----------------------------------------------------
  // Scenario 1: Initial Lead Creation (NEW)
  // ----------------------------------------------------
  const lead1 = await createLead(
    {
      centerId,
      name: '강태양',
      phone: '010-1122-3344',
      inquiryDate: '2026-09-27',
      source: '방문',
      status: 'NEW',
      memo: '체형 교정 및 라운드숄더 개선 희망'
    },
    'CENTER_ADMIN'
  );

  assert(lead1.status === 'NEW', 'Scenario 1A: Initial status is NEW', `Got ${lead1.status}`);
  assert(!lead1.assignedTrainerId, 'Scenario 1B: No trainer assigned initially', `Got ${lead1.assignedTrainerId}`);
  assert(!lead1.otDate, 'Scenario 1C: No otDate initially', `Got ${lead1.otDate}`);
  assert(!lead1.otCompletedAt, 'Scenario 1D: No otCompletedAt initially', `Got ${lead1.otCompletedAt}`);

  // ----------------------------------------------------
  // Scenario 2: OT Assignment by CENTER_ADMIN (NEW -> OT_SCHEDULED)
  // Requirement 1:
  // - status = OT_SCHEDULED
  // - assignedTrainerId 저장
  // - otDate 저장
  // ----------------------------------------------------
  const scheduledLead = await updateLead(
    centerId,
    lead1.leadId,
    {
      status: 'OT_SCHEDULED',
      assignedTrainerId: trainerAId,
      assignedTrainerName: '김트레이너',
      otDate: '2026-09-30'
    },
    'CENTER_ADMIN'
  );

  assert(
    scheduledLead.status === 'OT_SCHEDULED',
    'Scenario 2A: Lead status transitioned to OT_SCHEDULED',
    `Expected 'OT_SCHEDULED', got '${scheduledLead.status}'`
  );
  assert(
    scheduledLead.assignedTrainerId === trainerAId,
    'Scenario 2B: assignedTrainerId correctly recorded',
    `Expected '${trainerAId}', got '${scheduledLead.assignedTrainerId}'`
  );
  assert(
    scheduledLead.otDate === '2026-09-30',
    'Scenario 2C: otDate correctly recorded',
    `Expected '2026-09-30', got '${scheduledLead.otDate}'`
  );

  // ----------------------------------------------------
  // Scenario 3: TRAINER cannot change assignedTrainerId
  // Requirement 5: TRAINER가 담당자를 변경하는 것은 불가
  // ----------------------------------------------------
  let trainerAssignRejectionWorked = false;
  try {
    await updateLead(
      centerId,
      lead1.leadId,
      {
        assignedTrainerId: trainerBId // Attempt to reassign to trainerB
      },
      'TRAINER',
      trainerAId
    );
  } catch (err: any) {
    trainerAssignRejectionWorked = true;
  }
  assert(
    trainerAssignRejectionWorked,
    'Scenario 3: TRAINER cannot reassign assignedTrainerId to someone else',
    'TRAINER was illegally permitted to change assignedTrainerId'
  );

  // ----------------------------------------------------
  // Scenario 4: OT Completion by Assigned TRAINER (OT_SCHEDULED -> OT_COMPLETED)
  // Requirement 2:
  // - status = OT_COMPLETED
  // - otCompletedAt 추가 기록
  // - 기존 otDate는 변경하지 않음
  // ----------------------------------------------------
  const completedTimestamp = new Date().toISOString();
  const completedLead = await updateLead(
    centerId,
    lead1.leadId,
    {
      status: 'OT_COMPLETED',
      otCompletedAt: completedTimestamp
    },
    'TRAINER',
    trainerAId
  );

  assert(
    completedLead.status === 'OT_COMPLETED',
    'Scenario 4A: Lead status transitioned to OT_COMPLETED',
    `Expected 'OT_COMPLETED', got '${completedLead.status}'`
  );
  assert(
    completedLead.otCompletedAt === completedTimestamp,
    'Scenario 4B: otCompletedAt correctly recorded',
    `Expected '${completedTimestamp}', got '${completedLead.otCompletedAt}'`
  );
  assert(
    completedLead.otDate === '2026-09-30',
    'Scenario 4C: Original otDate is preserved',
    `Expected '2026-09-30', got '${completedLead.otDate}'`
  );

  // ----------------------------------------------------
  // Scenario 5: Unassigned Trainer cannot complete OT for another trainer's lead
  // ----------------------------------------------------
  let wrongTrainerBlocked = false;
  try {
    await updateLead(
      centerId,
      lead1.leadId,
      {
        status: 'OT_COMPLETED',
        otCompletedAt: new Date().toISOString()
      },
      'TRAINER',
      trainerBId // Trainer B is NOT assigned
    );
  } catch (err: any) {
    wrongTrainerBlocked = true;
  }
  assert(
    wrongTrainerBlocked,
    'Scenario 5: Unassigned Trainer B is blocked from modifying Lead assigned to Trainer A',
    'Trainer B was allowed to modify Lead assigned to Trainer A'
  );

  // ----------------------------------------------------
  // Scenario 6: OT Result - PT Registration (OT_COMPLETED -> REGISTERED)
  // Requirement 3:
  // - status = REGISTERED
  // - registeredAt 기록
  // - convertedMemberId 준비 (Member 자동 생성은 아직 하지 않음)
  // ----------------------------------------------------
  const registeredTime = new Date().toISOString();
  const registeredLead = await updateLead(
    centerId,
    lead1.leadId,
    {
      status: 'REGISTERED',
      registeredAt: registeredTime,
      convertedMemberId: 'mem-sun-001'
    },
    'TRAINER',
    trainerAId
  );

  assert(
    registeredLead.status === 'REGISTERED',
    'Scenario 6A: Lead status transitioned to REGISTERED',
    `Expected 'REGISTERED', got '${registeredLead.status}'`
  );
  assert(
    registeredLead.registeredAt === registeredTime,
    'Scenario 6B: registeredAt timestamp recorded',
    `Expected '${registeredTime}', got '${registeredLead.registeredAt}'`
  );
  assert(
    registeredLead.convertedMemberId === 'mem-sun-001',
    'Scenario 6C: convertedMemberId stored for future automatic member linking',
    `Expected 'mem-sun-001', got '${registeredLead.convertedMemberId}'`
  );

  // ----------------------------------------------------
  // Scenario 7: OT Result - Lost / Unregistered (OT_COMPLETED -> LOST)
  // Requirement 3:
  // - status = LOST
  // - lostReason 필수
  // - lostMemo 선택
  // ----------------------------------------------------
  const lead2 = await createLead(
    {
      centerId,
      name: '윤아름',
      phone: '010-5544-3322',
      inquiryDate: '2026-09-27',
      source: '전화',
      status: 'OT_SCHEDULED',
      assignedTrainerId: trainerAId,
      assignedTrainerName: '김트레이너',
      otDate: '2026-09-29'
    },
    'CENTER_ADMIN'
  );

  // Complete OT
  await updateLead(
    centerId,
    lead2.leadId,
    {
      status: 'OT_COMPLETED',
      otCompletedAt: new Date().toISOString()
    },
    'TRAINER',
    trainerAId
  );

  // Mark as LOST with reason and memo
  const lostLead = await updateLead(
    centerId,
    lead2.leadId,
    {
      status: 'LOST',
      lostReason: '가격',
      lostMemo: '30회 기준 단가 부담으로 인해 3개월 헬스 이용권만 희망'
    },
    'TRAINER',
    trainerAId
  );

  assert(
    lostLead.status === 'LOST',
    'Scenario 7A: Lead status transitioned to LOST',
    `Expected 'LOST', got '${lostLead.status}'`
  );
  assert(
    lostLead.lostReason === '가격',
    'Scenario 7B: lostReason recorded correctly',
    `Expected '가격', got '${lostLead.lostReason}'`
  );
  assert(
    Boolean(lostLead.lostMemo && lostLead.lostMemo.includes('30회 기준 단가 부담')),
    'Scenario 7C: lostMemo recorded correctly',
    `Got ${lostLead.lostMemo}`
  );

  // ----------------------------------------------------
  // Scenario 8: MEMBER Role is completely blocked from Leads
  // ----------------------------------------------------
  let memberReadBlocked = false;
  try {
    await getLeads(centerId, 'MEMBER');
  } catch (err: any) {
    memberReadBlocked = true;
  }
  assert(
    memberReadBlocked,
    'Scenario 8A: MEMBER cannot read leads list',
    'MEMBER was permitted to read leads'
  );

  let memberWriteBlocked = false;
  try {
    await updateLead(centerId, lead2.leadId, { memo: 'Hacked by member' }, 'MEMBER');
  } catch (err: any) {
    memberWriteBlocked = true;
  }
  assert(
    memberWriteBlocked,
    'Scenario 8B: MEMBER cannot update leads',
    'MEMBER was permitted to update lead'
  );

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  const passedCount = results.filter((r) => r.passed).length;
  console.log('\n====================================================');
  console.log(`🎉 Phase 8C Test Results: ${passedCount}/${results.length} PASSED`);
  console.log('====================================================\n');
}

runPhase8cTests().catch((e) => {
  console.error('Fatal error during Phase 8C tests:', e);
  process.exit(1);
});
