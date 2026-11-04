import { MemberAccessPanel } from './components/MemberAccessPanel';
import React, { Suspense, lazy, useState } from 'react';
import { isDevSandbox } from './firebase/config';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar, type NavTab } from './components/Navbar';
import { TenantVerificationBar } from './components/TenantVerificationBar';
const DashboardView = lazy(() => import('./components/DashboardView').then((m) => ({ default: m.DashboardView })));
const MemberList = lazy(() => import('./components/MemberList').then((m) => ({ default: m.MemberList })));
const MemberDetailView = lazy(() => import('./components/MemberDetailView').then((m) => ({ default: m.MemberDetailView })));
const TrainerList = lazy(() => import('./components/TrainerList').then((m) => ({ default: m.TrainerList })));
const NewMemberModal = lazy(() => import('./components/NewMemberModal').then((m) => ({ default: m.NewMemberModal })));
import { LoginModal } from './components/LoginModal';
import { LoginView } from './components/LoginView';
const MemberPortal = lazy(() => import('./components/member/MemberPortal').then((m) => ({ default: m.MemberPortal })));
const LeadList = lazy(() => import('./components/LeadList').then((m) => ({ default: m.LeadList })));
const RenewalManagementView = lazy(() => import('./components/RenewalManagementView').then((m) => ({ default: m.RenewalManagementView })));
import { LayoutDashboard, Users, Dumbbell, ClipboardList, RotateCcw } from 'lucide-react';

const ScreenLoading = () => (
  <div className="py-16 flex justify-center">
    <div className="w-7 h-7 rounded-full border-2 border-stone-300 border-t-stone-900 animate-spin" />
  </div>
);

