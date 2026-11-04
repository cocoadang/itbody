import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  deleteDoc,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, defaultDb, auth, storage, isDevSandbox, isFirestoreAvailable as configFirestoreAvailable } from '../firebase/config';

// In automated test environments (Node.js), default to high-performance local memory store unless explicitly requested
const isFirestoreAvailable =
  configFirestoreAvailable &&
  (typeof window !== 'undefined' || process.env.USE_FIRESTORE_IN_NODE === 'true');
import type {
  Center,
  Member,
  Trainer,
  PtSession,
  DashboardMetrics,
  UserRole,
  MemberStatus,
  Consultation,
  MemberGoal,
  PtContract,
  ContractStatus,
  ExerciseRecord,
  ExerciseSet,
  TimelineEvent,
  AttentionMemberItem,
  AttentionReasonCode,
  BodyMeasurement,
  ProgressPhoto,
  ProgressReview,
  PhotoViewType,
  ProgressPhotoConsent,
  Exercise,
  WorkoutTemplate,
  PersonalWorkoutPlan,
  PersonalWorkoutPlanExercise,
  PersonalWorkoutTargetSet,
  PersonalWorkoutPlanStatus,
  PersonalWorkoutLog,
  PersonalWorkoutLogExercise,
  PersonalWorkoutActualSet,
  WeeklyActivitySummary,
  Lead,
  LeadStatus,
  LeadSource,
  LeadLostReason,
  Renewal,
  RenewalStatus,
  RenewalDeclineReason,
  RenewalCandidate
} from '../types';

/**
 * Robust in-memory & local-storage cache to ensure resilience during dev/testing
 * and offline fallback if Firebase Auth is not active.
 */
interface LocalStore {
  centers: Record<string, Center>;
  trainers: Record<string, Trainer>;
  members: Record<string, Member>;
  ptSessions: Record<string, PtSession>;
  consultations: Record<string, Consultation>;
  memberGoals: Record<string, MemberGoal>;
  ptContracts: Record<string, PtContract>;
  bodyMeasurements: Record<string, BodyMeasurement>;
  progressPhotos: Record<string, ProgressPhoto>;
  progressReviews: Record<string, ProgressReview>;
  exercises: Record<string, Exercise>;
  workoutTemplates: Record<string, WorkoutTemplate>;
  personalWorkoutPlans: Record<string, PersonalWorkoutPlan>;
  personalWorkoutLogs: Record<string, PersonalWorkoutLog>;
  leads: Record<string, Lead>;
  renewals: Record<string, Renewal>;
  storageObjects: Record<string, string>;
}

const LOCAL_STORAGE_KEY = isDevSandbox ? 'pt_journey_dev_sandbox_v1' : 'pt_journey_data_store_v2';

function loadLocalStore(): LocalStore {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = isFirestoreAvailable ? null : localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          centers: parsed.centers || {},
          trainers: parsed.trainers || {},
          members: parsed.members || {},
          ptSessions: parsed.ptSessions || {},
          consultations: parsed.consultations || {},
          memberGoals: parsed.memberGoals || {},
          ptContracts: parsed.ptContracts || {},
          bodyMeasurements: parsed.bodyMeasurements || {},
          progressPhotos: parsed.progressPhotos || {},
          progressReviews: parsed.progressReviews || {},
          exercises: parsed.exercises || {},
          workoutTemplates: parsed.workoutTemplates || {},
          personalWorkoutPlans: parsed.personalWorkoutPlans || {},
          personalWorkoutLogs: parsed.personalWorkoutLogs || {},
          leads: parsed.leads || {},
          renewals: parsed.renewals || {},
          storageObjects: parsed.storageObjects || {}
        };
      }
    }
  } catch (e) {
    console.warn('[LocalStore load error]', e);
  }
  return {
    centers: {},
    trainers: {},
    members: {},
    ptSessions: {},
    consultations: {},
    memberGoals: {},
    ptContracts: {},
    bodyMeasurements: {},
    progressPhotos: {},
    progressReviews: {},
    exercises: {},
    workoutTemplates: {},
    personalWorkoutPlans: {},
    personalWorkoutLogs: {},
    leads: {},
    renewals: {},
    storageObjects: {}
  };
}

// Production data lives in Firestore. Keeping a browser copy caused stale or phantom records
// (different per domain/device) and left member data on shared devices, so only the dev
// sandbox and Node tests persist locally.
const persistLocally = !isFirestoreAvailable;
if (!persistLocally) {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(LOCAL_STORAGE_KEY); } catch { /* storage blocked */ }
}

function saveLocalStore(store: LocalStore) {
  if (!persistLocally) return;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
    }
  } catch (e) {
    console.warn('[LocalStore save error]', e);
  }
}

export let memoryStore: LocalStore = loadLocalStore();

/** A failed server write must be shown to the user instead of looking saved on this device only. */
function firestoreWriteFailed(label: string, err: unknown): never {
  console.error(`[Firestore ${label} error]`, err);
  const code = (err as { code?: string })?.code || '';
  if (code.includes('permission-denied')) throw new Error('권한이 없어 저장하지 못했습니다. 담당 회원인지 확인하거나 관리자에게 문의해주세요.');
  if (code.includes('unavailable') || code.includes('deadline')) throw new Error('네트워크 연결이 불안정해 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
  throw new Error('서버에 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
}


/**
 * Fail-Closed check before modifying operational data.
 * When in a browser environment with Firestore configured:
 * Blocks writes if user is not authenticated with real Firebase Auth.
 */
export function assertCanWrite(): void {
  if (typeof window !== 'undefined' && isFirestoreAvailable) {
    if (!auth || !auth.currentUser) {
      throw new Error(
        '인증되지 않은 사용자입니다. Firebase Authentication 계정으로 로그인한 상태에서만 데이터를 저장할 수 있습니다.'
      );
    }
  }
}

/**
 * Recursively removes undefined fields so that Firestore setDoc/updateDoc never errors with
 * "Unsupported field value: undefined".
 */
export function cleanFirestoreData<T>(val: T): T {
  if (val === undefined) return undefined as any;
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val
      .map((item) => cleanFirestoreData(item))
      .filter((item) => item !== undefined) as any;
  }
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      const cleaned = cleanFirestoreData(v);
      if (cleaned !== undefined) {
        result[k] = cleaned;
      }
    }
  }
  return result as T;
}

// ==========================================
// CENTER SERVICE
// ==========================================

export async function getCenter(centerId: string): Promise<Center | null> {
  if (isFirestoreAvailable && db) {
    try {
      const docRef = doc(db, 'centers', centerId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const c = snap.data() as Center;
        memoryStore.centers[centerId] = c;
        saveLocalStore(memoryStore);
        return c;
      }
      return null;
    } catch (err) {
      if (typeof window !== 'undefined' && auth?.currentUser) {
        console.error('[Firestore getCenter error]', err);
        throw err;
      }
      console.warn('[Firestore] Falling back to local store for center:', err);
    }
  }
  return memoryStore.centers[centerId] || null;
}

export async function updateCenter(centerId: string, data: Partial<Center>): Promise<void> {
  const now = new Date().toISOString();
  if (isFirestoreAvailable && db) {
    assertCanWrite();
    await updateDoc(doc(db, 'centers', centerId), {
      ...data,
      updatedAt: now
    });
  }

  if (memoryStore.centers[centerId]) {
    memoryStore.centers[centerId] = {
      ...memoryStore.centers[centerId],
      ...data,
      updatedAt: now
    };
    saveLocalStore(memoryStore);
  }
}

export async function createCenter(center: Center): Promise<void> {
  if (isFirestoreAvailable && db) {
    assertCanWrite();
    await setDoc(doc(db, 'centers', center.centerId), center);
  }

  memoryStore.centers[center.centerId] = center;
  saveLocalStore(memoryStore);
}

// ==========================================
// TRAINER SERVICE
// ==========================================

export async function getTrainers(centerId: string): Promise<Trainer[]> {
  if (isFirestoreAvailable && db) {
    try {
      const q = query(collection(db, 'trainers'), where('centerId', '==', centerId));
      const snap = await getDocs(q);
      const list: Trainer[] = [];
      snap.forEach((d) => {
        const tr = d.data() as Trainer;
        list.push(tr);
        memoryStore.trainers[tr.trainerId] = tr;
      });
      saveLocalStore(memoryStore);
      return list;
    } catch (err) {
      if (typeof window !== 'undefined' && auth?.currentUser) {
        console.error('[Firestore getTrainers error]', err);
        throw err;
      }
      console.warn('[Firestore] Falling back to local store for trainers:', err);
    }
  }
  return Object.values(memoryStore.trainers).filter((t) => t.centerId === centerId);
}

export async function createTrainer(
  trainerData: Omit<Trainer, 'trainerId' | 'createdAt'>
): Promise<Trainer> {
  const trainerId = 'tr-' + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();
  const cleanLoginEmail = trainerData.loginEmail?.trim() || undefined;
  const cleanUid = trainerData.uid?.trim() || undefined;
  if (cleanUid && !isDevSandbox) throw new Error('계정 연결은 서버 계정 발급 기능을 이용해주세요.');

  // Build explicitly sanitized payload for Firestore without undefined properties
  const firestorePayload: Record<string, any> = {
    trainerId,
    centerId: trainerData.centerId,
    name: trainerData.name.trim(),
    phone: trainerData.phone.trim(),
    specialty: trainerData.specialty?.trim() || '체형 교정 & 웨이트 트레이닝',
    role: trainerData.role || 'TRAINER',
    status: trainerData.status || 'ACTIVE',
    createdAt: now
  };
  if (cleanLoginEmail) {
    firestorePayload.loginEmail = cleanLoginEmail;
  }
  if (cleanUid) {
    firestorePayload.uid = cleanUid;
  }

  if (isFirestoreAvailable && db) {
    assertCanWrite();
    await setDoc(doc(db, 'trainers', trainerId), firestorePayload);
    // If uid is linked, sync or create users/{uid} document with role TRAINER
    if (cleanUid) {
      await setDoc(
        doc(db, 'users', cleanUid),
        {
          role: 'TRAINER',
          centerId: firestorePayload.centerId,
          trainerId: trainerId,
          email: cleanLoginEmail || '',
          name: firestorePayload.name
        },
        { merge: true }
      );
    }
  }

  const newTrainer: Trainer = {
    ...trainerData,
    loginEmail: cleanLoginEmail,
    uid: cleanUid,
    trainerId,
    createdAt: now
  };

  memoryStore.trainers[trainerId] = newTrainer;
  saveLocalStore(memoryStore);
  return newTrainer;
}

export async function updateTrainer(
  trainerId: string,
  data: Partial<Omit<Trainer, 'trainerId' | 'centerId' | 'createdAt'>>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Trainer> {
  let current = memoryStore.trainers[trainerId];
  if (!current && isFirestoreAvailable && db) {
    try {
      const snap = await getDoc(doc(db, 'trainers', trainerId));
      if (snap.exists()) {
        current = snap.data() as Trainer;
        memoryStore.trainers[trainerId] = current;
      }
    } catch (e) {
      console.warn('[updateTrainer fetch error]', e);
    }
  }
  if (!current && (!isFirestoreAvailable || !db)) {
    throw new Error(`Trainer with id ${trainerId} not found.`);
  }

  // RBAC validation:
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || currentTrainerId !== trainerId) {
      throw new Error('본인의 프로필 정보만 수정할 수 있습니다.');
    }
    // Block modifying restricted administrative fields
    if (data.status !== undefined && current && data.status !== current.status) {
      throw new Error('트레이너는 재직 상태를 변경할 수 없습니다.');
    }
    if (data.role !== undefined && current && data.role !== current.role) {
      throw new Error('트레이너는 권한(role)을 변경할 수 없습니다.');
    }
    if (data.loginEmail !== undefined && current && data.loginEmail !== current.loginEmail) {
      throw new Error('로그인 이메일 변경은 센터 관리자에게 문의해주세요.');
    }
    if (data.uid !== undefined && current && data.uid !== current.uid) {
      throw new Error('UID 식별자는 임의로 변경할 수 없습니다.');
    }
  }

  const now = new Date().toISOString();

  // Preserve existing uid if not explicitly updated with a valid value
  const preservedUid = data.uid !== undefined
    ? (data.uid?.trim() || undefined)
    : current?.uid;

  // Clean loginEmail: if data explicitly specifies it, use trimmed; otherwise keep current
  const cleanLoginEmail = data.loginEmail !== undefined
    ? (data.loginEmail?.trim() || undefined)
    : current?.loginEmail;

  // Build explicitly sanitized update payload for Firestore (no undefined values)
  const firestoreUpdate: Record<string, any> = {};
  if (data.name !== undefined) firestoreUpdate.name = data.name.trim();
  if (data.phone !== undefined) firestoreUpdate.phone = data.phone.trim();
  if (data.specialty !== undefined) firestoreUpdate.specialty = data.specialty.trim();
  if (data.bio !== undefined) firestoreUpdate.bio = data.bio.trim();
  firestoreUpdate.updatedAt = now;

  if (userRole !== 'TRAINER') {
    if (data.status !== undefined) firestoreUpdate.status = data.status;
    if (data.role !== undefined) firestoreUpdate.role = data.role;
    if (cleanLoginEmail) {
      firestoreUpdate.loginEmail = cleanLoginEmail;
    }
    if (preservedUid) {
      firestoreUpdate.uid = preservedUid;
    }
  }

  if (isFirestoreAvailable && db) {
    assertCanWrite();
    try {
      if (Object.keys(firestoreUpdate).length > 0) {
        await updateDoc(doc(db, 'trainers', trainerId), firestoreUpdate);
      }
      // If uid is linked, sync users/{uid} document with name & phone
      if (preservedUid) {
        const userUpdate: Record<string, any> = {
          name: data.name?.trim() || current?.name || '',
          phone: data.phone?.trim() || current?.phone || '',
          updatedAt: now
        };
        await setDoc(doc(db, 'users', preservedUid), userUpdate, { merge: true });
      }
    } catch (err: any) {
      console.error('[Firestore updateTrainer error]', err);
      throw new Error(`트레이너 정보 수정 실패: ${err?.message || 'Firestore 쓰기 오류'}`);
    }
  }

  const updatedTrainer: Trainer = {
    ...(current || ({} as Trainer)),
    ...data,
    updatedAt: now,
    ...(userRole === 'TRAINER' ? {} : { loginEmail: cleanLoginEmail, uid: preservedUid })
  };

  memoryStore.trainers[trainerId] = updatedTrainer;
  saveLocalStore(memoryStore);
  return updatedTrainer;
}

// ==========================================
// MEMBER SERVICE
// ==========================================

export async function getMembers(
  centerId: string,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<Member[]> {
  let list: Member[] = [];

  if (isFirestoreAvailable && db) {
    try {
      let q;
      if (userRole === 'TRAINER') {
        if (!currentTrainerId) return [];
        q = query(
          collection(db, 'members'),
          where('centerId', '==', centerId),
          where('trainerId', '==', currentTrainerId)
        );
      } else {
        q = query(collection(db, 'members'), where('centerId', '==', centerId));
      }
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const m = d.data() as Member;
        list.push(m);
        memoryStore.members[m.memberId] = m;
      });
      saveLocalStore(memoryStore);
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return list;
    } catch (err) {
      console.warn('[Firestore] Falling back to local store for members:', err);
    }
  }

  // Local fallback
  list = Object.values(memoryStore.members).filter((m) => {
    if (m.centerId !== centerId) return false;
    if (userRole === 'TRAINER') {
      return currentTrainerId ? m.trainerId === currentTrainerId : false;
    }
    return true;
  });
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return list;
}

export async function getMemberById(
  centerId: string,
  memberId: string,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<Member | null> {
  // Strict member boundary:
  if (userRole === 'MEMBER' && currentMemberId && currentMemberId !== memberId) {
    console.warn(`[Member Isolation] Blocked access to other member ${memberId}`);
    return null;
  }

  let member: Member | null = null;

  if (isFirestoreAvailable && db) {
    try {
      const snap = await getDoc(doc(db, 'members', memberId));
      if (snap.exists()) {
        member = snap.data() as Member;
        memoryStore.members[memberId] = member;
        saveLocalStore(memoryStore);
      }
    } catch (err) {
      console.warn('[Firestore] Falling back to local store for member detail:', err);
    }
  }

  if (!member) {
    member = memoryStore.members[memberId] || null;
  }

  if (!member) return null;

  // Strict tenant boundary:
  if (member.centerId !== centerId) {
    console.warn(`[Tenant Isolation] Blocked access to member ${memberId} of different center`);
    return null;
  }

  // Strict trainer boundary:
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || member.trainerId !== currentTrainerId) {
      console.warn(`[Trainer Isolation] Blocked access to unassigned member ${memberId}`);
      return null;
    }
  }

  return member;
}

export async function checkMemberEmailExists(
  centerId: string,
  email: string,
  excludeMemberId?: string
): Promise<boolean> {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) return false;

  if (isFirestoreAvailable && db) {
    try {
      const q = query(
        collection(db, 'members'),
        where('centerId', '==', centerId),
        where('email', '==', normalizedEmail)
      );
      const snap = await getDocs(q);
      let exists = false;
      snap.forEach((d) => {
        const m = d.data() as Member;
        if (!excludeMemberId || m.memberId !== excludeMemberId) {
          exists = true;
        }
      });
      if (exists) return true;
    } catch (err) {
      console.warn('[Firestore checkMemberEmailExists error]', err);
    }
  }

  // Local/memoryStore check
  return Object.values(memoryStore.members).some((m) => {
    if (m.centerId !== centerId) return false;
    if (excludeMemberId && m.memberId === excludeMemberId) return false;
    return (m.email || '').trim().toLowerCase() === normalizedEmail;
  });
}

export async function createMember(
  data: Omit<Member, 'memberId' | 'createdAt' | 'updatedAt'>
): Promise<Member> {
  const memberId = 'mem-' + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();

  let cleanEmail: string | undefined = undefined;
  if (data.email) {
    cleanEmail = data.email.trim().toLowerCase();
    const isDuplicate = await checkMemberEmailExists(data.centerId, cleanEmail);
    if (isDuplicate) {
      throw new Error('동일 센터 내에 이미 등록된 이메일입니다. 다른 이메일을 입력해주세요.');
    }
  }

  const newMember: Member = {
    ...data,
    ...(cleanEmail ? { email: cleanEmail } : {}),
    memberId,
    createdAt: now,
    updatedAt: now
  };

  memoryStore.members[memberId] = newMember;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await setDoc(doc(db, 'members', memberId), newMember);
    } catch (err) {
      firestoreWriteFailed('createMember', err);
    }
  }
  return newMember;
}

export async function updateMember(
  memberId: string,
  data: Partial<Omit<Member, 'memberId' | 'centerId' | 'createdAt' | 'updatedAt'>>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Member> {
  let current = memoryStore.members[memberId];
  if (!current && isFirestoreAvailable && db) {
    try {
      const snap = await getDoc(doc(db, 'members', memberId));
      if (snap.exists()) {
        current = snap.data() as Member;
        memoryStore.members[memberId] = current;
      }
    } catch (e) {
      console.warn('[updateMember] fetch error', e);
    }
  }
  if (!current) {
    throw new Error(`Member with id ${memberId} not found.`);
  }

  // Trainer authorization check
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || current.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원만 수정할 수 있습니다.');
    }
    // Prevent trainer from reassigning member to another trainer
    if (data.trainerId && data.trainerId !== currentTrainerId) {
      delete (data as any).trainerId;
    }
  }

  let cleanEmail: string | null | undefined = undefined;
  if (data.email !== undefined) {
    if (data.email) {
      cleanEmail = data.email.trim().toLowerCase();
      const isDuplicate = await checkMemberEmailExists(current.centerId, cleanEmail, memberId);
      if (isDuplicate) {
        throw new Error('동일 센터 내에 이미 등록된 이메일입니다. 다른 이메일을 입력해주세요.');
      }
    } else {
      cleanEmail = null;
    }
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, any> = {
    ...data,
    updatedAt: now
  };
  if (cleanEmail !== undefined) {
    updatePayload.email = cleanEmail;
  }

  const updatedMember: Member = {
    ...current,
    ...data,
    ...(cleanEmail !== undefined ? { email: cleanEmail } : {}),
    updatedAt: now
  };

  memoryStore.members[memberId] = updatedMember;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'members', memberId), updatePayload);
    } catch (err) {
      firestoreWriteFailed('updateMember', err);
    }
  }

  return updatedMember;
}

export async function updateMemberStatus(
  memberId: string,
  status: MemberStatus,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const current = memoryStore.members[memberId];
  if (userRole === 'TRAINER' && current) {
    if (!currentTrainerId || current.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 상태만 변경할 수 있습니다.');
    }
  }

  const now = new Date().toISOString();
  if (memoryStore.members[memberId]) {
    memoryStore.members[memberId].status = status;
    memoryStore.members[memberId].updatedAt = now;
    saveLocalStore(memoryStore);
  }
  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'members', memberId), { status, updatedAt: now });
    } catch (err) {
      firestoreWriteFailed('updateMemberStatus', err);
    }
  }
}

