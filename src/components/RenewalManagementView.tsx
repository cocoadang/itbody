import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getRenewalCandidates,
  getRenewals,
  createRenewal,
  getMembers,
  getTrainers
} from '../services/dataService';
import type {
  Renewal,
  RenewalCandidate,
  RenewalStatus,
  Member,
  Trainer,
  PtContract
} from '../types';
import {
  RenewalModal,
  RENEWAL_STATUS_CONFIG,
  DECLINE_REASON_LABELS
} from './RenewalModal';
import { RenewalContractModal } from './RenewalContractModal';
import { RenewalPerformanceDashboard } from './RenewalPerformanceDashboard';
import { EmptyState } from './EmptyState';
import {
  RotateCcw,
  Sparkles,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  PlayCircle,
  Edit2,
  ShieldAlert,
  Loader2,
  FileCheck,
  Eye,
  TrendingUp
} from 'lucide-react';

interface RenewalManagementViewProps {
  onSelectMember?: (memberId: string) => void;
}

export type RenewalFilterStatus = 'ALL' | 'IN_PROGRESS' | RenewalStatus;

const STATUS_FILTER_OPTIONS: {
  value: RenewalFilterStatus;
  label: string;
}[] = [
  { value: 'ALL', label: '전체' },
  { value: 'IN_PROGRESS', label: '진행중' },
  { value: 'TARGET', label: '대상' },
  { value: 'CONTACTED', label: '상담예정' },
  { value: 'CONSULTING', label: '상담중' },
  { value: 'RENEWED', label: '재등록완료' },
  { value: 'DECLINED', label: '거절' },
  { value: 'CLOSED', label: '종료' }
];

