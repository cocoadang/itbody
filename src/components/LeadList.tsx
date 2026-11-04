import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getLeads, getTrainers } from '../services/dataService';
import type { Lead, Trainer, LeadStatus } from '../types';
import { EmptyState } from './EmptyState';
import { LeadModal } from './LeadModal';
import {
  ClipboardList,
  Search,
  Plus,
  RefreshCw,
  Phone,
  Calendar,
  UserCheck,
  Filter,
  Edit2,
  CalendarCheck,
  ChevronRight,
  ShieldAlert,
  ExternalLink
} from 'lucide-react';

export const LEAD_STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  NEW: {
    label: '신규',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200'
  },
  CONSULTING: {
    label: '상담중',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200'
  },
  OT_SCHEDULED: {
    label: 'OT예정',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200'
  },
  OT_COMPLETED: {
    label: 'OT완료',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200'
  },
  REGISTERED: {
    label: '등록',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200'
  },
  LOST: {
    label: '미등록',
    bg: 'bg-stone-100',
    text: 'text-stone-600',
    border: 'border-stone-200'
  }
};

const STATUS_FILTERS: { value: 'ALL' | LeadStatus; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'NEW', label: '신규' },
  { value: 'CONSULTING', label: '상담중' },
  { value: 'OT_SCHEDULED', label: 'OT예정' },
  { value: 'OT_COMPLETED', label: 'OT완료' },
  { value: 'REGISTERED', label: '등록' },
  { value: 'LOST', label: '미등록' }
];

interface LeadListProps {
  onSelectMember?: (memberId: string) => void;
}

