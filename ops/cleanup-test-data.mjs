#!/usr/bin/env node
// Finds verification/test records in the ITBODY database and, only with --delete,
// removes them after writing a JSON backup. Run in Google Cloud Shell:
//   node cleanup-test-data.mjs                 # list only (changes nothing)
//   node cleanup-test-data.mjs --delete        # backup to ./itbody-test-data-backup-*.json, then delete
//   node cleanup-test-data.mjs --exclude=ID1,ID2   # keep specific documents that were matched by mistake
// Firebase Auth accounts are only listed, never deleted.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';

const PROJECT_ID = 'gen-lang-client-0064554427';
const DATABASE_ID = 'ai-studio-e4e8fbca-f678-44f7-a410-4cb94740b469';
const DELETE = process.argv.includes('--delete');
const EXCLUDE = new Set((process.argv.find((a) => a.startsWith('--exclude=')) || '').slice(10).split(',').filter(Boolean));

// Words that only test/verification data uses. Matched against name-like fields only.
const TEST_PATTERN = /검증|테스트|test|e2e|dummy|더미|샘플|sample|smoke|qa용|확인용|임시 ?데이터/i;
const NAME_FIELDS = ['name', 'title', 'memberName', 'trainerName', 'centerName', 'caption', 'exerciseName', 'email', 'loginEmail'];
// Operational/system collections: never touched.
const SKIP = new Set(['serverRateLimits', 'kakaoOAuthStates', 'securityAuditLogs', 'journalUploads', 'kakaoIdentities', 'memberAccounts', 'memberInvites', 'users']);
const REFERENCE_FIELDS = ['memberId', 'trainerId', 'centerId', 'contractId', 'sessionId', 'leadId'];

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore(app, DATABASE_ID);

const collections = (await db.listCollections()).map((c) => c.id).filter((id) => !SKIP.has(id));
const all = new Map(); // collection -> docs
for (const id of collections) all.set(id, (await db.collection(id).get()).docs);

const idOf = (col, doc) => `${col}/${doc.id}`;
const matched = new Map(); // key -> { col, doc, reason }
const testIds = { memberId: new Set(), trainerId: new Set(), centerId: new Set(), contractId: new Set(), sessionId: new Set(), leadId: new Set() };
const ID_FIELD_BY_COLLECTION = { members: 'memberId', trainers: 'trainerId', centers: 'centerId', ptContracts: 'contractId', ptSessions: 'sessionId', leads: 'leadId' };

// 1) Directly named as test data.
for (const [col, docs] of all) {
  for (const doc of docs) {
    const data = doc.data();
    const hit = NAME_FIELDS.map((f) => (typeof data[f] === 'string' && TEST_PATTERN.test(data[f]) ? `${f}="${data[f]}"` : null)).find(Boolean);
    if (hit && !EXCLUDE.has(doc.id)) {
      matched.set(idOf(col, doc), { col, doc, reason: hit });
      const field = ID_FIELD_BY_COLLECTION[col];
      if (field) testIds[field].add(doc.id);
    }
  }
}

// 2) Records that belong to a test member/trainer/center/contract/session/lead.
let grew = true;
while (grew) {
  grew = false;
  for (const [col, docs] of all) {
    for (const doc of docs) {
      const key = idOf(col, doc);
      if (matched.has(key) || EXCLUDE.has(doc.id)) continue;
      const data = doc.data();
      // trainerId alone is not enough: a test trainer may be linked to real members.
      const ref = REFERENCE_FIELDS.filter((f) => f !== 'trainerId').find((f) => typeof data[f] === 'string' && testIds[f].has(data[f]));
      if (ref) {
        matched.set(key, { col, doc, reason: `${ref} → test ${ref.replace('Id', '')} ${data[ref]}` });
        const field = ID_FIELD_BY_COLLECTION[col];
        if (field && !testIds[field].has(doc.id)) { testIds[field].add(doc.id); grew = true; }
      }
    }
  }
}

const byCol = {};
for (const m of matched.values()) (byCol[m.col] ||= []).push(m);
console.log(`\n=== 검증용 데이터 후보 ${matched.size}건 (${DELETE ? '삭제 모드' : '목록만 표시, 변경 없음'}) ===`);
for (const [col, list] of Object.entries(byCol)) {
  console.log(`\n[${col}] ${list.length}건`);
  for (const m of list.slice(0, 200)) console.log(`  ${m.doc.id}  ·  ${m.reason}`);
}

// Auth accounts that look like test accounts (listed only).
const authHits = [];
try {
  let pageToken;
  do {
    const page = await getAuth(app).listUsers(1000, pageToken);
    for (const u of page.users) if (TEST_PATTERN.test(`${u.email || ''} ${u.displayName || ''}`)) authHits.push(`${u.uid}  ${u.email || ''}  ${u.displayName || ''}`);
    pageToken = page.pageToken;
  } while (pageToken);
} catch (err) {
  console.log(`\n(로그인 계정 목록은 확인하지 못했습니다: ${err.code || err.message})`);
}
if (authHits.length) {
  console.log(`\n[로그인 계정 (삭제하지 않음, 확인용)] ${authHits.length}건`);
  authHits.forEach((l) => console.log('  ' + l));
}

if (!DELETE) {
  console.log('\n변경한 것은 없습니다. 위 목록을 Claude에게 보여주세요. 잘못 잡힌 항목은 --exclude=문서ID 로 제외할 수 있습니다.');
  process.exit(0);
}

const backup = `itbody-test-data-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(backup, JSON.stringify([...matched.values()].map((m) => ({ path: `${m.col}/${m.doc.id}`, data: m.doc.data() })), null, 1));
console.log(`\n백업 저장: ${backup}`);
let batch = db.batch(), n = 0, total = 0;
for (const m of matched.values()) {
  batch.delete(m.doc.ref); n++; total++;
  if (n === 400) { await batch.commit(); batch = db.batch(); n = 0; }
}
if (n) await batch.commit();
console.log(`삭제 완료: ${total}건`);
