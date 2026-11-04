import type { PtContract, PtSession } from '../types';

export interface ContractSessionSummary {
  /** 총 등록 횟수 (유효한 이용권 기준 합산) */
  totalSessions: number;
  /** 총 사용 횟수 (완료된 수업 기준 합산) */
  usedSessions: number;
  /** 총 잔여 횟수 (totalSessions - usedSessions, 0 이상) */
  remainingSessions: number;
  /** 진행률 (%) */
  completionRate: number;
  /** 활성 계약 목록 */
  activeContracts: PtContract[];
  /** 모든 계약 목록 (이력 포함) */
  allContracts: PtContract[];
  /** 우선순위 활성 계약 (현재 차감 대상 1순위) */
  priorityContract: PtContract | null;
}

/**
 * PT 이용권 우선순위 판별 함수 (SSOT)
 * 1) 잔여횟수가 남아있는 ACTIVE 계약 우선
 * 2) 만료일이 가장 빠른 계약 (오름차순)
 * 3) 시작일이 가장 빠른 계약 (오름차순)
 * 4) 생성일시가 가장 오래된 계약 (오름차순)
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

/**
 * PT 이용권 통합 집계 공통 함수 (SSOT)
 * 
 * 규칙:
 * 1. ACTIVE 상태인 유효 계약들의 totalSessions 합산
 * 2. 각 계약의 usedSessions (COMPLETED 수업 기준) 합산
 * 3. 총 잔여 횟수 = Math.max(0, totalSessions - usedSessions)
 * 4. 취소(CANCELLED), 만료(EXPIRED)된 계약은 사용 가능 횟수 집계에서 제외
 * 5. optional sessions 파라미터가 제공되면, COMPLETED 상태의 유효 세션 수와 contract.usedSessions를 동기화 검증
 */
export function calculateMemberContractSummary(
  contracts: PtContract[],
  sessions?: PtSession[]
): ContractSessionSummary {
  if (!contracts || contracts.length === 0) {
    return {
      totalSessions: 0,
      usedSessions: 0,
      remainingSessions: 0,
      completionRate: 0,
      activeContracts: [],
      allContracts: [],
      priorityContract: null
    };
  }

  // 1. 만약 sessions가 전달되었으면 각 계약별 COMPLETED 세션 수 엄밀 재계산 (Single Source of Truth)
  const normalizedContracts: PtContract[] = contracts.map((c) => {
    if (sessions && sessions.length > 0) {
      const completedCount = sessions.filter(
        (s) => s.contractId === c.contractId && s.status === 'COMPLETED'
      ).length;
      return {
        ...c,
        usedSessions: completedCount,
        status: completedCount >= c.totalSessions ? 'COMPLETED' : c.status
      };
    }
    return c;
  });

  // 2. 현재 유효한 이용권(ACTIVE) 필터링
  const activeContracts = normalizedContracts.filter((c) => c.status === 'ACTIVE');

  // 3. 총 등록 및 사용 횟수 합산 (유효 계약 기준)
  // 만약 모든 계약이 COMPLETED라면 전체 완료 상태로 표시
  const targetContracts = activeContracts.length > 0 ? activeContracts : normalizedContracts;

  const totalSessions = targetContracts.reduce((acc, c) => acc + (c.totalSessions || 0), 0);
  const usedSessions = targetContracts.reduce((acc, c) => acc + (c.usedSessions || 0), 0);
  const remainingSessions = Math.max(0, totalSessions - usedSessions);
  const completionRate = totalSessions > 0 ? Math.min(100, Math.round((usedSessions / totalSessions) * 100)) : 0;

  const priority = getPriorityContract(normalizedContracts);

  return {
    totalSessions,
    usedSessions,
    remainingSessions,
    completionRate,
    activeContracts,
    allContracts: normalizedContracts,
    priorityContract: priority
  };
}