function MainApp() {
  const { currentUser, isLoading, memberAccount, firebaseAuthUser } = useAuth();
  const [showMemberAccess, setShowMemberAccess] = useState(false);
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberListInitialFilter, setMemberListInitialFilter] = useState<'ALL' | 'ACTIVE' | 'ATTENTION'>('ALL');

  // Modals
  const [isNewMemberModalOpen, setIsNewMemberModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Key to force refresh of data across children when seed or role changes
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDataChanged = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleSelectMember = (memberId: string) => {
    setSelectedMemberId(memberId);
  };

  const handleBackToMemberList = () => {
    setSelectedMemberId(null);
  };

  const handleTabChange = (tab: NavTab) => {
    setSelectedMemberId(null);
    if (tab === 'members') {
      setMemberListInitialFilter('ALL');
    }
    setCurrentTab(tab);
  };

  const handleNavigateToMembers = (filter: 'ALL' | 'ACTIVE' | 'ATTENTION' = 'ALL') => {
    setSelectedMemberId(null);
    setMemberListInitialFilter(filter);
    setCurrentTab('members');
  };

  const handleMemberCreated = (newMemberId: string) => {
    handleDataChanged();
    setSelectedMemberId(newMemberId);
  };

  // 1. Loading state during Firebase Auth & Firestore profile verification
  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-stone-600">
          <div className="w-8 h-8 rounded-full border-2 border-stone-300 border-t-stone-900 animate-spin" />
          <p className="text-xs font-semibold text-stone-700">로그인 상태 확인 중...</p>
        </div>
      </div>
    );
  }

  if (memberAccount && firebaseAuthUser && (!currentUser || showMemberAccess)) {
    return <MemberAccessPanel onClose={currentUser ? () => setShowMemberAccess(false) : undefined} />;
  }

  // 2. Unauthenticated Gate: Show LoginView exclusively when not logged in
  if (!currentUser) {
    return <><TenantVerificationBar onDataChanged={handleDataChanged} />{isDevSandbox ? <main className="max-w-lg mx-auto p-8 text-center space-y-3"><h1 className="text-2xl font-bold">개발용 가상 계정 선택</h1><p>상단에서 관리자, 트레이너 또는 회원 테스트를 선택해주세요.</p><p className="text-sm text-stone-500">가상 데이터로 동작하며 실제 회원 계정 로그인은 배포 사이트에서 이용할 수 있습니다.</p></main> : <LoginView />}</>;
  }

  // 3. MEMBER Role Routing: Render dedicated mobile-first Member Portal
  if (currentUser.role === 'MEMBER') {
    return (
      <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col font-sans antialiased selection:bg-stone-900 selection:text-white">
        {/* Top Tenant & RBAC Verification Toolbar (DEV mode only) */}
        <TenantVerificationBar onDataChanged={handleDataChanged} />

        {/* Dedicated Member Mobile Portal */}
        <Suspense fallback={<ScreenLoading />}>
          <MemberPortal key={`member-portal-${currentUser.memberId}-${currentUser.centerId}-${refreshKey}`} />
        </Suspense>

        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100/70 text-stone-900 flex flex-col font-sans antialiased selection:bg-stone-900 selection:text-white">
      {/* 1. Top Tenant & RBAC Verification Toolbar */}
      <TenantVerificationBar onDataChanged={handleDataChanged} />

      {/* 2. Main Navigation Bar */}
      <Navbar
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onOpenNewMemberModal={() => setIsNewMemberModalOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
      />

      {/* 3. Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-6">
        <Suspense fallback={<ScreenLoading />}>
        {selectedMemberId ? (
          /* Member Detail View */
          <MemberDetailView
            key={`detail-${selectedMemberId}-${refreshKey}`}
            memberId={selectedMemberId}
            onBack={handleBackToMemberList}
          />
        ) : (
          /* Tab Views */
          <div key={`tab-${currentTab}-${currentUser?.uid}-${refreshKey}`}>
            {currentTab === 'dashboard' && (
              <DashboardView
                onNavigateToMembers={handleNavigateToMembers}
                onOpenNewMemberModal={() => setIsNewMemberModalOpen(true)}
                onSelectMember={handleSelectMember}
              />
            )}

            {currentTab === 'members' && (
              <MemberList
                key={`members-list-${memberListInitialFilter}-${refreshKey}`}
                initialFilter={memberListInitialFilter}
                onSelectMember={handleSelectMember}
                onOpenNewMemberModal={() => setIsNewMemberModalOpen(true)}
              />
            )}

            {currentTab === 'leads' && <LeadList onSelectMember={handleSelectMember} />}

            {currentTab === 'renewals' && (
              <RenewalManagementView onSelectMember={handleSelectMember} />
            )}

            {currentTab === 'trainers' && <TrainerList />}
          </div>
        )}
        </Suspense>
      </main>

      {/* 4. Footer with phase info */}
      <footer className="bg-white border-t border-stone-200 py-4 mt-auto text-center text-xs text-stone-500 mb-16 md:mb-0">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            <strong>ITBODY</strong> &copy; {new Date().getFullYear()} — PT 회원관리 및 성장 여정 시각화 플랫폼
          </p>
          <div className="flex items-center gap-3 text-stone-400">
            <span>스마트 PT 회원 관리 및 성장 여정 시스템</span>
            <span>•</span>
            <span>Firestore 안전 데이터 격리</span>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (Visible only on mobile md:hidden) */}
      <nav
        id="mobile-bottom-nav"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 px-2 py-1 shadow-lg"
      >
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          <button
            type="button"
            id="mobile-nav-dashboard"
            onClick={() => handleTabChange('dashboard')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
              currentTab === 'dashboard' && !selectedMemberId
                ? 'text-stone-900 font-bold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <div
              className={`p-1 rounded-md mb-0.5 ${
                currentTab === 'dashboard' && !selectedMemberId ? 'bg-stone-900 text-white' : 'text-stone-500'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
            </div>
            <span>대시보드</span>
          </button>

          <button
            type="button"
            id="mobile-nav-members"
            onClick={() => handleTabChange('members')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
              (currentTab === 'members' || selectedMemberId)
                ? 'text-stone-900 font-bold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <div
              className={`p-1 rounded-md mb-0.5 ${
                (currentTab === 'members' || selectedMemberId) ? 'bg-stone-900 text-white' : 'text-stone-500'
              }`}
            >
              <Users className="w-4 h-4" />
            </div>
            <span>회원목록</span>
          </button>

          <button
            type="button"
            id="mobile-nav-leads"
            onClick={() => handleTabChange('leads')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
              currentTab === 'leads' && !selectedMemberId
                ? 'text-stone-900 font-bold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <div
              className={`p-1 rounded-md mb-0.5 ${
                currentTab === 'leads' && !selectedMemberId ? 'bg-stone-900 text-white' : 'text-stone-500'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
            </div>
            <span>신규문의</span>
          </button>

          <button
            type="button"
            id="mobile-nav-renewals"
            onClick={() => handleTabChange('renewals')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
              currentTab === 'renewals' && !selectedMemberId
                ? 'text-stone-900 font-bold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <div
              className={`p-1 rounded-md mb-0.5 ${
                currentTab === 'renewals' && !selectedMemberId ? 'bg-stone-900 text-white' : 'text-stone-500'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
            </div>
            <span>재등록</span>
          </button>

          <button
            type="button"
            id="mobile-nav-trainers"
            onClick={() => handleTabChange('trainers')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
              currentTab === 'trainers' && !selectedMemberId
                ? 'text-stone-900 font-bold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <div
              className={`p-1 rounded-md mb-0.5 ${
                currentTab === 'trainers' && !selectedMemberId ? 'bg-stone-900 text-white' : 'text-stone-500'
              }`}
            >
              <Dumbbell className="w-4 h-4" />
            </div>
            <span>트레이너</span>
          </button>
        </div>
      </nav>

      {/* 5. Modals */}
      {isNewMemberModalOpen && (
        <Suspense fallback={null}>
          <NewMemberModal
            isOpen={isNewMemberModalOpen}
            onClose={() => setIsNewMemberModalOpen(false)}
            onSuccess={handleMemberCreated}
          />
        </Suspense>
      )}

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </div>
  );
}

function AuthenticatedApp() {
  const { currentUser } = useAuth();
  return <MainApp key={currentUser?.uid || 'signed-out'} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}

