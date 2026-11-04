import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getRenewals, getTrainers } from '../services/dataService';
import type { Renewal, Trainer, RenewalDeclineReason, RenewalStatus } from '../types';
import { DECLINE_REASON_LABELS } from './RenewalModal';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import {
  RotateCcw,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  BarChart3,
  TrendingUp,
  Users,
  AlertCircle,
  HelpCircle,
  Filter,
  Check,
  ChevronRight
} from 'lucide-react';

export type DateRangeFilterType = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'CUSTOM';

// Format Date as YYYY-MM-DD
export function getLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Check if a renewal is completed (status === 'RENEWED' + contract or renewedAt verification)
export function isRenewalCompleted(r: Renewal): boolean {
  return r.status === 'RENEWED' && (Boolean(r.renewedContractId) || Boolean(r.renewedAt));
}

// Safely format rate percentage (0 denominator -> '0%')
export function formatRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  const pct = Math.round((numerator / denominator) * 100);
  return `${pct}%`;
}

// Filter renewals by date using startedAt (fallback to createdAt)
export function filterRenewalsByDate(
  renewals: Renewal[],
  startDate: string,
  endDate: string
): Renewal[] {
  return renewals.filter((r) => {
    const rawDate = r.startedAt || r.createdAt;
    if (!rawDate) return false;
    const date = rawDate.split('T')[0];
    return date >= startDate && date <= endDate;
  });
}

// Calculate Core KPIs
export function calculateRenewalKpis(renewals: Renewal[]) {
  const totalStarted = renewals.length;
  const inProgress = renewals.filter((r) =>
    ['TARGET', 'CONTACTED', 'CONSULTING'].includes(r.status)
  ).length;
  const renewed = renewals.filter(isRenewalCompleted).length;
  const declined = renewals.filter((r) => r.status === 'DECLINED').length;
  const closed = renewals.filter((r) => r.status === 'CLOSED').length;

  // Decided = RENEWED + DECLINED (TARGET/CONTACTED/CONSULTING and CLOSED excluded)
  const decided = renewed + declined;
  const renewalRate = formatRate(renewed, decided);

  return {
    totalStarted,
    inProgress,
    renewed,
    declined,
    closed,
    decided,
    renewalRate
  };
}

// Calculate Renewal Funnel Steps
export function calculateRenewalFunnel(renewals: Renewal[]) {
  const totalStarted = renewals.length;
  // Step 2: 상담 진행 (접촉 및 상담 착수된 건: TARGET 외의 모든 건)
  const inConsultation = renewals.filter((r) => r.status !== 'TARGET').length;
  // Step 3: 결과 확정 (RENEWED + DECLINED)
  const renewed = renewals.filter(isRenewalCompleted).length;
  const declined = renewals.filter((r) => r.status === 'DECLINED').length;
  const decided = renewed + declined;

  return [
    {
      label: '재등록 대상',
      count: totalStarted,
      stepRate: '100%',
      desc: '상담 시작된 전체 후보'
    },
    {
      label: '상담 진행',
      count: inConsultation,
      stepRate: formatRate(inConsultation, totalStarted),
      desc: '접촉 및 상담 착수'
    },
    {
      label: '결과 확정',
      count: decided,
      stepRate: formatRate(decided, inConsultation),
      desc: '재등록 완료 또는 고사'
    },
    {
      label: '재등록 완료',
      count: renewed,
      stepRate: formatRate(renewed, decided),
      desc: '신규 PT 계약 체결'
    }
  ];
}

// Calculate Decline Reason Distribution
export const ALL_DECLINE_REASONS: RenewalDeclineReason[] = [
  'PRICE',
  'TIME',
  'DISTANCE',
  'TRAINER',
  'STOP_EXERCISE',
  'OTHER_CENTER',
  'OTHER'
];

export function calculateDeclineReasonStats(renewals: Renewal[]) {
  const declinedList = renewals.filter((r) => r.status === 'DECLINED');
  const totalDeclined = declinedList.length;

  return ALL_DECLINE_REASONS.map((key) => {
    const matched = declinedList.filter((r) => r.declineReason === key);
    const count = matched.length;
    const rate = formatRate(count, totalDeclined);
    const info = DECLINE_REASON_LABELS[key] || { short: key, label: key };
    return {
      reasonKey: key,
      shortLabel: info.short,
      fullLabel: info.label,
      count,
      rate
    };
  });
}