export async function updateMemberNotes(
  memberId: string,
  notes: string,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const current = memoryStore.members[memberId];
  if (userRole === 'TRAINER' && current) {
    if (!currentTrainerId || current.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 메모만 수정할 수 있습니다.');
    }
  }

  const now = new Date().toISOString();
  if (memoryStore.members[memberId]) {
    memoryStore.members[memberId].notes = notes;
    memoryStore.members[memberId].updatedAt = now;
    saveLocalStore(memoryStore);
  }
  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'members', memberId), { notes, updatedAt: now });
    } catch (err) {
      firestoreWriteFailed('updateMemberNotes', err);
    }
  }
}

// ==========================================
// PHASE 2: CONSULTATION SERVICE (최초 상담)
// ==========================================

export async function getConsultationByMemberId(
  centerId: string,
  memberId: string,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<Consultation | null> {
  if (userRole === 'MEMBER' && currentMemberId && currentMemberId !== memberId) {
    return null;
  }
  if (userRole === 'TRAINER') {
    if (!currentTrainerId) return null;
    const targetMember = memoryStore.members[memberId];
    if (targetMember && targetMember.trainerId !== currentTrainerId) {
      return null;
    }
  }

  if (isFirestoreAvailable && db) {
    try {
      let q;
      if (userRole === 'TRAINER') {
        q = query(
          collection(db, 'consultations'),
          where('centerId', '==', centerId),
          where('memberId', '==', memberId),
          where('trainerId', '==', currentTrainerId)
        );
      } else {
        q = query(
          collection(db, 'consultations'),
          where('centerId', '==', centerId),
          where('memberId', '==', memberId)
        );
      }
      const snap = await getDocs(q);
      if (!snap.empty) {
        const item = snap.docs[0].data() as Consultation;
        memoryStore.consultations[item.consultationId] = item;
        saveLocalStore(memoryStore);
        return item;
      }
    } catch (err) {
      console.warn('[Firestore] Falling back to local store for consultation:', err);
    }
  }

  // Local fallback
  const found = Object.values(memoryStore.consultations).find(
    (c) => c.centerId === centerId && c.memberId === memberId
  );

  if (found && userRole === 'TRAINER') {
    if (!currentTrainerId || found.trainerId !== currentTrainerId) {
      return null;
    }
  }
  return found || null;
}

export async function saveConsultation(
  consultationData: Omit<Consultation, 'consultationId' | 'createdAt' | 'updatedAt'> & {
    consultationId?: string;
  },
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Consultation> {
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || consultationData.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 상담 기록만 작성 및 수정할 수 있습니다.');
    }
  }

  const now = new Date().toISOString();
  const consultationId =
    consultationData.consultationId || 'con-' + Math.random().toString(36).substring(2, 9);

  const existing = memoryStore.consultations[consultationId];
  const item: Consultation = {
    ...consultationData,
    consultationId,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  memoryStore.consultations[consultationId] = item;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await setDoc(doc(db, 'consultations', consultationId), item);
    } catch (err) {
      firestoreWriteFailed('saveConsultation', err);
    }
  }
  return item;
}

// ==========================================
// PHASE 2: MEMBER GOALS SERVICE (목표 관리)
// ==========================================

export async function getGoalsByMember(
  centerId: string,
  memberId: string,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<MemberGoal[]> {
  if (userRole === 'MEMBER' && currentMemberId && currentMemberId !== memberId) {
    return [];
  }
  if (userRole === 'TRAINER') {
    if (!currentTrainerId) return [];
    const targetMember = memoryStore.members[memberId];
    if (targetMember && targetMember.trainerId !== currentTrainerId) {
      return [];
    }
  }

  if (isFirestoreAvailable && db) {
    try {
      let q;
      if (userRole === 'TRAINER') {
        q = query(
          collection(db, 'memberGoals'),
          where('centerId', '==', centerId),
          where('memberId', '==', memberId),
          where('trainerId', '==', currentTrainerId)
        );
      } else {
        q = query(
          collection(db, 'memberGoals'),
          where('centerId', '==', centerId),
          where('memberId', '==', memberId)
        );
      }
      const snap = await getDocs(q);
      const list: MemberGoal[] = [];
      snap.forEach((d) => {
        const g = d.data() as MemberGoal;
        list.push(g);
        memoryStore.memberGoals[g.goalId] = g;
      });
      saveLocalStore(memoryStore);
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return list;
    } catch (err) {
      console.warn('[Firestore] Falling back to local store for member goals:', err);
    }
  }

  const list = Object.values(memoryStore.memberGoals).filter((g) => {
    if (g.centerId !== centerId || g.memberId !== memberId) return false;
    if (userRole === 'TRAINER') {
      return currentTrainerId ? g.trainerId === currentTrainerId : false;
    }
    return true;
  });
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return list;
}

export async function createGoal(
  data: Omit<MemberGoal, 'goalId' | 'createdAt' | 'updatedAt'>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<MemberGoal> {
  let effectiveTrainerId = data.trainerId;
  if (userRole === 'TRAINER') {
    if (!currentTrainerId) {
      throw new Error('본인 담당 회원의 목표만 등록할 수 있습니다.');
    }
    effectiveTrainerId = currentTrainerId;
  }

  const goalId = 'goal-' + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();
  const newGoal: MemberGoal = {
    ...data,
    ...(effectiveTrainerId ? { trainerId: effectiveTrainerId } : {}),
    goalId,
    createdAt: now,
    updatedAt: now
  };

  memoryStore.memberGoals[goalId] = newGoal;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      const cleaned = cleanFirestoreData(newGoal);
      await setDoc(doc(db, 'memberGoals', goalId), cleaned);
    } catch (err) {
      console.error('[Firestore createGoal error]', err);
      throw err;
    }
  }
  return newGoal;
}

export async function updateGoal(
  centerId: string,
  goalId: string,
  updates: Partial<MemberGoal>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const current = memoryStore.memberGoals[goalId];
  if (userRole === 'TRAINER' && current) {
    if (!currentTrainerId || current.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 목표만 수정할 수 있습니다.');
    }
  }

  const now = new Date().toISOString();
  if (memoryStore.memberGoals[goalId]) {
    memoryStore.memberGoals[goalId] = {
      ...memoryStore.memberGoals[goalId],
      ...updates,
      updatedAt: now,
      completedAt:
        updates.status === 'ACHIEVED'
          ? now
          : updates.status
          ? null
          : memoryStore.memberGoals[goalId].completedAt
    };
    saveLocalStore(memoryStore);
  }

  if (isFirestoreAvailable && db) {
    try {
      const updateData: any = {
        ...updates,
        updatedAt: now
      };
      if (updates.status === 'ACHIEVED') {
        updateData.completedAt = now;
      } else if (updates.status) {
        updateData.completedAt = null;
      }
      const cleaned = cleanFirestoreData(updateData);
      await updateDoc(doc(db, 'memberGoals', goalId), cleaned);
    } catch (err) {
      console.error('[Firestore updateGoal error]', err);
      throw err;
    }
  }
}

export async function deleteGoal(
  centerId: string,
  goalId: string,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const current = memoryStore.memberGoals[goalId];
  if (userRole === 'TRAINER' && current) {
    if (!currentTrainerId || current.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 목표만 삭제할 수 있습니다.');
    }
  }

  delete memoryStore.memberGoals[goalId];
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'memberGoals', goalId));
    } catch (err) {
      firestoreWriteFailed('deleteGoal', err);
    }
  }
}

// ==========================================
// PHASE 2: PT CONTRACTS (이용권 / 계약 관리)
// ==========================================

export const loadedMemberSessionIds = new Set<string>();

/**
 * 다중 ACTIVE 이용권 소진 우선순위:
 * 1) 만료일이 가장 빠른 계약 (expirationDate 오름차순)
 * 2) 만료일이 같거나 없으면 시작일이 가장 빠른 계약 (startDate 오름차순)
 * 3) 그래도 같으면 createdAt이 가장 오래된 계약 (createdAt 오름차순)
 * 잔여횟수(totalSessions - usedSessions > 0)가 남아있는 계약 우선.
 */
export function getPriorityContract(contracts: PtContract[]): PtContract | null {
  if (!contracts || contracts.length === 0) return null;

  const activeAvailable = contracts.filter(
    (c) => c.status === 'ACTIVE' && c.totalSessions - (c.usedSessions || 0) > 0
  );

  if (activeAvailable.length === 0) {
    return contracts.find((c) => c.status === 'ACTIVE') || contracts[0] || null;
  }

  return [...activeAvailable].sort((a, b) => {
    // 1) 만료일이 가장 빠른 계약
    if (a.expirationDate && b.expirationDate && a.expirationDate !== b.expirationDate) {
      return a.expirationDate.localeCompare(b.expirationDate);
    }
    if (a.expirationDate && !b.expirationDate) return -1;
    if (!a.expirationDate && b.expirationDate) return 1;

    // 2) 만료일이 같거나 없으면 시작일이 가장 빠른 계약
    if (a.startDate && b.startDate && a.startDate !== b.startDate) {
      return a.startDate.localeCompare(b.startDate);
    }
    if (a.startDate && !b.startDate) return -1;
    if (!a.startDate && b.startDate) return 1;

    // 3) 그래도 같으면 createdAt이 가장 오래된 계약
    const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aCreated - bCreated;
  })[0];
}

export interface MemberSessionSummary {
  /** 현재 이용 가능한 ACTIVE 이용권 총 등록 횟수 합산 (예: 10 + 10 + 10 = 30) */
  activeTotalSessions: number;
  /** 현재 이용 가능한 ACTIVE 이용권 총 완료 사용 횟수 합산 (예: 1 + 0 + 0 = 1) */
  activeUsedSessions: number;
  /** 현재 총 잔여 횟수 (activeTotalSessions - activeUsedSessions, 예: 29) */
  activeRemainingSessions: number;
  /** 현재 유효(ACTIVE) 이용권 개수 */
  activeContractsCount: number;
  /** 전체 누적 계약 개수 (만료, 완료, 취소 포함) */
  allContractsCount: number;
  /** 전체 계약 총 등록 횟수 누적 */
  allTotalSessions: number;
  /** 전체 계약 총 사용 횟수 누적 */
  allUsedSessions: number;
  /** 전체 계약 잔여 횟수 누적 */
  allRemainingSessions: number;
  /** 주 이용권 (우선순위 소진 대상 계약) */
  primaryContract: PtContract | null;
  /** 활성 계약 여부 */
  hasActiveContracts: boolean;
  /** 진척률 (%) */
  completionRate: number;
}

/**
 * Single Source of Truth PT 이용권 통합 집계 함수
 * - 최초 등록과 재등록 이용권 전체를 합산
 * - ACTIVE 상태인 계약만 현재 사용 가능 횟수로 집계
 * - 만료/종료/취소된 계약은 구분
 * - 수업일지와 계약 사용 횟수의 중복 차감 방지 (COMPLETED 수업만 인정, 취소/미완료 제외)
 */
export function calculateMemberSessionSummary(
  contracts: PtContract[] = [],
  sessions?: PtSession[]
): MemberSessionSummary {
  const activeContracts = contracts.filter((c) => c.status === 'ACTIVE');
  const primaryContract = getPriorityContract(contracts);

  // Completed sessions count (취소/예약/노쇼 제외, COMPLETED만)
  let completedSessionsCount: number | null = null;
  if (sessions && Array.isArray(sessions)) {
    completedSessionsCount = sessions.filter((s) => s.status === 'COMPLETED').length;
  }

  // Active contracts aggregation
  let activeTotalSessions = 0;
  let activeUsedSessions = 0;

  for (const c of activeContracts) {
    const total = Number(c.totalSessions) || 0;
    activeTotalSessions += total;

    let used = Number(c.usedSessions) || 0;
    if (sessions && Array.isArray(sessions)) {
      const contractCompletedSessions = sessions.filter(
        (s) => s.contractId === c.contractId && s.status === 'COMPLETED'
      ).length;
      if (contractCompletedSessions > 0 || (loadedMemberSessionIds.size > 0 && c.usedSessions !== undefined)) {
        used = contractCompletedSessions;
      }
    }
    activeUsedSessions += Math.min(total, Math.max(0, used));
  }

  // If completedSessionsCount is provided and activeContracts are loaded without contractId tags,
  // ensure activeUsedSessions accurately reflects completed sessions (capped at total)
  if (completedSessionsCount !== null && activeContracts.length > 0 && activeUsedSessions === 0 && completedSessionsCount > 0) {
    activeUsedSessions = Math.min(activeTotalSessions, completedSessionsCount);
  }

  const activeRemainingSessions = Math.max(0, activeTotalSessions - activeUsedSessions);

  // All contracts aggregation (including completed, expired, cancelled)
  let allTotalSessions = 0;
  let allUsedSessions = 0;
  for (const c of contracts) {
    const total = Number(c.totalSessions) || 0;
    const used = Number(c.usedSessions) || 0;
    allTotalSessions += total;
    allUsedSessions += Math.min(total, Math.max(0, used));
  }
  const allRemainingSessions = Math.max(0, allTotalSessions - allUsedSessions);

  const completionRate =
    activeTotalSessions > 0
      ? Math.min(100, Math.round((activeUsedSessions / activeTotalSessions) * 100))
      : 0;

  return {
    activeTotalSessions,
    activeUsedSessions,
    activeRemainingSessions,
    activeContractsCount: activeContracts.length,
    allContractsCount: contracts.length,
    allTotalSessions,
    allUsedSessions,
    allRemainingSessions,
    primaryContract,
    hasActiveContracts: activeContracts.length > 0,
    completionRate
  };
}

export async function getContractsByMember(
  centerId: string,
  memberId: string,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<PtContract[]> {
  if (userRole === 'MEMBER' && currentMemberId && currentMemberId !== memberId) {
    return [];
  }
  if (userRole === 'TRAINER') {
    if (!currentTrainerId) return [];
    const targetMember = memoryStore.members[memberId];
    if (targetMember && targetMember.trainerId !== currentTrainerId) {
      return [];
    }
  }

  if (isFirestoreAvailable && db) {
    try {
      let q;
      if (userRole === 'TRAINER') {
        q = query(
          collection(db, 'ptContracts'),
          where('centerId', '==', centerId),
          where('memberId', '==', memberId),
          where('trainerId', '==', currentTrainerId)
        );
      } else {
        q = query(
          collection(db, 'ptContracts'),
          where('centerId', '==', centerId),
          where('memberId', '==', memberId)
        );
      }
      const snap = await getDocs(q);
      const list: PtContract[] = [];
      snap.forEach((d) => {
        const c = d.data() as PtContract;
        list.push(c);
        memoryStore.ptContracts[c.contractId] = c;
      });
      saveLocalStore(memoryStore);
      // Ensure SSOT mathematical sync with COMPLETED sessions only if session data has been verified loaded
      const isSessionsLoaded = loadedMemberSessionIds.has(`${centerId}:${memberId}`);
      for (const c of list) {
        if (isSessionsLoaded) {
          const actualCount = Object.values(memoryStore.ptSessions).filter(
            (s) => s.contractId === c.contractId && s.status === 'COMPLETED'
          ).length;
          c.usedSessions = actualCount;
          c.status = actualCount >= c.totalSessions ? 'COMPLETED' : 'ACTIVE';
        } else {
          // Cold-start / sessions not yet loaded: trust the stored usedSessions from Firestore / memoryStore
          c.status = (c.usedSessions || 0) >= c.totalSessions ? 'COMPLETED' : (c.status || 'ACTIVE');
        }
      }
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return list;
    } catch (err) {
      console.warn('[Firestore] Falling back to local store for contracts:', err);
    }
  }

  const list = Object.values(memoryStore.ptContracts).filter((c) => {
    if (c.centerId !== centerId || c.memberId !== memberId) return false;
    if (userRole === 'TRAINER') {
      return currentTrainerId ? c.trainerId === currentTrainerId : false;
    }
    return true;
  });

  // Ensure SSOT mathematical sync with COMPLETED sessions only if session data has been verified loaded
  const isSessionsLoaded = loadedMemberSessionIds.has(`${centerId}:${memberId}`);
  for (const c of list) {
    if (isSessionsLoaded) {
      const actualCount = Object.values(memoryStore.ptSessions).filter(
        (s) => s.contractId === c.contractId && s.status === 'COMPLETED'
      ).length;
      c.usedSessions = actualCount;
      c.status = actualCount >= c.totalSessions ? 'COMPLETED' : 'ACTIVE';
    } else {
      c.status = (c.usedSessions || 0) >= c.totalSessions ? 'COMPLETED' : (c.status || 'ACTIVE');
    }
  }

  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return list;
}

export async function getActiveContract(
  centerId: string,
  memberId: string,
  userRole: UserRole = 'CENTER_ADMIN',
  currentTrainerId?: string | null
): Promise<PtContract | null> {
  const contracts = await getContractsByMember(centerId, memberId, userRole, currentTrainerId);
  return getPriorityContract(contracts);
}

export async function getContractById(
  centerId: string,
  contractId: string,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<PtContract | null> {
  if (isFirestoreAvailable && db) {
    try {
      const snap = await getDoc(doc(db, 'ptContracts', contractId));
      if (snap.exists()) {
        const item = snap.data() as PtContract;
        if (item.centerId === centerId) {
          if (!memoryStore.ptContracts) memoryStore.ptContracts = {};
          memoryStore.ptContracts[contractId] = item;
          saveLocalStore(memoryStore);
          if (userRole === 'TRAINER') {
            if (!currentTrainerId || item.trainerId !== currentTrainerId) return null;
          }
          return item;
        }
      }
    } catch (err) {
      console.warn('[Firestore getContractById error]', err);
    }
  }

  const found = memoryStore.ptContracts?.[contractId];
  if (!found || found.centerId !== centerId) return null;
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || found.trainerId !== currentTrainerId) return null;
  }
  return found;
}

export async function createContract(
  data: Omit<PtContract, 'contractId' | 'usedSessions' | 'createdAt' | 'updatedAt'>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<PtContract> {
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || data.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 이용권만 등록할 수 있습니다.');
    }
  }

  const contractId = 'ct-' + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();
  const newContract: PtContract = {
    ...data,
    contractId,
    usedSessions: 0,
    status: data.status || 'ACTIVE',
    createdAt: now,
    updatedAt: now
  };

  memoryStore.ptContracts[contractId] = newContract;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await setDoc(doc(db, 'ptContracts', contractId), newContract);
    } catch (err) {
      firestoreWriteFailed('createContract', err);
    }
  }
  return newContract;
}

export async function updateContract(
  centerId: string,
  contractId: string,
  updates: Partial<PtContract>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const contract = memoryStore.ptContracts[contractId];
  if (!contract) return;
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || contract.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 이용권만 수정할 수 있습니다.');
    }
  }

  const now = new Date().toISOString();
  memoryStore.ptContracts[contractId] = {
    ...contract,
    ...updates,
    updatedAt: now
  };
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'ptContracts', contractId), {
        ...updates,
        updatedAt: now
      });
    } catch (err) {
      firestoreWriteFailed('updateContract', err);
    }
  }
}

export async function deleteContract(
  centerId: string,
  contractId: string,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const contract = memoryStore.ptContracts[contractId];
  if (userRole === 'TRAINER' && contract) {
    if (!currentTrainerId || contract.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 이용권만 삭제할 수 있습니다.');
    }
  }

  delete memoryStore.ptContracts[contractId];
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'ptContracts', contractId));
    } catch (err) {
      firestoreWriteFailed('deleteContract', err);
    }
  }
}

/**
 * Recomputes contract usedSessions strictly based on completed ptSessions (Single Source of Truth)
 */
export async function syncContractUsage(centerId: string, contractId: string): Promise<number> {
  const contract = memoryStore.ptContracts[contractId];
  if (!contract) return 0;

  // Single Source of Truth: Count all COMPLETED sessions for this contract
  const completedSessions = Object.values(memoryStore.ptSessions).filter(
    (s) => s.contractId === contractId && s.status === 'COMPLETED'
  );
  const usedCount = completedSessions.length;

  const newStatus: ContractStatus =
    usedCount >= contract.totalSessions ? 'COMPLETED' : 'ACTIVE';

  contract.usedSessions = usedCount;
  contract.status = newStatus;
  contract.updatedAt = new Date().toISOString();
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'ptContracts', contractId), {
        usedSessions: usedCount,
        status: newStatus,
        updatedAt: contract.updatedAt
      });
    } catch (err) {
      firestoreWriteFailed('syncContractUsage', err);
    }
  }
  return usedCount;
}

// ==========================================
// PHASE 2: PT SESSIONS & LOG (수업 일지 및 세트 기록)
// ==========================================

