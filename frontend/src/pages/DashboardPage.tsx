import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, ArrowUpRight as OpenIcon, CheckCircle2, CircleUserRound, KeyRound, ShieldCheck, UsersRound } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { request, ApiClientError } from '../api/client';
import { isUserList, isUserStats } from '../api/guards';
import { useAuth } from '../auth/AuthProvider';
import { EmptyState, LoadingState, PageHeading } from '../components/ui';
import type { User, UserStats } from '../types';

const chartColors = ['#76d7c4', '#e4b85d', '#d97565'];

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: typeof UsersRound; tone: string }) {
  return (
    <article className="metric-card">
      <div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={17} /></span></div>
      <strong className="metric-value">{value.toLocaleString()}</strong>
      <span className="metric-detail">{detail}</span>
      <span className="metric-mark" aria-hidden="true" />
    </article>
  );
}

function RegistrationList({ users }: { users: User[] }) {
  if (!users.length) return <EmptyState title="No registrations yet" description="New accounts will appear here when they are created." />;
  return (
    <div className="registration-list">
      {users.map((user) => (
        <Link className="registration-row" to={`/users/${user.id}`} key={user.id}>
          <div className="avatar avatar-row">{user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
          <div className="registration-copy"><strong>{user.name}</strong><span>{user.email}</span></div>
          <span className={`status-pill status-${user.status.toLowerCase()}`}>{user.status.toLowerCase()}</span>
          <span className="registration-date">{new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          <OpenIcon className="row-open-icon" size={15} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canList = user?.role === 'ADMIN' || user?.role === 'MODERATOR';
  const [stats, setStats] = useState<UserStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      const tasks: Promise<unknown>[] = [];
      if (isAdmin) tasks.push(request<UserStats>('/users/stats', { validateData: isUserStats }).then((response) => setStats(response.data)));
      if (canList) {
        tasks.push(
          request<User[]>('/users?page=1&limit=5&sortBy=createdAt&sortOrder=desc', { validateData: isUserList })
            .then((response) => setRecentUsers(response.data)),
        );
      }
      await Promise.all(tasks);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : 'Dashboard data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDashboard(); }, [isAdmin, canList]);

  const roleData = stats ? [
    { name: 'Admins', value: stats.byRole.ADMIN },
    { name: 'Moderators', value: stats.byRole.MODERATOR },
    { name: 'Users', value: stats.byRole.USER },
  ].filter((item) => item.value > 0) : [];
  const statusData = stats ? [
    { name: 'Active', value: stats.byStatus.ACTIVE },
    { name: 'Pending', value: stats.byStatus.PENDING },
    { name: 'Suspended', value: stats.byStatus.SUSPENDED },
  ].filter((item) => item.value > 0) : [];

  return (
    <>
      <PageHeading
        eyebrow="IDENTITY OPERATIONS / OVERVIEW"
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user?.name.split(' ')[0] ?? 'there'}.`}
        description="A clear view of the accounts and access under your care."
        action={canList ? <Link className="button button-secondary" to="/users"><UsersRound size={16} />Open directory</Link> : undefined}
      />

      {loading ? <div className="dashboard-loading"><LoadingState label="Loading account data" /><div className="skeleton-grid"><span /><span /><span /><span /></div></div> : error ? (
        <div className="inline-error" role="alert"><span>{error}</span><button className="button button-secondary" onClick={() => void loadDashboard()}>Retry</button></div>
      ) : isAdmin && stats ? (
        <>
          <div className="metrics-grid">
            <Metric label="Total accounts" value={stats.totalUsers} detail={`${stats.byRole.ADMIN} administrator${stats.byRole.ADMIN === 1 ? '' : 's'}`} icon={UsersRound} tone="tone-teal" />
            <Metric label="Active accounts" value={stats.byStatus.ACTIVE} detail="Currently enabled" icon={CheckCircle2} tone="tone-green" />
            <Metric label="Pending review" value={stats.byStatus.PENDING} detail={`${stats.byStatus.SUSPENDED} suspended`} icon={CircleUserRound} tone="tone-amber" />
            <Metric label="MFA enabled" value={stats.mfaActiveUsers} detail={`${stats.verifiedEmails} verified emails`} icon={ShieldCheck} tone="tone-blue" />
          </div>
          <div className="dashboard-grid">
            <section className="panel chart-panel">
              <div className="panel-heading"><div><span className="eyebrow">DIRECTORY MIX</span><h2>Accounts by role</h2></div><span className="chart-caption">Current totals</span></div>
              {roleData.length ? <div className="chart-layout">
                <div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={roleData} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="90%" paddingAngle={4} stroke="none">{roleData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index]} />)}</Pie><Tooltip contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} /></PieChart></ResponsiveContainer><div className="donut-total"><strong>{stats.totalUsers}</strong><span>accounts</span></div></div>
                <div className="chart-legend">{roleData.map((entry, index) => <div className="legend-row" key={entry.name}><span className="legend-dot" style={{ backgroundColor: chartColors[index] }} /><span>{entry.name}</span><strong>{entry.value}</strong></div>)}</div>
              </div> : <EmptyState title="No account data" description="Role distribution will appear when accounts exist." />}
            </section>
            <section className="panel chart-panel">
              <div className="panel-heading"><div><span className="eyebrow">ACCOUNT HEALTH</span><h2>Status distribution</h2></div><span className="chart-caption">Current totals</span></div>
              {statusData.length ? <div className="chart-layout">
                <div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="90%" paddingAngle={4} stroke="none">{statusData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index]} />)}</Pie><Tooltip contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} /></PieChart></ResponsiveContainer><div className="donut-total"><strong>{stats.totalUsers}</strong><span>accounts</span></div></div>
                <div className="chart-legend">{statusData.map((entry, index) => <div className="legend-row" key={entry.name}><span className="legend-dot" style={{ backgroundColor: chartColors[index] }} /><span>{entry.name}</span><strong>{entry.value}</strong></div>)}</div>
              </div> : <EmptyState title="No account data" description="Account status distribution will appear here." />}
            </section>
          </div>
        </>
      ) : user?.role === 'USER' ? (
        <div className="member-welcome">
          <div className="member-welcome-copy"><span className="eyebrow">YOUR ACCOUNT</span><h2>Everything in good order.</h2><p>Your account is {user.status.toLowerCase()}. Review your profile and security settings any time.</p><div className="member-actions"><Link className="button button-primary" to="/profile"><CircleUserRound size={16} />View profile</Link><Link className="button button-secondary" to="/security"><KeyRound size={16} />Security settings</Link></div></div>
          <div className="account-orbit"><div className="orbit-ring orbit-ring-outer" /><div className="orbit-ring orbit-ring-inner" /><div className="orbit-center"><ShieldCheck size={30} /></div><span className="orbit-node node-a" /><span className="orbit-node node-b" /></div>
        </div>
      ) : null}

      {canList && !loading && !error && <section className="panel recent-panel">
        <div className="panel-heading"><div><span className="eyebrow">LATEST ACCOUNTS</span><h2>Recently registered</h2></div><Link className="text-link" to="/users">View directory <ArrowUpRight size={15} /></Link></div>
        <RegistrationList users={recentUsers} />
      </section>}

      {user?.role === 'MODERATOR' && !loading && !error && <section className="panel moderator-note"><div className="moderator-note-icon"><ShieldCheck size={19} /></div><div><h2>Moderation workspace</h2><p>Your role can review and inspect accounts. Administrative changes remain restricted to administrators.</p></div><Link className="text-link" to="/users">Review users <ArrowUpRight size={15} /></Link></section>}
    </>
  );
}