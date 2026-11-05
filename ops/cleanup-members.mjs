#!/usr/bin/env node
// Removes ALL member data and member login accounts (all current members are test data).
// Staff accounts (관리자/트레이너), centers, trainers, exercises and 신규문의(leads) are kept.
// Run in Google Cloud Shell:
//   node cleanup-members.mjs            # list only (changes nothing)
//   node cleanup-members.mjs --delete   # JSON backup, then delete
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import fs from 'node:fs';

const PROJECT_ID = 'gen-lang-client-0064554427';
const DATABASE_ID = 'ai-studio-e4e8fbca-f678-44f7-a410-4cb94740b469';
const BUCKET = 'gen-lang-client-0064554427.firebasestorage.app';
const DELETE = process.argv.includes('--delete');

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore(app, DATABASE_ID);
const auth = getAuth(app);

// Collections whose documents belong to a member (by memberId field).
const BY_MEMBER = ['ptSessions', 'ptContracts', 'consultations', 'memberGoals', 'bodyMeasurements', 'progressPhotos',
  'progressReviews', 'personalWorkoutPlans', 'personalWorkoutLogs', 'renewals', 'sessionComments', 'privateTrainerNotes', 'memberInvites'];

const toDelete = new Map(); // path -> data
const add = (snap) => { if (snap.exists) toDelete.set(snap.ref.path, { ref: snap.ref, data: snap.data() }); };

// 1) Members and everything attached to them.
const members = (await db.collection('members').get()).docs;
const memberIds = new Set(members.map((d) => d.id));
const memberUids = new Set();
members.forEach((d) => { add(d); const m = d.data(); if (m.uid) memberUids.add(m.uid); if (m.portalUid) memberUids.add(m.portalUid); });
for (const col of BY_MEMBER) {
  const snap = await db.collection(col).get();
  snap.docs.filter((d) => memberIds.has(d.data().memberId)).forEach(add);
}
for (const id of memberIds) add(await db.doc(`memberPlans/${id}`).get());
(await db.collection('journalUploads').get()).docs.forEach(add);

// 2) Member login accounts: role MEMBER profiles, Kakao portal accounts and their identities.
(await db.collection('users').get()).docs.forEach((d) => { if (d.data().role === 'MEMBER') { memberUids.add(d.id); add(d); } });
for (const acc of (await db.collection('memberAccounts').get()).docs) {
  memberUids.add(acc.id);
  add(acc);
  (await acc.ref.collection('centers').get()).docs.forEach(add);
}
(await db.collection('kakaoIdentities').get()).docs.forEach((d) => { if (memberUids.has(d.data().uid)) add(d); });
(await db.collection('memberJoinRequests').get()).docs.forEach(add);
for (const c of (await db.collection('centers').get()).docs) (await c.ref.collection('memberJoinRequests').get()).docs.forEach(add);

// Never touch staff.
const staffUids = new Set();
(await db.collection('users').get()).docs.forEach((d) => { if (['CENTER_ADMIN', 'TRAINER'].includes(d.data().role)) staffUids.add(d.id); });
(await db.collection('trainers').get()).docs.forEach((d) => { if (d.data().uid) staffUids.add(d.data().uid); });
for (const uid of staffUids) memberUids.delete(uid);

const authUsers = [];
for (const uid of memberUids) {
  try { const u = await auth.getUser(uid); authUsers.push(u); } catch { /* already gone */ }
}

const bucket = getStorage(app).bucket(BUCKET);
const [files] = await bucket.getFiles({ prefix: 'centers/' });
const memberFiles = files.filter((f) => /^centers\/[^/]+\/members\//.test(f.name));

// Report
const counts = {};
for (const p of toDelete.keys()) { const col = p.split('/').slice(0, -1).join('/').replace(/\/[^/]+\//g, '/*/'); counts[col] = (counts[col] || 0) + 1; }
console.log(`\n=== 회원 데이터 정리 (${DELETE ? '삭제 모드' : '목록만 표시, 변경 없음'}) ===`);
console.log(`\n회원 ${members.length}명:`);
members.forEach((d) => { const m = d.data(); console.log(`  ${d.id}  ${m.name || ''}  ${m.status || ''}`); });
console.log('\n삭제 대상 문서:');
Object.entries(counts).sort().forEach(([k, v]) => console.log(`  ${k}: ${v}건`));
console.log(`\n회원 로그인 계정: ${authUsers.length}개`);
authUsers.forEach((u) => console.log(`  ${u.uid}  ${u.email || ''}  ${u.providerData.map((p) => p.providerId).join(',') || 'custom'}`));
console.log(`\n사진·영상 파일: ${memberFiles.length}개`);
console.log(`\n유지: 관리자/트레이너 계정 ${staffUids.size}개, 센터·트레이너·운동 목록·신규문의`);

if (!DELETE) {
  console.log('\n변경한 것은 없습니다. 목록을 확인한 뒤 --delete 로 실행하세요.');
  process.exit(0);
}

const backup = `itbody-members-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(backup, JSON.stringify({
  documents: [...toDelete.entries()].map(([path, v]) => ({ path, data: v.data })),
  authUsers: authUsers.map((u) => ({ uid: u.uid, email: u.email || null, providers: u.providerData.map((p) => p.providerId) })),
  files: memberFiles.map((f) => f.name)
}, null, 1));
console.log(`\n백업 저장: ${backup}`);

let batch = db.batch(), n = 0;
for (const { ref } of toDelete.values()) { batch.delete(ref); if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); } }
await batch.commit();
console.log(`문서 삭제: ${toDelete.size}건`);
if (authUsers.length) { const r = await auth.deleteUsers(authUsers.map((u) => u.uid)); console.log(`로그인 계정 삭제: ${r.successCount}개 (실패 ${r.failureCount})`); }
for (const f of memberFiles) await f.delete({ ignoreNotFound: true });
console.log(`파일 삭제: ${memberFiles.length}개\n완료`);