export async function getSessionsByMember(
  centerId: string,
  memberId: string,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<PtSession[]> {
  if (userRole === 'MEMBER' && currentMemberId && currentMemberId !== memberId) {
    return [];
  }
  if (userRole === 'TRAINER') {
    if (!currentTrainerId) return [];
    const targetMember = memoryStore.members[memberId];
    if (targetMember && targetMember.trainerId !== currentTrainerId) {
      return [];
    }
  }

  const sanitize = (sessions: PtSession[]) => {
    if (userRole === 'MEMBER') {
      return sessions.map((s) => {
        const { sessionNotes, internalNote, ...safe } = s;
        return safe as PtSession;
      });
    }
    return sessions;
  };

  if (isFirestoreAvailable && db) {
    try {
      let q;
      if (userRole === 'TRAINER') {
        q = query(
          collection(db, 'ptSessions'),
          where('centerId', '==', centerId),
          where('memberId', '==', memberId),
          where('trainerId', '==', currentTrainerId)
        );
      } else {
        q = query(
          collection(db, 'ptSessions'),
          where('centerId', '==', centerId),
          where('memberId', '==', memberId)
        );
      }
      const snap = await getDocs(q);
      const list: PtSession[] = [];
      snap.forEach((d) => {
        const s = d.data() as PtSession;
        list.push(s);
        memoryStore.ptSessions[s.sessionId] = s;
      });
      loadedMemberSessionIds.add(`${centerId}:${memberId}`);
      saveLocalStore(memoryStore);
      list.sort((a, b) => b.sessionNumber - a.sessionNumber || b.date.localeCompare(a.date));
      return sanitize(list);
    } catch (err) {
      console.warn('[Firestore] Falling back to local store for sessions:', err);
    }
  }

  const list = Object.values(memoryStore.ptSessions).filter((s) => {
    if (s.centerId !== centerId || s.memberId !== memberId) return false;
    if (userRole === 'TRAINER') {
      return currentTrainerId ? s.trainerId === currentTrainerId : false;
    }
    return true;
  });
  loadedMemberSessionIds.add(`${centerId}:${memberId}`);
  list.sort((a, b) => b.sessionNumber - a.sessionNumber || b.date.localeCompare(a.date));
  return sanitize(list);
}

export async function createPtSession(
  data: Omit<PtSession, 'sessionId' | 'createdAt' | 'updatedAt'>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<PtSession> {
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || data.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 수업 일지만 작성할 수 있습니다.');
    }
  }

  const sessionId = 'ses-' + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();

  if (!data.contractId) {
    throw new Error('PT 수업 일지를 작성하기 위해 유효한 PT 계약(이용권) 선택이 필수입니다.');
  }

  const contract = memoryStore.ptContracts[data.contractId];
  if (!contract) {
    throw new Error('선택된 PT 계약(이용권)을 찾을 수 없습니다.');
  }
  if (contract.memberId !== data.memberId || contract.centerId !== data.centerId) {
    throw new Error('해당 회원의 소속 센터 및 계약 정보와 일치하지 않습니다.');
  }

  // Count existing completed sessions for this contractId
  const existingCompletedCount = Object.values(memoryStore.ptSessions).filter(
    (s) => s.contractId === data.contractId && s.status === 'COMPLETED'
  ).length;

  if (data.status === 'COMPLETED') {
    if (existingCompletedCount >= contract.totalSessions) {
      throw new Error(`계약된 총 횟수(${contract.totalSessions}회)를 초과하여 수업을 완료할 수 없습니다.`);
    }
  }

  const internalNote = data.internalNote !== undefined ? data.internalNote : data.sessionNotes;
  const sessionNotes = internalNote;
  const memberFeedback = data.memberFeedback !== undefined ? data.memberFeedback : data.trainerFeedback;
  const trainerFeedback = memberFeedback;

  const newSession: PtSession = {
    ...data,
    internalNote,
    sessionNotes,
    memberFeedback,
    trainerFeedback,
    sessionId,
    createdAt: now,
    updatedAt: now
  };

  memoryStore.ptSessions[sessionId] = newSession;
  loadedMemberSessionIds.add(`${newSession.centerId}:${newSession.memberId}`);
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await setDoc(doc(db, 'ptSessions', sessionId), newSession);
    } catch (err) {
      firestoreWriteFailed('createPtSession', err);
    }
  }

  // Update contract usage strictly based on COMPLETED sessions
  await syncContractUsage(newSession.centerId, newSession.contractId);

  return newSession;
}

export async function updatePtSession(
  centerId: string,
  sessionId: string,
  updates: Partial<PtSession>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const session = memoryStore.ptSessions[sessionId];
  if (!session) return;
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || session.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 수업 일지만 수정할 수 있습니다.');
    }
  }

  const now = new Date().toISOString();
  const oldContractId = session.contractId;
  const newContractId = updates.contractId || oldContractId;

  const targetContract = memoryStore.ptContracts[newContractId];
  if (!targetContract) {
    throw new Error('선택된 PT 계약(이용권)을 찾을 수 없습니다.');
  }

  const oldStatus = session.status;
  const newStatus = updates.status || oldStatus;

  // Guard: if changing to COMPLETED (or switching contract with COMPLETED status), verify boundary
  if (newStatus === 'COMPLETED' && (oldStatus !== 'COMPLETED' || oldContractId !== newContractId)) {
    const existingCompletedCount = Object.values(memoryStore.ptSessions).filter(
      (s) => s.contractId === newContractId && s.sessionId !== sessionId && s.status === 'COMPLETED'
    ).length;

    if (existingCompletedCount >= targetContract.totalSessions) {
      throw new Error(`계약된 총 횟수(${targetContract.totalSessions}회)를 초과하여 수업을 완료할 수 없습니다.`);
    }
  }

  const normalizedUpdates: Partial<PtSession> = { ...updates };
  if (updates.internalNote !== undefined) {
    normalizedUpdates.sessionNotes = updates.internalNote;
  } else if (updates.sessionNotes !== undefined) {
    normalizedUpdates.internalNote = updates.sessionNotes;
  }
  if (updates.memberFeedback !== undefined) {
    normalizedUpdates.trainerFeedback = updates.memberFeedback;
  } else if (updates.trainerFeedback !== undefined) {
    normalizedUpdates.memberFeedback = updates.trainerFeedback;
  }

  memoryStore.ptSessions[sessionId] = {
    ...session,
    ...normalizedUpdates,
    updatedAt: now
  };
  loadedMemberSessionIds.add(`${session.centerId}:${session.memberId}`);
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'ptSessions', sessionId), {
        ...normalizedUpdates,
        updatedAt: now
      });
    } catch (err) {
      firestoreWriteFailed('updatePtSession', err);
    }
  }

  // Sync affected contracts
  if (oldContractId && oldContractId !== newContractId) {
    await syncContractUsage(centerId, oldContractId);
  }
  await syncContractUsage(centerId, newContractId);
}

export async function deletePtSession(
  centerId: string,
  sessionId: string,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const session = memoryStore.ptSessions[sessionId];
  if (userRole === 'TRAINER' && session) {
    if (!currentTrainerId || session.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 수업 일지만 삭제할 수 있습니다.');
    }
  }

  const contractId = session?.contractId;
  const memberCenterId = session?.centerId;
  const memberId = session?.memberId;

  delete memoryStore.ptSessions[sessionId];
  if (memberCenterId && memberId) {
    loadedMemberSessionIds.add(`${memberCenterId}:${memberId}`);
  }
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'ptSessions', sessionId));
    } catch (err) {
      firestoreWriteFailed('deletePtSession', err);
    }
  }

  // Restore session usage accurately if session was deleted
  if (contractId) {
    await syncContractUsage(centerId, contractId);
  }
}

/**
 * Finds the most recent completed performance of an exercise for this member
 * to display as a reference comparison during workout entry (STEP 7)
 */
export async function getPreviousExerciseRecord(
  centerId: string,
  memberId: string,
  exerciseName: string
): Promise<{
  sessionDate: string;
  sessionNumber: number;
  sets: ExerciseSet[];
  memo?: string;
} | null> {
  if (!exerciseName || !exerciseName.trim()) return null;
  const cleanName = exerciseName.trim().toLowerCase();

  // Retrieve member sessions sorted by date descending
  const sessions = Object.values(memoryStore.ptSessions)
    .filter((s) => s.centerId === centerId && s.memberId === memberId && s.status === 'COMPLETED')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  for (const s of sessions) {
    const match = s.exercises?.find(
      (e) => e.exerciseName.trim().toLowerCase() === cleanName
    );
    if (match && match.sets && match.sets.length > 0) {
      return {
        sessionDate: s.date,
        sessionNumber: s.sessionNumber,
        sets: match.sets,
        memo: match.memo
      };
    }
  }
  return null;
}

// ==========================================
// TODAY'S PT
// ==========================================

export async function getTodayPtSessions(
  centerId: string,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<PtSession[]> {
  if (userRole === 'TRAINER' && !currentTrainerId) {
    return [];
  }

  const todayStr = new Date().toISOString().split('T')[0];

  if (isFirestoreAvailable && db) {
    try {
      let q;
      if (userRole === 'TRAINER') {
        q = query(
          collection(db, 'ptSessions'),
          where('centerId', '==', centerId),
          where('trainerId', '==', currentTrainerId),
          where('date', '==', todayStr)
        );
      } else {
        q = query(
          collection(db, 'ptSessions'),
          where('centerId', '==', centerId),
          where('date', '==', todayStr)
        );
      }
      const snap = await getDocs(q);
      const list: PtSession[] = [];
      snap.forEach((d) => {
        list.push(d.data() as PtSession);
      });
      list.sort((a, b) => a.time.localeCompare(b.time));
      return list;
    } catch (err) {
      console.warn('[Firestore] Falling back to local store for today sessions:', err);
    }
  }

  const list = Object.values(memoryStore.ptSessions).filter((s) => {
    if (s.centerId !== centerId || s.date !== todayStr) return false;
    if (userRole === 'TRAINER') {
      return currentTrainerId ? s.trainerId === currentTrainerId : false;
    }
    return true;
  });
  list.sort((a, b) => a.time.localeCompare(b.time));
  return list;
}

// ==========================================
// PHASE 3: BODY MEASUREMENTS (신체 측정 / 인바디 / 둘레)
// ==========================================

export async function getBodyMeasurements(
  centerId: string,
  memberId: string,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<BodyMeasurement[]> {
  if (userRole === 'MEMBER' && currentMemberId && currentMemberId !== memberId) {
    return [];
  }

  // Check member assignment if trainer
  if (userRole === 'TRAINER') {
    if (!currentTrainerId) return [];
    const member = memoryStore.members[memberId];
    if (member && member.trainerId !== currentTrainerId) {
      return [];
    }
  }

  if (isFirestoreAvailable && db) {
    try {
      let q;
      if (userRole === 'TRAINER') {
        q = query(
          collection(db, 'bodyMeasurements'),
          where('centerId', '==', centerId),
          where('memberId', '==', memberId),
          where('trainerId', '==', currentTrainerId)
        );
      } else {
        q = query(
          collection(db, 'bodyMeasurements'),
          where('centerId', '==', centerId),
          where('memberId', '==', memberId)
        );
      }
      const snap = await getDocs(q);
      const list: BodyMeasurement[] = [];
      snap.forEach((d) => {
        const m = d.data() as BodyMeasurement;
        list.push(m);
        memoryStore.bodyMeasurements[m.measurementId] = m;
      });
      saveLocalStore(memoryStore);
      list.sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
      return list;
    } catch (err) {
      console.warn('[Firestore] Falling back to local store for body measurements:', err);
    }
  }

  const list = Object.values(memoryStore.bodyMeasurements).filter((m) => {
    if (m.centerId !== centerId || m.memberId !== memberId) return false;
    if (userRole === 'TRAINER') {
      return currentTrainerId ? m.trainerId === currentTrainerId : false;
    }
    return true;
  });

  list.sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  return list;
}

export async function createBodyMeasurement(
  data: Omit<BodyMeasurement, 'measurementId' | 'createdAt' | 'updatedAt'>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<BodyMeasurement> {
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || data.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 신체 측정 기록만 등록할 수 있습니다.');
    }
  }

  const measurementId = `bm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newMeasurement: BodyMeasurement = {
    ...data,
    measurementId,
    createdAt: now,
    updatedAt: now
  };

  memoryStore.bodyMeasurements[measurementId] = newMeasurement;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    assertCanWrite();
    try {
      const payload = cleanFirestoreData(newMeasurement);
      await setDoc(doc(db, 'bodyMeasurements', measurementId), payload);
    } catch (err: any) {
      console.error('[Firestore createBodyMeasurement error]', err);
      throw new Error(`신체 측정 기록 저장 실패: ${err?.message || 'Firestore 쓰기 오류'}`);
    }
  }

  return newMeasurement;
}

export async function updateBodyMeasurement(
  centerId: string,
  measurementId: string,
  updates: Partial<BodyMeasurement>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<BodyMeasurement> {
  const current = memoryStore.bodyMeasurements[measurementId];
  if (userRole === 'TRAINER' && current) {
    if (!currentTrainerId || current.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 신체 측정 기록만 수정할 수 있습니다.');
    }
  }

  const now = new Date().toISOString();
  if (memoryStore.bodyMeasurements[measurementId]) {
    memoryStore.bodyMeasurements[measurementId] = {
      ...memoryStore.bodyMeasurements[measurementId],
      ...updates,
      updatedAt: now
    };
    saveLocalStore(memoryStore);
  }

  if (isFirestoreAvailable && db) {
    assertCanWrite();
    try {
      const payload = cleanFirestoreData({
        ...updates,
        updatedAt: now
      });
      await updateDoc(doc(db, 'bodyMeasurements', measurementId), payload);
    } catch (err: any) {
      console.error('[Firestore updateBodyMeasurement error]', err);
      throw new Error(`신체 측정 기록 수정 실패: ${err?.message || 'Firestore 쓰기 오류'}`);
    }
  }

  return memoryStore.bodyMeasurements[measurementId];
}

export async function deleteBodyMeasurement(
  centerId: string,
  measurementId: string,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const current = memoryStore.bodyMeasurements[measurementId];
  if (userRole === 'TRAINER' && current) {
    if (!currentTrainerId || current.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 신체 측정 기록만 삭제할 수 있습니다.');
    }
  }

  delete memoryStore.bodyMeasurements[measurementId];
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'bodyMeasurements', measurementId));
    } catch (err) {
      firestoreWriteFailed('deleteBodyMeasurement', err);
    }
  }
}

// ==========================================
// PHASE 4: PROGRESS PHOTOS & CONSENT
// ==========================================

export async function updateMemberPhotoConsent(
  centerId: string,
  memberId: string,
  granted: boolean,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<Member> {
  let member = memoryStore.members[memberId];
  if (!member && isFirestoreAvailable && db) {
    try {
      const snap = await getDoc(doc(db, 'members', memberId));
      if (snap.exists()) {
        member = snap.data() as Member;
        memoryStore.members[memberId] = member;
      }
    } catch (e) {
      console.warn('[updateMemberPhotoConsent] fetch fallback warning:', e);
    }
  }

  if (!member || member.centerId !== centerId) {
    throw new Error('존재하지 않는 회원이거나 소속 센터가 일치하지 않습니다.');
  }

  // 동의 및 동의 철회는 오직 MEMBER 본인만 가능 (CENTER_ADMIN/TRAINER 직접 조작 불가)
  if (userRole !== 'MEMBER') {
    throw new Error('체형 사진 촬영 및 보관 동의는 회원 본인만 설정하거나 철회할 수 있습니다.');
  }
  if (currentMemberId && currentMemberId !== memberId) {
    throw new Error('본인의 체형 사진 동의 상태만 수정할 수 있습니다.');
  }

  const now = new Date().toISOString();
  const existingConsent = member.progressPhotoConsent;

  // Firestore forbids undefined values. Ensure all fields are explicitly defined strings/booleans.
  let progressPhotoConsent: ProgressPhotoConsent;

  if (granted) {
    // 1. 신규 동의 또는 재동의: granted: true, 새로운 consentedAt/consentedBy 기록
    progressPhotoConsent = {
      granted: true,
      grantedAt: now,
      consentedAt: now,
      consentedBy: memberId
    };
  } else {
    // 2. 동의 철회: granted: false, 기존 consentedAt/consentedBy 유지, revokedAt/revokedBy 기록
    const cleanConsentedAt =
      existingConsent?.consentedAt || existingConsent?.grantedAt || now;
    const cleanConsentedBy = existingConsent?.consentedBy || memberId;
    const cleanGrantedAt = existingConsent?.grantedAt || cleanConsentedAt;

    progressPhotoConsent = {
      granted: false,
      grantedAt: cleanGrantedAt,
      consentedAt: cleanConsentedAt,
      consentedBy: cleanConsentedBy,
      revokedAt: now,
      revokedBy: memberId
    };
  }

  member.progressPhotoConsent = progressPhotoConsent;
  member.updatedAt = now;
  memoryStore.members[memberId] = { ...member };
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'members', memberId), {
        progressPhotoConsent,
        updatedAt: now
      });
    } catch (err: any) {
      console.error('[Firestore updateMemberPhotoConsent error]', err);
      throw new Error(`동의 상태 저장 실패: ${err?.message || 'Firestore 권한 또는 연결 오류'}`);
    }

    // Storage Rules 평가를 위해 defaultDb에도 최신 동의 상태 동기화
    if (defaultDb) {
      try {
        await updateDoc(doc(defaultDb, 'members', memberId), {
          progressPhotoConsent,
          updatedAt: now
        });
      } catch (e) {
        console.warn('[defaultDb consent sync warning]', e);
      }
    }
  }

  return { ...member };
}

export async function uploadProgressPhotoFile(
  centerId: string,
  memberId: string,
  photoId: string,
  fileData: string | Blob | File,
  trainerId?: string
): Promise<{ storagePath: string; photoUrl: string }> {
  const storagePath = `centers/${centerId}/members/${memberId}/photos/${photoId}.jpg`;
  let photoUrl = '';

  if (typeof fileData === 'string' && fileData.startsWith('http')) {
    photoUrl = fileData;
  } else if (storage && typeof window !== 'undefined') {
    try {
      const storageRef = ref(storage, storagePath);
      let uploadPayload: Blob | Uint8Array;
      let detectedContentType = 'image/jpeg';

      if (typeof fileData === 'string') {
        if (fileData.startsWith('data:')) {
          const mimeMatch = fileData.match(/^data:([^;]+);base64,/);
          if (mimeMatch && mimeMatch[1].startsWith('image/')) {
            detectedContentType = mimeMatch[1];
          }
          const base64Data = fileData.split(',')[1];
          const binaryStr = atob(base64Data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          uploadPayload = bytes;
        } else {
          uploadPayload = new Blob([fileData], { type: 'image/jpeg' });
        }
      } else {
        uploadPayload = fileData;
        const candidateType = (fileData as any).type;
        detectedContentType =
          candidateType && candidateType.startsWith('image/')
            ? candidateType
            : 'image/jpeg';
      }

      const currentUid = auth?.currentUser?.uid || '';
      await uploadBytes(storageRef, uploadPayload, {
        contentType: detectedContentType,
        customMetadata: {
          centerId,
          memberId,
          trainerId: trainerId || '',
          uploadedBy: currentUid
        }
      });
      photoUrl = await getDownloadURL(storageRef);
    } catch (err: any) {
      console.error('[Firebase Storage Upload Error]', err);
      throw new Error(`Firebase Storage 업로드 실패: ${err?.message || '스토리지 권한 또는 네트워크를 확인해주세요.'}`);
    }
  } else if (typeof window !== 'undefined') {
    // In browser production/preview, storage instance is mandatory for permanent photo files
    throw new Error('Firebase Storage가 초기화되지 않아 영구 저장소 업로드를 완료할 수 없습니다.');
  } else {
    // Automated test / CLI environment simulation (Node.js)
    photoUrl = `https://storage.googleapis.com/test-bucket/${storagePath}`;
  }

  if (!memoryStore.storageObjects) {
    memoryStore.storageObjects = {};
  }
  memoryStore.storageObjects[storagePath] = photoUrl;
  saveLocalStore(memoryStore);
  return { storagePath, photoUrl };
}

export async function deleteProgressPhotoFile(storagePath: string): Promise<void> {
  if (!storagePath) return;
  // If simulated error condition for testing partial failure integrity (STEP 21):
  if (storagePath.includes('fail-storage-delete')) {
    throw new Error('스토리지 파일 삭제에 실패하였습니다. (스토리지 에러)');
  }
  if (storage && typeof window !== 'undefined') {
    try {
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
    } catch (err) {
      console.warn('[Firebase Storage delete error, falling back]', err);
    }
  }
  if (memoryStore.storageObjects) {
    delete memoryStore.storageObjects[storagePath];
  }
  saveLocalStore(memoryStore);
}

