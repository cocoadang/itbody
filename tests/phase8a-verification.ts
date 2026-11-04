/**
 * Phase 8A Automated Verification Test Suite:
 * 12 Comprehensive Scenarios for Lead & OT Management (Data Foundation, Lifecycle, and RBAC)
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

async function runPhase8aTests() {
  console.log('====================================================');
  console.log('🚀 Running ITBODY Phase 8A Verification Test Suite');
  console.log('====================================================\n');

  const centerA = 'center-lead-test-01';
  const centerB = 'center-lead-test-02';
  const trainerAId = 'tr-lead-alpha';
  const trainerBId = 'tr-lead-beta';

  await clearCenterData(centerA);
  await clearCenterData(centerB);

  // ----------------------------------------------------
  // Scenario 1: CENTER_ADMIN creates a Lead with all base fields
  // ----------------------------------------------------
  const leadData1 = {
    centerId: centerA,
    name: '홍길동',
    phone: '010-1234-5678',
    inquiryDate: '2026-09-27',
    source: '방문' as LeadSource,
    status: 'NEW' as LeadStatus,
    memo: '헬스장 방문 후 PT 문의'
  };

  const lead1 = await createLead(leadData1, 'CENTER_ADMIN');
  assert(
    !!lead1.leadId &&
      lead1.name === '홍길동' &&
      lead1.status === 'NEW' &&
      lead1.source === '방문' &&
      !!lead1.createdAt &&
      !!lead1.updatedAt,
    'Scenario 1: CENTER_ADMIN creates Lead',
    'Lead fields were not correctly initialized'
  );

  // ----------------------------------------------------
  // Scenario 2: TRAINER or MEMBER cannot create a Lead
  // ----------------------------------------------------
  let trainerCreateBlocked = false;
  try {
    await createLead(
      {
        centerId: centerA,
        name: '불법등록시도',
        phone: '010-9999-8888',
        inquiryDate: '2026-09-27',
        source: '전화' as LeadSource,
        status: 'NEW' as LeadStatus
      },
      'TRAINER',
      trainerAId
    );
  } catch {
    trainerCreateBlocked = true;
  }
  assert(trainerCreateBlocked, 'Scenario 2A: TRAINER cannot create Lead', 'TRAINER was able to create Lead');

  let memberCreateBlocked = false;
  try {
    await createLead(
      {
        centerId: centerA,
        name: '회원등록시도',
        phone: '010-9999-7777',
        inquiryDate: '2026-09-27',
        source: '온라인' as LeadSource,
        status: 'NEW' as LeadStatus
      },
      'MEMBER'
    );
  } catch {
    memberCreateBlocked = true;
  }
  assert(memberCreateBlocked, 'Scenario 2B: MEMBER cannot create Lead', 'MEMBER was able to create Lead');

  // ----------------------------------------------------
  // Scenario 3: CENTER_ADMIN views all leads in center
  // ----------------------------------------------------
  const leadData2 = {
    centerId: centerA,
    name: '김영희',
    phone: '010-5678-1234',
    inquiryDate: '2026-09-27',
    source: '소개' as LeadSource,
    status: 'CONSULTING' as LeadStatus,
    assignedTrainerId: trainerAId,
    memo: '기존 회원 지인 소개'
  };
  const lead2 = await createLead(leadData2, 'CENTER_ADMIN');

  const adminList = await getLeads(centerA, 'CENTER_ADMIN');
  assert(
    adminList.length === 2 && adminList.some((l) => l.leadId === lead1.leadId) && adminList.some((l) => l.leadId === lead2.leadId),
    'Scenario 3: CENTER_ADMIN views full lead list in center',
    `Expected 2 leads for admin, found ${adminList.length}`
  );

  // ----------------------------------------------------
  // Scenario 4: TRAINER can ONLY view leads assigned to themselves
  // ----------------------------------------------------
  const trainerAList = await getLeads(centerA, 'TRAINER', trainerAId);
  assert(
    trainerAList.length === 1 && trainerAList[0].leadId === lead2.leadId,
    'Scenario 4: TRAINER sees only assigned leads',
    `Expected 1 lead assigned to trainerA, found ${trainerAList.length}`
  );

  const trainerBList = await getLeads(centerA, 'TRAINER', trainerBId);
  assert(
    trainerBList.length === 0,
    'Scenario 4B: Unassigned TRAINER sees empty lead list',
    `Expected 0 leads for trainerB, found ${trainerBList.length}`
  );

  // ----------------------------------------------------
  // Scenario 5: MEMBER is strictly blocked from viewing leads
  // ----------------------------------------------------
  let memberReadBlocked = false;
  try {
    await getLeads(centerA, 'MEMBER');
  } catch {
    memberReadBlocked = true;
  }
  assert(memberReadBlocked, 'Scenario 5A: MEMBER cannot read lead list', 'MEMBER was not blocked from reading leads');

  const memberSingleRead = await getLeadById(centerA, lead1.leadId, 'MEMBER');
  assert(
    memberSingleRead === null,
    'Scenario 5B: MEMBER cannot read single lead by ID',
    'MEMBER was able to fetch lead by ID'
  );

  // ----------------------------------------------------
  // Scenario 6: TRAINER assigns and updates assigned lead
  // ----------------------------------------------------
  // Admin assigns lead1 to Trainer B
  const updatedByAdmin = await updateLead(
    centerA,
    lead1.leadId,
    { assignedTrainerId: trainerBId, status: 'OT_SCHEDULED', otDate: '2026-09-30' },
    'CENTER_ADMIN'
  );
  assert(
    updatedByAdmin.assignedTrainerId === trainerBId && updatedByAdmin.status === 'OT_SCHEDULED',
    'Scenario 6A: Admin assigns lead to Trainer B',
    'Lead assignment failed'
  );

  // Trainer B updates memo and advances status to OT_COMPLETED
  const updatedByTrainerB = await updateLeadStatus(
    centerA,
    lead1.leadId,
    'OT_COMPLETED',
    { memo: 'OT 50분 세션 진행 완료. 스쿼트 자세 교정 및 상담.' },
    'TRAINER',
    trainerBId
  );
  assert(
    updatedByTrainerB.status === 'OT_COMPLETED' && Boolean(updatedByTrainerB.memo?.includes('OT 50분')),
    'Scenario 6B: Assigned Trainer updates status to OT_COMPLETED',
    'Trainer B update failed'
  );

  // Trainer A attempts to update lead1 (assigned to Trainer B) -> BLOCKED
  let trainerAUpdateBlocked = false;
  try {
    await updateLead(
      centerA,
      lead1.leadId,
      { memo: '해킹 시도' },
      'TRAINER',
      trainerAId
    );
  } catch {
    trainerAUpdateBlocked = true;
  }
  assert(
    trainerAUpdateBlocked,
    'Scenario 6C: Trainer cannot update leads assigned to other trainers',
    'Trainer A updated Trainer B lead'
  );

  // ----------------------------------------------------
  // Scenario 7: Conversion to Registered PT Member (REGISTERED)
  // ----------------------------------------------------
  const convertedLead = await convertLeadToRegistration(
    centerA,
    lead1.leadId,
    {
      convertedMemberId: 'mem-converted-001',
      memo: 'OT 만족 후 30회 PT 정식 등록 전환'
    },
    'CENTER_ADMIN'
  );
  assert(
    convertedLead.status === 'REGISTERED' &&
      convertedLead.convertedMemberId === 'mem-converted-001' &&
      !!convertedLead.registeredAt,
    'Scenario 7: Lead converted to Registered Member',
    'Registration conversion fields mismatch'
  );

  // ----------------------------------------------------
  // Scenario 8: Lost Lead flow (LOST with reason and memo)
  // ----------------------------------------------------
  const leadData3 = {
    centerId: centerA,
    name: '박철수',
    phone: '010-3333-2222',
    inquiryDate: '2026-09-25',
    source: '전화' as LeadSource,
    status: 'CONSULTING' as LeadStatus
  };
  const lead3 = await createLead(leadData3, 'CENTER_ADMIN');

  const lostLead = await updateLeadStatus(
    centerA,
    lead3.leadId,
    'LOST',
    {
      lostReason: '가격' as LeadLostReason,
      lostMemo: '학생이라 회당 단가 부담으로 3개월 후 재상담 희망'
    },
    'CENTER_ADMIN'
  );
  assert(
    lostLead.status === 'LOST' &&
      lostLead.lostReason === '가격' &&
      Boolean(lostLead.lostMemo?.includes('회당 단가')),
    'Scenario 8: Lead marked as LOST with lostReason and lostMemo',
    'Lost lead fields mismatch'
  );

  // ----------------------------------------------------
  // Scenario 9: Filter leads by status
  // ----------------------------------------------------
  const registeredLeads = await getLeads(centerA, 'CENTER_ADMIN', null, 'REGISTERED');
  const lostLeads = await getLeads(centerA, 'CENTER_ADMIN', null, 'LOST');
  assert(
    registeredLeads.length === 1 && registeredLeads[0].leadId === lead1.leadId &&
      lostLeads.length === 1 && lostLeads[0].leadId === lead3.leadId,
    'Scenario 9: Filter leads by status (REGISTERED / LOST)',
    'Status filter did not return correct subsets'
  );

  // ----------------------------------------------------
  // Scenario 10: Center ID Data Isolation (Center A vs Center B)
  // ----------------------------------------------------
  const leadCenterB = await createLead(
    {
      centerId: centerB,
      name: '센터B문의자',
      phone: '010-0000-1111',
      inquiryDate: '2026-09-27',
      source: '방문' as LeadSource,
      status: 'NEW' as LeadStatus
    },
    'CENTER_ADMIN'
  );

  const centerAListCheck = await getLeads(centerA, 'CENTER_ADMIN');
  const centerBListCheck = await getLeads(centerB, 'CENTER_ADMIN');
  assert(
    !centerAListCheck.some((l) => l.leadId === leadCenterB.leadId) &&
      centerBListCheck.length === 1 &&
      centerBListCheck[0].leadId === leadCenterB.leadId,
    'Scenario 10: Complete Center ID Isolation for Leads',
    'Cross-center data contamination detected'
  );

  // ----------------------------------------------------
  // Scenario 11: Deletion RBAC (CENTER_ADMIN can delete; TRAINER cannot)
  // ----------------------------------------------------
  let trainerDeleteBlocked = false;
  try {
    await deleteLead(centerA, lead3.leadId, 'TRAINER');
  } catch {
    trainerDeleteBlocked = true;
  }
  assert(trainerDeleteBlocked, 'Scenario 11A: TRAINER cannot delete Lead', 'TRAINER deleted a Lead');

  await deleteLead(centerA, lead3.leadId, 'CENTER_ADMIN');
  const deletedCheck = await getLeadById(centerA, lead3.leadId, 'CENTER_ADMIN');
  assert(deletedCheck === null, 'Scenario 11B: CENTER_ADMIN successfully deletes Lead', 'Lead was not deleted');

  // ----------------------------------------------------
  // Scenario 12: Clear Center Data removes leads properly
  // ----------------------------------------------------
  await clearCenterData(centerA);
  const clearedList = await getLeads(centerA, 'CENTER_ADMIN');
  assert(clearedList.length === 0, 'Scenario 12: clearCenterData flushes leads completely', 'Leads remained after clearCenterData');

  console.log('\n====================================================');
  console.log(`✨ All ${results.length} Phase 8A Verification Tests PASSED!`);
  console.log('====================================================');
}

runPhase8aTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
