import { sanitizePhoneNumber, isValidPhoneNumber } from '../src/utils/phoneUtils';
import { createTrainer, updateTrainer, createMember, updateMember, createLead, updateLead } from '../src/services/dataService';

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${testName}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
  console.log(`✅ [PASS] ${testName}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 Running Phone Number Utility & Input Verification Tests');
  console.log('====================================================\n');

  // 1. Sanitization tests
  // Normal 11 digits
  assert(sanitizePhoneNumber('01012345678') === '01012345678', '01012345678 remains unchanged');

  // Hyphens paste
  assert(sanitizePhoneNumber('010-1234-5678') === '01012345678', '010-1234-5678 converted to 01012345678');

  // Special characters & Korean & English stripping
  assert(sanitizePhoneNumber('abc-010-가나다-1234#$5678') === '01012345678', 'Strips alphabets, Korean, special characters');

  // Max 11 digits: truncated immediately
  assert(sanitizePhoneNumber('010123456789999') === '01012345678', '12+ digits truncated to 11 digits');

  // 10 digits (e.g. landline or 011)
  assert(sanitizePhoneNumber('02-1234-5678') === '0212345678', '10 digit landline stripped cleanly');

  // Empty / null handling
  assert(sanitizePhoneNumber('') === '', 'Empty string returns empty string');
  assert(sanitizePhoneNumber(null) === '', 'Null returns empty string');
  assert(sanitizePhoneNumber(undefined) === '', 'Undefined returns empty string');

  // 2. Validation tests (isValidPhoneNumber)
  // Required field checks
  assert(isValidPhoneNumber('01012345678', true) === true, '11 digits valid for required');
  assert(isValidPhoneNumber('0212345678', true) === true, '10 digits valid for required');
  assert(isValidPhoneNumber('0319876543', true) === true, '10 digits area code valid for required');
  assert(isValidPhoneNumber('010-1234-5678', true) === true, 'Formatted string valid because digits are 11');
  assert(isValidPhoneNumber('010123456', true) === false, '9 digits blocked for required (too short)');
  assert(isValidPhoneNumber('12345', true) === false, '5 digits blocked for required');
  assert(isValidPhoneNumber('', true) === false, 'Empty string blocked for required');
  assert(isValidPhoneNumber(null, true) === false, 'Null blocked for required');

  // Optional field checks
  assert(isValidPhoneNumber('', false) === true, 'Empty string allowed for optional');
  assert(isValidPhoneNumber(null, false) === true, 'Null allowed for optional');
  assert(isValidPhoneNumber('01012345678', false) === true, '11 digits valid for optional');
  assert(isValidPhoneNumber('0212345678', false) === true, '10 digits valid for optional');
  assert(isValidPhoneNumber('010123456', false) === false, '9 digits blocked if provided for optional');

  // 3. Integration with dataService models
  const centerId = 'center-phone-test-01';

  // Trainer creation and update
  const trainer = await createTrainer({
    centerId,
    name: '전화번호트레이너',
    phone: sanitizePhoneNumber('010-8888-9999'),
    specialty: '웨이트',
    role: 'TRAINER',
    status: 'ACTIVE'
  });
  assert(trainer.phone === '01088889999', 'Trainer created with normalized phone');

  const updatedTrainer = await updateTrainer(trainer.trainerId, {
    name: '전화번호트레이너수정',
    phone: sanitizePhoneNumber('010-7777-6666')
  });
  assert(updatedTrainer.phone === '01077776666', 'Trainer updated with normalized phone');

  // Member creation and update
  const member = await createMember({
    centerId,
    trainerId: trainer.trainerId,
    name: '전화번호회원',
    gender: 'FEMALE',
    birthDate: '1996-05-10',
    phone: sanitizePhoneNumber('010-2222-3333'),
    startDate: '2026-10-01',
    status: 'ACTIVE'
  });
  assert(member.phone === '01022223333', 'Member created with normalized phone');

  const updatedMember = await updateMember(member.memberId, {
    name: '전화번호회원수정',
    phone: sanitizePhoneNumber('010-4444-5555')
  });
  assert(updatedMember.phone === '01044445555', 'Member updated with normalized phone');

  // Lead creation and update
  const lead = await createLead({
    centerId,
    name: '전화번호문의',
    status: 'NEW',
    phone: sanitizePhoneNumber('010-6666-7777'),
    inquiryDate: '2026-10-01',
    source: 'ONLINE'
  });
  assert(lead.phone === '01066667777', 'Lead created with normalized phone');

  const updatedLead = await updateLead(
    centerId,
    lead.leadId,
    {
      phone: sanitizePhoneNumber('010-9999-0000')
    },
    'CENTER_ADMIN'
  );
  assert(updatedLead.phone === '01099990000', 'Lead updated with normalized phone');

  console.log('\n====================================================');
  console.log('🎉 All Phone Number Verification Tests Passed Successfully!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