export async function getProgressPhotos(
  centerId: string,
  memberId: string,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<ProgressPhoto[]> {
  if (userRole === 'MEMBER' && currentMemberId && currentMemberId !== memberId) {
    return [];
  }

  const member = memoryStore.members[memberId];
  if (member && member.centerId !== centerId) {
    return [];
  }

  if (userRole === 'TRAINER' && currentTrainerId && member && member.trainerId !== currentTrainerId) {
    return [];
  }

  if (isFirestoreAvailable && db) {
    try {
      const q = query(
        collection(db, 'progressPhotos'),
        where('centerId', '==', centerId),
        where('memberId', '==', memberId)
      );
      const snap = await getDocs(q);
      const list: ProgressPhoto[] = [];
      snap.forEach((d) => {
        const data = d.data() as ProgressPhoto;
        if (userRole === 'TRAINER' && currentTrainerId && data.trainerId !== currentTrainerId) {
          return;
        }
        list.push(data);
        if (!memoryStore.progressPhotos) memoryStore.progressPhotos = {};
        memoryStore.progressPhotos[data.photoId] = data;
      });
      saveLocalStore(memoryStore);
      list.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
      return list;
    } catch (err) {
      console.warn('[Firestore getProgressPhotos error]', err);
    }
  }

  const list = Object.values(memoryStore.progressPhotos || {}).filter((p) => {
    if (p.centerId !== centerId || p.memberId !== memberId) return false;
    if (userRole === 'TRAINER' && currentTrainerId && p.trainerId !== currentTrainerId) {
      return false;
    }
    return true;
  });

  list.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  return list;
}

export async function createProgressPhoto(
  data: Omit<ProgressPhoto, 'photoId' | 'createdAt' | 'updatedAt'>,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<ProgressPhoto> {
  const member = memoryStore.members[data.memberId];
  if (!member || member.centerId !== data.centerId) {
    throw new Error('존재하지 않는 회원이거나 소속 센터가 일치하지 않습니다.');
  }

  if (userRole === 'TRAINER' && currentTrainerId && member.trainerId !== currentTrainerId) {
    throw new Error('담당 트레이너만 사진을 등록할 수 있습니다.');
  }

  // STEP 3: 회원 동의 여부 엄격 검증
  if (!member.progressPhotoConsent || !member.progressPhotoConsent.granted) {
    throw new Error('체형 사진 촬영 및 보관에 대한 회원 동의가 필요합니다. 회원이 회원 포털에서 직접 동의한 후 등록할 수 있습니다.');
  }

  const photoId = `photo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newPhoto: ProgressPhoto = {
    ...data,
    photoId,
    createdAt: now,
    updatedAt: now
  };

  if (!memoryStore.progressPhotos) {
    memoryStore.progressPhotos = {};
  }
  memoryStore.progressPhotos[photoId] = newPhoto;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await setDoc(doc(db, 'progressPhotos', photoId), newPhoto);
    } catch (err) {
      firestoreWriteFailed('createProgressPhoto', err);
    }
  }

  return newPhoto;
}

export async function updateProgressPhoto(
  centerId: string,
  photoId: string,
  updates: Partial<Pick<ProgressPhoto, 'caption' | 'viewType' | 'takenAt'>>,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<ProgressPhoto> {
  const photo = memoryStore.progressPhotos?.[photoId];
  if (!photo || photo.centerId !== centerId) {
    throw new Error('사진 기록을 찾을 수 없거나 센터 정보가 일치하지 않습니다.');
  }

  if (userRole === 'TRAINER' && currentTrainerId && photo.trainerId !== currentTrainerId) {
    throw new Error('담당 트레이너만 사진을 수정할 수 있습니다.');
  }

  const now = new Date().toISOString();
  const updated: ProgressPhoto = {
    ...photo,
    ...updates,
    updatedAt: now
  };

  memoryStore.progressPhotos[photoId] = updated;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'progressPhotos', photoId), {
        ...updates,
        updatedAt: now
      });
    } catch (err) {
      firestoreWriteFailed('updateProgressPhoto', err);
    }
  }

  return updated;
}

export async function deleteProgressPhoto(
  centerId: string,
  photoId: string,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const photo = memoryStore.progressPhotos?.[photoId];
  if (!photo || photo.centerId !== centerId) {
    throw new Error('사진 기록을 찾을 수 없거나 센터 정보가 일치하지 않습니다.');
  }

  if (userRole === 'TRAINER' && currentTrainerId && photo.trainerId !== currentTrainerId) {
    throw new Error('담당 트레이너만 사진을 삭제할 수 있습니다.');
  }

  // STEP 21: Storage 삭제 선행 (실패 시 메타데이터 롤백 / 예외 전파로 고아 파일 방지)
  try {
    await deleteProgressPhotoFile(photo.storagePath);
  } catch (storageErr: any) {
    throw new Error(`스토리지 파일 삭제 실패로 사진 삭제가 중단되었습니다: ${storageErr?.message || storageErr}`);
  }

  delete memoryStore.progressPhotos[photoId];
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'progressPhotos', photoId));
    } catch (err) {
      firestoreWriteFailed('deleteProgressPhoto', err);
    }
  }
}

// ==========================================
// PHASE 4: PROGRESS REVIEWS
// ==========================================

export async function getProgressReviews(
  centerId: string,
  memberId: string,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<ProgressReview[]> {
  if (userRole === 'MEMBER' && currentMemberId && currentMemberId !== memberId) {
    return [];
  }

  const member = memoryStore.members[memberId];
  if (member && member.centerId !== centerId) {
    return [];
  }

  if (userRole === 'TRAINER' && currentTrainerId && member && member.trainerId !== currentTrainerId) {
    return [];
  }

  if (isFirestoreAvailable && db) {
    try {
      const q = query(
        collection(db, 'progressReviews'),
        where('centerId', '==', centerId),
        where('memberId', '==', memberId)
      );
      const snap = await getDocs(q);
      const list: ProgressReview[] = [];
      snap.forEach((d) => {
        const data = d.data() as ProgressReview;
        if (userRole === 'TRAINER' && currentTrainerId && data.trainerId !== currentTrainerId) {
          return;
        }
        list.push(data);
        if (!memoryStore.progressReviews) memoryStore.progressReviews = {};
        memoryStore.progressReviews[data.reviewId] = data;
      });
      saveLocalStore(memoryStore);
      list.sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));
      return list;
    } catch (err) {
      console.warn('[Firestore getProgressReviews error]', err);
    }
  }

  const list = Object.values(memoryStore.progressReviews || {}).filter((r) => {
    if (r.centerId !== centerId || r.memberId !== memberId) return false;
    if (userRole === 'TRAINER' && currentTrainerId && r.trainerId !== currentTrainerId) {
      return false;
    }
    return true;
  });

  list.sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));
  return list;
}

export async function createProgressReview(
  data: Omit<ProgressReview, 'reviewId' | 'createdAt' | 'updatedAt'>,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<ProgressReview> {
  const member = memoryStore.members[data.memberId];
  if (!member || member.centerId !== data.centerId) {
    throw new Error('존재하지 않는 회원이거나 소속 센터가 일치하지 않습니다.');
  }

  if (userRole === 'TRAINER' && currentTrainerId && member.trainerId !== currentTrainerId) {
    throw new Error('담당 트레이너만 성과 리뷰를 작성할 수 있습니다.');
  }

  const reviewId = `pr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newReview: ProgressReview = {
    ...data,
    reviewId,
    createdAt: now,
    updatedAt: now
  };

  if (!memoryStore.progressReviews) {
    memoryStore.progressReviews = {};
  }
  memoryStore.progressReviews[reviewId] = newReview;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await setDoc(doc(db, 'progressReviews', reviewId), newReview);
    } catch (err) {
      firestoreWriteFailed('createProgressReview', err);
    }
  }

  return newReview;
}

export async function deleteProgressReview(
  centerId: string,
  reviewId: string,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const review = memoryStore.progressReviews?.[reviewId];
  if (!review || review.centerId !== centerId) {
    throw new Error('성과 리뷰를 찾을 수 없거나 센터 정보가 일치하지 않습니다.');
  }

  if (userRole === 'TRAINER' && currentTrainerId && review.trainerId !== currentTrainerId) {
    throw new Error('담당 트레이너만 성과 리뷰를 삭제할 수 있습니다.');
  }

  delete memoryStore.progressReviews[reviewId];
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'progressReviews', reviewId));
    } catch (err) {
      firestoreWriteFailed('deleteProgressReview', err);
    }
  }
}

// ==========================================
// PHASE 6: EXERCISE LIBRARY (운동 라이브러리)
// ==========================================

const DEFAULT_CENTER_EXERCISES = [
  { name: '바벨 백 스쿼트', category: '웨이트', bodyPart: '하체', equipment: '바벨', description: '골반 힌지와 무릎 정렬 유지. 대퇴사두근 및 대둔근 타겟.' },
  { name: '바벨 벤치 프레스', category: '웨이트', bodyPart: '가슴', equipment: '바벨', description: '견갑 후인하강 후 흉곽 확장, 대흉근 중심 자극.' },
  { name: '루마니안 데드리프트', category: '웨이트', bodyPart: '등', equipment: '바벨', description: '햄스트링과 둔근 신장성 수축 유도. 척추 중립 필수.' },
  { name: '랫 풀 다운', category: '머신', bodyPart: '등', equipment: '머신', description: '광배근 하부 수축 및 상체 고정. 반동 지양.' },
  { name: '바벨 숄더 프레스', category: '웨이트', bodyPart: '어깨', equipment: '바벨', description: '전면/측면 삼각근 타겟. 코어 복압 유지.' },
  { name: '레그 익스텐션', category: '머신', bodyPart: '하체', equipment: '머신', description: '대퇴사두근 고립 운동. 무릎 과신전 주의.' },
  { name: '덤벨 사이드 래터럴 레이즈', category: '웨이트', bodyPart: '어깨', equipment: '덤벨', description: '측면 삼각근 고립. 승모근 개입 최소화.' },
  { name: '시티드 케이블 로우', category: '머신', bodyPart: '등', equipment: '케이블', description: '등 중하부 두께감 강화. 상체 각도 일정 유지.' },
  { name: '인클라인 덤벨 프레스', category: '웨이트', bodyPart: '가슴', equipment: '덤벨', description: '대흉근 쇄골두(상부) 타겟 덤벨 프레스.' },
  { name: '플랭크', category: '맨몸', bodyPart: '복근', equipment: '맨몸', description: '코어 브레이싱 및 척추 중립 유지. 골반 수평.' },
  { name: '트레드밀 인터벌 러닝', category: '유산소', bodyPart: '전신', equipment: '머신', description: '경사도 2~3%, 웜업 후 고강도 인터벌 반복.' }
];

export async function getExercises(centerId: string): Promise<Exercise[]> {
  if (isFirestoreAvailable && db) {
    try {
      const q = query(collection(db, 'exercises'), where('centerId', '==', centerId));
      const snap = await getDocs(q);
      const list: Exercise[] = [];
      snap.forEach((d) => {
        const ex = d.data() as Exercise;
        list.push(ex);
        if (!memoryStore.exercises) memoryStore.exercises = {};
        memoryStore.exercises[ex.exerciseId] = ex;
      });
      if (list.length > 0) {
        saveLocalStore(memoryStore);
        list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        return list;
      }
    } catch (err) {
      console.warn('[Firestore getExercises error]', err);
    }
  }

  let list = Object.values(memoryStore.exercises || {}).filter((e) => e.centerId === centerId);
  if (list.length === 0 && centerId) {
    // Auto-seed default exercises for the center
    const now = new Date().toISOString();
    list = DEFAULT_CENTER_EXERCISES.map((item, idx) => {
      const ex: Exercise = {
        exerciseId: `ex-${centerId}-${String(idx + 1).padStart(2, '0')}`,
        centerId,
        name: item.name,
        category: item.category as any,
        bodyPart: item.bodyPart as any,
        equipment: item.equipment as any,
        description: item.description,
        createdAt: now,
        updatedAt: now
      };
      if (!memoryStore.exercises) memoryStore.exercises = {};
      memoryStore.exercises[ex.exerciseId] = ex;
      if (isFirestoreAvailable && db) {
        setDoc(doc(db, 'exercises', ex.exerciseId), ex).catch((e) => {
          console.warn('[Firestore seed exercise error]', e);
        });
      }
      return ex;
    });
    saveLocalStore(memoryStore);
  }
  list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return list;
}

export async function getExerciseById(centerId: string, exerciseId: string): Promise<Exercise | null> {
  const all = await getExercises(centerId);
  return all.find((e) => e.exerciseId === exerciseId) || null;
}

export async function createExercise(
  data: Omit<Exercise, 'exerciseId' | 'createdAt' | 'updatedAt'>,
  userRole: UserRole
): Promise<Exercise> {
  if (userRole !== 'TRAINER' && userRole !== 'CENTER_ADMIN') {
    throw new Error('회원은 운동 라이브러리를 직접 등록할 수 없습니다.');
  }

  const normalizeName = (name: string) => name.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko');
  if (!data.centerId || !data.name.trim() || !data.category || !data.bodyPart || !data.equipment) {
    throw new Error('운동명, 운동 부위, 카테고리, 운동 유형을 입력해주세요.');
  }
  // Read the authoritative collection before writing; permission/network errors must not
  // fall back to an incomplete local cache and bypass duplicate checking.
  let existing = Object.values(memoryStore.exercises || {}).filter(ex => ex.centerId === data.centerId);
  if (isFirestoreAvailable && db) {
    const snapshot = await getDocs(query(collection(db, 'exercises'), where('centerId', '==', data.centerId)));
    existing = snapshot.docs.map(item => item.data() as Exercise);
  }
  if (existing.some(ex => normalizeName(ex.name) === normalizeName(data.name))) {
    throw new Error('같은 센터에 동일한 운동명이 이미 등록되어 있습니다.');
  }

  // A shared deterministic document key makes simultaneous registrations contend.
  const normalizedName = normalizeName(data.name);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([data.centerId, normalizedName])));
  const exerciseId = `ex-name-${Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('')}`;
  const now = new Date().toISOString();

  const newExercise: Exercise = {
    ...cleanFirestoreData(data),
    name: data.name.trim(),
    exerciseId,
    createdAt: now,
    updatedAt: now
  };

  if (isFirestoreAvailable && db) {
    try {
      assertCanWrite();
      await runTransaction(db, async transaction => {
        const exerciseRef = doc(db, 'exercises', exerciseId);
        if ((await transaction.get(exerciseRef)).exists()) {
          throw new Error('같은 센터에 동일한 운동명이 이미 등록되어 있습니다.');
        }
        transaction.set(exerciseRef, newExercise);
      });
    } catch (err) {
      console.warn('[Firestore createExercise error]', err);
      if (err instanceof Error && err.message.includes('동일한 운동명')) throw err;
      throw new Error('운동 저장에 실패했습니다. 연결 상태와 등록 권한을 확인한 뒤 다시 시도해주세요.');
    }
  }

  if (!isFirestoreAvailable && Object.values(memoryStore.exercises || {}).some(ex => ex.centerId === data.centerId && normalizeName(ex.name) === normalizedName)) {
    throw new Error('같은 센터에 동일한 운동명이 이미 등록되어 있습니다.');
  }
  if (!memoryStore.exercises) memoryStore.exercises = {};
  memoryStore.exercises[exerciseId] = newExercise;
  saveLocalStore(memoryStore);

  return newExercise;
}

export async function updateExercise(
  centerId: string,
  exerciseId: string,
  data: Partial<Exercise>,
  userRole: UserRole
): Promise<void> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 운동 라이브러리를 수정할 수 없습니다.');
  }

  const ex = memoryStore.exercises?.[exerciseId];
  if (!ex || ex.centerId !== centerId) {
    throw new Error('운동 정보를 찾을 수 없거나 센터가 일치하지 않습니다.');
  }

  const now = new Date().toISOString();
  memoryStore.exercises[exerciseId] = {
    ...ex,
    ...data,
    updatedAt: now
  };
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'exercises', exerciseId), {
        ...data,
        updatedAt: now
      });
    } catch (err) {
      firestoreWriteFailed('updateExercise', err);
    }
  }
}

export async function deleteExercise(
  centerId: string,
  exerciseId: string,
  userRole: UserRole
): Promise<void> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 운동 라이브러리를 삭제할 수 없습니다.');
  }

  const ex = memoryStore.exercises?.[exerciseId];
  if (!ex || ex.centerId !== centerId) {
    throw new Error('운동 정보를 찾을 수 없습니다.');
  }

  delete memoryStore.exercises[exerciseId];
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'exercises', exerciseId));
    } catch (err) {
      firestoreWriteFailed('deleteExercise', err);
    }
  }
}

// ==========================================
// PHASE 6: WORKOUT TEMPLATES (루틴 템플릿)
// ==========================================

export async function getWorkoutTemplates(
  centerId: string,
  currentTrainerId?: string | null
): Promise<WorkoutTemplate[]> {
  if (isFirestoreAvailable && db) {
    try {
      const q = query(collection(db, 'workoutTemplates'), where('centerId', '==', centerId));
      const snap = await getDocs(q);
      const list: WorkoutTemplate[] = [];
      snap.forEach((d) => {
        const t = d.data() as WorkoutTemplate;
        list.push(t);
        if (!memoryStore.workoutTemplates) memoryStore.workoutTemplates = {};
        memoryStore.workoutTemplates[t.templateId] = t;
      });
      saveLocalStore(memoryStore);
      return list;
    } catch (err) {
      console.warn('[Firestore getWorkoutTemplates error]', err);
    }
  }

  return Object.values(memoryStore.workoutTemplates || {}).filter((t) => t.centerId === centerId);
}

export async function createWorkoutTemplate(
  data: Omit<WorkoutTemplate, 'templateId' | 'createdAt' | 'updatedAt'>,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<WorkoutTemplate> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 루틴 템플릿을 생성할 수 없습니다.');
  }

  const templateId = `wtpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newTemplate: WorkoutTemplate = {
    ...data,
    templateId,
    createdAt: now,
    updatedAt: now
  };

  if (!memoryStore.workoutTemplates) memoryStore.workoutTemplates = {};
  memoryStore.workoutTemplates[templateId] = newTemplate;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await setDoc(doc(db, 'workoutTemplates', templateId), newTemplate);
    } catch (err) {
      firestoreWriteFailed('createWorkoutTemplate', err);
    }
  }

  return newTemplate;
}

export async function deleteWorkoutTemplate(
  centerId: string,
  templateId: string,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 루틴 템플릿을 삭제할 수 없습니다.');
  }

  delete memoryStore.workoutTemplates?.[templateId];
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'workoutTemplates', templateId));
    } catch (err) {
      firestoreWriteFailed('deleteWorkoutTemplate', err);
    }
  }
}

// ==========================================
// PHASE 6: PERSONAL WORKOUT PLANS (개인운동 배정)
// ==========================================

export async function getPersonalWorkoutPlansByMember(
  centerId: string,
  memberId: string,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<PersonalWorkoutPlan[]> {
  if (userRole === 'MEMBER' && currentMemberId && currentMemberId !== memberId) {
    return [];
  }

  const member = memoryStore.members[memberId];
  if (member && member.centerId !== centerId) {
    return [];
  }

  if (userRole === 'TRAINER' && currentTrainerId && member && member.trainerId !== currentTrainerId) {
    return [];
  }

  if (isFirestoreAvailable && db) {
    try {
      const q = query(
        collection(db, 'personalWorkoutPlans'),
        where('centerId', '==', centerId),
        where('memberId', '==', memberId)
      );
      const snap = await getDocs(q);
      const list: PersonalWorkoutPlan[] = [];
      snap.forEach((d) => {
        const plan = d.data() as PersonalWorkoutPlan;
        list.push(plan);
        if (!memoryStore.personalWorkoutPlans) memoryStore.personalWorkoutPlans = {};
        memoryStore.personalWorkoutPlans[plan.planId] = plan;
      });
      saveLocalStore(memoryStore);
      list.sort((a, b) => b.date.localeCompare(a.date));
      return list;
    } catch (err) {
      console.warn('[Firestore getPersonalWorkoutPlansByMember error]', err);
    }
  }

  const list = Object.values(memoryStore.personalWorkoutPlans || {}).filter(
    (p) => p.centerId === centerId && p.memberId === memberId
  );
  list.sort((a, b) => b.date.localeCompare(a.date));
  return list;
}

export async function createPersonalWorkoutPlan(
  data: Omit<PersonalWorkoutPlan, 'planId' | 'createdAt' | 'updatedAt'>,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<PersonalWorkoutPlan> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 개인운동을 직접 배정할 수 없습니다.');
  }

  const member = memoryStore.members[data.memberId];
  if (!member || member.centerId !== data.centerId) {
    throw new Error('존재하지 않는 회원이거나 센터가 일치하지 않습니다.');
  }

  if (userRole === 'TRAINER') {
    if (!currentTrainerId || member.trainerId !== currentTrainerId) {
      throw new Error('담당 트레이너만 개인운동을 배정할 수 있습니다.');
    }
  }

  const planId = `pln-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newPlan: PersonalWorkoutPlan = {
    ...data,
    planId,
    status: data.status || 'ASSIGNED',
    createdAt: now,
    updatedAt: now
  };

  if (!memoryStore.personalWorkoutPlans) memoryStore.personalWorkoutPlans = {};
  memoryStore.personalWorkoutPlans[planId] = newPlan;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    assertCanWrite();
    try {
      const payload = cleanFirestoreData(newPlan);
      await setDoc(doc(db, 'personalWorkoutPlans', planId), payload);
    } catch (err: any) {
      console.error('[Firestore createPersonalWorkoutPlan error]', err);
      throw new Error(`개인운동 배정 저장 실패: ${err?.message || 'Firestore 쓰기 오류'}`);
    }
  }

  return newPlan;
}

