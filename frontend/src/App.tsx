import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Grid2X2,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  UsersRound,
  UserRound,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ToastProvider, LoadingState } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';

const AuthPage = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.AuthPage })));
const UnauthorizedPage = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.UnauthorizedPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((module) => ({ default: module.UsersPage })));
const UserDetailPage = lazy(() => import('./pages/UsersPage').then((module) => ({ default: module.UserDetailPage })));
const ProfilePage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.ProfilePage })));
const SecurityPage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.SecurityPage })));
const ChangePasswordPage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.ChangePasswordPage })));
const MfaPage = lazy(() => import('./pages/AccountPages').then((module) => ({ default: module.MfaPage })));

function AuthGate() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function RoleGate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? children : <Navigate to="/unauthorized" replace />;
}

function AppShell() {
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = window.localStorage.getItem('nexus-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);
  const location = useLocation();
  const userName = user?.name ?? 'Account';
  const initials = userName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const pageTitles: Record<string, string> = {
    '/': 'Overview',
    '/users': 'User directory',
    '/users/new': 'Create user',
    '/profile': 'Your profile',
    '/security': 'Security settings',
    '/security/password': 'Change password',
    '/security/mfa': 'Multi-factor authentication',
  };
  const title = location.pathname.startsWith('/users/') && location.pathname !== '/users/new'
    ? 'User details'
    : pageTitles[location.pathname] ?? 'Workspace';

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    window.localStorage.setItem('nexus-theme', next);
  }

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className={`app-shell theme-${theme}`}>
      {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={closeSidebar} />}
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation">
        <div className="brand-row">
          <div className="brand-symbol" aria-hidden="true"><span /></div>
          <span className="brand-name">NEXUS<span> / CONTROL</span></span>
          <button className="icon-button sidebar-close" onClick={closeSidebar} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-avatar">N</span>
          <span><strong>Northstar Labs</strong><small>Enterprise workspace</small></span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </div>
        <nav className="nav-stack">
          <p className="nav-label">WORKSPACE</p>
          <NavLink to="/" end onClick={closeSidebar}><Grid2X2 size={17} />Overview</NavLink>
          {(user?.role === 'ADMIN' || user?.role === 'MODERATOR') && (
            <NavLink to="/users" onClick={closeSidebar}><UsersRound size={17} />User directory</NavLink>
          )}
          <p className="nav-label nav-label-spaced">ACCOUNT</p>
          <NavLink to="/profile" onClick={closeSidebar}><UserRound size={17} />My profile</NavLink>
          <NavLink to="/security" onClick={closeSidebar}><ShieldCheck size={17} />Security</NavLink>
          <div className="nav-substack">
            <NavLink to="/security/password" onClick={closeSidebar}>Change password</NavLink>
            <NavLink to="/security/mfa" onClick={closeSidebar}>Multi-factor authentication</NavLink>
          </div>
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><span className="status-dot" /><span>Secure session<small>Cookie renewal enabled</small></span></div>
          <div className="sidebar-user">
            <div className="avatar avatar-small">{initials || 'U'}</div>
            <div className="sidebar-user-copy"><strong>{userName}</strong><span>{user?.role.toLowerCase()}</span></div>
            <button className="icon-button" onClick={() => void signOut()} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{title}</strong></div>
          <div className="topbar-actions">
            <span className="topbar-date"><Activity size={14} />Live workspace</span>
            <button className="icon-button theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <NavLink className="topbar-avatar avatar" to="/profile" aria-label="Open profile">{initials || 'U'}</NavLink>
          </div>
        </header>
        <main className="content-area" id="main-content"><Outlet /></main>
        <footer className="app-footer"><span>NEXUS CONTROL</span><span>Identity operations · v1</span></footer>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState label="Opening workspace" />}><Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
      <Route path="/reset-password" element={<AuthPage mode="reset" />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route element={<AuthGate />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="users" element={<RoleGate roles={['ADMIN', 'MODERATOR']}><UsersPage /></RoleGate>} />
          <Route path="users/new" element={<RoleGate roles={['ADMIN']}><UsersPage createMode /></RoleGate>} />
          <Route path="users/:id" element={<UserDetailPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="security/password" element={<ChangePasswordPage />} />
          <Route path="security/mfa" element={<MfaPage />} />
          <Route path="*" element={<div className="not-found"><span>404</span><h1>Page not found</h1><p>This destination is not part of this workspace.</p><NavLink className="button button-primary" to="/">Return to overview</NavLink></div>} />
        </Route>
      </Route>
    </Routes></Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ErrorBoundary><AppRoutes /></ErrorBoundary>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}