import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  Dumbbell,
  LogOut,
  UserCircle,
  ClipboardList,
  RotateCcw
} from 'lucide-react';

export type NavTab = 'dashboard' | 'members' | 'leads' | 'renewals' | 'trainers';

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenNewMemberModal?: () => void;
  onOpenLoginModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  onOpenLoginModal
}) => {
  const { currentUser, logout, isAuthenticated } = useAuth();

  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand: itbody only */}
          <div className="flex items-center gap-3 md:gap-6 min-w-0">
            <div
              className="flex items-center cursor-pointer shrink-0"
              onClick={() => onTabChange('dashboard')}
            >
              <span className="text-xl md:text-2xl font-black text-stone-900 tracking-tight leading-none">
                itbody
              </span>
            </div>
          </div>

          {/* Desktop Navigation Items (hidden on mobile, served via bottom navigation) */}
          <nav className="hidden md:flex items-center gap-1 sm:gap-2">
            <button
              id="nav-tab-dashboard"
              onClick={() => onTabChange('dashboard')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                currentTab === 'dashboard'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>대시보드</span>
            </button>

            <button
              id="nav-tab-members"
              onClick={() => onTabChange('members')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                currentTab === 'members'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>회원 목록</span>
            </button>

            <button
              id="nav-tab-leads"
              onClick={() => onTabChange('leads')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                currentTab === 'leads'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>신규문의</span>
            </button>

            {currentUser?.role !== 'MEMBER' && (
              <button
                id="nav-tab-renewals"
                onClick={() => onTabChange('renewals')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  currentTab === 'renewals'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                <span>재등록 관리</span>
              </button>
            )}

            <button
              id="nav-tab-trainers"
              onClick={() => onTabChange('trainers')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                currentTab === 'trainers'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <Dumbbell className="w-4 h-4" />
              <span>트레이너</span>
            </button>
          </nav>

          {/* Right Action & User Profile */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* User profile & Role Badge */}
            {isAuthenticated && currentUser ? (
              <div className="flex items-center gap-1.5 sm:gap-2 pl-2 border-l border-stone-200">
                <div className="flex flex-col text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-xs font-semibold text-stone-900 max-w-[80px] sm:max-w-[120px] truncate">
                      {currentUser.name}
                    </span>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        currentUser.role === 'CENTER_ADMIN'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-blue-100 text-blue-800 border border-blue-300'
                      }`}
                    >
                      {currentUser.role === 'CENTER_ADMIN' ? '관리자' : '트레이너'}
                    </span>
                  </div>
                  <span className="text-[10px] sm:text-[11px] text-stone-500 hidden sm:block max-w-[120px] truncate">
                    {currentUser.email}
                  </span>
                </div>

                <button
                  id="user-logout-btn"
                  onClick={logout}
                  title="로그아웃"
                  className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                id="open-login-btn"
                onClick={onOpenLoginModal}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 text-xs font-medium cursor-pointer"
              >
                <UserCircle className="w-4 h-4" />
                <span>로그인</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
