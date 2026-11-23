import type { Lead, UserRole } from '../types';

export function assertLeadStaff(role?: UserRole, trainerId?: string | null) {
  if (role !== 'CENTER_ADMIN' && (role !== 'TRAINER' || !trainerId)) {
    throw new Error('센터 관리자 또는 연결된 트레이너 계정이 필요합니다.');
  }
}

export function assertLeadUpdate(existing: Lead, updates: Partial<Lead>, role?: UserRole, trainerId?: string | null) {
  assertLeadStaff(role, trainerId);
  if (role === 'CENTER_ADMIN') return;
  const own = existing.assignedTrainerId === trainerId;
  const allowed = own
    ? ['status', 'memo', 'otDate', 'otCompletedAt', 'lostReason', 'lostMemo', 'convertedMemberId', 'registeredAt', 'assignedTrainerId', 'assignedTrainerName']
    : ['assignedTrainerId', 'assignedTrainerName', 'otDate', 'status'];
  const changed = (Object.keys(updates) as (keyof Lead)[]).filter((key) => updates[key] !== existing[key]);
  if (changed.some((key) => !allowed.includes(key))) throw new Error('다른 담당자의 OT는 담당자 배정·변경만 가능합니다.');
  if (!own && updates.status && updates.status !== existing.status &&
      !(['NEW', 'CONSULTING'].includes(existing.status) && updates.status === 'OT_SCHEDULED')) {
    throw new Error('OT 기록 수정·완료는 담당 트레이너 또는 관리자만 가능합니다.');
  }
}