export const RenewalManagementView: React.FC<RenewalManagementViewProps> = ({
  onSelectMember
}) => {
  const { currentUser } = useAuth();
  const currentCenterId = currentUser?.centerId || 'center-main';
  const [candidates, setCandidates] = useState<RenewalCandidate[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeSubTab, setActiveSubTab] = useState<'management' | 'analytics'>('management');
  const [statusFilter, setStatusFilter] = useState<RenewalFilterStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRenewal, setSelectedRenewal] = useState<Renewal | null>(null);

  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [contractModalRenewal, setContractModalRenewal] = useState<Renewal | null>(null);

  const isCenterAdmin = currentUser?.role === 'CENTER_ADMIN';

  const fetchData = useCallback(async () => {
    if (!currentUser) return;
    if (currentUser.role === 'MEMBER') {
      setError('회원 권한으로는 재등록 관리에 접근할 수 없습니다.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [candidatesData, renewalsData, membersData, trainersData] =
        await Promise.all([
          getRenewalCandidates(
            currentCenterId,
            currentUser.role,
            currentUser.trainerId
          ),
          getRenewals(
            currentCenterId,
            currentUser.role,
            currentUser.trainerId
          ),
          getMembers(
            currentCenterId,
            currentUser.role,
            currentUser.trainerId
          ),
          getTrainers(currentCenterId)
        ]);

      setCandidates(candidatesData);
      setRenewals(renewalsData);
      setMembers(membersData);
      setTrainers(trainersData);
    } catch (err: any) {
      console.error('[RenewalManagementView] fetch error:', err);
      setError(err?.message || '재등록 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [currentUser, currentCenterId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lookup Maps
  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((m) => map.set(m.memberId, m));
    return map;
  }, [members]);

  const trainerMap = useMemo(() => {
    const map = new Map<string, string>();
    trainers.forEach((t) => map.set(t.trainerId, t.name));
    return map;
  }, [trainers]);

  // Active Renewal Candidates:
  // Exclude candidates if an active renewal (TARGET, CONTACTED, CONSULTING) or RENEWED exists on the contract
  const pendingCandidates = useMemo(() => {
    return candidates
      .filter((c) => {
        if (!c.existingRenewal) return true;
        const activeStatuses: RenewalStatus[] = [
          'TARGET',
          'CONTACTED',
          'CONSULTING',
          'RENEWED'
        ];
        return !activeStatuses.includes(c.existingRenewal.status);
      })
      .sort((a, b) => a.remainingSessions - b.remainingSessions); // 0 -> 1 -> 2 -> ... -> 5
  }, [candidates]);

  // Summary counts
  const summaryCounts = useMemo(() => {
    const candidateCount = pendingCandidates.length;
    const inProgressCount = renewals.filter((r) =>
      ['TARGET', 'CONTACTED', 'CONSULTING'].includes(r.status)
    ).length;
    const renewedCount = renewals.filter((r) => r.status === 'RENEWED').length;
    const declinedCount = renewals.filter((r) => r.status === 'DECLINED').length;

    return {
      candidateCount,
      inProgressCount,
      renewedCount,
      declinedCount
    };
  }, [pendingCandidates, renewals]);

  // Filtered renewals list
  const filteredRenewals = useMemo(() => {
    return renewals.filter((r) => {
      // Status filter
      if (statusFilter === 'IN_PROGRESS') {
        if (!['TARGET', 'CONTACTED', 'CONSULTING'].includes(r.status)) {
          return false;
        }
      } else if (statusFilter !== 'ALL' && r.status !== statusFilter) {
        return false;
      }

      // Search query (member name, trainer name, memo)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const memName = (memberMap.get(r.memberId)?.name || '').toLowerCase();
        const trName = (trainerMap.get(r.trainerId) || '').toLowerCase();
        const memoText = (r.memo || '').toLowerCase();
        const declineMemoText = (r.declineMemo || '').toLowerCase();

        return (
          memName.includes(query) ||
          trName.includes(query) ||
          memoText.includes(query) ||
          declineMemoText.includes(query)
        );
      }

      return true;
    });
  }, [renewals, statusFilter, searchQuery, memberMap, trainerMap]);

  // Handle KPI summary card click (smooth scroll & filter)
  const handleCardClick = (target: 'CANDIDATES' | 'IN_PROGRESS' | 'RENEWED' | 'DECLINED') => {
    setActiveSubTab('management');

    if (target === 'CANDIDATES') {
      const el = document.getElementById('renewal-candidates-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    if (target === 'IN_PROGRESS') {
      setStatusFilter('IN_PROGRESS');
    } else if (target === 'RENEWED') {
      setStatusFilter('RENEWED');
    } else if (target === 'DECLINED') {
      setStatusFilter('DECLINED');
    }

    setTimeout(() => {
      const el = document.getElementById('renewal-tasks-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  // Start renewal management for a candidate
  const handleStartRenewal = async (candidate: RenewalCandidate) => {
    if (!currentUser) return;
    setActionLoading(candidate.contractId);
    setError(null);
    try {
      const created = await createRenewal(
        {
          centerId: currentCenterId,
          memberId: candidate.memberId,
          trainerId: candidate.trainerId,
          contractId: candidate.contractId,
          remainingSessionsAtStart: candidate.remainingSessions,
          status: 'TARGET'
        },
        currentUser.role,
        currentUser.trainerId
      );

      // Refresh data to reflect candidate moving to renewal list
      await fetchData();

      // Open modal so user can immediately record consultation or date
      setSelectedRenewal(created);
      setIsModalOpen(true);
    } catch (err: any) {
      console.error('[handleStartRenewal error]', err);
      setError(err?.message || '재등록 관리 시작 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenEditModal = (r: Renewal) => {
    setSelectedRenewal(r);
    setIsModalOpen(true);
  };

  const handleOpenContractModal = (r: Renewal) => {
    setContractModalRenewal(r);
    setIsContractModalOpen(true);
  };

  const handleViewContract = (contractId: string, memberId: string) => {
    if (onSelectMember) {
      onSelectMember(memberId);
    }
  };

  if (currentUser?.role === 'MEMBER') {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 shadow-xs max-w-lg mx-auto">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-stone-900 mb-1">접근 권한 제한</h3>
        <p className="text-xs text-stone-500">
          회원 계정은 재등록 관리 페이지에 접근할 수 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">
              PT 재등록 관리
            </h1>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                isCenterAdmin
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-300'
              }`}
            >
              {isCenterAdmin ? '센터 전체' : `${currentUser?.name} 트레이너 담당`}
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            잔여 PT 5회 이하 회원을 조기에 발굴하고, 재등록 상담부터 신규 계약 체결까지 원스톱으로 연결합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-300 hover:bg-stone-50 text-xs font-semibold text-stone-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>새로고침</span>
        </button>
      </div>

      {/* Sub Tabs: 재등록 상담 목록 / 재등록 성과 분석 */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
        <button
          type="button"
          id="renewal-subtab-management"
          onClick={() => setActiveSubTab('management')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'management'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>재등록 상담 및 목록</span>
        </button>
        <button
          type="button"
          id="renewal-subtab-analytics"
          onClick={() => setActiveSubTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'analytics'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>재등록 성과 분석</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {activeSubTab === 'analytics' ? (
        <RenewalPerformanceDashboard onRefreshParent={fetchData} />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 재등록 후보 */}
            <button
              type="button"
              id="kpi-card-candidates"
              onClick={() => handleCardClick('CANDIDATES')}
              className="text-left bg-white p-4 rounded-2xl border border-amber-200/70 shadow-xs hover:border-amber-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-500 group-hover:text-amber-800 transition-colors">
                  재등록 대상 후보
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                  {summaryCounts.candidateCount}
                </span>
                <span className="text-xs text-stone-500 font-medium">명</span>
              </div>
              <p className="text-[11px] text-amber-700 font-medium mt-1">
                잔여 5회 이하 미상담
              </p>
            </button>

            {/* 상담 진행중 */}
            <button
              type="button"
              id="kpi-card-in-progress"
              onClick={() => handleCardClick('IN_PROGRESS')}
              className="text-left bg-white p-4 rounded-2xl border border-blue-200/70 shadow-xs hover:border-blue-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-500 group-hover:text-blue-800 transition-colors">
                  상담 진행중
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                  {summaryCounts.inProgressCount}
                </span>
                <span className="text-xs text-stone-500 font-medium">건</span>
              </div>
              <p className="text-[11px] text-blue-700 font-medium mt-1">
                대상 · 상담예정 · 상담중
              </p>
            </button>

            {/* 재등록 완료 */}
            <button
              type="button"
              id="kpi-card-renewed"
              onClick={() => handleCardClick('RENEWED')}
              className="text-left bg-white p-4 rounded-2xl border border-emerald-200/70 shadow-xs hover:border-emerald-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-500 group-hover:text-emerald-800 transition-colors">
                  재등록 완료
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                  {summaryCounts.renewedCount}
                </span>
                <span className="text-xs text-stone-500 font-medium">건</span>
              </div>
              <p className="text-[11px] text-emerald-700 font-medium mt-1">
                신규 계약 체결 완료
              </p>
            </button>

            {/* 거절 */}
            <button
              type="button"
              id="kpi-card-declined"
              onClick={() => handleCardClick('DECLINED')}
              className="text-left bg-white p-4 rounded-2xl border border-stone-200 shadow-xs hover:border-stone-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-500 group-hover:text-rose-700 transition-colors">
                  재등록 거절
                </span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center group-hover:bg-rose-100 transition-colors">
                  <XCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                  {summaryCounts.declinedCount}
                </span>
                <span className="text-xs text-stone-500 font-medium">건</span>
              </div>
              <p className="text-[11px] text-stone-500 font-medium mt-1">
                거절 사유 기록됨
              </p>
            </button>
          </div>

          {/* 화면 상단 — 재등록 대상 후보 */}
          <section id="renewal-candidates-section" className="bg-white rounded-2xl border border-amber-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    재등록 대상 후보 (잔여 5회 이하)
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      {pendingCandidates.length}명
                    </span>
                  </h2>
                  <p className="text-[11px] text-stone-600">
                    활성 이용권의 잔여 세션이 5회 이하인 회원 목록입니다. 잔여 횟수가 적은 순으로 정렬됩니다.
                  </p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-stone-500 text-xs">
                <Loader2 className="w-6 h-6 animate-spin text-stone-700" />
                <span>재등록 대상 후보를 조회하는 중...</span>
              </div>
            ) : pendingCandidates.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="font-semibold text-stone-800">
                  현재 재등록 상담이 필요한 잔여 5회 이하 회원이 없습니다.
                </p>
                <p className="text-stone-400 mt-0.5">
                  이미 상담이 시작되었거나 잔여 횟수가 충분합니다.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table View (Hidden on mobile) */}
                <div className="hidden md:block divide-y divide-stone-100 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-stone-50/75 border-b border-stone-200 text-[11px] font-semibold text-stone-500">
                        <th className="py-3 px-4">회원명</th>
                        <th className="py-3 px-4">담당 트레이너</th>
                        <th className="py-3 px-4">현재 이용권</th>
                        <th className="py-3 px-4 text-center">총 횟수</th>
                        <th className="py-3 px-4 text-center">잔여 횟수</th>
                        <th className="py-3 px-4">종료 예정일</th>
                        <th className="py-3 px-4 text-right">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {pendingCandidates.map((candidate) => {
                        const isOperating = actionLoading === candidate.contractId;
                        const isZeroRemaining = candidate.remainingSessions === 0;

                        return (
                          <tr
                            key={`cand-${candidate.contractId}`}
                            className="hover:bg-amber-50/30 transition-colors"
                          >
                            <td className="py-3.5 px-4 font-bold text-stone-900">
                              {onSelectMember ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectMember(candidate.memberId)}
                                  className="hover:text-blue-600 hover:underline transition-colors cursor-pointer text-left font-bold"
                                >
                                  {candidate.memberName}
                                </button>
                              ) : (
                                candidate.memberName
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-stone-600">
                              {candidate.trainerName ||
                                trainerMap.get(candidate.trainerId) ||
                                '-'}
                            </td>
                            <td className="py-3.5 px-4 text-stone-700 font-medium truncate max-w-[150px]">
                              {candidate.contractTitle}
                            </td>
                            <td className="py-3.5 px-4 text-center text-stone-500 font-medium">
                              {candidate.totalSessions}회
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] ${
                                  isZeroRemaining
                                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}
                              >
                                {candidate.remainingSessions}회 잔여
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-stone-500 font-medium">
                              {candidate.expirationDate || '무기한'}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                id={`btn-start-renewal-${candidate.contractId}`}
                                onClick={() => handleStartRenewal(candidate)}
                                disabled={isOperating}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                {isOperating ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>생성 중...</span>
                                  </>
                                ) : (
                                  <>
                                    <PlayCircle className="w-3.5 h-3.5" />
                                    <span>재등록 관리 시작</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View (Visible on mobile only, hidden on md+) */}
                <div className="block md:hidden divide-y divide-stone-100">
                  {pendingCandidates.map((candidate) => {
                    const isOperating = actionLoading === candidate.contractId;
                    const isZeroRemaining = candidate.remainingSessions === 0;

                    return (
                      <div
                        key={`cand-mobile-${candidate.contractId}`}
                        className="p-4 space-y-3 bg-white hover:bg-amber-50/20 transition-colors"
                      >
                        {/* Header: 회원명 / 담당 트레이너 & 잔여 뱃지 */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {onSelectMember ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectMember(candidate.memberId)}
                                  className="font-bold text-stone-900 text-sm hover:text-blue-600 hover:underline cursor-pointer text-left"
                                >
                                  {candidate.memberName}
                                </button>
                              ) : (
                                <span className="font-bold text-stone-900 text-sm">
                                  {candidate.memberName}
                                </span>
                              )}
                              <span className="text-stone-300 text-xs">/</span>
                              <span className="text-xs text-stone-600">
                                {candidate.trainerName || trainerMap.get(candidate.trainerId) || '-'}
                              </span>
                            </div>
                            <p className="text-xs text-stone-500 font-medium mt-0.5">
                              {candidate.contractTitle}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              isZeroRemaining
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {candidate.remainingSessions}회 잔여
                          </span>
                        </div>

                        {/* Stats Grid: 총 횟수 & 잔여 횟수 */}
                        <div className="grid grid-cols-2 gap-2 bg-stone-50 rounded-xl p-3 border border-stone-100 text-xs">
                          <div>
                            <span className="text-[11px] text-stone-400 block mb-0.5">총 횟수</span>
                            <span className="font-semibold text-stone-800 text-sm">
                              {candidate.totalSessions}회
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-stone-400 block mb-0.5">잔여 횟수</span>
                            <span
                              className={`font-bold text-sm ${
                                isZeroRemaining ? 'text-rose-600' : 'text-amber-800'
                              }`}
                            >
                              {candidate.remainingSessions}회
                            </span>
                          </div>
                        </div>

                        {/* 종료 예정일 */}
                        <div className="flex items-center justify-between text-xs text-stone-600 px-0.5">
                          <span className="text-stone-400 text-[11px]">종료 예정일</span>
                          <span className="font-medium text-stone-800 font-mono">
                            {candidate.expirationDate || '무기한'}
                          </span>
                        </div>

                        {/* Action Button: Full-width button with ample touch target */}
                        <button
                          type="button"
                          id={`btn-mobile-start-renewal-${candidate.contractId}`}
                          onClick={() => handleStartRenewal(candidate)}
                          disabled={isOperating}
                          className="w-full py-2.5 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          {isOperating ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>생성 중...</span>
                            </>
                          ) : (
                            <>
                              <PlayCircle className="w-3.5 h-3.5 text-amber-400" />
                              <span>재등록 관리 시작</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* 재등록 관리 목록 */}
          <section id="renewal-tasks-section" className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        {/* Header & Filters */}
        <div className="p-4 sm:p-5 border-b border-stone-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                재등록 관리 목록
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                  {filteredRenewals.length}건
                </span>
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                상담 진행 상태와 계약 결과를 기록하고 관리합니다.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="회원명, 트레이너, 메모 검색"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 focus:bg-white transition-all"
              />
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {STATUS_FILTER_OPTIONS.map((opt) => {
              const isSelected = statusFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  id={`filter-tab-${opt.value}`}
                  onClick={() => setStatusFilter(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* List Content */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-stone-500 text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-stone-700" />
            <span>재등록 목록을 불러오는 중...</span>
          </div>
        ) : filteredRenewals.length === 0 ? (
          <div className="p-12 text-center text-xs text-stone-500">
            <EmptyState
              title="해당 조건의 재등록 상담 내역이 없습니다."
              description="상단의 재등록 대상 후보에서 [재등록 관리 시작]을 눌러 상담을 시작해보세요."
            />
          </div>
        ) : (
          <div className="divide-y divide-stone-100 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50/75 border-b border-stone-200 text-[11px] font-semibold text-stone-500">
                  <th className="py-3 px-4">회원명</th>
                  <th className="py-3 px-4">담당 트레이너</th>
                  <th className="py-3 px-4">상담 시작일</th>
                  <th className="py-3 px-4 text-center">시작 당시 잔여</th>
                  <th className="py-3 px-4 text-center">현재 상태</th>
                  <th className="py-3 px-4">상담일</th>
                  <th className="py-3 px-4">메모</th>
                  <th className="py-3 px-4 text-right">계약 / 상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredRenewals.map((r) => {
                  const m = memberMap.get(r.memberId);
                  const memName = m ? m.name : '회원';
                  const trName = trainerMap.get(r.trainerId) || '트레이너';
                  const isRenewed = r.status === 'RENEWED' || !!r.renewedContractId;
                  const stConfig = RENEWAL_STATUS_CONFIG[r.status] || {
                    label: r.status,
                    bg: 'bg-stone-100',
                    text: 'text-stone-700',
                    border: 'border-stone-300'
                  };

                  return (
                    <tr
                      key={r.renewalId}
                      className="hover:bg-stone-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-stone-900">
                        {onSelectMember ? (
                          <button
                            type="button"
                            onClick={() => onSelectMember(r.memberId)}
                            className="hover:text-blue-600 hover:underline transition-colors cursor-pointer text-left font-bold"
                          >
                            {memName}
                          </button>
                        ) : (
                          memName
                        )}
                      </td>
                      <td className="py-3 px-4 text-stone-600 font-medium">
                        {trName}
                      </td>
                      <td className="py-3 px-4 text-stone-500 font-mono text-[11px]">
                        {r.startedAt
                          ? r.startedAt.split('T')[0]
                          : r.createdAt.split('T')[0]}
                      </td>
                      <td className="py-3 px-4 text-center text-amber-700 font-bold text-[11px]">
                        {r.remainingSessionsAtStart}회
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] ${stConfig.bg} ${stConfig.text} border ${stConfig.border}`}
                        >
                          {stConfig.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-stone-600 font-medium">
                        {r.consultationDate ? (
                          <span className="font-mono text-[11px] text-stone-700">
                            {r.consultationDate}
                          </span>
                        ) : (
                          <span className="text-stone-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-stone-600 max-w-[200px] truncate">
                        {r.status === 'DECLINED' ? (
                          <div className="flex items-center gap-1">
                            <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[10px] font-bold shrink-0">
                              {r.declineReason
                                ? DECLINE_REASON_LABELS[r.declineReason]?.short ||
                                  r.declineReason
                                : '거절'}
                            </span>
                            <span className="truncate text-stone-500 text-[11px]">
                              {r.declineMemo || r.memo || '-'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px]">
                            {r.memo || <span className="text-stone-300">-</span>}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {isRenewed ? (
                            <button
                              type="button"
                              id={`btn-view-contract-${r.renewalId}`}
                              onClick={() => {
                                if (r.renewedContractId) {
                                  handleViewContract(r.renewedContractId, r.memberId);
                                } else {
                                  handleOpenEditModal(r);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
                              title="신규 체결된 계약 보기"
                            >
                              <Eye className="w-3 h-3 text-emerald-600" />
                              <span>계약 보기</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              id={`btn-register-contract-${r.renewalId}`}
                              onClick={() => handleOpenContractModal(r)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
                              title="재등록 신규 PT 계약 등록"
                            >
                              <FileCheck className="w-3 h-3" />
                              <span>계약 등록</span>
                            </button>
                          )}

                          <button
                            type="button"
                            id={`btn-edit-renewal-${r.renewalId}`}
                            onClick={() => handleOpenEditModal(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 text-stone-700 font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>상세</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>
      )}

      {/* Edit Modal */}
      <RenewalModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedRenewal(null);
        }}
        onSuccess={fetchData}
        onOpenContractModal={(r) => handleOpenContractModal(r)}
        onViewContract={(contractId, memberId) => handleViewContract(contractId, memberId)}
        renewal={selectedRenewal}
        memberName={
          selectedRenewal
            ? memberMap.get(selectedRenewal.memberId)?.name || '회원'
            : '회원'
        }
        trainerName={
          selectedRenewal
            ? trainerMap.get(selectedRenewal.trainerId) || '트레이너'
            : '트레이너'
        }
      />

      {/* Phase 9C: Renewal Contract Modal */}
      <RenewalContractModal
        isOpen={isContractModalOpen}
        onClose={() => {
          setIsContractModalOpen(false);
          setContractModalRenewal(null);
        }}
        onSuccess={async () => {
          await fetchData();
        }}
        renewal={contractModalRenewal}
        memberName={
          contractModalRenewal
            ? memberMap.get(contractModalRenewal.memberId)?.name || '회원'
            : '회원'
        }
        trainerName={
          contractModalRenewal
            ? trainerMap.get(contractModalRenewal.trainerId) || '트레이너'
            : '트레이너'
        }
      />
    </div>
  );
};
