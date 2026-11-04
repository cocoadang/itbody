import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getDashboardMetrics, getAttentionMembers, getWeeklyActivitySummary } from '../services/dataService';
import type { DashboardMetrics, PtSession, Member, AttentionMemberItem, WeeklyActivitySummary } from '../types';
import { EmptyState } from './EmptyState';
import { UnreadCommentsCard } from './journal/UnreadCommentsCard';
import { LeadPerformanceDashboard } from './LeadPerformanceDashboard';
import { RenewalPerformanceDashboard } from './RenewalPerformanceDashboard';
import {
  Calendar,
  Users,
  AlertCircle,
  UserPlus,
  Clock,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  UserCheck,
  Target,
  FileQuestion,
  Flame
} from 'lucide-react';

interface DashboardViewProps {
  onNavigateToMembers: (filter?: 'ALL' | 'ACTIVE' | 'ATTENTION') => void;
  onOpenNewMemberModal: () => void;
  onSelectMember: (memberId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateToMembers,
  onOpenNewMemberModal,
  onSelectMember
}) => {
  const { currentUser, currentCenterName } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    todayPtCount: 0,
    activeMemberCount: 0,
    needsAttentionCount: 0,
    recentRegistrationCount: 0
  });
  const [todaySessions, setTodaySessions] = useState<PtSession[]>([]);
  const [recentMembers, setRecentMembers] = useState<Member[]>([]);
  const [attentionMembers, setAttentionMembers] = useState<AttentionMemberItem[]>([]);
  const [weeklyActivity, setWeeklyActivity] = useState<WeeklyActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setError(null);
      const [dashData, attentionData, weeklyData] = await Promise.all([
        getDashboardMetrics(currentUser.centerId, currentUser.role, currentUser.trainerId),
        getAttentionMembers(currentUser.centerId, currentUser.role, currentUser.trainerId),
        getWeeklyActivitySummary(
          currentUser.centerId,
          null,
          undefined,
          currentUser.role === 'TRAINER' ? currentUser.trainerId : null
        )
      ]);
      setMetrics(dashData.metrics);
      setTodaySessions(dashData.todaySessions);
      setRecentMembers(dashData.recentMembers);
      setAttentionMembers(attentionData);
      setWeeklyActivity(weeklyData);
    } catch (err) {
      console.error('[Dashboard fetch error]', err);
      setError('Firestore에서 대시보드 데이터를 불러오지 못했습니다. 네트워크 연결을 확인해주세요.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <div id="dashboard-view" className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-2 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            메인 대시보드
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            {currentCenterName}의 실시간 트레이닝 현황과 회원 지표를 한눈에 파악합니다.
            {currentUser?.role === 'TRAINER' && (
              <span className="text-blue-700 font-medium ml-1 block sm:inline">
                (현재 담당 트레이너 배정 회원 기준 표시)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="refresh-dashboard-btn"
            onClick={fetchDashboardData}
            disabled={loading}
            className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
          <button
            id="dashboard-new-member-btn"
            onClick={onOpenNewMemberModal}
            className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer active:scale-95 whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            신규 회원 등록
          </button>
        </div>
      </div>

      <UnreadCommentsCard onSelectMember={onSelectMember} />

      {/* Error alert if any */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">데이터 동기화 알림</p>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchDashboardData}
            className="text-xs font-semibold text-rose-800 underline hover:text-rose-900"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 4 Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: 오늘 PT */}
        <div
          id="metric-card-today-pt"
          className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              오늘 PT
            </span>
            <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-stone-900 tracking-tight">
              {loading ? '-' : metrics.todayPtCount}
              <span className="text-sm font-normal text-stone-500 ml-1">건</span>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              오늘 예정된 1:1 세션
            </p>
          </div>
        </div>

        {/* Card 2: 활성 회원 */}
        <div
          id="metric-card-active-members"
          onClick={() => onNavigateToMembers('ACTIVE')}
          className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs flex flex-col justify-between cursor-pointer hover:border-emerald-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider group-hover:text-emerald-700 transition-colors">
              활성 회원
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-stone-900 tracking-tight flex items-baseline justify-between">
              <span>
                {loading ? '-' : metrics.activeMemberCount}
                <span className="text-sm font-normal text-stone-500 ml-1">명</span>
              </span>
              <span className="text-xs text-emerald-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                목록 보기 <ArrowRight className="w-3 h-3" />
              </span>
            </div>
            <p className="text-xs text-emerald-700 mt-1 font-medium">
              현재 정상 수강 중인 회원
            </p>
          </div>
        </div>

        {/* Card 3: 관리 필요 회원 */}
        <div
          id="metric-card-attention-members"
          onClick={() => onNavigateToMembers('ATTENTION')}
          className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs flex flex-col justify-between cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider group-hover:text-amber-800 transition-colors">
              관리 필요 회원
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-stone-900 tracking-tight flex items-baseline justify-between">
              <span>
                {loading ? '-' : attentionMembers.length}
                <span className="text-sm font-normal text-stone-500 ml-1">명</span>
              </span>
              <span className="text-xs text-amber-700 font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                목록 보기 <ArrowRight className="w-3 h-3" />
              </span>
            </div>
            <p className="text-xs text-amber-700 mt-1 font-medium">
              잔여 횟수 소진/미출석/목표 점검 대상
            </p>
          </div>
        </div>

        {/* Card 4: 최근 등록 회원 */}
        <div
          id="metric-card-recent-members"
          onClick={() => onNavigateToMembers('ALL')}
          className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs flex flex-col justify-between cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider group-hover:text-blue-700 transition-colors">
              최근 등록 회원
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-stone-900 tracking-tight flex items-baseline justify-between">
              <span>
                {loading ? '-' : metrics.recentRegistrationCount}
                <span className="text-sm font-normal text-stone-500 ml-1">명</span>
              </span>
              <span className="text-xs text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                목록 보기 <ArrowRight className="w-3 h-3" />
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              최근 30일 이내 신규 등록
            </p>
          </div>
        </div>
      </div>

      {/* Phase 6: Weekly Combined Activity (PT 수업 + 개인운동 함께 집계) */}
      <div
        id="weekly-activity-combined-card"
        className="bg-white rounded-xl border border-stone-200 shadow-xs p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                주간 총 운동 활동 집계 (PT 수업 + 개인운동)
              </h3>
              <p className="text-xs text-stone-500">
                {weeklyActivity ? (
                  <span>
                    집계 기간: {weeklyActivity.weekStart} ~ {weeklyActivity.weekEnd} (월~일 기준)
                  </span>
                ) : (
                  '이번 주 운동 활동 집계'
                )}
              </p>
            </div>
          </div>

          <span className="text-xs text-stone-500 bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200 font-medium self-start sm:self-auto">
            주간 운동횟수 = PT 수업 + 개인운동
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-100 flex items-center justify-between">
            <div>
              <span className="text-xs text-stone-500 font-medium block">PT 완료 수업</span>
              <span className="text-2xl font-bold font-mono text-stone-900 block mt-0.5">
                {loading || !weeklyActivity ? '-' : weeklyActivity.ptCount}
                <span className="text-xs font-normal text-stone-500 ml-1">회</span>
              </span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-purple-700">
              <Calendar className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/70 flex items-center justify-between">
            <div>
              <span className="text-xs text-amber-800 font-medium block">개인운동 완료</span>
              <span className="text-2xl font-bold font-mono text-amber-950 block mt-0.5">
                {loading || !weeklyActivity ? '-' : weeklyActivity.soloCount}
                <span className="text-xs font-normal text-amber-700 ml-1">회</span>
              </span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-white border border-amber-200 flex items-center justify-center text-amber-700">
              <Flame className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 bg-stone-900 text-white rounded-xl shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs text-stone-300 font-medium block">주간 총 운동량</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-bold font-mono text-white">
                  {loading || !weeklyActivity ? '-' : weeklyActivity.totalCount}
                  <span className="text-xs font-normal text-stone-300 ml-1">회</span>
                </span>
                {weeklyActivity && (
                  <span className="text-[11px] text-amber-300 font-medium hidden md:inline">
                    (PT {weeklyActivity.ptCount}회 + 개인운동 {weeklyActivity.soloCount}회)
                  </span>
                )}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center text-amber-400">
              <Target className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Phase 8E: 신규문의·OT 성과 분석 대시보드 (MEMBER에게는 표시되지 않음) */}
      {currentUser?.role !== 'MEMBER' && (
        <LeadPerformanceDashboard />
      )}

      {/* Phase 9D: PT 재등록 성과 분석 대시보드 (MEMBER에게는 표시되지 않음) */}
      {currentUser?.role !== 'MEMBER' && (
        <RenewalPerformanceDashboard />
      )}

      {/* Attention Members Section (Phase 2 Requirement: Care & Follow-up, NOT Sales CRM) */}
      {attentionMembers.length > 0 && (
        <div className="bg-amber-50/40 border border-amber-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-bold text-amber-950">
                트레이닝 케어 및 일정 점검 필요 회원 ({attentionMembers.length}명)
              </h3>
            </div>
            <span className="text-xs text-amber-800 font-medium">
              잔여 회차 안내, 장기 미출석 확인 및 목표 설정 필요
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {attentionMembers.map((item) => (
              <div
                key={item.member.memberId}
                className="bg-white p-3.5 rounded-lg border border-amber-200/80 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-stone-900">
                      {item.member.name} 회원님
                    </span>
                    {item.remainingSessions !== undefined && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                        잔여 {item.remainingSessions}회
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mb-2">
                    {item.reasons.map((r, rIdx) => {
                      const code = item.reasonCodes[rIdx];
                      const isReviewDue = code === 'PROGRESS_REVIEW_DUE';
                      return (
                        <div
                          key={rIdx}
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded mr-1.5 mb-1 border ${
                            isReviewDue
                              ? 'text-purple-900 bg-purple-50 border-purple-200'
                              : 'text-amber-900 bg-amber-50 border-amber-200/60'
                          }`}
                        >
                          <AlertCircle
                            className={`w-3 h-3 shrink-0 ${
                              isReviewDue ? 'text-purple-600' : 'text-amber-600'
                            }`}
                          />
                          <span>{r}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                  <span className="text-[11px] text-stone-400 font-mono">
                    {item.member.phone}
                  </span>
                  <button
                    onClick={() => onSelectMember(item.member.memberId)}
                    className="text-xs font-semibold text-stone-900 hover:text-stone-700 flex items-center gap-1 cursor-pointer"
                  >
                    회원 관리 <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two Column Layout: Today's Schedule & Recent Members */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: 오늘 PT 일정 */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-stone-500" />
              <h2 className="text-base font-bold text-stone-900">
                오늘의 PT 일정
              </h2>
            </div>
            <span className="text-xs text-stone-400 font-medium">
              {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
            </span>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center text-stone-400 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 일정을 불러오는 중입니다...
            </div>
          ) : todaySessions.length === 0 ? (
            <EmptyState
              id="empty-today-sessions"
              icon={Calendar}
              title="오늘 예정된 PT 일정이 없습니다"
              description="오늘 등록된 1:1 PT 세션이 없습니다. 회원의 수업 일정이 생기면 여기에 표시됩니다."
            />
          ) : (
            <div className="divide-y divide-stone-100">
              {todaySessions.map((session) => (
                <div
                  key={session.sessionId}
                  onClick={() => onSelectMember(session.memberId)}
                  className="py-3 flex items-center justify-between hover:bg-stone-50 px-2 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 rounded bg-stone-100 text-stone-800 text-xs font-semibold">
                      {session.time}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-stone-900">
                        {session.memberName} 회원님
                      </p>
                      <p className="text-xs text-stone-500">
                        담당: {session.trainerName || '트레이너'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      session.status === 'COMPLETED'
                        ? 'bg-stone-100 text-stone-600'
                        : session.status === 'CANCELLED'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {session.status === 'COMPLETED' ? '완료' : session.status === 'CANCELLED' ? '취소' : '예정'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: 최근 등록 회원 */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-stone-500" />
              <h2 className="text-base font-bold text-stone-900">
                최근 등록 회원
              </h2>
            </div>
            <button
              onClick={() => onNavigateToMembers('ALL')}
              className="text-xs font-semibold text-stone-700 hover:text-stone-950 flex items-center gap-1 cursor-pointer"
            >
              전체 보기 <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center text-stone-400 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 회원 목록을 불러오는 중입니다...
            </div>
          ) : recentMembers.length === 0 ? (
            <EmptyState
              id="empty-recent-members"
              icon={Users}
              title="등록된 회원이 없습니다"
              description="현재 센터에 등록된 회원이 존재하지 않습니다. 첫 회원을 등록하고 체계적인 트레이닝 여정을 시작해보세요."
              actionText="신규 회원 등록"
              onAction={onOpenNewMemberModal}
            />
          ) : (
            <div className="divide-y divide-stone-100">
              {recentMembers.map((member) => (
                <div
                  key={member.memberId}
                  onClick={() => onSelectMember(member.memberId)}
                  className="py-3 flex items-center justify-between hover:bg-stone-50 px-2 rounded-lg transition-colors cursor-pointer group"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-stone-900 group-hover:text-stone-950">
                        {member.name}
                      </span>
                      <span className="text-xs text-stone-400">
                        ({member.gender === 'MALE' ? '남' : member.gender === 'FEMALE' ? '여' : '기타'}, {member.phone})
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      시작일: {member.startDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        member.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : member.status === 'PAUSED'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-stone-100 text-stone-600 border border-stone-200'
                      }`}
                    >
                      {member.status === 'ACTIVE' ? '활성' : member.status === 'PAUSED' ? '일시정지' : '종료'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-stone-300 group-hover:text-stone-600 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