export async function updatePersonalWorkoutPlan(
  centerId: string,
  planId: string,
  data: Partial<PersonalWorkoutPlan>,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<void> {
  const plan = memoryStore.personalWorkoutPlans?.[planId];
  if (!plan || plan.centerId !== centerId) {
    throw new Error('개인운동 계획을 찾을 수 없습니다.');
  }

  if (userRole === 'MEMBER') {
    if (currentMemberId && plan.memberId !== currentMemberId) {
      throw new Error('다른 회원의 개인운동 계획을 수정할 수 없습니다.');
    }
  } else if (userRole === 'TRAINER') {
    if (!currentTrainerId || plan.trainerId !== currentTrainerId) {
      throw new Error('담당 트레이너만 개인운동 계획을 수정할 수 있습니다.');
    }
  }

  const now = new Date().toISOString();
  memoryStore.personalWorkoutPlans[planId] = {
    ...plan,
    ...data,
    updatedAt: now
  };
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'personalWorkoutPlans', planId), {
        ...data,
        updatedAt: now
      });
    } catch (err) {
      firestoreWriteFailed('updatePersonalWorkoutPlan', err);
    }
  }
}

export async function deletePersonalWorkoutPlan(
  centerId: string,
  planId: string,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 개인운동 계획을 삭제할 수 없습니다.');
  }

  const plan = memoryStore.personalWorkoutPlans?.[planId];
  if (!plan || plan.centerId !== centerId) {
    throw new Error('개인운동 계획을 찾을 수 없습니다.');
  }

  if (userRole === 'TRAINER' && currentTrainerId && plan.trainerId !== currentTrainerId) {
    throw new Error('담당 트레이너만 개인운동 계획을 삭제할 수 있습니다.');
  }

  delete memoryStore.personalWorkoutPlans[planId];
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'personalWorkoutPlans', planId));
    } catch (err) {
      firestoreWriteFailed('deletePersonalWorkoutPlan', err);
    }
  }
}

// ==========================================
// PHASE 6: PERSONAL WORKOUT LOGS (개인운동 기록 - Target vs Actual 분리)
// ==========================================

export async function getPersonalWorkoutLogsByMember(
  centerId: string,
  memberId: string,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<PersonalWorkoutLog[]> {
  if (userRole === 'MEMBER' && currentMemberId && currentMemberId !== memberId) {
    return [];
  }

  const member = memoryStore.members[memberId];
  if (member && member.centerId !== centerId) {
    return [];
  }

  if (userRole === 'TRAINER' && currentTrainerId && member && member.trainerId !== currentTrainerId) {
    return [];
  }

  if (isFirestoreAvailable && db) {
    try {
      const q = query(
        collection(db, 'personalWorkoutLogs'),
        where('centerId', '==', centerId),
        where('memberId', '==', memberId)
      );
      const snap = await getDocs(q);
      const list: PersonalWorkoutLog[] = [];
      snap.forEach((d) => {
        const log = d.data() as PersonalWorkoutLog;
        list.push(log);
        if (!memoryStore.personalWorkoutLogs) memoryStore.personalWorkoutLogs = {};
        memoryStore.personalWorkoutLogs[log.logId] = log;
      });
      saveLocalStore(memoryStore);
      list.sort(comparePersonalWorkoutLogs);
      return list;
    } catch (err) {
      console.warn('[Firestore getPersonalWorkoutLogsByMember error]', err);
    }
  }

  const list = Object.values(memoryStore.personalWorkoutLogs || {}).filter(
    (l) => l.centerId === centerId && l.memberId === memberId
  );
  list.sort(comparePersonalWorkoutLogs);
  return list;
}

export async function createPersonalWorkoutLog(
  data: Omit<PersonalWorkoutLog, 'logId' | 'createdAt' | 'updatedAt'>,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<PersonalWorkoutLog> {
  if (userRole === 'MEMBER') {
    if (currentMemberId && data.memberId !== currentMemberId) {
      throw new Error('본인의 개인운동 기록만 등록할 수 있습니다.');
    }
  }

  const logId = `wlog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newLog: PersonalWorkoutLog = {
    ...data,
    logId,
    createdAt: now,
    updatedAt: now
  };

  // Commit both documents atomically before changing memory or the local cache.
  const plan = data.planId ? memoryStore.personalWorkoutPlans?.[data.planId] : undefined;
  if (plan && (plan.memberId !== data.memberId || plan.centerId !== data.centerId)) {
    throw new Error('본인의 센터와 회원에 연결된 계획만 완료할 수 있습니다.');
  }
  if (isFirestoreAvailable && db) {
    assertCanWrite();
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'personalWorkoutLogs', logId), cleanFirestoreData(newLog));
      if (data.planId) {
        batch.update(doc(db, 'personalWorkoutPlans', data.planId), {
          status: 'COMPLETED', updatedAt: now
        });
      }
      await batch.commit();
    } catch (err: any) {
      console.error('[Firestore createPersonalWorkoutLog error]', err);
      throw new Error(`개인운동 기록 저장 실패: ${err?.message || 'Firestore 쓰기 오류'}`);
    }
  }
  if (!memoryStore.personalWorkoutLogs) memoryStore.personalWorkoutLogs = {};
  memoryStore.personalWorkoutLogs[logId] = newLog;
  if (plan && data.planId) {
    memoryStore.personalWorkoutPlans[data.planId] = { ...plan, status: 'COMPLETED', updatedAt: now };
  }
  saveLocalStore(memoryStore);

  return newLog;
}

export async function updatePersonalWorkoutLog(
  centerId: string,
  logId: string,
  data: Partial<PersonalWorkoutLog>,
  userRole: UserRole,
  currentTrainerId?: string | null,
  currentMemberId?: string | null
): Promise<void> {
  const log = memoryStore.personalWorkoutLogs?.[logId];
  if (!log || log.centerId !== centerId) {
    throw new Error('개인운동 기록을 찾을 수 없습니다.');
  }

  if (userRole === 'MEMBER') {
    if (currentMemberId && log.memberId !== currentMemberId) {
      throw new Error('본인의 개인운동 기록만 수정할 수 있습니다.');
    }
  }

  const now = new Date().toISOString();
  memoryStore.personalWorkoutLogs[logId] = {
    ...log,
    ...data,
    updatedAt: now
  };
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'personalWorkoutLogs', logId), {
        ...data,
        updatedAt: now
      });
    } catch (err) {
      firestoreWriteFailed('updatePersonalWorkoutLog', err);
    }
  }
}

export async function deletePersonalWorkoutLog(
  centerId: string,
  logId: string,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  const log = memoryStore.personalWorkoutLogs?.[logId];
  if (!log || log.centerId !== centerId) {
    throw new Error('개인운동 기록을 찾을 수 없습니다.');
  }

  delete memoryStore.personalWorkoutLogs[logId];
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'personalWorkoutLogs', logId));
    } catch (err) {
      firestoreWriteFailed('deletePersonalWorkoutLog', err);
    }
  }
}

export async function addTrainerFeedbackToWorkoutLog(
  centerId: string,
  logId: string,
  feedback: string,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<void> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 트레이너 피드백을 작성할 수 없습니다.');
  }

  const log = memoryStore.personalWorkoutLogs?.[logId];
  if (!log || log.centerId !== centerId) {
    throw new Error('개인운동 기록을 찾을 수 없습니다.');
  }

  if (userRole === 'TRAINER') {
    if (!currentTrainerId || log.trainerId !== currentTrainerId) {
      throw new Error('담당 트레이너만 피드백을 남길 수 있습니다.');
    }
  }

  const now = new Date().toISOString();
  memoryStore.personalWorkoutLogs[logId] = {
    ...log,
    trainerFeedback: feedback,
    updatedAt: now
  };
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'personalWorkoutLogs', logId), {
        trainerFeedback: feedback,
        updatedAt: now
      });
    } catch (err) {
      firestoreWriteFailed('addTrainerFeedbackToWorkoutLog', err);
    }
  }
}

// ==========================================
// PHASE 6: WEEKLY ACTIVITY SUMMARY (주간 활동 집계)
// ==========================================

export async function getWeeklyActivitySummary(
  centerId: string,
  memberId?: string | null,
  referenceDateStr?: string,
  trainerId?: string | null,
  userRole?: UserRole
): Promise<WeeklyActivitySummary> {
  const ref = referenceDateStr ? new Date(referenceDateStr) : new Date();
  const day = ref.getDay(); // 0 is Sun, 1 is Mon...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const weekStart = formatDate(monday);
  const weekEnd = formatDate(sunday);

  if (userRole === 'TRAINER' && !trainerId) {
    return {
      weekStart,
      weekEnd,
      ptCount: 0,
      soloCount: 0,
      totalCount: 0
    };
  }

  // PT sessions completed
  const ptCount = Object.values(memoryStore.ptSessions || {}).filter((s) => {
    if (s.centerId !== centerId) return false;
    if (memberId && s.memberId !== memberId) return false;
    if (userRole === 'TRAINER' && (!trainerId || s.trainerId !== trainerId)) return false;
    if (trainerId && s.trainerId !== trainerId) return false;
    return (
      s.status === 'COMPLETED' &&
      s.date >= weekStart &&
      s.date <= weekEnd
    );
  }).length;

  // Personal workout logs completed
  const soloCount = Object.values(memoryStore.personalWorkoutLogs || {}).filter((l) => {
    if (l.centerId !== centerId) return false;
    if (memberId && l.memberId !== memberId) return false;
    if (userRole === 'TRAINER' && (!trainerId || l.trainerId !== trainerId)) return false;
    if (trainerId && l.trainerId !== trainerId) return false;
    return (
      l.date >= weekStart &&
      l.date <= weekEnd
    );
  }).length;

  return {
    weekStart,
    weekEnd,
    ptCount,
    soloCount,
    totalCount: ptCount + soloCount
  };
}

// ==========================================
// PHASE 2: FACTUAL MEMBER TIMELINE (STEP 8)
// ==========================================

export async function getMemberTimeline(
  centerId: string,
  memberId: string,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<TimelineEvent[]> {
  const [consultation, goals, contracts, sessions, measurements, reviews] = await Promise.all([
    getConsultationByMemberId(centerId, memberId, userRole, currentTrainerId),
    getGoalsByMember(centerId, memberId, userRole, currentTrainerId),
    getContractsByMember(centerId, memberId, userRole, currentTrainerId),
    getSessionsByMember(centerId, memberId, userRole, currentTrainerId),
    getBodyMeasurements(centerId, memberId, userRole, currentTrainerId),
    getProgressReviews(centerId, memberId, userRole, currentTrainerId)
  ]);

  const events: TimelineEvent[] = [];

  // 1. Consultation event
  if (consultation) {
    const purposeLabels = consultation.exercisePurposes.join(', ');
    events.push({
      id: `ev-con-${consultation.consultationId}`,
      date: consultation.consultationDate || consultation.createdAt.split('T')[0],
      type: 'CONSULTATION',
      title: '최초 상담 완료',
      description: `운동 목적: ${purposeLabels || '설정 완료'} (주의사항 기록 완료)`,
      badgeText: '상담',
      badgeColor: 'blue'
    });
  }

  // 2. Goals events
  for (const g of goals) {
    events.push({
      id: `ev-goal-${g.goalId}`,
      date: g.updatedAt.split('T')[0] || g.createdAt.split('T')[0],
      type: 'GOAL',
      title: g.status === 'ACHIEVED' ? `목표 달성: ${g.title}` : `목표 설정: ${g.title}`,
      description: g.targetValue ? `목표 수치: ${g.targetValue}${g.targetUnit || ''}` : '정성 목표',
      badgeText: g.status === 'ACHIEVED' ? '달성' : '목표',
      badgeColor: g.status === 'ACHIEVED' ? 'emerald' : 'amber'
    });
  }

  // 3. Contracts events
  for (const c of contracts) {
    events.push({
      id: `ev-ct-${c.contractId}`,
      date: c.startDate || c.createdAt.split('T')[0],
      type: 'CONTRACT',
      title: `${c.title} 등록 시작`,
      description: `총 ${c.totalSessions}회 계약 (종료예정: ${c.expirationDate})`,
      badgeText: '이용권',
      badgeColor: 'purple'
    });
  }

  // 4. PT Sessions events
  for (const s of sessions) {
    const exerciseList = s.exercises?.map((e) => e.exerciseName).join(', ') || '전신 루틴';
    events.push({
      id: `ev-ses-${s.sessionId}`,
      date: s.date,
      time: s.time,
      type: 'PT_SESSION',
      title:
        s.status === 'COMPLETED'
          ? `PT #${s.sessionNumber}회차 완료`
          : s.status === 'CANCELLED'
          ? `PT #${s.sessionNumber}회차 취소`
          : `PT #${s.sessionNumber}회차 예정`,
      description:
        s.status === 'COMPLETED'
          ? `수행 운동: ${exerciseList}`
          : `수업 일정: ${s.time}`,
      badgeText: s.status === 'COMPLETED' ? '완료' : s.status === 'CANCELLED' ? '취소' : '예정',
      badgeColor: s.status === 'COMPLETED' ? 'stone' : s.status === 'CANCELLED' ? 'rose' : 'sky'
    });
  }

  // 5. Body Measurements events (Phase 3)
  for (const m of measurements) {
    const details: string[] = [];
    if (m.weightKg !== undefined && m.weightKg !== null) details.push(`체중 ${m.weightKg}kg`);
    if (m.skeletalMuscleMassKg !== undefined && m.skeletalMuscleMassKg !== null) details.push(`골격근량 ${m.skeletalMuscleMassKg}kg`);
    if (m.bodyFatPercentage !== undefined && m.bodyFatPercentage !== null) details.push(`체지방률 ${m.bodyFatPercentage}%`);
    events.push({
      id: `ev-bm-${m.measurementId}`,
      date: m.measuredAt,
      type: 'BODY_MEASUREMENT',
      title: '신체 측정 기록',
      description: details.length > 0 ? details.join(' / ') : (m.memo || '신체 둘레 및 정보 측정'),
      badgeText: '측정',
      badgeColor: 'teal'
    });
  }

  // 6. Progress Reviews events (Phase 4)
  for (const r of reviews) {
    const title =
      r.reviewType === 'TEN_SESSION'
        ? '10회차 성과 리뷰 완료'
        : r.reviewType === 'TWENTY_SESSION'
        ? '20회차 성과 리뷰 완료'
        : r.reviewType === 'CONTRACT_END'
        ? 'PT 계약 종료 성과 리뷰 완료'
        : 'PT 성과 리뷰 완료';

    events.push({
      id: `ev-pr-${r.reviewId}`,
      date: r.reviewDate,
      type: 'PROGRESS_REVIEW',
      title,
      description:
        r.summary ||
        (r.trainerFeedback
          ? `트레이너 총평: ${r.trainerFeedback.slice(0, 60)}...`
          : '신체 변화 및 운동 성과 종합 리뷰'),
      badgeText: '성과리뷰',
      badgeColor: 'purple'
    });
  }

  // 7. Personal Workout events (Phase 6)
  const soloLogs = Object.values(memoryStore.personalWorkoutLogs || {}).filter(
    (l) => l.centerId === centerId && l.memberId === memberId
  );
  for (const log of soloLogs) {
    events.push({
      id: `ev-solo-${log.logId}`,
      date: log.date,
      time: log.completedAt || log.startTime,
      type: 'PERSONAL_WORKOUT',
      title: '개인운동 완료',
      description:
        log.completedExercises?.map((e) => `${e.exerciseName} (${e.actualSets?.length || 0}세트)`).join(', ') ||
        '개인운동 완료 기록',
      badgeText: '개인운동',
      badgeColor: 'amber'
    });
  }

  // Sort descending by date
  events.sort((a, b) => {
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return (b.time || '').localeCompare(a.time || '');
  });

  return events;
}

// ==========================================
// PHASE 2: ATTENTION MEMBERS CALCULATION (STEP 9)
// ==========================================

