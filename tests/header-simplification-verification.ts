import fs from 'fs';
import path from 'path';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${msg}`);
  }
  console.log(`[PASS] ${msg}`);
}

function runHeaderSimplificationVerification() {
  console.log('--- 1. Navbar.tsx Brand & Header Simplification Verification ---');

  const navbarPath = path.resolve(process.cwd(), 'src/components/Navbar.tsx');
  const navbarContent = fs.readFileSync(navbarPath, 'utf-8');

  // 1-1: Brand is itbody
  assert(navbarContent.includes('itbody'), 'Navbar renders itbody brand text');
  assert(!navbarContent.includes('PT Journey'), 'Navbar does NOT render PT Journey text');

  // 1-2: PT icon removed
  assert(!navbarContent.includes('>PT<') && !navbarContent.includes('> PT <'), 'PT square icon badge removed from Navbar');

  // 1-3: Center badge next to dashboard removed
  assert(!navbarContent.includes('Current Center Badge'), 'Current Center Badge comment/block removed');
  assert(!navbarContent.includes('{currentCenterName}'), 'currentCenterName badge removed from Navbar');

  // 1-4: Quick register member button in Navbar removed
  assert(!navbarContent.includes('nav-btn-register-member'), 'nav-btn-register-member removed from Navbar');
  assert(!navbarContent.includes('신규 회원 등록'), 'Navbar does not contain duplicate 신규 회원 등록 button');

  // 1-5: Menu tabs preserved
  assert(navbarContent.includes('nav-tab-dashboard'), 'nav-tab-dashboard preserved');
  assert(navbarContent.includes('nav-tab-members'), 'nav-tab-members preserved');
  assert(navbarContent.includes('nav-tab-leads'), 'nav-tab-leads preserved');
  assert(navbarContent.includes('nav-tab-renewals'), 'nav-tab-renewals preserved');
  assert(navbarContent.includes('nav-tab-trainers'), 'nav-tab-trainers preserved');

  // 1-6: User profile and logout button preserved
  assert(navbarContent.includes('currentUser.name'), 'currentUser.name preserved in Navbar');
  assert(navbarContent.includes('user-logout-btn'), 'user-logout-btn preserved in Navbar');

  console.log('--- 2. DashboardView.tsx Action Buttons Verification ---');

  const dashboardPath = path.resolve(process.cwd(), 'src/components/DashboardView.tsx');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

  // 2-1: Dashboard 본문 buttons preserved
  assert(dashboardContent.includes('dashboard-new-member-btn'), 'dashboard-new-member-btn preserved in Dashboard');
  assert(dashboardContent.includes('refresh-dashboard-btn'), 'refresh-dashboard-btn preserved in Dashboard');

  console.log('--- 3. TenantVerificationBar Developer Status Bar UI Removal ---');

  const tenantBarPath = path.resolve(process.cwd(), 'src/components/TenantVerificationBar.tsx');
  const tenantBarContent = fs.readFileSync(tenantBarPath, 'utf-8');

  // 3-1: Status bar UI elements removed (returns null)
  assert(tenantBarContent.includes('return null'), 'TenantVerificationBar returns null');
  assert(!tenantBarContent.includes('• DB 연결됨'), 'DB 연결됨 text removed from UI');
  assert(!tenantBarContent.includes('id="tenant-verification-bar"'), 'id="tenant-verification-bar" DOM container removed');

  console.log('--- 4. Mobile Navigation Preserved ---');

  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  assert(appContent.includes('mobile-bottom-nav'), 'Mobile bottom nav preserved in App.tsx');
  assert(appContent.includes('mobile-nav-dashboard'), 'mobile-nav-dashboard preserved');
  assert(appContent.includes('mobile-nav-members'), 'mobile-nav-members preserved');
  assert(appContent.includes('mobile-nav-leads'), 'mobile-nav-leads preserved');
  assert(appContent.includes('mobile-nav-renewals'), 'mobile-nav-renewals preserved');
  assert(appContent.includes('mobile-nav-trainers'), 'mobile-nav-trainers preserved');

  console.log('\n========================================');
  console.log('All Header Simplification Tests PASSED!');
  console.log('========================================');
}

runHeaderSimplificationVerification();
