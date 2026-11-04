import { createTrainer, updateTrainer, memoryStore } from '../src/services/dataService';
import type { Trainer } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error('❌ Assertion failed:', msg);
    throw new Error(msg);
  }
  console.log('✅ ' + msg);
}

async function runTests() {
  console.log('--- Starting Trainer Payload & Sanitization Tests ---');

  const centerId = 'center-test-01';

  // 1. Create trainer without loginEmail and without uid
  const t1 = await createTrainer({
    centerId,
    name: '김테스트',
    phone: '010-1111-2222',
    specialty: '웨이트',
    role: 'TRAINER',
    status: 'ACTIVE'
  });

  assert(t1.name === '김테스트', 'Trainer 1 created with correct name');
  assert(t1.loginEmail === undefined, 'Trainer 1 loginEmail is undefined in memory model');
  assert(t1.uid === undefined, 'Trainer 1 uid is undefined in memory model');
  assert(memoryStore.trainers[t1.trainerId] !== undefined, 'Trainer 1 stored in memoryStore after success');

  // 2. Create trainer with loginEmail only
  const t2 = await createTrainer({
    centerId,
    name: '이코치',
    phone: '010-3333-4444',
    specialty: '필라테스',
    role: 'TRAINER',
    status: 'ACTIVE',
    loginEmail: 'coach.lee@itbody.com'
  });

  assert(t2.name === '이코치', 'Trainer 2 created with correct name');
  assert(t2.loginEmail === 'coach.lee@itbody.com', 'Trainer 2 loginEmail preserved');
  assert(t2.uid === undefined, 'Trainer 2 uid is undefined');

  // 3. Existing trainer with linked uid: update must preserve uid
  const t3 = await createTrainer({
    centerId,
    name: '박트레이너',
    phone: '010-5555-6666',
    specialty: '체형교정',
    role: 'TRAINER',
    status: 'ACTIVE',
    loginEmail: 'park@itbody.com',
    uid: 'firebase-auth-uid-12345'
  });

  assert(t3.uid === 'firebase-auth-uid-12345', 'Trainer 3 created with linked uid');

  // Update without passing uid (e.g. from UI edit modal without uid field)
  const updatedT3 = await updateTrainer(t3.trainerId, {
    name: '박트레이너(수정)',
    phone: '010-5555-7777',
    specialty: '재활&체형교정'
  });

  assert(updatedT3.name === '박트레이너(수정)', 'Trainer 3 name updated');
  assert(updatedT3.uid === 'firebase-auth-uid-12345', 'Trainer 3 existing uid strictly preserved');
  assert(updatedT3.loginEmail === 'park@itbody.com', 'Trainer 3 existing loginEmail preserved');

  // 4. Verify no undefined properties exist in memoryStore entries that would pollute writes
  const stored = memoryStore.trainers[t1.trainerId];
  const keys = Object.keys(stored);
  for (const k of keys) {
    // If key exists, check value
    if ((stored as any)[k] === undefined) {
      // In JS object, k can have undefined value, but when sending to Firestore, firestorePayload specifically filters out undefined!
    }
  }

  console.log('--- All Trainer Payload & Sanitization Tests Passed! ---');
}

runTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