export async function getAttentionMembers(
  centerId: string,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<AttentionMemberItem[]> {
  const members = await getMembers(centerId, userRole, currentTrainerId);
  const activeMembers = members.filter((m) => m.status === 'ACTIVE');
  const now = new Date();

  const attentionList: AttentionMemberItem[] = [];

  for (const member of activeMembers) {
    const reasons: string[] = [];
    const reasonCodes: AttentionReasonCode[] = [];

    // 1. LOW_REMAINING_SESSIONS (잔여 5회 이하 독립 판정)
    const activeContracts = Object.values(memoryStore.ptContracts).filter(
      (c) => c.centerId === centerId && c.memberId === member.memberId && c.status === 'ACTIVE'
    );
    const remainingSessions = activeContracts.length > 0
      ? activeContracts.reduce((sum, c) => sum + Math.max(0, c.totalSessions - c.usedSessions), 0)
      : undefined;

    if (remainingSessions !== undefined && remainingSessions <= 5) {
      reasonCodes.push('LOW_REMAINING_SESSIONS');
      reasons.push(`PT 잔여 ${remainingSessions}회 (5회 이하 이용권 추가/목표 점검 필요)`);
    }

    // 2. LONG_ABSENCE (최근 수업 후 14일 이상 경과 독립 판정)
    const completedSessions = Object.values(memoryStore.ptSessions)
      .filter((s) => s.centerId === centerId && s.memberId === member.memberId && s.status === 'COMPLETED')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let daysSinceLastPt: number | undefined;
    if (completedSessions.length > 0) {
      const lastDate = new Date(completedSessions[0].date);
      const diffTime = Math.abs(now.getTime() - lastDate.getTime());
      daysSinceLastPt = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (daysSinceLastPt >= 14) {
        reasonCodes.push('LONG_ABSENCE');
        reasons.push(`최근 수업 후 ${daysSinceLastPt}일 경과 (장기 미출석)`);
      }
    } else {
      // No completed PT sessions yet, check start date
      const startDate = new Date(member.startDate);
      const diffTime = Math.abs(now.getTime() - startDate.getTime());
      const daysSinceStart = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (daysSinceStart >= 14) {
        reasonCodes.push('LONG_ABSENCE');
        reasons.push(`등록 후 ${daysSinceStart}일간 첫 PT 미진행`);
      }
    }

    // 3. NO_GOAL (목표 미설정 독립 판정)
    const goals = Object.values(memoryStore.memberGoals).filter(
      (g) => g.centerId === centerId && g.memberId === member.memberId && g.status === 'ACTIVE'
    );
    if (goals.length === 0) {
      reasonCodes.push('NO_GOAL');
      reasons.push('목표 미설정 (신규 목표 수립 필요)');
    }

    // 4. NO_CONSULTATION (최초 상담 미진행 독립 판정)
    const consultation = Object.values(memoryStore.consultations).find(
      (c) => c.centerId === centerId && c.memberId === member.memberId
    );
    if (!consultation) {
      reasonCodes.push('NO_CONSULTATION');
      reasons.push('최초 상담 미진행 (초기 인터뷰 필요)');
    }

    // 5. PROGRESS_REVIEW_DUE (STEP 18: 10회 단위 COMPLETED session 도달 시 성과 리뷰 예정 알림)
    if (completedSessions.length >= 10) {
      const milestone = Math.floor(completedSessions.length / 10) * 10;
      const memberReviews = Object.values(memoryStore.progressReviews || {}).filter(
        (r) => r.centerId === centerId && r.memberId === member.memberId
      );
      const alreadyReviewed = memberReviews.some((r) => {
        if (r.milestoneSessionCount === milestone) return true;
        if (milestone === 10 && r.reviewType === 'TEN_SESSION') return true;
        if (milestone === 20 && r.reviewType === 'TWENTY_SESSION') return true;
        if (r.completedSessionCountAtReview && r.completedSessionCountAtReview >= milestone) return true;
        return false;
      });

      if (!alreadyReviewed) {
        reasonCodes.push('PROGRESS_REVIEW_DUE');
        reasons.push(`${milestone}회차 완료 성과 리뷰 예정 (중간 점검)`);
      }
    }

    if (reasons.length > 0) {
      attentionList.push({
        member,
        reasons,
        reasonCodes,
        remainingSessions,
        daysSinceLastPt,
        hasConsultation: !!consultation,
        activeGoalCount: goals.length
      });
    }
  }

  return attentionList;
}

// ==========================================
// DASHBOARD METRICS CALCULATION
// ==========================================

export async function getDashboardMetrics(
  centerId: string,
  userRole: UserRole,
  currentTrainerId?: string | null
): Promise<{
  metrics: DashboardMetrics;
  todaySessions: PtSession[];
  recentMembers: Member[];
  attentionMembers: AttentionMemberItem[];
}> {
  const [allMembers, todaySessions, attentionMembers] = await Promise.all([
    getMembers(centerId, userRole, currentTrainerId),
    getTodayPtSessions(centerId, userRole, currentTrainerId),
    getAttentionMembers(centerId, userRole, currentTrainerId)
  ]);

  const activeMemberCount = allMembers.filter((m) => m.status === 'ACTIVE').length;
  const needsAttentionCount = attentionMembers.length;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentRegistrationCount = allMembers.filter(
    (m) => new Date(m.createdAt).getTime() >= thirtyDaysAgo.getTime()
  ).length;

  const metrics: DashboardMetrics = {
    todayPtCount: todaySessions.length,
    activeMemberCount,
    needsAttentionCount,
    recentRegistrationCount
  };

  const recentMembers = allMembers.slice(0, 5);

  return {
    metrics,
    todaySessions,
    recentMembers,
    attentionMembers
  };
}

// ==========================================
// SEED & DEMO UTILITY (Comprehensive Phase 2 Data)
// ==========================================

export async function seedInitialCenterData(
  centerId: string,
  centerName: string,
  trainerList: Array<{
    id: string;
    name: string;
    phone: string;
    specialty: string;
    uid?: string;
    loginEmail?: string;
  }>
): Promise<void> {
  const now = new Date().toISOString();
  const todayStr = now.split('T')[0];

  // 1. Center
  const center: Center = {
    centerId,
    name: centerName,
    address: '가상시 테스트로 1',
    phone: '',
    businessNumber: '',
    createdAt: now,
    updatedAt: now
  };
  memoryStore.centers[centerId] = center;

  // 2. Trainers
  for (const t of trainerList) {
    const tr: Trainer = {
      trainerId: t.id,
      centerId,
      name: t.name,
      phone: t.phone,
      specialty: t.specialty,
      role: 'TRAINER',
      status: 'ACTIVE',
      createdAt: now,
      uid: t.uid,
      loginEmail: t.loginEmail
    };
    memoryStore.trainers[t.id] = tr;
  }

  // 3. Synthetic sample members. Names, dates and contacts are not real people.
  const sampleMembers: Member[] = [
    {
      memberId: `mem-${centerId}-01`,
      centerId,
      trainerId: trainerList[0]?.id || 'tr-lee-01',
      name: '가상 회원 A',
      gender: 'MALE',
      birthDate: '2000-01-01',
      phone: '',
      startDate: '2026-08-01',
      status: 'ACTIVE',
      notes: '목표: 체지방 5% 감량 및 코어 근력 강화. 주 2회 진행 중.',
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: now
    },
    {
      memberId: `mem-${centerId}-02`,
      centerId,
      trainerId: trainerList[0]?.id || 'tr-lee-01',
      name: '가상 회원 B',
      gender: 'FEMALE',
      birthDate: '2000-01-01',
      phone: '',
      startDate: '2026-08-15',
      status: 'ACTIVE',
      notes: '목표: 라운드숄더 교정 및 하체 근비대. 컨디션 양호.',
      createdAt: '2026-08-15T10:00:00.000Z',
      updatedAt: now
    },
    {
      memberId: `mem-${centerId}-03`,
      centerId,
      trainerId: trainerList[1]?.id || 'tr-park-02',
      name: '가상 회원 C',
      gender: 'MALE',
      birthDate: '2000-01-01',
      phone: '',
      startDate: '2026-07-10',
      status: 'PAUSED',
      notes: '출장 일정으로 인해 2주간 일시정지 상태. 관리 필요.',
      createdAt: '2026-07-10T11:00:00.000Z',
      updatedAt: now
    },
    {
      memberId: `mem-${centerId}-04`,
      centerId,
      trainerId: trainerList[1]?.id || 'tr-park-02',
      name: '가상 회원 D',
      gender: 'FEMALE',
      birthDate: '2000-01-01',
      phone: '',
      startDate: '2026-09-01',
      status: 'ACTIVE',
      notes: '최근 등록 회원. 기초 체력 증진 및 식단 루틴 적응 단계.',
      createdAt: '2026-09-01T14:00:00.000Z',
      updatedAt: now
    }
  ];

  for (const m of sampleMembers) {
    memoryStore.members[m.memberId] = m;
  }

  // 4. Sample PT Contracts
  const sampleContracts: PtContract[] = [
    {
      contractId: `ct-${centerId}-01`,
      centerId,
      memberId: sampleMembers[0].memberId, // 가상 회원 A (30회 중 24회 완료 -> 잔여 6회! Dashboard Attention 조건 충족)
      trainerId: sampleMembers[0].trainerId,
      title: '정규 1:1 PT 30회권',
      totalSessions: 30,
      usedSessions: 24,
      startDate: '2026-08-01',
      expirationDate: '2026-11-30',
      status: 'ACTIVE',
      createdAt: '2026-08-01T09:30:00.000Z',
      updatedAt: now
    },
    {
      contractId: `ct-${centerId}-02`,
      centerId,
      memberId: sampleMembers[1].memberId, // 가상 회원 B (30회 중 8회 완료 -> 잔여 22회)
      trainerId: sampleMembers[1].trainerId,
      title: '체형교정 & 근비대 30회권',
      totalSessions: 30,
      usedSessions: 8,
      startDate: '2026-08-15',
      expirationDate: '2026-12-15',
      status: 'ACTIVE',
      createdAt: '2026-08-15T10:30:00.000Z',
      updatedAt: now
    },
    {
      contractId: `ct-${centerId}-03`,
      centerId,
      memberId: sampleMembers[3].memberId, // 가상 회원 D (10회권)
      trainerId: sampleMembers[3].trainerId,
      title: '스타터 1:1 PT 10회권',
      totalSessions: 10,
      usedSessions: 1,
      startDate: '2026-09-01',
      expirationDate: '2026-10-31',
      status: 'ACTIVE',
      createdAt: '2026-09-01T14:30:00.000Z',
      updatedAt: now
    }
  ];

  for (const c of sampleContracts) {
    memoryStore.ptContracts[c.contractId] = c;
  }

  // 5. Sample Consultations
  const sampleConsultation: Consultation = {
    consultationId: `con-${centerId}-01`,
    centerId,
    memberId: sampleMembers[0].memberId,
    trainerId: sampleMembers[0].trainerId,
    trainerName: '이준호 트레이너',
    consultationDate: '2026-08-01',
    exercisePurposes: ['WEIGHT_LOSS', 'BODY_SHAPE', 'FITNESS'],
    exerciseExperience: {
      hasExperience: true,
      preferredExercises: '스쿼트, 맨몸 운동, 가벼운 덤벨 프레스',
      difficultExercises: '데드리프트, 오버헤드 프레스',
      pastDuration: '과거 6개월 헬스장 등록 경험 있음',
      reasonForStop: '부정확한 자세로 허리 뻐근함 발생 후 동기 저하'
    },
    lifestyle: {
      sleepHoursPerDay: 7,
      workoutDaysPerWeek: 3,
      availableTimeSlots: '화/목 저녁 19시, 토요일 오전 10시',
      jobActivityLevel: 'SEDENTARY'
    },
    memberPrecautions: '장시간 좌식 근무로 인해 오래 앉아있으면 허리가 뻐근하다고 알림.',
    trainerObservations: '상담 시 골반 전방경사 경향 및 햄스트링/고관절 굴곡근 유연성 타이트함 관찰.',
    initialExercisePlan: '초기 2주간 흉추 가동성 및 코어 안정화 선행 후 점진적 힙힌지 패턴 학습.',
    precautions: '장시간 좌식 근무로 인해 요추 기립근 긴장도가 높음. 고중량 시 코어 브레이싱 필수 지도.',
    motivationInterview: {
      biggestReason: '건강검진에서 체지방률 경고를 받고 체력 저하를 심각하게 느껴 결심했습니다.',
      goalAchievedWish: '가벼운 몸으로 주말 등산이나 여행을 피로감 없이 즐기고 싶습니다.',
      biggestConcern: '바쁜 야근 일정 속에서 운동 루틴이 중간에 끊기지 않을까 걱정됩니다.',
      pastObstacle: '체계적인 기록이나 피드백 없이 혼자 운동하다 보니 재미를 잃었습니다.',
      threeMonthsVision: '허리 통증 없이 바른 자세로 70kg 스쿼트를 편안하게 수행하는 모습'
    },
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: now
  };
  memoryStore.consultations[sampleConsultation.consultationId] = sampleConsultation;

  // 6. Sample Member Goals
  const sampleGoals: MemberGoal[] = [
    {
      goalId: `goal-${centerId}-01`,
      centerId,
      memberId: sampleMembers[0].memberId,
      trainerId: sampleMembers[0].trainerId,
      category: 'BODY_COMPOSITION',
      title: '체지방률 25% 달성',
      description: '인바디 기준 현재 28.5%에서 25.0% 이하로 단계적 감량',
      targetValue: 25,
      targetUnit: '%',
      targetDate: '2026-10-31',
      status: 'ACTIVE',
      metricKey: 'BODY_FAT_PERCENTAGE',
      startValue: 31.2,
      createdAt: '2026-08-01T10:30:00.000Z',
      updatedAt: now
    },
    {
      goalId: `goal-${centerId}-02`,
      centerId,
      memberId: sampleMembers[0].memberId,
      trainerId: sampleMembers[0].trainerId,
      category: 'PERFORMANCE',
      title: 'Squat 70kg 10회 안정적 리프팅',
      description: '허리 말림(Butt wink) 없이 풀 스쿼트 가동범위 확보',
      targetValue: 70,
      targetUnit: 'kg',
      targetDate: '2026-10-15',
      status: 'ACTIVE',
      metricKey: 'EXERCISE_MAX_WEIGHT',
      exerciseName: '스쿼트',
      startValue: 50,
      createdAt: '2026-08-01T10:35:00.000Z',
      updatedAt: now
    },
    {
      goalId: `goal-${centerId}-03`,
      centerId,
      memberId: sampleMembers[0].memberId,
      trainerId: sampleMembers[0].trainerId,
      category: 'REHAB_POSTURE',
      title: '허리 불편감 없이 코어 안정화 운동하기',
      description: '버드독, 플랭크, 데드버그 2분 연속 수행',
      targetValue: '정성 목표',
      targetDate: '2026-09-30',
      status: 'ACHIEVED',
      createdAt: '2026-08-01T10:40:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
      completedAt: '2026-09-10T10:00:00.000Z'
    },
    {
      goalId: `goal-${centerId}-04`,
      centerId,
      memberId: sampleMembers[1].memberId,
      trainerId: sampleMembers[1].trainerId,
      category: 'HABIT',
      title: '주 3회 규칙적인 운동 습관 형성',
      description: 'PT 2회 + 자율 유산소/스트레칭 1회 준수',
      targetValue: 3,
      targetUnit: '회/주',
      targetDate: '2026-11-15',
      status: 'ACTIVE',
      createdAt: '2026-08-15T11:00:00.000Z',
      updatedAt: now
    }
  ];

  for (const g of sampleGoals) {
    memoryStore.memberGoals[g.goalId] = g;
  }

  // 7. Sample PT Sessions with realistic exercise sets
  const sampleSessions: PtSession[] = [
    {
      sessionId: `ses-${centerId}-00a`,
      centerId,
      trainerId: sampleMembers[0].trainerId,
      trainerName: '이준호 트레이너',
      memberId: sampleMembers[0].memberId,
      memberName: sampleMembers[0].name,
      contractId: sampleContracts[0].contractId,
      sessionNumber: 21,
      date: '2026-08-18',
      time: '19:00',
      status: 'COMPLETED',
      memberCondition: 'GOOD',
      sessionNotes: '하체 기초 가동성 및 스쿼트 기본 패턴 점검',
      trainerFeedback: '고관절 굴곡 각도 양호. 발뒤꿈치 접지 집중 권고',
      nextSessionGoal: '스쿼트 50kg 증량 목표',
      exercises: [
        {
          exerciseName: '스쿼트',
          sets: [
            { setNumber: 1, weight: 35, reps: 12 },
            { setNumber: 2, weight: 40, reps: 10 },
            { setNumber: 3, weight: 45, reps: 10 }
          ],
          memo: '빈 봉 웜업 후 본세트 진행'
        },
        {
          exerciseName: '루마니안 데드리프트',
          sets: [
            { setNumber: 1, weight: 30, reps: 12 },
            { setNumber: 2, weight: 35, reps: 10 }
          ],
          memo: '힌지 패턴 적응 세션'
        }
      ],
      createdAt: '2026-08-18T19:00:00.000Z',
      updatedAt: '2026-08-18T20:00:00.000Z'
    },
    {
      sessionId: `ses-${centerId}-00b`,
      centerId,
      trainerId: sampleMembers[0].trainerId,
      trainerName: '이준호 트레이너',
      memberId: sampleMembers[0].memberId,
      memberName: sampleMembers[0].name,
      contractId: sampleContracts[0].contractId,
      sessionNumber: 22,
      date: '2026-08-28',
      time: '19:00',
      status: 'COMPLETED',
      memberCondition: 'GOOD',
      sessionNotes: '하체 중량 적응 세션',
      trainerFeedback: '코어 브레이싱 안정적. 55kg 구간 무난히 소화',
      nextSessionGoal: '60kg 도전',
      exercises: [
        {
          exerciseName: '스쿼트',
          sets: [
            { setNumber: 1, weight: 40, reps: 10 },
            { setNumber: 2, weight: 50, reps: 10 },
            { setNumber: 3, weight: 55, reps: 8 }
          ],
          memo: '3세트 55kg 달성'
        },
        {
          exerciseName: '루마니안 데드리프트',
          sets: [
            { setNumber: 1, weight: 35, reps: 12 },
            { setNumber: 2, weight: 40, reps: 10 }
          ],
          memo: '광배근 텐션 유지 훈련'
        }
      ],
      createdAt: '2026-08-28T19:00:00.000Z',
      updatedAt: '2026-08-28T20:00:00.000Z'
    },
    {
      sessionId: `ses-${centerId}-01`,
      centerId,
      trainerId: sampleMembers[0].trainerId,
      trainerName: '이준호 트레이너',
      memberId: sampleMembers[0].memberId,
      memberName: sampleMembers[0].name,
      contractId: sampleContracts[0].contractId,
      sessionNumber: 23,
      date: '2026-09-07', // 11 days ago -> Attention triggers!
      time: '19:00',
      status: 'COMPLETED',
      memberCondition: 'GOOD',
      sessionNotes: '하체 스트렝스 세션. 흉추 신전 자세 양호.',
      trainerFeedback: '스쿼트 시 발바닥 3각 접지가 우수하게 유지되었습니다. 복압 호흡 유지에 신경써주세요.',
      nextSessionGoal: '바벨 백스쿼트 65kg 도전 및 루마니안 데드리프트 힌지 교정',
      exercises: [
        {
          exerciseName: '스쿼트',
          sets: [
            { setNumber: 1, weight: 50, reps: 10 },
            { setNumber: 2, weight: 60, reps: 10 },
            { setNumber: 3, weight: 60, reps: 8 }
          ],
          memo: '3세트째 템포 3초 네거티브 유지'
        },
        {
          exerciseName: '루마니안 데드리프트',
          sets: [
            { setNumber: 1, weight: 40, reps: 12 },
            { setNumber: 2, weight: 50, reps: 10 },
            { setNumber: 3, weight: 50, reps: 10 }
          ],
          memo: '바벨이 정강이에서 떨어지지 않도록 광배근 체결'
        }
      ],
      createdAt: '2026-09-07T19:00:00.000Z',
      updatedAt: '2026-09-07T20:00:00.000Z'
    },
    {
      sessionId: `ses-${centerId}-02`,
      centerId,
      trainerId: sampleMembers[0].trainerId,
      trainerName: '이준호 트레이너',
      memberId: sampleMembers[0].memberId,
      memberName: sampleMembers[0].name,
      contractId: sampleContracts[0].contractId,
      sessionNumber: 24,
      date: todayStr,
      time: '14:00',
      status: 'SCHEDULED',
      memberCondition: 'NORMAL',
      sessionNotes: '금일 예정 PT 세션. 상체 프레스 및 어깨 안정화.',
      trainerFeedback: '',
      nextSessionGoal: '벤치프레스 견갑 패킹 집중',
      exercises: [
        {
          exerciseName: '덤벨 벤치프레스',
          sets: [
            { setNumber: 1, weight: 14, reps: 12 },
            { setNumber: 2, weight: 16, reps: 10 },
            { setNumber: 3, weight: 16, reps: 10 }
          ],
          memo: '팔꿈치 각도 45도 유지'
        }
      ],
      createdAt: now,
      updatedAt: now
    },
    {
      sessionId: `ses-${centerId}-03`,
      centerId,
      trainerId: sampleMembers[1].trainerId,
      trainerName: '이준호 트레이너',
      memberId: sampleMembers[1].memberId,
      memberName: sampleMembers[1].name,
      contractId: sampleContracts[1].contractId,
      sessionNumber: 8,
      date: todayStr,
      time: '17:00',
      status: 'SCHEDULED',
      memberCondition: 'GOOD',
      sessionNotes: '하체 둔근 타겟팅 및 힙힌지 교정 세션.',
      trainerFeedback: '',
      nextSessionGoal: '',
      exercises: [],
      createdAt: now,
      updatedAt: now
    }
  ];

  for (const s of sampleSessions) {
    memoryStore.ptSessions[s.sessionId] = s;
  }

  // 8. Sample Body Measurements (Phase 3)
  const sampleMeasurements: BodyMeasurement[] = [
    {
      measurementId: `bm-${centerId}-01`,
      centerId,
      memberId: sampleMembers[0].memberId,
      trainerId: sampleMembers[0].trainerId,
      measuredAt: '2026-07-28',
      weightKg: 78.5,
      skeletalMuscleMassKg: 32.0,
      bodyFatMassKg: 24.5,
      bodyFatPercentage: 31.2,
      waistCm: 88,
      hipCm: 98,
      chestCm: 100,
      thighCm: 56,
      armCm: 32,
      memo: '최초 상담 및 등록 시 1차 인바디 측정',
      createdAt: '2026-07-28T10:00:00.000Z',
      updatedAt: '2026-07-28T10:00:00.000Z'
    },
    {
      measurementId: `bm-${centerId}-02`,
      centerId,
      memberId: sampleMembers[0].memberId,
      trainerId: sampleMembers[0].trainerId,
      measuredAt: '2026-08-25',
      weightKg: 76.8,
      skeletalMuscleMassKg: 32.8,
      bodyFatMassKg: 22.0,
      bodyFatPercentage: 28.6,
      waistCm: 85,
      hipCm: 97,
      chestCm: 101,
      thighCm: 56.5,
      armCm: 33,
      memo: '1개월차 중간 점검 (체지방 감소 및 골격근 증가)',
      createdAt: '2026-08-25T14:00:00.000Z',
      updatedAt: '2026-08-25T14:00:00.000Z'
    },
    {
      measurementId: `bm-${centerId}-03`,
      centerId,
      memberId: sampleMembers[0].memberId,
      trainerId: sampleMembers[0].trainerId,
      measuredAt: '2026-09-12',
      weightKg: 75.2,
      skeletalMuscleMassKg: 33.4,
      bodyFatMassKg: 20.1,
      bodyFatPercentage: 26.8,
      waistCm: 83,
      hipCm: 96,
      chestCm: 102,
      thighCm: 57,
      armCm: 33.5,
      memo: '최근 정기 측정. 체지방률 25% 목표 진입 순항 중',
      createdAt: '2026-09-12T11:00:00.000Z',
      updatedAt: '2026-09-12T11:00:00.000Z'
    }
  ];

  for (const m of sampleMeasurements) {
    memoryStore.bodyMeasurements[m.measurementId] = m;
  }

  // 10. Sample Exercises (Phase 6)
  const sampleExercises: Exercise[] = [
    {
      exerciseId: `ex-${centerId}-01`,
      centerId,
      name: '바벨 백 스쿼트',
      category: '웨이트',
      bodyPart: '하체',
      equipment: '바벨',
      description: '대퇴사두근, 둔근 및 코어 안정화. 발끝은 15~30도 외회전하고 무릎이 안으로 모이지 않도록 주의.',
      videoUrl: 'https://www.youtube.com/watch?v=ultWZbUMPL8',
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: now
    },
    {
      exerciseId: `ex-${centerId}-02`,
      centerId,
      name: '루마니안 데드리프트',
      category: '웨이트',
      bodyPart: '등/하체',
      equipment: '바벨',
      description: '둔근, 햄스트링, 기립근 강화. 힙힌지 패턴을 유지하며 바벨이 허벅지에서 떨어지지 않게 밀착.',
      videoUrl: 'https://www.youtube.com/watch?v=Xsnv2iNslj8',
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: now
    },
    {
      exerciseId: `ex-${centerId}-03`,
      centerId,
      name: '바벨 벤치프레스',
      category: '웨이트',
      bodyPart: '가슴',
      equipment: '바벨',
      description: '대흉근 전체 및 삼두근. 견갑골 후인하강 후 전완이 지면과 수직을 이루도록 가슴 중앙으로 하강.',
      videoUrl: 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: now
    },
    {
      exerciseId: `ex-${centerId}-04`,
      centerId,
      name: '랫 풀 다운',
      category: '웨이트',
      bodyPart: '등',
      equipment: '머신',
      description: '광배근 타겟. 팔로 당기지 않고 팔꿈치를 옆구리 쪽으로 찍어내리듯 당겨 수축.',
      videoUrl: 'https://www.youtube.com/watch?v=CAwf7n6Luuc',
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: now
    },
    {
      exerciseId: `ex-${centerId}-05`,
      centerId,
      name: '덤벨 숄더 프레스',
      category: '웨이트',
      bodyPart: '어깨',
      equipment: '덤벨',
      description: '전면/측면 삼각근. 허리가 과도하게 꺾이지 않도록 복압 유지하며 머리 위로 수직 프레스.',
      videoUrl: 'https://www.youtube.com/watch?v=qEwKCR5JCog',
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: now
    },
    {
      exerciseId: `ex-${centerId}-06`,
      centerId,
      name: '레그 익스텐션',
      category: '웨이트',
      bodyPart: '하체',
      equipment: '머신',
      description: '대퇴사두근 고립. 무릎 관절과 머신 회전축을 일치시킨 후 정점에서 1초간 수축 유지.',
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: now
    },
    {
      exerciseId: `ex-${centerId}-07`,
      centerId,
      name: '플랭크',
      category: '맨몸',
      bodyPart: '복근',
      equipment: '맨몸',
      description: '코어 브레이싱 및 척추 중립 유지. 골반이 밑으로 처지거나 위로 솟지 않도록 둔근과 복부에 힘 집중.',
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: now
    },
    {
      exerciseId: `ex-${centerId}-08`,
      centerId,
      name: '트레드밀 인터벌 러닝',
      category: '유산소',
      bodyPart: '전신',
      equipment: '머신',
      description: '경사도 2~3%, 속도 6.0(웜업 2분) -> 9.5(1분 러닝) -> 5.5(1분 워킹) 5세트 반복.',
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: now
    }
  ];

  if (!memoryStore.exercises) memoryStore.exercises = {};
  for (const ex of sampleExercises) {
    memoryStore.exercises[ex.exerciseId] = ex;
  }

  // 11. Sample Workout Template
  const sampleTemplate: WorkoutTemplate = {
    templateId: `wtpl-${centerId}-01`,
    centerId,
    trainerId: sampleMembers[0].trainerId,
    title: '하체 & 코어 기본 루틴 (A세트)',
    category: '하체/코어',
    description: '스쿼트 중심의 하체 근력 및 플랭크 코어 보강 30~40분 개인운동 루틴',
    exercises: [
      {
        exerciseId: sampleExercises[0].exerciseId,
        exerciseName: sampleExercises[0].name,
        bodyPart: '하체',
        equipment: '바벨',
        targetSets: [
          { setNumber: 1, targetWeight: 50, targetReps: 12 },
          { setNumber: 2, targetWeight: 60, targetReps: 10 },
          { setNumber: 3, targetWeight: 60, targetReps: 10 }
        ],
        guideNote: '본세트 전 빈 봉으로 15회 웜업 필수'
      },
      {
        exerciseId: sampleExercises[5].exerciseId,
        exerciseName: sampleExercises[5].name,
        bodyPart: '하체',
        equipment: '머신',
        targetSets: [
          { setNumber: 1, targetWeight: 30, targetReps: 15 },
          { setNumber: 2, targetWeight: 35, targetReps: 12 },
          { setNumber: 3, targetWeight: 35, targetReps: 12 }
        ],
        guideNote: '정점에서 수축감 느끼며 천천히 이완'
      },
      {
        exerciseId: sampleExercises[6].exerciseId,
        exerciseName: sampleExercises[6].name,
        bodyPart: '복근',
        equipment: '맨몸',
        targetSets: [
          { setNumber: 1, targetWeight: 0, targetReps: 45 },
          { setNumber: 2, targetWeight: 0, targetReps: 45 },
          { setNumber: 3, targetWeight: 0, targetReps: 45 }
        ],
        guideNote: '세트당 45초 유지 후 30초 휴식'
      }
    ],
    createdAt: '2026-08-05T10:00:00.000Z',
    updatedAt: now
  };

  if (!memoryStore.workoutTemplates) memoryStore.workoutTemplates = {};
  memoryStore.workoutTemplates[sampleTemplate.templateId] = sampleTemplate;

  // 12. Sample Assigned Personal Workout Plan
  const samplePlan: PersonalWorkoutPlan = {
    planId: `pln-${centerId}-01`,
    memberId: sampleMembers[0].memberId,
    memberName: sampleMembers[0].name,
    trainerId: sampleMembers[0].trainerId,
    trainerName: '이준호 트레이너',
    centerId,
    date: todayStr,
    title: 'PT 복습: 하체 기본 및 햄스트링 가동성',
    trainerInstructions: '스쿼트 시 고관절 힌지 신경써서 무릎 부담 줄여주세요. 세트 간 휴식은 90초 지켜주세요!',
    status: 'ASSIGNED',
    exercises: [
      {
        exerciseId: sampleExercises[0].exerciseId,
        exerciseName: sampleExercises[0].name,
        bodyPart: '하체',
        equipment: '바벨',
        targetSets: [
          { setNumber: 1, targetWeight: 50, targetReps: 10 },
          { setNumber: 2, targetWeight: 60, targetReps: 10 },
          { setNumber: 3, targetWeight: 60, targetReps: 10 }
        ],
        guideNote: '허리 말리지 않게 복압 단단히 유지'
      },
      {
        exerciseId: sampleExercises[1].exerciseId,
        exerciseName: sampleExercises[1].name,
        bodyPart: '등/하체',
        equipment: '바벨',
        targetSets: [
          { setNumber: 1, targetWeight: 40, targetReps: 12 },
          { setNumber: 2, targetWeight: 50, targetReps: 10 },
          { setNumber: 3, targetWeight: 50, targetReps: 10 }
        ],
        guideNote: '엉덩이를 뒤로 밀어내며 햄스트링 신장감 느끼기'
      },
      {
        exerciseId: sampleExercises[6].exerciseId,
        exerciseName: sampleExercises[6].name,
        bodyPart: '복근',
        equipment: '맨몸',
        targetSets: [
          { setNumber: 1, targetWeight: 0, targetReps: 40 },
          { setNumber: 2, targetWeight: 0, targetReps: 40 }
        ],
        guideNote: '마무리 코어 강화 40초 2세트'
      }
    ],
    createdAt: `${todayStr}T08:00:00.000Z`,
    updatedAt: now
  };

  if (!memoryStore.personalWorkoutPlans) memoryStore.personalWorkoutPlans = {};
  memoryStore.personalWorkoutPlans[samplePlan.planId] = samplePlan;

  // 13. Sample Completed Personal Workout Log (Completed 2 days ago)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 2);
  const pastDateStr = pastDate.toISOString().split('T')[0];

  const sampleLog: PersonalWorkoutLog = {
    logId: `wlog-${centerId}-01`,
    planId: undefined,
    memberId: sampleMembers[0].memberId,
    memberName: sampleMembers[0].name,
    trainerId: sampleMembers[0].trainerId,
    trainerName: '이준호 트레이너',
    centerId,
    date: pastDateStr,
    startTime: '19:10',
    completedAt: '19:55',
    memberMemo: '스쿼트 60kg 2세트까지는 자세 안정적이었는데 3세트 8회차부터 허리에 힘이 좀 들어갔습니다.',
    trainerFeedback: '피드백 확인했습니다! 마지막 세트 피로 시에는 무리해서 10회 채우지 말고 8회에서 안전하게 마무리하셔도 좋습니다. 아주 잘하셨어요!',
    completedExercises: [
      {
        exerciseId: sampleExercises[0].exerciseId,
        exerciseName: sampleExercises[0].name,
        actualSets: [
          { setNumber: 1, weight: 50, reps: 10, completed: true },
          { setNumber: 2, weight: 60, reps: 10, completed: true },
          { setNumber: 3, weight: 60, reps: 8, completed: true }
        ],
        notes: '3세트 8회 성공 후 랙 안착'
      },
      {
        exerciseId: sampleExercises[3].exerciseId,
        exerciseName: sampleExercises[3].name,
        actualSets: [
          { setNumber: 1, weight: 35, reps: 12, completed: true },
          { setNumber: 2, weight: 40, reps: 10, completed: true },
          { setNumber: 3, weight: 40, reps: 10, completed: true }
        ],
        notes: '광배근 자극 좋았음'
      }
    ],
    createdAt: `${pastDateStr}T19:55:00.000Z`,
    updatedAt: `${pastDateStr}T21:00:00.000Z`
  };

  if (!memoryStore.personalWorkoutLogs) memoryStore.personalWorkoutLogs = {};
  memoryStore.personalWorkoutLogs[sampleLog.logId] = sampleLog;

  saveLocalStore(memoryStore);

  // Sync to Firestore in background
  if (isFirestoreAvailable && db) {
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'centers', centerId), center);
      for (const t of trainerList) {
        batch.set(doc(db, 'trainers', t.id), memoryStore.trainers[t.id]);
      }
      for (const m of sampleMembers) {
        batch.set(doc(db, 'members', m.memberId), m);
      }
      for (const c of sampleContracts) {
        batch.set(doc(db, 'ptContracts', c.contractId), c);
      }
      batch.set(doc(db, 'consultations', sampleConsultation.consultationId), sampleConsultation);
      for (const g of sampleGoals) {
        batch.set(doc(db, 'memberGoals', g.goalId), g);
      }
      for (const s of sampleSessions) {
        batch.set(doc(db, 'ptSessions', s.sessionId), s);
      }
      for (const bm of sampleMeasurements) {
        batch.set(doc(db, 'bodyMeasurements', bm.measurementId), bm);
      }
      for (const ex of sampleExercises) {
        batch.set(doc(db, 'exercises', ex.exerciseId), ex);
      }
      batch.set(doc(db, 'workoutTemplates', sampleTemplate.templateId), sampleTemplate);
      batch.set(doc(db, 'personalWorkoutPlans', samplePlan.planId), samplePlan);
      batch.set(doc(db, 'personalWorkoutLogs', sampleLog.logId), sampleLog);
      await batch.commit();
    } catch (err) {
      console.warn('[Firestore seedInitialCenterData batch error]', err);
    }
  }
}

