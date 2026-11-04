import React, { useState, useEffect, useCallback } from 'react';
import {
  Home,
  Calendar,
  Target,
  Camera,
  Award,
  User,
  LogOut,
  RefreshCw,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  X,
  Activity
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getMemberById,
  getConsultationByMemberId,
  getGoalsByMember,
  getContractsByMember,
  getPtSessionsByMember,
  getBodyMeasurementsByMember,
  getProgressPhotos,
  getProgressReviews,
  getWeeklyActivitySummary
} from '../../services/dataService';
import type {
  Member,
  PtContract,
  PtSession,
  MemberGoal,
  BodyMeasurement,
  ProgressPhoto,
  ProgressReview,
  Consultation,
  WeeklyActivitySummary
} from '../../types';
import { MemberSimpleHome } from './MemberSimpleHome';
import { MemberJournalTab } from './MemberJournalTab';
import { MemberBodyTab } from './MemberBodyTab';

export type MemberPortalTab = 'home' | 'sessions' | 'body';

interface MemberPortalProps {
  memberIdOverride?: string | null;
  onLogout?: () => void;
}

export const MemberPortal: React.FC<MemberPortalProps> = ({ memberIdOverride, onLogout }) => {
  const { currentUser, currentCenterName, logout } = useAuth();
  const effectiveMemberId = memberIdOverride || currentUser?.memberId;

  const [activeTab, setActiveTab] = useState<MemberPortalTab>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<PtSession | null>(null);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      setIsMenuOpen(false);
      if (onLogout) {
        onLogout();
      } else {
        await logout();
      }
    } catch (err) {
      console.warn('Member logout warning:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Data states
  const [member, setMember] = useState<Member | null>(null);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [contracts, setContracts] = useState<PtContract[]>([]);
  const [sessions, setSessions] = useState<PtSession[]>([]);
  const [goals, setGoals] = useState<MemberGoal[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [reviews, setReviews] = useState<ProgressReview[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklyActivitySummary | null>(null);

  const loadMemberData = useCallback(async (isSilent = false) => {
    if (!currentUser?.centerId || !effectiveMemberId) {
      setIsLoading(false);
      return;
    }

    try {
      if (!isSilent) {
        setIsLoading(true);
      }
      const role = currentUser.role || 'MEMBER';
      const trainerId = currentUser.trainerId || null;

      const [
        memberRes,
        consultRes,
        contractsRes,
        sessionsRes,
        goalsRes,
        measurementsRes,
        photosRes,
        reviewsRes,
        weeklyRes
      ] = await Promise.all([
        getMemberById(currentUser.centerId, effectiveMemberId, role, trainerId, effectiveMemberId),
        getConsultationByMemberId(currentUser.centerId, effectiveMemberId, role, trainerId, effectiveMemberId),
        getContractsByMember(currentUser.centerId, effectiveMemberId, role, trainerId, effectiveMemberId),
        getPtSessionsByMember(currentUser.centerId, effectiveMemberId, role, trainerId, effectiveMemberId),
        getGoalsByMember(currentUser.centerId, effectiveMemberId, role, trainerId, effectiveMemberId),
        getBodyMeasurementsByMember(currentUser.centerId, effectiveMemberId, role, trainerId, effectiveMemberId),
        getProgressPhotos(currentUser.centerId, effectiveMemberId, role, trainerId, effectiveMemberId),
        getProgressReviews(currentUser.centerId, effectiveMemberId, role, trainerId, effectiveMemberId),
        getWeeklyActivitySummary(currentUser.centerId, effectiveMemberId)
      ]);

      setMember(memberRes);
      setConsultation(consultRes);
      setContracts(contractsRes);
      setSessions(sessionsRes);
      setGoals(goalsRes);
      setMeasurements(measurementsRes);
      setPhotos(photosRes);
      setReviews(reviewsRes);
      setWeeklySummary(weeklyRes);
    } catch (err) {
      console.error('Failed to load member portal data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.centerId, effectiveMemberId]);

  useEffect(() => {
    loadMemberData();
  }, [loadMemberData]);

  const handleSelectSessionFromHome = (s: PtSession) => {
    setSelectedSessionForModal(s);
    setActiveTab('sessions');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-purple-600 animate-spin mx-auto" />
          <p className="text-xs text-stone-600 font-medium">회원님의 PT 여정 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // If member record not found
  if (!member) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-stone-200 p-8 max-w-sm w-full text-center space-y-4 shadow-sm">
          <ShieldCheck className="w-10 h-10 text-stone-400 mx-auto" />
          <div>
            <h3 className="text-base font-bold text-stone-900">회원 정보를 찾을 수 없습니다</h3>
            <p className="text-xs text-stone-500 mt-1">
              현재 로그인된 계정에 연결된 회원 정보({effectiveMemberId || 'ID 없음'})가 존재하지 않거나,
              접근 권한이 격리되어 있습니다.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={onLogout || logout}
              className="w-full py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors cursor-pointer"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col justify-between overflow-x-hidden font-sans">
      {/* Mobile Shell Container */}
      <div className="w-full max-w-md mx-auto bg-stone-50 min-h-screen flex flex-col shadow-xl relative border-x border-stone-200/70">
        {/* 1. Mobile Top Header: itbody on left, Member Profile on right */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200/80 px-4 py-3 flex items-center justify-between">
          {/* Logo & Brand: itbody only (Navbar와 동일한 글꼴·굵기·크기) */}
          <div className="flex items-center">
            <span className="text-xl md:text-2xl font-black text-stone-900 tracking-tight leading-none">
              itbody
            </span>
          </div>

          {/* Right Header: Profile Button with Dropdown Trigger */}
          <div className="relative">
            <button
              type="button"
              id="btn-member-profile"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-expanded={isMenuOpen}
              aria-haspopup="true"
              aria-label="회원 메뉴 열기"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200/70 border border-stone-200 transition-colors text-xs text-stone-800 font-semibold cursor-pointer active:scale-95"
            >
              <div className="w-5 h-5 rounded-full bg-purple-200 text-purple-800 flex items-center justify-center text-[10px] font-bold">
                {member.name.charAt(0)}
              </div>
              <span className="max-w-[70px] truncate">{member.name}</span>
              <ChevronDown
                className={`w-3 h-3 text-stone-400 transition-transform duration-150 ${
                  isMenuOpen ? 'rotate-180 text-stone-700' : ''
                }`}
              />
            </button>

            {/* Mobile Dropdown Popover */}
            {isMenuOpen && (
              <>
                {/* Backdrop overlay for mobile & touch dismissal */}
                <div
                  className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[0.5px] transition-opacity"
                  onClick={() => setIsMenuOpen(false)}
                />

                <div
                  id="member-profile-dropdown"
                  className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl border border-stone-200 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                >
                  {/* User info header */}
                  <div className="p-3.5 bg-stone-50 border-b border-stone-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-sm shrink-0 border border-purple-200">
                        {member.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-stone-900 truncate">{member.name}</p>
                          <span className="text-[9px] font-semibold bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded">
                            회원
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 truncate mt-0.5 font-mono">
                          {currentUser?.email || member.email || member.phone}
                        </p>
                        <p className="text-[10px] text-stone-400 truncate mt-0.5">
                          {currentCenterName && !currentCenterName.startsWith('center-')
                            ? currentCenterName
                            : '잇바디피트니스'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Menu actions */}
                  <div className="p-1.5 space-y-1">
                    <button
                      type="button"
                      id="btn-member-view-profile"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setIsProfileModalOpen(true);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900 rounded-xl flex items-center justify-between transition-colors cursor-pointer active:bg-stone-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <User className="w-4 h-4 text-stone-500" />
                        <span>내 상세 정보</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                    </button>

                    <button
                      type="button"
                      id="btn-member-logout"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="w-full min-h-[44px] px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer active:scale-[0.98] disabled:opacity-50"
                    >
                      {isLoggingOut ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
                      ) : (
                        <LogOut className="w-4 h-4 text-rose-500" />
                      )}
                      <span>{isLoggingOut ? '로그아웃 중...' : '로그아웃'}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        {/* 2. Main Content Area (simplified: home, journal, body changes) */}
        <main className="flex-1 p-4 pb-24 overflow-y-auto">
          {activeTab === 'home' && (
            <MemberSimpleHome
              member={member}
              contracts={contracts}
              sessions={sessions}
              measurements={measurements}
              onOpenSession={(s) => { setSelectedSessionForModal(s); setActiveTab('sessions'); }}
              onOpenBody={() => setActiveTab('body')}
            />
          )}
          {activeTab === 'sessions' && (
            <MemberJournalTab
              memberId={member.memberId}
              sessions={sessions}
              focusSessionId={selectedSessionForModal?.sessionId || null}
              readOnly={currentUser?.role !== 'MEMBER'}
            />
          )}
          {activeTab === 'body' && <MemberBodyTab measurements={measurements} />}
        </main>

        {/* 3. Mobile Bottom Navigation Bar */}
        <nav
          id="member-bottom-nav"
          className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 shadow-lg max-w-md mx-auto"
        >
          <div className="grid grid-cols-3 h-16">
            {([
              ['home', Home, '홈'],
              ['sessions', Calendar, '수업 일지'],
              ['body', Activity, '몸 변화']
            ] as const).map(([tab, Icon, label]) => (
              <button
                key={tab}
                type="button"
                id={`tab-btn-${tab}`}
                onClick={() => { if (tab === 'sessions') setSelectedSessionForModal(null); setActiveTab(tab); }}
                className={`flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === tab ? 'text-stone-900 font-bold' : 'text-stone-400 hover:text-stone-600'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px]">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* 4. Member Profile & Security Modal */}
      {isProfileModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs"
          onClick={() => setIsProfileModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            id="member-profile-modal"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <User className="w-4 h-4 text-purple-600" />
                내 회원 정보
              </h3>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">회원 이름</span>
                <span className="font-bold text-stone-900">{member.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">연락처</span>
                <span className="font-mono text-stone-800">{member.phone}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">소속 센터</span>
                <span className="font-medium text-stone-800">
                  {currentCenterName && !currentCenterName.startsWith('center-')
                    ? currentCenterName
                    : '잇바디피트니스'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">담당 트레이너</span>
                <span className="font-semibold text-purple-800">
                  {consultation?.trainerName || '담당 트레이너'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">등록일자</span>
                <span className="font-mono text-stone-700">{member.startDate}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-stone-500">체형 사진 보관 동의</span>
                <span
                  className={`font-semibold ${
                    member.progressPhotoConsent?.granted
                      ? 'text-emerald-700'
                      : member.progressPhotoConsent?.revokedAt
                      ? 'text-rose-700'
                      : 'text-amber-700'
                  }`}
                >
                  {member.progressPhotoConsent?.granted
                    ? '동의 완료'
                    : member.progressPhotoConsent?.revokedAt
                    ? '동의 철회'
                    : '미동의'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-[11px] text-stone-500 space-y-1">
              <div className="flex items-center gap-1 font-semibold text-stone-700">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                보안 및 개인정보 보호 적용
              </div>
              <p>
                본 포털은 회원 본인 계정의 운동 여정 데이터만 안전하게 암호화 및 격리 조회합니다.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                id="member-modal-logout-btn"
                onClick={async () => {
                  setIsProfileModalOpen(false);
                  if (onLogout) {
                    onLogout();
                  } else {
                    await logout();
                  }
                }}
                className="flex-1 py-2 bg-stone-100 hover:bg-rose-50 text-stone-700 hover:text-rose-700 border border-stone-200 hover:border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>로그아웃</span>
              </button>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="flex-1 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