// Calculate Trainer Breakdown (CENTER_ADMIN only)
export function calculateTrainerRenewalStats(renewals: Renewal[], trainers: Trainer[]) {
  return trainers.map((t) => {
    // Renewal.trainerId 기준 집계
    const trainerRenewals = renewals.filter((r) => r.trainerId === t.trainerId);
    const totalStarted = trainerRenewals.length;
    const renewed = trainerRenewals.filter(isRenewalCompleted).length;
    const declined = trainerRenewals.filter((r) => r.status === 'DECLINED').length;
    const decided = renewed + declined;
    const rate = formatRate(renewed, decided);

    return {
      trainerId: t.trainerId,
      trainerName: t.name,
      specialty: t.specialty,
      totalStarted,
      decided,
      renewed,
      declined,
      rate
    };
  });
}

interface RenewalPerformanceDashboardProps {
  onRefreshParent?: () => void;
}

export const RenewalPerformanceDashboard: React.FC<RenewalPerformanceDashboardProps> = () => {
  const { currentUser } = useAuth();
  const currentCenterId = currentUser?.centerId || 'center-main';
  const isCenterAdmin = currentUser?.role === 'CENTER_ADMIN';

  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range filter
  const [filterType, setFilterType] = useState<DateRangeFilterType>('THIS_MONTH');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Calculate date range bounds
  const { startDate, endDate, customError } = useMemo(() => {
    const now = new Date();
    if (filterType === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: getLocalDateString(start), endDate: getLocalDateString(end), customError: null };
    }
    if (filterType === 'LAST_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: getLocalDateString(start), endDate: getLocalDateString(end), customError: null };
    }
    if (filterType === 'LAST_3_MONTHS') {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: getLocalDateString(start), endDate: getLocalDateString(end), customError: null };
    }
    // CUSTOM
    const isStartValid = !customStartDate || isValidDate(customStartDate);
    const isEndValid = !customEndDate || isValidDate(customEndDate);
    const isInverted = Boolean(
      customStartDate &&
      customEndDate &&
      isValidDate(customStartDate) &&
      isValidDate(customEndDate) &&
      customEndDate < customStartDate
    );

    if ((customStartDate && !isStartValid) || (customEndDate && !isEndValid) || isInverted) {
      return {
        startDate: '9999-99-99',
        endDate: '0000-00-00',
        customError: isInverted
          ? '종료일은 시작일보다 이전일 수 없습니다.'
          : '올바른 날짜 형식(YYYY-MM-DD)을 입력해주세요.'
      };
    }

    return {
      startDate: customStartDate || '1970-01-01',
      endDate: customEndDate || '2099-12-31',
      customError: null
    };
  }, [filterType, customStartDate, customEndDate]);

  const loadData = async () => {
    if (!currentUser || currentUser.role === 'MEMBER') return;
    try {
      setLoading(true);
      setError(null);
      const [renewalsData, trainersData] = await Promise.all([
        getRenewals(
          currentCenterId,
          currentUser.role,
          currentUser.trainerId
        ),
        isCenterAdmin ? getTrainers(currentCenterId) : Promise.resolve([])
      ]);
      setRenewals(renewalsData);
      setTrainers(trainersData);
    } catch (err: any) {
      console.error('[RenewalPerformanceDashboard fetch error]', err);
      setError('재등록 성과 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser, currentCenterId]);

  // Filtered renewals by date
  const filteredRenewals = useMemo(() => {
    return filterRenewalsByDate(renewals, startDate, endDate);
  }, [renewals, startDate, endDate]);

  // Metrics
  const kpis = useMemo(() => calculateRenewalKpis(filteredRenewals), [filteredRenewals]);
  const funnelSteps = useMemo(() => calculateRenewalFunnel(filteredRenewals), [filteredRenewals]);
  const declineStats = useMemo(() => calculateDeclineReasonStats(filteredRenewals), [filteredRenewals]);
  const trainerStats = useMemo(
    () => calculateTrainerRenewalStats(filteredRenewals, trainers),
    [filteredRenewals, trainers]
  );

  if (currentUser?.role === 'MEMBER') {
    return null;
  }

  return (
    <div id="renewal-performance-dashboard" className="bg-white rounded-2xl border border-stone-200 shadow-xs p-5 space-y-6">
      {/* Top Header & Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-stone-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              PT 재등록 성과 분석
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                {isCenterAdmin ? '센터 전체' : `${currentUser?.name} 트레이너`}
              </span>
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              상담 착수 대비 재등록 성공률 및 사유별 분석을 실시간으로 확인합니다.
            </p>
          </div>
        </div>

        {/* Date Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 self-start lg:self-auto">
          {(
            [
              { id: 'THIS_MONTH', label: '이번 달' },
              { id: 'LAST_MONTH', label: '지난 달' },
              { id: 'LAST_3_MONTHS', label: '최근 3개월' },
              { id: 'CUSTOM', label: '직접 선택' }
            ] as { id: DateRangeFilterType; label: string }[]
          ).map((btn) => (
            <button
              key={btn.id}
              type="button"
              id={`renewal-period-btn-${btn.id}`}
              onClick={() => setFilterType(btn.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filterType === btn.id
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {btn.label}
            </button>
          ))}

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-1.5 rounded-lg border border-stone-200 text-stone-500 hover:text-stone-900 hover:bg-stone-50 transition-colors cursor-pointer ml-1"
            title="새로고침"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {filterType === 'CUSTOM' && (
        <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-stone-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-stone-500" />
            조회 기간 설정:
          </span>
          <div className="flex items-center gap-2">
            <div className="w-36">
              <DateInputField
                id="renewal-custom-start-date"
                value={customStartDate}
                onChange={setCustomStartDate}
                className="!px-2 !py-1 !text-xs !bg-white"
                aria-label="시작일"
              />
            </div>
            <span className="text-stone-400">~</span>
            <div className="w-36">
              <DateInputField
                id="renewal-custom-end-date"
                value={customEndDate}
                onChange={setCustomEndDate}
                className="!px-2 !py-1 !text-xs !bg-white"
                aria-label="종료일"
              />
            </div>
          </div>
          {customError && (
            <span className="text-rose-600 font-medium text-[11px] ml-1">
              ⚠️ {customError}
            </span>
          )}
        </div>
      )}

      {/* Current Range Info */}
      <div className="text-[11px] text-stone-500 flex items-center justify-between">
        <span>
          분석 기준 기간: <strong className="text-stone-800 font-mono">{startDate} ~ {endDate}</strong> (상담 시작일 기준)
        </span>
        <span>해당 기간 총 {filteredRenewals.length}건 집계됨</span>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-xs text-rose-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. 핵심 KPI Cards (5종) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* 대상 시작 건수 */}
        <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
          <span className="text-[11px] font-semibold text-stone-500 block">
            재등록 대상 시작
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-stone-900">
              {kpis.totalStarted}
            </span>
            <span className="text-xs text-stone-500 font-medium">건</span>
          </div>
          <span className="text-[10px] text-stone-400 mt-1 block">
            기간 내 발굴 및 상담 착수
          </span>
        </div>

        {/* 상담 진행중 */}
        <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200">
          <span className="text-[11px] font-semibold text-blue-700 block">
            상담 진행중
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-blue-900">
              {kpis.inProgress}
            </span>
            <span className="text-xs text-blue-600 font-medium">건</span>
          </div>
          <span className="text-[10px] text-blue-600/80 mt-1 block">
            대상 · 상담예정 · 상담중
          </span>
        </div>

        {/* 재등록 완료 */}
        <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200">
          <span className="text-[11px] font-semibold text-emerald-700 block">
            재등록 완료
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-900">
              {kpis.renewed}
            </span>
            <span className="text-xs text-emerald-600 font-medium">건</span>
          </div>
          <span className="text-[10px] text-emerald-600/80 mt-1 block">
            신규 PT 계약 체결
          </span>
        </div>

        {/* 재등록 거절 */}
        <div className="bg-rose-50/70 p-4 rounded-xl border border-rose-200">
          <span className="text-[11px] font-semibold text-rose-700 block">
            재등록 거절
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-rose-900">
              {kpis.declined}
            </span>
            <span className="text-xs text-rose-600 font-medium">건</span>
          </div>
          <span className="text-[10px] text-rose-600/80 mt-1 block">
            사유 기록 및 상담 고사
          </span>
        </div>

        {/* 핵심: 재등록률 */}
        <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-amber-500/20 p-4 rounded-xl border border-amber-300 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-900">
              최종 재등록률
            </span>
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-amber-950">
              {kpis.renewalRate}
            </span>
          </div>
          <span className="text-[10px] text-amber-800 mt-1 block">
            완료 / (완료 + 거절) (진행중·종료 제외)
          </span>
        </div>
      </div>

      {/* 3. 재등록 퍼널 (Funnel) */}
      <div className="bg-stone-50/80 p-5 rounded-xl border border-stone-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-stone-700" />
            <h3 className="text-sm font-bold text-stone-900">
              재등록 단계별 전환 퍼널
            </h3>
          </div>
          <span className="text-xs text-stone-500">
            결과 확정 모수: {kpis.decided}건
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {funnelSteps.map((step, idx) => (
            <div
              key={step.label}
              className="bg-white p-4 rounded-xl border border-stone-200 shadow-2xs relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
                  <span className="flex items-center gap-1.5 font-bold text-stone-700">
                    <span className="w-4 h-4 rounded-full bg-stone-100 text-stone-700 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    {step.label}
                  </span>
                  <span className="text-[11px] font-bold text-stone-900">
                    {step.stepRate}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-xl font-black text-stone-900">
                    {step.count}
                  </span>
                  <span className="text-xs text-stone-500">건</span>
                </div>
              </div>
              <p className="text-[11px] text-stone-400 mt-2 border-t border-stone-100 pt-1.5">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 4. 거절 사유 분석 (Decline Reason Distribution) */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-stone-100">
          <div>
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-500" />
              재등록 거절 사유 분포 ({kpis.declined}건)
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              회원이 재등록을 고사한 주요 사유를 집계하여 개선 포인트를 도출합니다.
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            총 {kpis.declined}건
          </span>
        </div>

        {kpis.declined === 0 ? (
          <div className="py-6 text-center text-xs text-stone-400">
            해당 기간에 등록된 재등록 거절 건이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {declineStats.map((item) => {
              const numericPct = parseInt(item.rate, 10) || 0;
              return (
                <div
                  key={item.reasonKey}
                  className="p-3 rounded-lg border border-stone-100 hover:border-stone-200 bg-stone-50/50 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-stone-800 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      {item.shortLabel}
                      <span className="text-[11px] text-stone-400 font-normal">
                        ({item.fullLabel})
                      </span>
                    </span>
                    <span className="text-stone-900 font-mono font-bold">
                      {item.count}건 ({item.rate})
                    </span>
                  </div>
                  {/* Tailwind Progress Bar */}
                  <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-rose-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${numericPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. 트레이너별 현황 (CENTER_ADMIN 전용) */}
      {isCenterAdmin && (
        <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-stone-800" />
                트레이너별 재등록 현황 (Renewal 담당 기준)
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                센터 관리자 전용 지표이며 순위나 평가는 제외된 사실 기반 현황입니다.
              </p>
            </div>
            <span className="text-xs text-stone-400">
              트레이너 {trainers.length}명
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50/75 border-b border-stone-200 text-[11px] font-semibold text-stone-500">
                  <th className="py-2.5 px-3">트레이너</th>
                  <th className="py-2.5 px-3">전문분야</th>
                  <th className="py-2.5 px-3 text-center">대상 (시작)</th>
                  <th className="py-2.5 px-3 text-center">결과확정</th>
                  <th className="py-2.5 px-3 text-center">재등록</th>
                  <th className="py-2.5 px-3 text-center">거절</th>
                  <th className="py-2.5 px-3 text-right">재등록률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {trainerStats.map((row) => (
                  <tr key={row.trainerId} className="hover:bg-stone-50/60 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-stone-900">
                      {row.trainerName}
                    </td>
                    <td className="py-2.5 px-3 text-stone-500 truncate max-w-[120px]">
                      {row.specialty || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center text-stone-700 font-medium">
                      {row.totalStarted}건
                    </td>
                    <td className="py-2.5 px-3 text-center text-stone-700 font-medium">
                      {row.decided}건
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                      {row.renewed}건
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-rose-600">
                      {row.declined}건
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-amber-800 font-mono">
                      {row.rate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
