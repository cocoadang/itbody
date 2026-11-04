import { MemberJoinRequests } from './MemberJoinRequests';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMembers, getTrainers, getAttentionMembers, loadCenterActivity } from '../services/dataService';
import type { Member, Trainer, MemberStatus } from '../types';
import { EmptyState } from './EmptyState';
import { NewMemberModal } from './NewMemberModal';
import {
  Users,
  Search,
  UserPlus,
  RefreshCw,
  Phone,
  Calendar,
  UserCheck,
  ChevronRight,
  Filter,
  Edit2
} from 'lucide-react';

interface MemberListProps {
  onSelectMember: (memberId: string) => void;
  onOpenNewMemberModal: () => void;
  initialFilter?: 'ALL' | MemberStatus | 'ATTENTION';
}

export const MemberList: React.FC<MemberListProps> = ({
  onSelectMember,
  onOpenNewMemberModal,
  initialFilter = 'ALL'
}) => {
  const { currentUser, currentCenterName } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [attentionMemberIds, setAttentionMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Member Modal State
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | MemberStatus | 'ATTENTION'>(initialFilter);
  const [selectedTrainerFilter, setSelectedTrainerFilter] = useState<string>('ALL');

  const fetchMembersData = useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setError(null);
      const [membersData, trainersData] = await Promise.all([
        getMembers(currentUser.centerId, currentUser.role, currentUser.trainerId),
        getTrainers(currentUser.centerId),
        loadCenterActivity(currentUser.centerId, currentUser.role, currentUser.trainerId)
      ]);
      // Attention flags reuse the members just loaded (no second member query).
      const attentionData = await getAttentionMembers(currentUser.centerId, currentUser.role, currentUser.trainerId, { members: membersData, simplified: true });
      setMembers(membersData);
      setTrainers(trainersData);
      setAttentionMemberIds(new Set(attentionData.map((item) => item.member.memberId)));
    } catch (err) {
      console.error('[MemberList fetch error]', err);
      setError('회원 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchMembersData();
  }, [fetchMembersData]);

  // Trainer name lookup helper
  const trainerMap = useMemo(() => {
    const map = new Map<string, string>();
    trainers.forEach((t) => map.set(t.trainerId, t.name));
    return map;
  }, [trainers]);

  // Filtered members
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      // 1. Status / Attention Filter
      if (statusFilter === 'ATTENTION') {
        if (!attentionMemberIds.has(member.memberId)) {
          return false;
        }
      } else if (statusFilter !== 'ALL' && member.status !== statusFilter) {
        return false;
      }
      // 2. Trainer Filter (For CENTER_ADMIN)
      if (currentUser?.role === 'CENTER_ADMIN' && selectedTrainerFilter !== 'ALL') {
        if (member.trainerId !== selectedTrainerFilter) {
          return false;
        }
      }
      // 3. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = member.name.toLowerCase().includes(query);
        const matchesPhone = member.phone.replace(/[^0-9]/g, '').includes(query.replace(/[^0-9]/g, ''));
        return matchesName || matchesPhone;
      }
      return true;
    });
  }, [members, statusFilter, attentionMemberIds, selectedTrainerFilter, searchQuery, currentUser?.role]);

  return (
    <div id="member-list-view" className="space-y-6">
      {currentUser?.role === 'CENTER_ADMIN' && <MemberJoinRequests members={members} onApproved={fetchMembersData} />}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-2 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              회원 목록
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 text-xs font-semibold">
              총 {filteredMembers.length}명
            </span>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            {currentCenterName} 소속 회원의 PT 시작일, 상태, 담당 트레이너 정보를 관리합니다.
            {currentUser?.role === 'TRAINER' && (
              <span className="text-blue-700 font-medium ml-1 block sm:inline">
                (본인 담당 회원 전용 뷰)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="refresh-members-btn"
            onClick={fetchMembersData}
            disabled={loading}
            className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
          <button
            id="open-register-member-btn"
            onClick={onOpenNewMemberModal}
            className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer active:scale-95 whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            신규 회원 등록
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="search-members-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="회원 이름 또는 연락처 검색..."
            className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent placeholder:text-stone-400"
          />
        </div>

        {/* Status Filter Tabs & Trainer selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-stone-100 p-1 rounded-lg w-full sm:w-auto justify-between sm:justify-start">
            {(['ALL', 'ACTIVE', 'ATTENTION', 'PAUSED', 'ENDED'] as const).map((st) => (
              <button
                key={st}
                id={`filter-status-${st.toLowerCase()}`}
                onClick={() => setStatusFilter(st)}
                className={`flex-1 sm:flex-none px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer text-center ${
                  statusFilter === st
                    ? st === 'ATTENTION'
                      ? 'bg-amber-100 text-amber-900 font-bold shadow-xs'
                      : 'bg-white text-stone-900 font-bold shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {st === 'ALL'
                  ? '전체'
                  : st === 'ACTIVE'
                  ? '활성'
                  : st === 'ATTENTION'
                  ? `관리 필요${attentionMemberIds.size > 0 ? ` (${attentionMemberIds.size})` : ''}`
                  : st === 'PAUSED'
                  ? '일시정지'
                  : '종료'}
              </button>
            ))}
          </div>

          {/* Trainer Filter (CENTER_ADMIN only) */}
          {currentUser?.role === 'CENTER_ADMIN' && trainers.length > 0 && (
            <div className="flex items-center gap-1.5 w-full sm:w-auto sm:pl-2 sm:border-l sm:border-stone-200">
              <Filter className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <select
                id="filter-trainer-select"
                value={selectedTrainerFilter}
                onChange={(e) => setSelectedTrainerFilter(e.target.value)}
                className="w-full sm:w-auto px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-900 cursor-pointer"
              >
                <option value="ALL">전체 트레이너</option>
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

      {/* Content Area: Loading / Error / Empty / Table */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-stone-400">
          <RefreshCw className="w-6 h-6 animate-spin mb-2" />
          <p className="text-sm">회원 정보를 불러오는 중입니다...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          <p className="font-semibold">{error}</p>
          <button
            onClick={fetchMembersData}
            className="mt-2 text-xs font-medium text-rose-700 underline"
          >
            다시 시도
          </button>
        </div>
      ) : members.length === 0 ? (
        /* True Empty State for center */
        <EmptyState
          id="empty-member-list-center"
          icon={Users}
          title="등록된 회원이 없습니다"
          description="현재 센터에 등록된 회원 데이터가 없습니다. 신규 회원을 등록하거나 상단의 'Firestore 데이터 생성' 버튼을 눌러 샘플 회원 데이터를 생성할 수 있습니다."
          actionText="신규 회원 등록"
          onAction={onOpenNewMemberModal}
        />
      ) : filteredMembers.length === 0 ? (
        /* Empty State for filter query */
        <EmptyState
          id="empty-member-list-search"
          icon={Search}
          title="조건에 일치하는 회원이 없습니다"
          description="검색어나 필터 조건을 변경하여 다시 확인해보세요."
          actionText="필터 초기화"
          onAction={() => {
            setSearchQuery('');
            setStatusFilter('ALL');
            setSelectedTrainerFilter('ALL');
          }}
        />
      ) : (
        /* Members List Container */
        <div>
          {/* Mobile Card View (visible on small screens < md) */}
          <div className="md:hidden space-y-3">
            {filteredMembers.map((member) => {
              const trainerName = trainerMap.get(member.trainerId) || '미지정';
              return (
                <div
                  key={member.memberId}
                  id={`member-card-${member.memberId}`}
                  onClick={() => onSelectMember(member.memberId)}
                  className="bg-white rounded-xl border border-stone-200 p-4 shadow-xs hover:border-stone-400 transition-all cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-stone-900 text-white font-bold text-sm flex items-center justify-center shrink-0">
                        {member.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-900 text-base">
                            {member.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 font-medium">
                            {member.gender === 'MALE' ? '남' : member.gender === 'FEMALE' ? '여' : '기타'}
                          </span>
                        </div>
                        <span className="text-xs text-stone-400 font-mono">
                          {member.memberId}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                        member.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : member.status === 'PAUSED'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-stone-100 text-stone-600 border border-stone-200'
                      }`}
                    >
                      {member.status === 'ACTIVE'
                        ? '활성'
                        : member.status === 'PAUSED'
                        ? '일시정지'
                        : '종료'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100 text-xs text-stone-600">
                    <div className="flex items-center gap-1.5 truncate">
                      <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="font-mono truncate">{member.phone}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <UserCheck className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="truncate font-medium text-stone-800">{trainerName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate text-[11px] text-stone-500">
                      <Calendar className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span>시작: {member.startDate}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-stone-900 col-span-2 pt-1 border-t border-stone-50">
                      <button
                        type="button"
                        id={`edit-member-btn-mobile-${member.memberId}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingMember(member);
                          setIsEditModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3 h-3 text-stone-600" />
                        <span>수정</span>
                      </button>

                      <div className="flex items-center gap-1 text-stone-900">
                        <span>여정 상세</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (hidden on mobile, visible md and up) */}
          <div className="hidden md:block bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-stone-200 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                    <th className="py-3 px-4">회원명</th>
                    <th className="py-3 px-4">성별 / 생년월일</th>
                    <th className="py-3 px-4">연락처</th>
                    <th className="py-3 px-4">담당 트레이너</th>
                    <th className="py-3 px-4">시작일</th>
                    <th className="py-3 px-4">상태</th>
                    <th className="py-3 px-4 text-center">관리</th>
                    <th className="py-3 px-4 text-right">상세보기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {filteredMembers.map((member) => {
                    const trainerName = trainerMap.get(member.trainerId) || '미지정';
                    return (
                      <tr
                        key={member.memberId}
                        id={`member-row-${member.memberId}`}
                        onClick={() => onSelectMember(member.memberId)}
                        className="hover:bg-stone-50/80 transition-colors cursor-pointer group"
                      >
                        {/* Name */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-stone-100 text-stone-700 font-semibold text-xs flex items-center justify-center border border-stone-200">
                              {member.name.slice(0, 1)}
                            </div>
                            <div>
                              <span className="font-semibold text-stone-900 group-hover:text-stone-950 block">
                                {member.name}
                              </span>
                              <span className="text-[11px] text-stone-400 font-mono">
                                {member.memberId}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Gender & BirthDate */}
                        <td className="py-3.5 px-4 text-stone-600 text-xs">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-medium mr-1.5">
                            {member.gender === 'MALE' ? '남성' : member.gender === 'FEMALE' ? '여성' : '기타'}
                          </span>
                          {member.birthDate}
                        </td>

                        {/* Phone */}
                        <td className="py-3.5 px-4 text-stone-600 text-xs">
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-stone-400" />
                            {member.phone}
                          </span>
                        </td>

                        {/* Trainer */}
                        <td className="py-3.5 px-4 text-stone-700 text-xs font-medium">
                          <span className="flex items-center gap-1">
                            <UserCheck className="w-3 h-3 text-stone-400" />
                            {trainerName}
                          </span>
                        </td>

                        {/* Start Date */}
                        <td className="py-3.5 px-4 text-stone-600 text-xs">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-stone-400" />
                            {member.startDate}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                              member.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : member.status === 'PAUSED'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-stone-100 text-stone-600 border border-stone-200'
                            }`}
                          >
                            {member.status === 'ACTIVE'
                              ? '활성 (ACTIVE)'
                              : member.status === 'PAUSED'
                              ? '일시정지 (PAUSED)'
                              : '종료 (ENDED)'}
                          </span>
                        </td>

                        {/* Edit Action */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            id={`edit-member-btn-desktop-${member.memberId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingMember(member);
                              setIsEditModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-stone-700 hover:text-stone-950 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3 text-stone-500" />
                            <span>수정</span>
                          </button>
                        </td>

                        {/* Detail Link */}
                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 group-hover:text-stone-900 transition-colors">
                            여정 보기
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
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

      {/* Edit Member Modal */}
      {isEditModalOpen && (
        <NewMemberModal
          isOpen={isEditModalOpen}
          member={editingMember}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingMember(null);
          }}
          onSuccess={() => {
            fetchMembersData();
            setIsEditModalOpen(false);
            setEditingMember(null);
          }}
        />
      )}
    </div>
  );
};