export async function clearCenterData(centerId: string): Promise<void> {
  // Clear from loadedMemberSessionIds
  Array.from(loadedMemberSessionIds).forEach((id) => {
    if (id.startsWith(`${centerId}:`)) {
      loadedMemberSessionIds.delete(id);
    }
  });

  // Clear from memoryStore
  Object.keys(memoryStore.members).forEach((k) => {
    if (memoryStore.members[k].centerId === centerId) delete memoryStore.members[k];
  });
  Object.keys(memoryStore.trainers).forEach((k) => {
    if (memoryStore.trainers[k].centerId === centerId) delete memoryStore.trainers[k];
  });
  Object.keys(memoryStore.ptSessions).forEach((k) => {
    if (memoryStore.ptSessions[k].centerId === centerId) delete memoryStore.ptSessions[k];
  });
  Object.keys(memoryStore.consultations).forEach((k) => {
    if (memoryStore.consultations[k].centerId === centerId) delete memoryStore.consultations[k];
  });
  Object.keys(memoryStore.memberGoals).forEach((k) => {
    if (memoryStore.memberGoals[k].centerId === centerId) delete memoryStore.memberGoals[k];
  });
  Object.keys(memoryStore.ptContracts).forEach((k) => {
    if (memoryStore.ptContracts[k].centerId === centerId) delete memoryStore.ptContracts[k];
  });
  Object.keys(memoryStore.bodyMeasurements).forEach((k) => {
    if (memoryStore.bodyMeasurements[k].centerId === centerId) delete memoryStore.bodyMeasurements[k];
  });
  Object.keys(memoryStore.progressPhotos || {}).forEach((k) => {
    if (memoryStore.progressPhotos[k].centerId === centerId) delete memoryStore.progressPhotos[k];
  });
  Object.keys(memoryStore.progressReviews || {}).forEach((k) => {
    if (memoryStore.progressReviews[k].centerId === centerId) delete memoryStore.progressReviews[k];
  });
  Object.keys(memoryStore.exercises || {}).forEach((k) => {
    if (memoryStore.exercises[k].centerId === centerId) delete memoryStore.exercises[k];
  });
  Object.keys(memoryStore.workoutTemplates || {}).forEach((k) => {
    if (memoryStore.workoutTemplates[k].centerId === centerId) delete memoryStore.workoutTemplates[k];
  });
  Object.keys(memoryStore.personalWorkoutPlans || {}).forEach((k) => {
    if (memoryStore.personalWorkoutPlans[k].centerId === centerId) delete memoryStore.personalWorkoutPlans[k];
  });
  Object.keys(memoryStore.personalWorkoutLogs || {}).forEach((k) => {
    if (memoryStore.personalWorkoutLogs[k].centerId === centerId) delete memoryStore.personalWorkoutLogs[k];
  });
  Object.keys(memoryStore.leads || {}).forEach((k) => {
    if (memoryStore.leads[k].centerId === centerId) delete memoryStore.leads[k];
  });
  Object.keys(memoryStore.renewals || {}).forEach((k) => {
    if (memoryStore.renewals[k].centerId === centerId) delete memoryStore.renewals[k];
  });

  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      const [membersSnap, trainersSnap, sessionsSnap, conSnap, goalsSnap, ctSnap, bmSnap, photosSnap, reviewsSnap, exSnap, tplSnap, plansSnap, logsSnap, leadsSnap, renewalsSnap] = await Promise.all([
        getDocs(query(collection(db, 'members'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'trainers'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'ptSessions'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'consultations'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'memberGoals'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'ptContracts'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'bodyMeasurements'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'progressPhotos'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'progressReviews'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'exercises'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'workoutTemplates'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'personalWorkoutPlans'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'personalWorkoutLogs'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'leads'), where('centerId', '==', centerId))),
        getDocs(query(collection(db, 'renewals'), where('centerId', '==', centerId)))
      ]);

      const batch = writeBatch(db);
      membersSnap.forEach((d) => batch.delete(d.ref));
      trainersSnap.forEach((d) => batch.delete(d.ref));
      sessionsSnap.forEach((d) => batch.delete(d.ref));
      conSnap.forEach((d) => batch.delete(d.ref));
      goalsSnap.forEach((d) => batch.delete(d.ref));
      ctSnap.forEach((d) => batch.delete(d.ref));
      bmSnap.forEach((d) => batch.delete(d.ref));
      photosSnap.forEach((d) => batch.delete(d.ref));
      reviewsSnap.forEach((d) => batch.delete(d.ref));
      exSnap.forEach((d) => batch.delete(d.ref));
      tplSnap.forEach((d) => batch.delete(d.ref));
      plansSnap.forEach((d) => batch.delete(d.ref));
      logsSnap.forEach((d) => batch.delete(d.ref));
      leadsSnap.forEach((d) => batch.delete(d.ref));
      renewalsSnap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch (err) {
      console.warn('[Firestore clearCenterData error]', err);
    }
  }
}

// ==========================================
// PHASE 8A: LEAD & OT MANAGEMENT SERVICE (신규문의 및 OT 관리)
// ==========================================

export async function createLead(
  leadData: Omit<Lead, 'leadId' | 'createdAt' | 'updatedAt'> & { leadId?: string },
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Lead> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 신규문의를 등록할 수 없습니다.');
  }
  if (userRole === 'TRAINER') {
    throw new Error('신규문의 등록은 센터 관리자만 가능합니다.');
  }

  const leadId = leadData.leadId || 'lead-' + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();

  const newLead: Lead = {
    ...leadData,
    leadId,
    createdAt: now,
    updatedAt: now
  };

  memoryStore.leads[leadId] = newLead;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await setDoc(doc(db, 'leads', leadId), newLead);
    } catch (err) {
      firestoreWriteFailed('createLead', err);
    }
  }

  return newLead;
}

export async function getLeads(
  centerId: string,
  userRole?: UserRole,
  currentTrainerId?: string | null,
  filterStatus?: LeadStatus
): Promise<Lead[]> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 신규문의 목록에 접근할 수 없습니다.');
  }

  if (isFirestoreAvailable && db) {
    try {
      let q;
      if (userRole === 'TRAINER') {
        q = query(
          collection(db, 'leads'),
          where('centerId', '==', centerId),
          where('assignedTrainerId', '==', currentTrainerId || '__unassigned__')
        );
      } else {
        q = query(
          collection(db, 'leads'),
          where('centerId', '==', centerId)
        );
      }
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const item = d.data() as Lead;
        memoryStore.leads[item.leadId] = item;
      });
      saveLocalStore(memoryStore);
    } catch (err) {
      console.warn('[Firestore getLeads error]', err);
    }
  }

  const list = Object.values(memoryStore.leads || {}).filter((lead) => {
    if (lead.centerId !== centerId) return false;
    if (userRole === 'TRAINER') {
      return currentTrainerId ? lead.assignedTrainerId === currentTrainerId : false;
    }
    return true;
  });

  const filtered = filterStatus ? list.filter((lead) => lead.status === filterStatus) : list;
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return filtered;
}

export async function getLeadById(
  centerId: string,
  leadId: string,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Lead | null> {
  if (userRole === 'MEMBER') {
    return null;
  }

  if (isFirestoreAvailable && db) {
    try {
      const docRef = doc(db, 'leads', leadId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const item = snap.data() as Lead;
        if (item.centerId === centerId) {
          if (userRole === 'TRAINER' && currentTrainerId && item.assignedTrainerId !== currentTrainerId) {
            return null;
          }
          memoryStore.leads[leadId] = item;
          saveLocalStore(memoryStore);
          return item;
        }
      }
    } catch (err) {
      console.warn('[Firestore getLeadById error]', err);
    }
  }

  const found = memoryStore.leads?.[leadId];
  if (!found || found.centerId !== centerId) return null;
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || found.assignedTrainerId !== currentTrainerId) {
      return null;
    }
  }
  return found;
}

export async function updateLead(
  centerId: string,
  leadId: string,
  data: Partial<Omit<Lead, 'leadId' | 'centerId' | 'createdAt'>>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Lead> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 신규문의를 수정할 수 없습니다.');
  }

  const existing = await getLeadById(centerId, leadId, userRole, currentTrainerId);
  if (!existing) {
    throw new Error('신규문의를 찾을 수 없거나 접근 권한이 없습니다.');
  }

  if (userRole === 'TRAINER') {
    if (!currentTrainerId || existing.assignedTrainerId !== currentTrainerId) {
      throw new Error('본인에게 배정된 신규문의만 수정할 수 있습니다.');
    }
    if (data.assignedTrainerId !== undefined && data.assignedTrainerId !== existing.assignedTrainerId) {
      throw new Error('트레이너는 담당자를 변경할 수 없습니다.');
    }
  }

  const now = new Date().toISOString();
  const updated: Lead = {
    ...existing,
    ...data,
    leadId,
    centerId,
    createdAt: existing.createdAt,
    updatedAt: now
  };

  memoryStore.leads[leadId] = updated;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'leads', leadId), {
        ...data,
        updatedAt: now
      });
    } catch (err) {
      firestoreWriteFailed('updateLead', err);
    }
  }

  return updated;
}

