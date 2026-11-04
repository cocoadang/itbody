// Offline checks for the session journal (no network, no database).
import assert from 'node:assert/strict';
import { canAccessMember, canAccessSession, cleanText, mediaKind, type Caller } from '../src/server/journal';
import { matchesSearch, sessionNote, summarizeSets } from '../src/components/journal/JournalParts';

const admin: Caller = { uid: 'a', role: 'CENTER_ADMIN', centerId: 'c1', name: '관리자' };
const trainer: Caller = { uid: 't', role: 'TRAINER', centerId: 'c1', trainerId: 'tr1', name: '김트' };
const otherTrainer: Caller = { uid: 't2', role: 'TRAINER', centerId: 'c1', trainerId: 'tr2', name: '박트' };
const member: Caller = { uid: 'm', role: 'MEMBER', centerId: 'c1', memberId: 'm1', name: '회원' };
const session = { centerId: 'c1', memberId: 'm1', trainerId: 'tr1' };

// Session access: staff of the same center, assigned trainer, the member themself (read only).
assert.equal(canAccessSession(admin, session, true), true);
assert.equal(canAccessSession(trainer, session, true), true);
assert.equal(canAccessSession(otherTrainer, session, false), false);
assert.equal(canAccessSession(member, session, false), true);
assert.equal(canAccessSession(member, session, true), false, 'members cannot upload media or edit sessions');
assert.equal(canAccessSession({ ...member, memberId: 'm2' }, session, false), false);
assert.equal(canAccessSession({ ...admin, centerId: 'c2' }, session, false), false, 'no cross-center access');
assert.equal(canAccessSession(trainer, undefined, false), false);
assert.equal(canAccessSession({ ...trainer, trainerId: undefined }, session, false), false);

// Member access for comment lists.
assert.equal(canAccessMember(member, { centerId: 'c1', trainerId: 'tr1' }, 'm1'), true);
assert.equal(canAccessMember(member, { centerId: 'c1', trainerId: 'tr1' }, 'm9'), false);
assert.equal(canAccessMember(otherTrainer, { centerId: 'c1', trainerId: 'tr1' }, 'm1'), false);
assert.equal(canAccessMember(admin, { centerId: 'c2', trainerId: 'tr1' }, 'm1'), false);

// Comment text and media types.
assert.equal(cleanText('  운동 후 오른쪽이 더 아팠어요 \r\n'), '운동 후 오른쪽이 더 아팠어요');
assert.equal(cleanText('   '), null);
assert.equal(cleanText('x'.repeat(1001)), null);
assert.equal(cleanText(42), null);
assert.equal(cleanText('a\u0000b'), 'ab');
assert.equal(mediaKind('image/jpeg'), 'image');
assert.equal(mediaKind('video/quicktime'), 'video');
assert.equal(mediaKind('image/svg+xml'), null, 'SVG is not accepted (script content)');
assert.equal(mediaKind('text/html'), null);
assert.equal(mediaKind(undefined), null);

// Journal display helpers.
assert.equal(summarizeSets({ sets: [{ setNumber: 1, weight: 50, reps: 10 }, { setNumber: 2, weight: 50, reps: 10 }] }), '50kg × 10회 × 2세트');
assert.equal(summarizeSets({ sets: [{ setNumber: 1, weight: 0, reps: 15 }, { setNumber: 2, weight: 20, reps: 10 }] }), '맨몸×15, 20kg×10');
assert.equal(summarizeSets({ sets: [] }), '');
assert.equal(sessionNote({ trainerFeedback: '자세 좋아짐', nextSessionGoal: '런지' }), '자세 좋아짐\n다음 수업: 런지');
assert.equal(sessionNote({ memberFeedback: '좋아요' }), '좋아요');

const s = { sessionNumber: 5, date: '2026-11-04', trainerFeedback: '무릎 정렬 주의', exercises: [{ exerciseName: '스쿼트', sets: [] }] };
const comments = [{ commentId: 'x', sessionId: 's', sessionNumber: 5, memberId: 'm1', authorRole: 'MEMBER' as const, authorName: '회원', text: '오른쪽 허벅지가 당겼어요', createdAt: '', readByStaffAt: null }];
assert.equal(matchesSearch(s, [], ''), true);
assert.equal(matchesSearch(s, [], '스쿼트'), true);
assert.equal(matchesSearch(s, [], '5회차'), true);
assert.equal(matchesSearch(s, [], '무릎 스쿼트'), true, 'all terms must match');
assert.equal(matchesSearch(s, [], '벤치'), false);
assert.equal(matchesSearch(s, comments, '허벅지'), true, 'member comments are searchable');

console.log('Journal checks passed: access control, comment/media validation, search and display; no network/database.');
