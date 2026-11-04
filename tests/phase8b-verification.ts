/**
 * Phase 8B Automated Verification Test Suite:
 * Validates Lead Management UI Logic, Status Mappings, RBAC permissions, and CRUD workflows
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
import { LEAD_STATUS_CONFIG } from '../src/components/LeadList';
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

async function runPhase8bTests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 8B UI Verification Test Suite');
  console.log('====================================================\n');

  const centerId = 'center-lead-ui-test';
  const trainerAId = 'tr-kim-lead';
  const trainerBId = 'tr-park-lead';

  await clearCenterData(centerId);

  // ----------------------------------------------------
  // Scenario 1: Korean Status Labels Verification (Requirement 2)
  // NEW=신규, CONSULTING=상담중, OT_SCHEDULED=OT예정, OT_COMPLETED=OT완료, REGISTERED=등록, LOST=미등록
  // ----------------------------------------------------
  assert(
    LEAD_STATUS_CONFIG.NEW.label === '신규',
    'Scenario 1A: Status NEW maps to 신규',
    `Expected '신규', got '${LEAD_STATUS_CONFIG.NEW.label}'`
  );
  assert(
    LEAD_STATUS_CONFIG.CONSULTING.label === '상담중',
    'Scenario 1B: Status CONSULTING maps to 상담중',
    `Expected '상담중', got '${LEAD_STATUS_CONFIG.CONSULTING.label}'`
  );
  assert(
    LEAD_STATUS_CONFIG.OT_SCHEDULED.label === 'OT예정',
    'Scenario 1C: Status OT_SCHEDULED maps to OT예정',
    `Expected 'OT예정', got '${LEAD_STATUS_CONFIG.OT_SCHEDULED.label}'`
  );
  assert(
    LEAD_STATUS_CONFIG.OT_COMPLETED.label === 'OT완료',
    'Scenario 1D: Status OT_COMPLETED maps to OT완료',
    `Expected 'OT완료', got '${LEAD_STATUS_CONFIG.OT_COMPLETED.label}'`
  );
  assert(
    LEAD_STATUS_CONFIG.REGISTERED.label === '등록',
    'Scenario 1E: Status REGISTERED maps to 등록',
    `Expected '등록', got '${LEAD_STATUS_CONFIG.REGISTERED.label}'`
  );
  assert(
    LEAD_STATUS_CONFIG.LOST.label === '미등록',
    'Scenario 1F: Status LOST maps to 미등록',
    `Expected '미등록', got '${LEAD_STATUS_CONFIG.LOST.label}'`
  );

  // ----------------------------------------------------
  // Scenario 2: Lead Creation with all 7 Required Fields
  // (이름, 연락처, 문의일, 유입경로, 상태, 담당트레이너, OT예정일)
  // ----------------------------------------------------
  const createdLead = await createLead(
    {
      centerId,
      name: '이수민',
      phone: '010-9988-7766',
      inquiryDate: '2026-09-27',
      source: '전화' as LeadSource,
      status: 'NEW' as LeadStatus,
      assignedTrainerId: trainerAId,
      assignedTrainerName: '김트레이너',
      memo: '퇴근 후 저녁 8시 PT 상담 희망'
    },
    'CENTER_ADMIN'
  );

  assert(
    createdLead.name === '이수민' &&
    createdLead.phone === '010-9988-7766' &&
    createdLead.inquiryDate === '2026-09-27' &&
    createdLead.source === '전화' &&
    createdLead.status === 'NEW' &&
    createdLead.assignedTrainerId === trainerAId,
    'Scenario 2: Lead created with required fields by CENTER_ADMIN',
    'Lead fields do not match expected initial values'
  );

  // ----------------------------------------------------
  // Scenario 3: Status Transition to OT_SCHEDULED with otDate
  // ----------------------------------------------------
  const scheduledLead = await updateLeadStatus(
    centerId,
    createdLead.leadId,
    'OT_SCHEDULED',
    { otDate: '2026-09-30' },
    'TRAINER',
    trainerAId
  );

  assert(
    scheduledLead.status === 'OT_SCHEDULED' && scheduledLead.otDate === '2026-09-30',
    'Scenario 3: Status transition to OT_SCHEDULED with otDate',
    `Expected OT_SCHEDULED on 2026-09-30, got status=${scheduledLead.status}, otDate=${scheduledLead.otDate}`
  );

  // ----------------------------------------------------
  // Scenario 4: Status Transition to OT_COMPLETED
  // ----------------------------------------------------
  const completedLead = await updateLeadStatus(
    centerId,
    createdLead.leadId,
    'OT_COMPLETED',
    { memo: 'OT 수업 성실히 완료, 체형교정 관심 높음' },
    'TRAINER',
    trainerAId
  );

  assert(
    completedLead.status === 'OT_COMPLETED' && Boolean(completedLead.memo?.includes('OT 수업 성실히 완료')),
    'Scenario 4: Status transition to OT_COMPLETED with memo',
    'OT_COMPLETED transition failed'
  );

  // ----------------------------------------------------
  // Scenario 5: Status Transition to REGISTERED
  // ----------------------------------------------------
  const registeredLead = await convertLeadToRegistration(
    centerId,
    createdLead.leadId,
    { memo: 'PT 20회 등록 완료' },
    'CENTER_ADMIN'
  );

  assert(
    registeredLead.status === 'REGISTERED' && Boolean(registeredLead.convertedMemberId),
    'Scenario 5: Status transition to REGISTERED with convertedMemberId',
    'Registration transition failed'
  );

  // ----------------------------------------------------
  // Scenario 6: Status Transition to LOST with reason & memo
  // ----------------------------------------------------
  const lead2 = await createLead(
    {
      centerId,
      name: '박철수',
      phone: '010-3344-5566',
      inquiryDate: '2026-09-27',
      source: '방문' as LeadSource,
      status: 'CONSULTING' as LeadStatus,
      assignedTrainerId: trainerAId
    },
    'CENTER_ADMIN'
  );

  const lostLead = await updateLeadStatus(
    centerId,
    lead2.leadId,
    'LOST',
    {
      lostReason: '가격',
      lostMemo: '가격 할인 행사 시 재연락 요청'
    },
    'TRAINER',
    trainerAId
  );

  assert(
    lostLead.status === 'LOST' && lostLead.lostReason === '가격' && lostLead.lostMemo === '가격 할인 행사 시 재연락 요청',
    'Scenario 6: Status transition to LOST with lostReason & lostMemo',
    'LOST status transition failed'
  );

  // ----------------------------------------------------
  // Scenario 7: RBAC - Trainer B cannot update Trainer A's lead
  // ----------------------------------------------------
  let trainerBBlocked = false;
  try {
    await updateLead(
      centerId,
      createdLead.leadId,
      { memo: 'Hacked by Trainer B' },
      'TRAINER',
      trainerBId
    );
  } catch (err) {
    trainerBBlocked = true;
  }

  assert(
    trainerBBlocked,
    'Scenario 7: Trainer B cannot edit Trainer A assigned lead',
    'Trainer B was able to modify Trainer A lead!'
  );

  // ----------------------------------------------------
  // Scenario 8: RBAC - MEMBER cannot fetch leads
  // ----------------------------------------------------
  let memberBlocked = false;
  try {
    await getLeads(centerId, 'MEMBER');
  } catch (err) {
    memberBlocked = true;
  }

  assert(
    memberBlocked,
    'Scenario 8: MEMBER is blocked from querying leads',
    'Member was able to query leads!'
  );

  // ----------------------------------------------------
  // Scenario 9: RBAC - TRAINER cannot register a new Lead (CENTER_ADMIN only)
  // ----------------------------------------------------
  let trainerCreateBlocked = false;
  try {
    await createLead(
      {
        centerId,
        name: '최영희',
        phone: '010-7777-8888',
        inquiryDate: '2026-09-27',
        source: '소개',
        status: 'NEW'
      },
      'TRAINER'
    );
  } catch (err) {
    trainerCreateBlocked = true;
  }

  assert(
    trainerCreateBlocked,
    'Scenario 9: TRAINER cannot create new leads (CENTER_ADMIN only)',
    'Trainer was able to create lead!'
  );

  // ----------------------------------------------------
  // Scenario 10: Lead Deletion by CENTER_ADMIN
  // ----------------------------------------------------
  await deleteLead(centerId, lead2.leadId, 'CENTER_ADMIN');
  const deletedCheck = await getLeadById(centerId, lead2.leadId, 'CENTER_ADMIN');

  assert(
    deletedCheck === null,
    'Scenario 10: CENTER_ADMIN successfully deleted lead',
    'Lead was not deleted'
  );

  console.log('\n====================================================');
  console.log(`✨ All ${results.length} Phase 8B Verification Tests PASSED!`);
  console.log('====================================================\n');
}

runPhase8bTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