export const LeadList: React.FC<LeadListProps> = ({ onSelectMember }) => {
  const { currentUser } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | LeadStatus>('ALL');
  const [selectedTrainerFilter, setSelectedTrainerFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const isCenterAdmin = currentUser?.role === 'CENTER_ADMIN';
  const isTrainer = currentUser?.role === 'TRAINER';

  const fetchLeadsData = useCallback(async () => {
    if (!currentUser) return;
    if (currentUser.role === 'MEMBER') {
      setError('회원 계정은 신규문의 관리에 접근할 수 없습니다.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [leadsData, trainersData] = await Promise.all([
        getLeads(
          currentUser.centerId,
          currentUser.role,
          currentUser.trainerId
        ),
        getTrainers(currentUser.centerId)
      ]);

      setLeads(leadsData);
      setTrainers(trainersData);
    } catch (err: any) {
      console.error('[LeadList fetch error]', err);
      setError('신규문의 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchLeadsData();
  }, [fetchLeadsData]);

  // Trainer Map for quick lookup
  const trainerMap = useMemo(() => {
    const map = new Map<string, string>();
    trainers.forEach((t) => map.set(t.trainerId, t.name));
    return map;
  }, [trainers]);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // 1. Status Filter
      if (statusFilter !== 'ALL' && lead.status !== statusFilter) {
        return false;
      }
      // 2. Trainer Filter (For CENTER_ADMIN)
      if (isCenterAdmin && selectedTrainerFilter !== 'ALL') {
        if (selectedTrainerFilter === 'UNASSIGNED') {
          if (lead.assignedTrainerId) return false;
        } else if (lead.assignedTrainerId !== selectedTrainerFilter) {
          return false;
        }
      }
      // 3. Search Query (name or phone)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = lead.name.toLowerCase().includes(query);
        const matchesPhone = lead.phone.replace(/[^0-9]/g, '').includes(query.replace(/[^0-9]/g, ''));
        return matchesName || matchesPhone;
      }
      return true;
    });
  }, [leads, statusFilter, selectedTrainerFilter, searchQuery, isCenterAdmin]);

  // Guard: MEMBER role should not access this view
  if (currentUser?.role === 'MEMBER') {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-stone-200">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-2" />
        <h3 className="text-base font-bold text-stone-900">접근 권한이 없습니다</h3>
        <p className="text-xs text-stone-500 mt-1">
          신규문의 관리는 센터 관리자 및 배정된 트레이너 전용 메뉴입니다.
        </p>
      </div>
    );
  }

  return (
    <div id="lead-list-view" className="space-y-6">
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              신규문의 관리
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-700">
              {filteredLeads.length}건
            </span>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
            {isCenterAdmin
              ? '방문/전화 문의 접수부터 상담, OT 배정, PT 정식 등록까지의 전환 흐름을 관리합니다.'
              : '나에게 배정된 신규 문의 및 OT 일정, 상담 진행 상황을 관리합니다.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="refresh-lead-list-btn"
            onClick={fetchLeadsData}
            title="새로고침"
            className="p-2 text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Only CENTER_ADMIN has authority to register a new lead */}
          {isCenterAdmin && (
            <button
              id="btn-register-lead"
              onClick={() => {
                setSelectedLead(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>신규문의 등록</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Filters & Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-stone-200 shadow-xs space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
          <input
            id="lead-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="문의자 이름 또는 연락처 검색..."
            className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent placeholder:text-stone-400"
          />
        </div>

        {/* Status Filter Tabs & Trainer Filter */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs (Requirement 5: 전체 / 신규 / 상담중 / OT예정 / OT완료 / 등록 / 미등록) */}
          <div className="flex items-center bg-stone-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto scrollbar-none">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                id={`filter-lead-status-${f.value.toLowerCase()}`}
                onClick={() => setStatusFilter(f.value)}
                className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap text-center ${
                  statusFilter === f.value
                    ? 'bg-white text-stone-900 font-bold shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Trainer Filter (CENTER_ADMIN only) */}
          {isCenterAdmin && trainers.length > 0 && (
            <div className="flex items-center gap-1.5 w-full sm:w-auto sm:pl-2 sm:border-l sm:border-stone-200">
              <Filter className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <select
                id="filter-lead-trainer-select"
                value={selectedTrainerFilter}
                onChange={(e) => setSelectedTrainerFilter(e.target.value)}
                className="w-full sm:w-auto px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-900 cursor-pointer"
              >
                <option value="ALL">전체 트레이너</option>
                <option value="UNASSIGNED">미배정 문의</option>
                {trainers.map((t) => (
                  <option key={t.trainerId} value={t.trainerId}>
                    {t.name} 트레이너
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 3. Content Area: Loading / Error / Empty / List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-stone-400">
          <RefreshCw className="w-6 h-6 animate-spin mb-2" />
          <p className="text-sm">신규문의 목록을 불러오는 중입니다...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          <p className="font-semibold">{error}</p>
          <button
            onClick={fetchLeadsData}
            className="mt-2 text-xs font-medium text-rose-700 underline cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          id="empty-lead-list-center"
          icon={ClipboardList}
          title={isCenterAdmin ? '등록된 신규문의가 없습니다' : '배정된 신규문의가 없습니다'}
          description={
            isCenterAdmin
              ? '방문 상담 또는 전화로 접수된 신규 고객 문의를 등록하고 OT 및 PT 등록 전환을 관리해보세요.'
              : '현재 트레이너님께 배정된 신규 상담 또는 OT 문의 내역이 없습니다.'
          }
          actionText={isCenterAdmin ? '신규문의 등록' : undefined}
          onAction={isCenterAdmin ? () => {
            setSelectedLead(null);
            setIsModalOpen(true);
          } : undefined}
        />
      ) : filteredLeads.length === 0 ? (
        <EmptyState
          id="empty-lead-list-search"
          icon={Search}
          title="조건에 일치하는 신규문의가 없습니다"
          description="검색어나 필터 조건을 변경하여 다시 확인해보세요."
          actionText="필터 초기화"
          onAction={() => {
            setSearchQuery('');
            setStatusFilter('ALL');
            setSelectedTrainerFilter('ALL');
          }}
        />
      ) : (
        <div>
          {/* Mobile Card View (md:hidden) */}
          <div className="md:hidden space-y-3">
            {filteredLeads.map((lead) => {
              const statusCfg = LEAD_STATUS_CONFIG[lead.status] || LEAD_STATUS_CONFIG.NEW;
              const assignedTrainerName =
                (lead.assignedTrainerId && trainerMap.get(lead.assignedTrainerId)) ||
                lead.assignedTrainerName ||
                '미배정';

              return (
                <div
                  key={lead.leadId}
                  id={`lead-card-${lead.leadId}`}
                  onClick={() => {
                    setSelectedLead(lead);
                    setIsModalOpen(true);
                  }}
                  className="bg-white rounded-xl border border-stone-200 p-4 shadow-xs hover:border-stone-400 transition-all cursor-pointer active:scale-[0.99]"
                >
                  {/* Card Header: Name + Status */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-stone-900 text-white font-bold text-sm flex items-center justify-center shrink-0">
                        {lead.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-stone-900 text-base">
                            {lead.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 font-medium">
                            {lead.source}
                          </span>
                        </div>
                        <span className="text-xs text-stone-400 font-mono">
                          {lead.leadId}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text} border ${statusCfg.border}`}
                    >
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100 text-xs text-stone-600">
                    <div className="flex items-center gap-1.5 truncate">
                      <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="font-mono truncate">{lead.phone}</span>
                    </div>

                    <div className="flex items-center gap-1.5 truncate">
                      <Calendar className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="truncate">문의: {lead.inquiryDate}</span>
                    </div>

                    <div className="flex items-center gap-1.5 truncate">
                      <UserCheck className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="truncate font-medium text-stone-800">
                        {assignedTrainerName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 truncate">
                      <CalendarCheck className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="truncate">
                        OT: {lead.otDate || '미정'}
                      </span>
                    </div>
                  </div>

                  {/* Memo preview if any */}
                  {lead.memo && (
                    <div className="mt-2.5 p-2 bg-stone-50 rounded-lg text-[11px] text-stone-600 line-clamp-2">
                      <span className="font-semibold text-stone-700 mr-1">메모:</span>
                      {lead.memo}
                    </div>
                  )}

                  {/* Card Action footer */}
                  <div className="flex items-center justify-between text-[11px] text-stone-500 pt-2.5 mt-2.5 border-t border-stone-50">
                    {lead.convertedMemberId && onSelectMember ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMember(lead.convertedMemberId!);
                        }}
                        className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>등록 회원 상세 보기</span>
                      </button>
                    ) : (
                      <span>수정 / 상세 확인</span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (hidden md:block) */}
          <div className="hidden md:block bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-stone-200 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                    <th className="py-3 px-4">문의자명</th>
                    <th className="py-3 px-4">연락처</th>
                    <th className="py-3 px-4">문의일</th>
                    <th className="py-3 px-4">유입경로</th>
                    <th className="py-3 px-4">상태</th>
                    <th className="py-3 px-4">담당 트레이너</th>
                    <th className="py-3 px-4">OT 예정일</th>
                    <th className="py-3 px-4 text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {filteredLeads.map((lead) => {
                    const statusCfg = LEAD_STATUS_CONFIG[lead.status] || LEAD_STATUS_CONFIG.NEW;
                    const assignedTrainerName =
                      (lead.assignedTrainerId && trainerMap.get(lead.assignedTrainerId)) ||
                      lead.assignedTrainerName ||
                      '미배정';

                    return (
                      <tr
                        key={lead.leadId}
                        id={`lead-row-${lead.leadId}`}
                        onClick={() => {
                          setSelectedLead(lead);
                          setIsModalOpen(true);
                        }}
                        className="hover:bg-stone-50/80 transition-colors cursor-pointer group"
                      >
                        {/* 1. Name */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-stone-100 text-stone-700 font-semibold text-xs flex items-center justify-center border border-stone-200">
                              {lead.name.slice(0, 1)}
                            </div>
                            <div>
                              <span className="font-semibold text-stone-900 group-hover:text-stone-950 block">
                                {lead.name}
                              </span>
                              <span className="text-[11px] text-stone-400 font-mono">
                                {lead.leadId}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Phone */}
                        <td className="py-3.5 px-4 text-stone-600 text-xs">
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-stone-400" />
                            {lead.phone}
                          </span>
                        </td>

                        {/* 3. Inquiry Date */}
                        <td className="py-3.5 px-4 text-stone-600 text-xs">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-stone-400" />
                            {lead.inquiryDate}
                          </span>
                        </td>

                        {/* 4. Source */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-stone-100 text-stone-700 border border-stone-200">
                            {lead.source}
                          </span>
                        </td>

                        {/* 5. Status (Requirement: NEW=신규, CONSULTING=상담중, OT_SCHEDULED=OT예정, OT_COMPLETED=OT완료, REGISTERED=등록, LOST=미등록) */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${statusCfg.bg} ${statusCfg.text} border ${statusCfg.border}`}
                          >
                            {statusCfg.label}
                          </span>
                        </td>

                        {/* 6. Assigned Trainer */}
                        <td className="py-3.5 px-4 text-stone-700 text-xs font-medium">
                          <span className="flex items-center gap-1">
                            <UserCheck className="w-3 h-3 text-stone-400" />
                            {assignedTrainerName}
                          </span>
                        </td>

                        {/* 7. OT Scheduled Date */}
                        <td className="py-3.5 px-4 text-stone-600 text-xs">
                          {lead.otDate ? (
                            <span className="flex items-center gap-1 font-medium text-indigo-700">
                              <CalendarCheck className="w-3 h-3 text-indigo-500" />
                              {lead.otDate}
                            </span>
                          ) : (
                            <span className="text-stone-400">-</span>
                          )}
                        </td>

                        {/* 8. Action (Edit / Detail & View Member) */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {lead.convertedMemberId && onSelectMember && (
                              <button
                                type="button"
                                id={`view-member-lead-btn-${lead.leadId}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectMember(lead.convertedMemberId!);
                                }}
                                title="등록된 회원 상세로 이동"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-emerald-700 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                              >
                                <ExternalLink className="w-3 h-3 text-emerald-600" />
                                <span>회원보기</span>
                              </button>
                            )}

                            <button
                              type="button"
                              id={`edit-lead-btn-${lead.leadId}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLead(lead);
                                setIsModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-stone-700 hover:text-stone-950 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3 text-stone-500" />
                              <span>상세/수정</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. Lead Modal for Registration or Detail/Edit */}
      {isModalOpen && (
        <LeadModal
          isOpen={isModalOpen}
          lead={selectedLead}
          trainers={trainers}
          onNavigateToMember={onSelectMember}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedLead(null);
          }}
          onSuccess={() => {
            fetchLeadsData();
            setIsModalOpen(false);
            setSelectedLead(null);
          }}
        />
      )}
    </div>
  );
};
