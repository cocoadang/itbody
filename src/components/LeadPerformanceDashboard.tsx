import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getLeads, getTrainers } from '../services/dataService';
import type { Lead, Trainer, LeadSource } from '../types';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import {
  TrendingUp,
  Calendar,
  Users,
  CheckCircle2,
  CalendarCheck,
  UserCheck,
  UserX,
  Filter,
  ArrowRight,
  RefreshCw,
  HelpCircle,
  BarChart3
} from 'lucide-react';

type DateRangeFilterType = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'CUSTOM';

// Format YYYY-MM-DD
function getLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Convert English / Korean source to unified Korean label
export function normalizeSourceLabel(src: LeadSource | string): string {
  switch (src) {
    case 'VISIT':
    case '방문':
      return '방문';
    case 'PHONE':
    case '전화':
      return '전화';
    case 'REFERRAL':
    case '소개':
      return '소개';
    case 'ONLINE':
    case '온라인':
      return '온라인';
    case 'OTHER':
    case '기타':
    default:
      return '기타';
  }
}

const CANONICAL_SOURCES = ['방문', '전화', '소개', '온라인', '기타'] as const;

export const LeadPerformanceDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const isCenterAdmin = currentUser?.role === 'CENTER_ADMIN';
  const isTrainer = currentUser?.role === 'TRAINER';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range filter
  const [filterType, setFilterType] = useState<DateRangeFilterType>('THIS_MONTH');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Calculate default date bounds based on filter
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

  // Load leads and trainers
  const loadData = async () => {
    if (!currentUser || currentUser.role === 'MEMBER') return;
    try {
      setLoading(true);
      setError(null);
      const [leadsData, trainersData] = await Promise.all([
        getLeads(
          currentUser.centerId,
          currentUser.role,
          currentUser.trainerId
        ),
        isCenterAdmin ? getTrainers(currentUser.centerId) : Promise.resolve([])
      ]);
      setLeads(leadsData);
      setTrainers(trainersData);
    } catch (err: any) {
      console.error('[LeadPerformanceDashboard fetch error]', err);
      setError('성과 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  // Filter leads by inquiryDate
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const date = lead.inquiryDate;
      if (!date) return false;
      return date >= startDate && date <= endDate;
    });
  }, [leads, startDate, endDate]);

  // ----------------------------------------------------
  // 1. KPI Calculations
  // Requirement 2:
  // - 신규문의 수: filteredLeads.length
  // - OT 배정 수: otDate가 존재하는 Lead
  // - OT 완료 수: otCompletedAt이 존재하는 Lead
  // - PT 등록 수: registeredAt + convertedMemberId가 존재하는 Lead
  // - 미등록 수: status === 'LOST' 또는 lostReason이 존재하는 Lead
  //
  // 비율:
  // - OT 실시율 = OT 완료 / OT 배정
  // - OT 등록률 = PT 등록 / OT 완료
  // - 전체 문의 등록률 = PT 등록 / 신규문의
  // ----------------------------------------------------
  const totalLeadsCount = filteredLeads.length;

  const otAssignedCount = filteredLeads.filter((l) => Boolean(l.otDate)).length;

  const otCompletedCount = filteredLeads.filter((l) => Boolean(l.otCompletedAt)).length;

  const ptRegisteredCount = filteredLeads.filter((l) =>
    Boolean(l.registeredAt && l.convertedMemberId)
  ).length;

  const lostCount = filteredLeads.filter((l) => l.status === 'LOST' || Boolean(l.lostReason)).length;

  // Rates safely formatted
  const formatRate = (numerator: number, denominator: number): string => {
    if (denominator <= 0) return '0%';
    const pct = Math.round((numerator / denominator) * 100);
    return `${pct}%`;
  };

  const otExecutionRate = formatRate(otCompletedCount, otAssignedCount);
  const otConversionRate = formatRate(ptRegisteredCount, otCompletedCount);
  const totalConversionRate = formatRate(ptRegisteredCount, totalLeadsCount);

  // ----------------------------------------------------
  // 2. Funnel Step Calculations
  // Requirement 3:
  // 신규문의 → OT배정 → OT완료 → PT등록
  // 각 단계 건수와 이전 단계 대비 전환율
  // ----------------------------------------------------
  const funnelSteps = [
    {
      label: '신규문의',
      count: totalLeadsCount,
      stepRate: '100%',
      desc: '접수된 전체 문의'
    },
    {
      label: 'OT 배정',
      count: otAssignedCount,
      stepRate: formatRate(otAssignedCount, totalLeadsCount),
      desc: '일정 조율된 문의'
    },
    {
      label: 'OT 완료',
      count: otCompletedCount,
      stepRate: formatRate(otCompletedCount, otAssignedCount),
      desc: '실제 수업 완료'
    },
    {
      label: 'PT 정식 등록',
      count: ptRegisteredCount,
      stepRate: formatRate(ptRegisteredCount, otCompletedCount),
      desc: '회원 등록 전환'
    }
  ];

  // ----------------------------------------------------
  // 3. Trainer Performance Calculations (CENTER_ADMIN only)
  // Requirement 4:
  // 트레이너 | OT배정 | OT완료 | PT등록 | OT등록률
  // assignedTrainerId 기준 집계
  // ----------------------------------------------------
  const trainerPerformance = useMemo(() => {
    if (!isCenterAdmin) return [];

    return trainers.map((t) => {
      const trainerLeads = filteredLeads.filter((l) => l.assignedTrainerId === t.trainerId);
      const assigned = trainerLeads.filter((l) => Boolean(l.otDate)).length;
      const completed = trainerLeads.filter((l) => Boolean(l.otCompletedAt)).length;
      const registered = trainerLeads.filter((l) => Boolean(l.registeredAt && l.convertedMemberId)).length;
      const rate = formatRate(registered, completed);

      return {
        trainerId: t.trainerId,
        trainerName: t.name,
        specialty: t.specialty,
        assigned,
        completed,
        registered,
        rate
      };
    });
  }, [isCenterAdmin, trainers, filteredLeads]);

  // Unassigned leads stats if any (CENTER_ADMIN)
  const unassignedStats = useMemo(() => {
    if (!isCenterAdmin) return null;
    const unassignedLeads = filteredLeads.filter((l) => !l.assignedTrainerId);
    if (unassignedLeads.length === 0) return null;
    return {
      count: unassignedLeads.length,
      assigned: unassignedLeads.filter((l) => Boolean(l.otDate)).length,
      completed: unassignedLeads.filter((l) => Boolean(l.otCompletedAt)).length,
      registered: unassignedLeads.filter((l) => Boolean(l.registeredAt && l.convertedMemberId)).length
    };
  }, [isCenterAdmin, filteredLeads]);

  // ----------------------------------------------------
  // 4. Inflow Source Performance Calculations
  // Requirement 5:
  // 유입경로 | 문의 | OT완료 | PT등록 | 등록률
  // ----------------------------------------------------
  const sourcePerformance = useMemo(() => {
    return CANONICAL_SOURCES.map((sourceLabel) => {
      const matchedLeads = filteredLeads.filter(
        (l) => normalizeSourceLabel(l.source) === sourceLabel
      );
      const total = matchedLeads.length;
      const completed = matchedLeads.filter((l) => Boolean(l.otCompletedAt)).length;
      const registered = matchedLeads.filter((l) => Boolean(l.registeredAt && l.convertedMemberId)).length;
      const rate = formatRate(registered, total);

      return {
        sourceLabel,
        total,
        completed,
        registered,
        rate
      };
    });
  }, [filteredLeads]);

  if (currentUser?.role === 'MEMBER') return null;

  return (
    <div id="lead-performance-dashboard-card" className="bg-white rounded-xl border border-stone-200 shadow-xs p-5 space-y-6">
      {/* Header and Date Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              신규문의 및 OT 성과 분석
              <span className="text-[11px] font-normal text-stone-500">
                ({isCenterAdmin ? '센터 전체' : '내 배정 문의 기준'})
              </span>
            </h3>
            <p className="text-xs text-stone-500">
              기준일: 문의 접수일 (inquiryDate) | 기간: {startDate} ~ {endDate}
            </p>
          </div>
        </div>

        {/* Date Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          <div className="flex items-center bg-stone-100 p-0.5 rounded-lg text-xs font-medium">
            <button
              id="filter-date-this-month"
              type="button"
              onClick={() => setFilterType('THIS_MONTH')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                filterType === 'THIS_MONTH'
                  ? 'bg-white text-stone-900 font-bold shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              이번 달
            </button>
            <button
              id="filter-date-last-month"
              type="button"
              onClick={() => setFilterType('LAST_MONTH')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                filterType === 'LAST_MONTH'
                  ? 'bg-white text-stone-900 font-bold shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              지난 달
            </button>
            <button
              id="filter-date-last-3-months"
              type="button"
              onClick={() => setFilterType('LAST_3_MONTHS')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                filterType === 'LAST_3_MONTHS'
                  ? 'bg-white text-stone-900 font-bold shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              최근 3개월
            </button>
            <button
              id="filter-date-custom"
              type="button"
              onClick={() => {
                setFilterType('CUSTOM');
                if (!customStartDate) setCustomStartDate(startDate);
                if (!customEndDate) setCustomEndDate(endDate);
              }}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                filterType === 'CUSTOM'
                  ? 'bg-white text-stone-900 font-bold shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              직접 선택
            </button>
          </div>

          <button
            id="refresh-lead-performance-btn"
            type="button"
            onClick={loadData}
            title="새로고침"
            className="p-1.5 text-stone-500 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 rounded-lg border border-stone-200 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Custom Date Inputs if CUSTOM is active */}
      {filterType === 'CUSTOM' && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-xs">
          <span className="text-stone-600 font-medium">기간 직접 설정:</span>
          <div className="w-36">
            <DateInputField
              id="custom-start-date-input"
              value={customStartDate}
              onChange={setCustomStartDate}
              className="!px-2 !py-1 !text-xs !bg-white"
              aria-label="시작일"
            />
          </div>
          <span className="text-stone-400">~</span>
          <div className="w-36">
            <DateInputField
              id="custom-end-date-input"
              value={customEndDate}
              onChange={setCustomEndDate}
              className="!px-2 !py-1 !text-xs !bg-white"
              aria-label="종료일"
            />
          </div>
          {customError && (
            <span className="text-rose-600 font-medium text-[11px] ml-1">
              ⚠️ {customError}
            </span>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
          {error}
        </div>
      )}

      {/* 1. Core KPIs Cards */}
      <div>
        <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-2.5">
          신규문의 핵심 KPI 현황
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {/* Card 1: 신규문의 수 */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200">
            <span className="text-xs text-stone-500 font-medium block">신규문의</span>
            <span className="text-2xl font-bold font-mono text-stone-900 block mt-1">
              {loading ? '-' : totalLeadsCount}
              <span className="text-xs font-normal text-stone-500 ml-1">건</span>
            </span>
            <span className="text-[10px] text-stone-400 mt-1 block">접수된 문의</span>
          </div>

          {/* Card 2: OT 배정 수 */}
          <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-200/70">
            <span className="text-xs text-indigo-900 font-medium block">OT 배정</span>
            <span className="text-2xl font-bold font-mono text-indigo-950 block mt-1">
              {loading ? '-' : otAssignedCount}
              <span className="text-xs font-normal text-indigo-700 ml-1">건</span>
            </span>
            <span className="text-[10px] text-indigo-700 mt-1 block">일정 확정</span>
          </div>

          {/* Card 3: OT 완료 수 */}
          <div className="p-3.5 bg-teal-50/60 rounded-xl border border-teal-200/70">
            <span className="text-xs text-teal-900 font-medium block">OT 완료</span>
            <span className="text-2xl font-bold font-mono text-teal-950 block mt-1">
              {loading ? '-' : otCompletedCount}
              <span className="text-xs font-normal text-teal-700 ml-1">건</span>
            </span>
            <span className="text-[10px] text-teal-700 mt-1 block">수업 실시 완료</span>
          </div>

          {/* Card 4: PT 등록 수 */}
          <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
            <span className="text-xs text-emerald-900 font-bold block">PT 정식등록</span>
            <span className="text-2xl font-bold font-mono text-emerald-950 block mt-1">
              {loading ? '-' : ptRegisteredCount}
              <span className="text-xs font-normal text-emerald-700 ml-1">건</span>
            </span>
            <span className="text-[10px] text-emerald-700 font-semibold mt-1 block">회원 전환 성공</span>
          </div>

          {/* Card 5: 미등록 수 */}
          <div className="p-3.5 bg-stone-100 rounded-xl border border-stone-200 col-span-2 sm:col-span-1">
            <span className="text-xs text-stone-600 font-medium block">미등록 (LOST)</span>
            <span className="text-2xl font-bold font-mono text-stone-700 block mt-1">
              {loading ? '-' : lostCount}
              <span className="text-xs font-normal text-stone-500 ml-1">건</span>
            </span>
            <span className="text-[10px] text-stone-400 mt-1 block">등록 취소/보류</span>
          </div>
        </div>

        {/* Rate Summary Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5 pt-2">
          <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 flex items-center justify-between">
            <span className="text-xs text-stone-600 font-medium">OT 실시율 (완료 / 배정)</span>
            <span className="text-sm font-bold font-mono text-stone-900">{otExecutionRate}</span>
          </div>
          <div className="p-2.5 bg-indigo-50/50 rounded-lg border border-indigo-200 flex items-center justify-between">
            <span className="text-xs text-indigo-900 font-medium">OT 등록률 (PT등록 / 완료)</span>
            <span className="text-sm font-bold font-mono text-indigo-950">{otConversionRate}</span>
          </div>
          <div className="p-2.5 bg-emerald-50/50 rounded-lg border border-emerald-200 flex items-center justify-between">
            <span className="text-xs text-emerald-900 font-bold">전체 문의 등록률 (PT등록 / 문의)</span>
            <span className="text-sm font-bold font-mono text-emerald-950">{totalConversionRate}</span>
          </div>
        </div>
      </div>

      {/* 2. Funnel Visualizer */}
      <div className="p-4 bg-stone-50/80 rounded-xl border border-stone-200 space-y-3">
        <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-stone-600" />
          신규문의 전환 퍼널 (Funnel)
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {funnelSteps.map((step, idx) => (
            <div
              key={step.label}
              className="bg-white p-3 rounded-lg border border-stone-200 shadow-2xs flex flex-col justify-between relative"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-600">
                  {idx + 1}. {step.label}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-mono">
                  {step.stepRate}
                </span>
              </div>

              <div className="my-2">
                <span className="text-xl font-bold font-mono text-stone-900">
                  {step.count}
                  <span className="text-xs font-normal text-stone-500 ml-1">건</span>
                </span>
                <p className="text-[10px] text-stone-400 mt-0.5">{step.desc}</p>
              </div>

              {idx < funnelSteps.length - 1 && (
                <div className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-stone-300">
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 3. Performance by Trainer (CENTER_ADMIN only) */}
      {isCenterAdmin && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
              트레이너별 OT 및 등록 성과
            </h4>
            <span className="text-[11px] text-stone-500">배정 트레이너 기준</span>
          </div>

          <div className="overflow-x-auto border border-stone-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold text-[11px]">
                  <th className="py-2.5 px-3">트레이너</th>
                  <th className="py-2.5 px-3 text-center">OT 배정</th>
                  <th className="py-2.5 px-3 text-center">OT 완료</th>
                  <th className="py-2.5 px-3 text-center">PT 등록</th>
                  <th className="py-2.5 px-3 text-right">OT 등록률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-mono">
                {trainerPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-stone-400 font-sans">
                      등록된 트레이너가 없습니다.
                    </td>
                  </tr>
                ) : (
                  trainerPerformance.map((item) => (
                    <tr key={item.trainerId} className="hover:bg-stone-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-sans font-semibold text-stone-900">
                        {item.trainerName}
                        {item.specialty && (
                          <span className="ml-1 text-[10px] text-stone-400 font-normal">
                            ({item.specialty})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-stone-700">{item.assigned}건</td>
                      <td className="py-2.5 px-3 text-center text-teal-700 font-semibold">
                        {item.completed}건
                      </td>
                      <td className="py-2.5 px-3 text-center text-emerald-700 font-bold">
                        {item.registered}건
                      </td>
                      <td className="py-2.5 px-3 text-right text-stone-900 font-bold">
                        {item.rate}
                      </td>
                    </tr>
                  ))
                )}

                {/* Unassigned row if any */}
                {unassignedStats && (
                  <tr className="bg-stone-50/60 font-sans text-stone-500">
                    <td className="py-2.5 px-3 font-semibold text-stone-600">미배정 문의</td>
                    <td className="py-2.5 px-3 text-center font-mono">{unassignedStats.assigned}건</td>
                    <td className="py-2.5 px-3 text-center font-mono">{unassignedStats.completed}건</td>
                    <td className="py-2.5 px-3 text-center font-mono">{unassignedStats.registered}건</td>
                    <td className="py-2.5 px-3 text-right font-mono text-stone-600">
                      {formatRate(unassignedStats.registered, unassignedStats.completed)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Performance by Inflow Source */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
            유입경로별 성과 분석
          </h4>
          <span className="text-[11px] text-stone-500">문의 채널 기준</span>
        </div>

        <div className="overflow-x-auto border border-stone-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold text-[11px]">
                <th className="py-2.5 px-3">유입경로</th>
                <th className="py-2.5 px-3 text-center">문의 수</th>
                <th className="py-2.5 px-3 text-center">OT 완료</th>
                <th className="py-2.5 px-3 text-center">PT 등록</th>
                <th className="py-2.5 px-3 text-right">등록률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-mono">
              {sourcePerformance.map((src) => (
                <tr key={src.sourceLabel} className="hover:bg-stone-50/80 transition-colors">
                  <td className="py-2.5 px-3 font-sans font-semibold text-stone-900">
                    {src.sourceLabel}
                  </td>
                  <td className="py-2.5 px-3 text-center text-stone-700">{src.total}건</td>
                  <td className="py-2.5 px-3 text-center text-teal-700">{src.completed}건</td>
                  <td className="py-2.5 px-3 text-center text-emerald-700 font-bold">
                    {src.registered}건
                  </td>
                  <td className="py-2.5 px-3 text-right text-stone-900 font-bold">
                    {src.rate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