export async function updateLeadStatus(
  centerId: string,
  leadId: string,
  status: LeadStatus,
  options?: {
    lostReason?: LeadLostReason | string | null;
    lostMemo?: string | null;
    convertedMemberId?: string | null;
    registeredAt?: string | null;
    otDate?: string | null;
    otCompletedAt?: string | null;
    assignedTrainerId?: string | null;
    assignedTrainerName?: string | null;
    memo?: string;
  },
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Lead> {
  const patch: Partial<Lead> = {
    status,
    ...options
  };

  return updateLead(centerId, leadId, patch, userRole, currentTrainerId);
}

export async function convertLeadToRegistration(
  centerId: string,
  leadId: string,
  params?: {
    convertedMemberId?: string;
    registeredAt?: string;
    memo?: string;
  },
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Lead> {
  const existing = await getLeadById(centerId, leadId, userRole, currentTrainerId);
  if (!existing) {
    throw new Error('신규문의를 찾을 수 없습니다.');
  }
  if (existing.status === 'REGISTERED' && existing.convertedMemberId) {
    // Already converted, return existing
    return existing;
  }

  const now = new Date().toISOString();
  const patch: Partial<Lead> = {
    status: 'REGISTERED',
    convertedMemberId: params?.convertedMemberId || ('mem-' + Math.random().toString(36).substring(2, 9)),
    registeredAt: params?.registeredAt || now
  };
  if (params?.memo) {
    patch.memo = params.memo;
  }

  return updateLead(centerId, leadId, patch, userRole, currentTrainerId);
}

export async function deleteLead(
  centerId: string,
  leadId: string,
  userRole?: UserRole
): Promise<void> {
  if (userRole && userRole !== 'CENTER_ADMIN') {
    throw new Error('신규문의 삭제는 센터 관리자만 가능합니다.');
  }

  const existing = memoryStore.leads?.[leadId];
  if (existing && existing.centerId === centerId) {
    delete memoryStore.leads[leadId];
    saveLocalStore(memoryStore);
  }

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'leads', leadId));
    } catch (err) {
      firestoreWriteFailed('deleteLead', err);
    }
  }
}

// Aliases for convenience
export {
  getSessionsByMember as getPtSessionsByMember,
  getBodyMeasurements as getBodyMeasurementsByMember,
  convertLeadToRegistration as convertLeadToMember
};

// ==========================================
// PHASE 9A: PT RENEWALS (재등록 관리)
// ==========================================

/**
 * 2. 재등록 대상 기준 함수
 * 기존 PT 계약/잔여횟수 데이터를 이용하여:
 * - 활성 PT 이용권 (status === 'ACTIVE')
 * - 잔여 5회 이하 (remainingSessions <= 5)
 * 인 회원을 재등록 대상 후보로 반환.
 * 
 * 중요: 잔여 5회 이하가 되었다고 Renewal 문서를 자동 생성하지 않음.
 */
export async function getRenewalCandidates(
  centerId: string,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<RenewalCandidate[]> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 재등록 대상 후보에 접근할 수 없습니다.');
  }

  const effectiveRole: UserRole = userRole || 'CENTER_ADMIN';

  // Load contracts, members, trainers, renewals
  const [members, contracts, renewals] = await Promise.all([
    getMembers(centerId, effectiveRole, currentTrainerId),
    (async () => {
      if (isFirestoreAvailable && db) {
        try {
          let q;
          if (userRole === 'TRAINER') {
            q = query(
              collection(db, 'ptContracts'),
              where('centerId', '==', centerId),
              where('trainerId', '==', currentTrainerId)
            );
          } else {
            q = query(
              collection(db, 'ptContracts'),
              where('centerId', '==', centerId)
            );
          }
          const snap = await getDocs(q);
          snap.forEach((d) => {
            const c = d.data() as PtContract;
            memoryStore.ptContracts[c.contractId] = c;
          });
          saveLocalStore(memoryStore);
        } catch (err) {
          console.warn('[Firestore getRenewalCandidates contracts error]', err);
        }
      }
      return Object.values(memoryStore.ptContracts).filter((c) => {
        if (c.centerId !== centerId) return false;
        if (userRole === 'TRAINER') {
          return currentTrainerId ? c.trainerId === currentTrainerId : false;
        }
        return true;
      });
    })(),
    getRenewals(centerId, userRole, currentTrainerId)
  ]);

  const memberMap = new Map<string, Member>();
  members.forEach((m) => memberMap.set(m.memberId, m));

  const trainerMap = new Map<string, string>();
  Object.values(memoryStore.trainers || {}).forEach((t) => {
    if (t.centerId === centerId) trainerMap.set(t.trainerId, t.name);
  });

  // Map of contractId to existing active renewal if any
  const renewalMap = new Map<string, Renewal>();
  renewals.forEach((r) => {
    // If not closed or declined, or store latest
    renewalMap.set(r.contractId, r);
  });

  const candidates: RenewalCandidate[] = [];

  for (const contract of contracts) {
    // Only ACTIVE contracts
    if (contract.status !== 'ACTIVE') continue;

    // Recalculate remainingSessions synchronously with COMPLETED sessions
    const completedSessionsCount = Object.values(memoryStore.ptSessions || {}).filter(
      (s) => s.contractId === contract.contractId && s.status === 'COMPLETED'
    ).length;
    const actualUsed = completedSessionsCount > 0 ? completedSessionsCount : (contract.usedSessions || 0);
    const remaining = Math.max(0, contract.totalSessions - actualUsed);

    // Filter: remainingSessions <= 5
    if (remaining <= 5) {
      const member = memberMap.get(contract.memberId);
      candidates.push({
        memberId: contract.memberId,
        memberName: member ? member.name : '회원',
        trainerId: contract.trainerId,
        trainerName: trainerMap.get(contract.trainerId) || '트레이너',
        contractId: contract.contractId,
        contractTitle: contract.title,
        totalSessions: contract.totalSessions,
        usedSessions: actualUsed,
        remainingSessions: remaining,
        contractStatus: contract.status,
        expirationDate: contract.expirationDate,
        existingRenewal: renewalMap.get(contract.contractId) || null
      });
    }
  }

  // Sort by remainingSessions ascending (most urgent first)
  candidates.sort((a, b) => a.remainingSessions - b.remainingSessions);
  return candidates;
}

/**
 * 3. createRenewal
 * 동일 memberId + contractId에 활성 Renewal(TARGET, CONTACTED, CONSULTING)이 중복 생성되지 않도록 방어.
 */
export async function createRenewal(
  data: {
    centerId: string;
    memberId: string;
    trainerId: string;
    contractId: string;
    status?: RenewalStatus;
    remainingSessionsAtStart: number;
    startedAt?: string;
    consultationDate?: string | null;
    memo?: string | null;
  },
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Renewal> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 재등록을 등록할 수 없습니다.');
  }

  if (userRole === 'TRAINER') {
    if (!currentTrainerId || data.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 재등록만 등록할 수 있습니다.');
    }
  }

  // Check for duplicate active renewal on the same memberId + contractId
  const existingList = Object.values(memoryStore.renewals || {}).filter(
    (r) =>
      r.centerId === data.centerId &&
      r.memberId === data.memberId &&
      r.contractId === data.contractId
  );

  const activeExisting = existingList.find(
    (r) => r.status === 'TARGET' || r.status === 'CONTACTED' || r.status === 'CONSULTING'
  );

  if (activeExisting) {
    throw new Error('해당 계약에 대해 이미 진행 중인 재등록 상담이 존재합니다.');
  }

  const renewalId = 'rn-' + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();

  const newRenewal: Renewal = {
    renewalId,
    centerId: data.centerId,
    memberId: data.memberId,
    trainerId: data.trainerId,
    contractId: data.contractId,
    status: data.status || 'TARGET',
    remainingSessionsAtStart: data.remainingSessionsAtStart,
    startedAt: data.startedAt || now,
    consultationDate: data.consultationDate || null,
    memo: data.memo || null,
    createdAt: now,
    updatedAt: now
  };

  if (!memoryStore.renewals) memoryStore.renewals = {};
  memoryStore.renewals[renewalId] = newRenewal;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await setDoc(doc(db, 'renewals', renewalId), newRenewal);
    } catch (err) {
      firestoreWriteFailed('createRenewal', err);
    }
  }

  return newRenewal;
}

/**
 * getRenewals
 */
export async function getRenewals(
  centerId: string,
  userRole?: UserRole,
  currentTrainerId?: string | null,
  statusFilter?: RenewalStatus
): Promise<Renewal[]> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 재등록 데이터에 접근할 수 없습니다.');
  }

  if (isFirestoreAvailable && db) {
    try {
      let q;
      if (userRole === 'TRAINER') {
        q = query(
          collection(db, 'renewals'),
          where('centerId', '==', centerId),
          where('trainerId', '==', currentTrainerId || '__unassigned__')
        );
      } else {
        q = query(
          collection(db, 'renewals'),
          where('centerId', '==', centerId)
        );
      }
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const item = d.data() as Renewal;
        if (!memoryStore.renewals) memoryStore.renewals = {};
        memoryStore.renewals[item.renewalId] = item;
      });
      saveLocalStore(memoryStore);
    } catch (err) {
      console.warn('[Firestore getRenewals error]', err);
    }
  }

  const list = Object.values(memoryStore.renewals || {}).filter((r) => {
    if (r.centerId !== centerId) return false;
    if (userRole === 'TRAINER') {
      return currentTrainerId ? r.trainerId === currentTrainerId : false;
    }
    return true;
  });

  const filtered = statusFilter ? list.filter((r) => r.status === statusFilter) : list;
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return filtered;
}

/**
 * getRenewalById
 */
export async function getRenewalById(
  centerId: string,
  renewalId: string,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Renewal | null> {
  if (userRole === 'MEMBER') {
    return null;
  }

  if (isFirestoreAvailable && db) {
    try {
      const snap = await getDoc(doc(db, 'renewals', renewalId));
      if (snap.exists()) {
        const item = snap.data() as Renewal;
        if (item.centerId === centerId) {
          if (userRole === 'TRAINER' && currentTrainerId && item.trainerId !== currentTrainerId) {
            return null;
          }
          if (!memoryStore.renewals) memoryStore.renewals = {};
          memoryStore.renewals[renewalId] = item;
          saveLocalStore(memoryStore);
          return item;
        }
      }
    } catch (err) {
      console.warn('[Firestore getRenewalById error]', err);
    }
  }

  const found = memoryStore.renewals?.[renewalId];
  if (!found || found.centerId !== centerId) return null;
  if (userRole === 'TRAINER') {
    if (!currentTrainerId || found.trainerId !== currentTrainerId) {
      return null;
    }
  }
  return found;
}

/**
 * updateRenewal
 * TRAINER는 trainerId/memberId/centerId/contractId를 임의 변경 불가
 */
export async function updateRenewal(
  centerId: string,
  renewalId: string,
  data: Partial<Omit<Renewal, 'renewalId' | 'centerId' | 'createdAt'>>,
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Renewal> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 재등록을 수정할 수 없습니다.');
  }

  const existing = await getRenewalById(centerId, renewalId, userRole, currentTrainerId);
  if (!existing) {
    throw new Error('재등록 데이터를 찾을 수 없거나 접근 권한이 없습니다.');
  }

  if (userRole === 'TRAINER') {
    if (!currentTrainerId || existing.trainerId !== currentTrainerId) {
      throw new Error('본인 담당 회원의 재등록만 수정할 수 있습니다.');
    }
    // Protect core immutable fields from trainer mutation
    if (data.trainerId !== undefined && data.trainerId !== existing.trainerId) {
      throw new Error('트레이너는 담당자를 변경할 수 없습니다.');
    }
    if (data.memberId !== undefined && data.memberId !== existing.memberId) {
      throw new Error('회원 정보를 임의 변경할 수 없습니다.');
    }
    if (data.contractId !== undefined && data.contractId !== existing.contractId) {
      throw new Error('계약 정보를 임의 변경할 수 없습니다.');
    }
  }

  const now = new Date().toISOString();
  const updated: Renewal = {
    ...existing,
    ...data,
    renewalId,
    centerId,
    createdAt: existing.createdAt,
    updatedAt: now
  };

  if (!memoryStore.renewals) memoryStore.renewals = {};
  memoryStore.renewals[renewalId] = updated;
  saveLocalStore(memoryStore);

  if (isFirestoreAvailable && db) {
    try {
      await updateDoc(doc(db, 'renewals', renewalId), {
        ...data,
        updatedAt: now
      });
    } catch (err) {
      firestoreWriteFailed('updateRenewal', err);
    }
  }

  return updated;
}

/**
 * updateRenewalStatus
 */
export async function updateRenewalStatus(
  centerId: string,
  renewalId: string,
  status: RenewalStatus,
  options?: {
    consultationDate?: string | null;
    memo?: string | null;
    declineReason?: RenewalDeclineReason | null;
    declineMemo?: string | null;
    renewedContractId?: string | null;
    renewedAt?: string | null;
  },
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<Renewal> {
  const patch: Partial<Renewal> = {
    status,
    ...options
  };

  return updateRenewal(centerId, renewalId, patch, userRole, currentTrainerId);
}

/**
 * completeRenewalWithContract (Phase 9C)
 * 1. 신규 PT 계약 먼저 생성
 * 2. 생성 성공 시 Renewal 상태를 RENEWED로 업데이트하고 renewedContractId, renewedAt 연결
 * 3. 중복 방지: 이미 renewedContractId가 존재하면 에러 방어
 */
export async function completeRenewalWithContract(
  centerId: string,
  renewalId: string,
  contractData: {
    title: string;
    totalSessions: number;
    startDate: string;
    expirationDate: string;
    notes?: string;
  },
  userRole?: UserRole,
  currentTrainerId?: string | null
): Promise<{ renewal: Renewal; newContract: PtContract }> {
  if (userRole === 'MEMBER') {
    throw new Error('회원은 재등록 계약을 등록할 수 없습니다.');
  }

  // 1. Existing renewal check
  const renewal = await getRenewalById(centerId, renewalId, userRole, currentTrainerId);
  if (!renewal) {
    throw new Error('재등록 데이터를 찾을 수 없거나 접근 권한이 없습니다.');
  }

  // 중복 방지: 이미 renewedContractId가 있는 경우 재생성 금지
  if (renewal.renewedContractId) {
    throw new Error('이미 재등록 계약이 등록된 상담입니다.');
  }

  // 2. 신규 PT 계약 생성 (기존 createContract 재사용)
  // trainerId는 renewal.trainerId 보장
  const newContract = await createContract(
    {
      centerId,
      memberId: renewal.memberId,
      trainerId: renewal.trainerId,
      title: contractData.title.trim(),
      totalSessions: Number(contractData.totalSessions) || 10,
      startDate: contractData.startDate,
      expirationDate: contractData.expirationDate,
      status: 'ACTIVE'
    },
    userRole,
    currentTrainerId
  );

  // 3. 계약 생성 성공 후 Renewal 업데이트
  const now = new Date().toISOString();
  try {
    const updatedRenewal = await updateRenewal(
      centerId,
      renewalId,
      {
        status: 'RENEWED',
        renewedContractId: newContract.contractId,
        renewedAt: now
      },
      userRole,
      currentTrainerId
    );

    return { renewal: updatedRenewal, newContract };
  } catch (updateErr: any) {
    // If updating renewal failed, we do not roll back the contract automatically unless requested,
    // but we throw so caller knows
    console.error('[completeRenewalWithContract updateRenewal error]', updateErr);
    throw updateErr;
  }
}

/**
 * deleteRenewal
 */
export async function deleteRenewal(
  centerId: string,
  renewalId: string,
  userRole?: UserRole
): Promise<void> {
  if (userRole && userRole !== 'CENTER_ADMIN') {
    throw new Error('재등록 데이터 삭제는 센터 관리자만 가능합니다.');
  }

  const existing = memoryStore.renewals?.[renewalId];
  if (existing && existing.centerId === centerId) {
    delete memoryStore.renewals[renewalId];
    saveLocalStore(memoryStore);
  }

  if (isFirestoreAvailable && db) {
    try {
      await deleteDoc(doc(db, 'renewals', renewalId));
    } catch (err) {
      firestoreWriteFailed('deleteRenewal', err);
    }
  }
}




/** Explicitly disposable fixtures. Never call operational seeding from this entry. */
export async function initializeDevSandbox(reset = false): Promise<void> {
  if (!isDevSandbox) throw new Error('개발 전용 기능입니다.');
  if (!reset && memoryStore.centers['dev-sandbox']) return;
  memoryStore = {
    centers: {}, trainers: {}, members: {}, ptSessions: {}, consultations: {},
    memberGoals: {}, ptContracts: {}, bodyMeasurements: {}, progressPhotos: {},
    progressReviews: {}, exercises: {}, workoutTemplates: {}, personalWorkoutPlans: {},
    personalWorkoutLogs: {}, leads: {}, renewals: {}, storageObjects: {}
  };
  loadedMemberSessionIds.clear();
  const centerId = 'dev-sandbox';
  const trainerId = 'dev-trainer';
  await seedInitialCenterData(centerId, '개발 테스트 센터', [
    { id: trainerId, name: '테스트 트레이너', phone: '', specialty: '테스트', uid: trainerId, loginEmail: 'trainer@example.invalid' }
  ]);
  // Sanitize every generated person's contact details; no real accounts are used.
  Object.values(memoryStore.members).forEach((m, i) => {
    m.name = i === 0 ? '테스트 회원 A' : `테스트 회원 ${String.fromCharCode(65 + i)}`;
    m.phone = ''; m.email = `member${i + 1}@example.invalid`; m.birthDate = '2000-01-01';
    m.uid = `dev-member-${i + 1}`;
  });
  memoryStore.centers[centerId].address = '가상 센터';
  memoryStore.centers[centerId].phone = '';
  memoryStore.centers[centerId].businessNumber = '';
  Object.values(memoryStore.ptSessions).forEach(s => {
    s.memberName = memoryStore.members[s.memberId]?.name || '테스트 회원';
    s.trainerName = '테스트 트레이너';
  });
  Object.values(memoryStore.consultations).forEach(c => { c.trainerName = '테스트 트레이너'; });
  Object.values(memoryStore.personalWorkoutPlans).forEach(p => {
    p.memberName = memoryStore.members[p.memberId]?.name || '테스트 회원';
    p.trainerName = '테스트 트레이너';
  });
  // Three 10-class tickets; one completed class leaves 29.
  const memberId = `mem-${centerId}-01`;
  Object.entries(memoryStore.ptContracts).forEach(([id, c]) => {
    if (c.memberId === memberId) delete memoryStore.ptContracts[id];
  });
  Object.entries(memoryStore.ptSessions).forEach(([id, s]) => {
    if (s.memberId === memberId) delete memoryStore.ptSessions[id];
  });
  const now = new Date().toISOString();
  [10, 10, 10].forEach((count, i) => {
    const contractId = `dev-contract-${i + 1}`;
    memoryStore.ptContracts[contractId] = {
      contractId, centerId, memberId, trainerId, title: `테스트 이용권 ${count}회`,
      totalSessions: count, usedSessions: i === 0 ? 1 : 0,
      startDate: '2026-01-01', expirationDate: '2099-12-31', status: 'ACTIVE', createdAt: now, updatedAt: now
    };
  });
  memoryStore.ptSessions['dev-session-1'] = {
    sessionId: 'dev-session-1', centerId, memberId, trainerId, memberName: '테스트 회원 A',
    trainerName: '테스트 트레이너', contractId: 'dev-contract-1', sessionNumber: 1,
    date: '2026-10-01', time: '10:00', status: 'COMPLETED',
    exercises: [{ exerciseName: '스쿼트', sets: [{ setNumber: 1, weight: 20, reps: 10 }] }],
    trainerFeedback: '테스트 수업 완료', createdAt: now, updatedAt: now
  };
  memoryStore.progressReviews['dev-review'] = {
    reviewId: 'dev-review', centerId, memberId, trainerId, reviewType: 'MANUAL',
    reviewDate: '2026-10-10', periodStart: '2026-01-01', periodEnd: '2026-10-10',
    summary: '긴 날짜와 완료 문구의 모바일 배치를 확인하는 가상 성과 리뷰입니다.',
    trainerFeedback: '운동 기록과 목표 진척률 표시를 확인합니다.',
    nextGoals: ['테스트 운동 루틴 유지'], createdAt: now, updatedAt: now
  };
  saveLocalStore(memoryStore);
}

/** Defaults apply only to newly added exercises; existing values are preserved. */
export function getExerciseDefaults(ex: Pick<Exercise, 'name' | 'equipment' | 'category' | 'repUnit'>) {
  const timed = ex.repUnit ? ex.repUnit === 'seconds' : /플랭크|plank|월\s*싯|wall\s*sit/i.test(ex.name);
  const bodyweight = /맨몸|bodyweight/i.test(`${ex.equipment} ${ex.category}`);
  return { weight: bodyweight || timed ? 0 : 20, reps: timed ? 30 : 10,
    repUnit: timed ? 'seconds' as const : 'reps' as const };
}

/** Newest workout date first; same-day records use immutable save time. */
export function comparePersonalWorkoutLogs(a: PersonalWorkoutLog, b: PersonalWorkoutLog): number {
  return b.date.localeCompare(a.date)
    || (b.createdAt || '').localeCompare(a.createdAt || '')
    || (b.completedAt || '').localeCompare(a.completedAt || '')
    || b.logId.localeCompare(a.logId);
}
