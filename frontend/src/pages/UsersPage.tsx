import { useDeferredValue, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Eye, Plus, Search, Trash2, UserRoundPlus } from 'lucide-react';
import { ApiClientError, request } from '../api/client';
import { isUser, isUserList } from '../api/guards';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog, EmptyState, LoadingState, PageHeading, useToast } from '../components/ui';
import type { CreateUserInput, PaginationMeta, Role, UpdateUserInput, User, UserStatus } from '../types';

const sortFields = [
  ['createdAt', 'Date added'], ['name', 'Name'], ['email', 'Email'], ['role', 'Role'], ['status', 'Status'],
] as const;
const roles: Role[] = ['ADMIN', 'MODERATOR', 'USER'];
const statuses: UserStatus[] = ['ACTIVE', 'PENDING', 'SUSPENDED'];

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function ErrorText({ children }: { children?: string }) {
  return children ? <span className="field-error">{children}</span> : null;
}

function CreateUserForm() {
  const navigate = useNavigate();
  const notify = useToast();
  const [form, setForm] = useState<CreateUserInput>({ name: '', email: '', password: '', role: 'USER', status: 'ACTIVE', bio: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function validate() {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2 || form.name.trim().length > 80) next.name = 'Use between 2 and 80 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`])[A-Za-z\d@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`]{8,128}$/.test(form.password)) {
      next.password = 'Use 8–128 characters with uppercase, lowercase, a number, and a symbol.';
    }
    if ((form.bio?.length ?? 0) > 300) next.bio = 'Bio cannot exceed 300 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validate() || busy) return;
    setBusy(true);
    try {
      const response = await request<User>('/users', { method: 'POST', body: JSON.stringify(form), validateData: isUser });
      notify(`${response.data.name} was added to the directory.`);
      navigate(`/users/${response.data.id}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fields);
        notify(error.message, 'error');
      } else notify('The account could not be created.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading eyebrow="DIRECTORY / NEW ACCOUNT" title="Create user" description="Add an account and assign its initial access level." />
      <form className="panel form-panel" onSubmit={submit} noValidate>
        <div className="form-section-title"><span>01</span><div><h2>Account details</h2><p>Identity information visible to workspace administrators.</p></div></div>
        <div className="form-grid">
          <label className="field"><span>Full name</span><input autoComplete="name" maxLength={80} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} aria-invalid={Boolean(errors.name)} /><ErrorText>{errors.name}</ErrorText></label>
          <label className="field"><span>Email address</span><input autoComplete="email" type="email" maxLength={150} required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} aria-invalid={Boolean(errors.email)} /><ErrorText>{errors.email}</ErrorText></label>
          <label className="field"><span>Temporary password</span><input autoComplete="new-password" type="password" maxLength={128} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} aria-invalid={Boolean(errors.password)} /><small>8+ characters with uppercase, lowercase, number, and symbol.</small><ErrorText>{errors.password}</ErrorText></label>
          <label className="field"><span>Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>{roles.map((role) => <option value={role} key={role}>{role[0] + role.slice(1).toLowerCase()}</option>)}</select></label>
          <label className="field"><span>Account status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as UserStatus })}>{statuses.map((status) => <option value={status} key={status}>{status[0] + status.slice(1).toLowerCase()}</option>)}</select></label>
          <label className="field field-wide"><span>Bio <small>Optional</small></span><textarea rows={3} maxLength={300} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /><small>{form.bio?.length ?? 0}/300</small><ErrorText>{errors.bio}</ErrorText></label>
        </div>
        <div className="form-actions"><Link className="button button-secondary" to="/users">Cancel</Link><button className="button button-primary" type="submit" disabled={busy}><UserRoundPlus size={16} />{busy ? 'Creating…' : 'Create account'}</button></div>
      </form>
    </>
  );
}

export function UsersPage({ createMode = false }: { createMode?: boolean }) {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const notify = useToast();
  const [searchValue, setSearchValue] = useState('');
  const deferredSearch = useDeferredValue(searchValue);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<User[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadUsers() {
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ page: String(page), limit: '10', sortBy, sortOrder });
    if (deferredSearch.trim()) query.set('search', deferredSearch.trim());
    if (role) query.set('role', role);
    if (status) query.set('status', status);
    try {
      const response = await request<User[]>(`/users?${query.toString()}`, { validateData: isUserList });
      setUsers(response.data);
      setMeta(response.meta ?? { page, limit: 10, total: response.data.length, totalPages: 1 });
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : 'The directory could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setPage(1); }, [deferredSearch, role, status, sortBy, sortOrder]);
  useEffect(() => { void loadUsers(); }, [deferredSearch, role, status, sortBy, sortOrder, page]);

  if (createMode) return <CreateUserForm />;

  return (
    <>
      <PageHeading eyebrow="IDENTITY OPERATIONS / DIRECTORY" title="User directory" description="Search, review, and manage workspace accounts."
        action={isAdmin ? <Link className="button button-primary" to="/users/new"><Plus size={17} />Create user</Link> : undefined} />
      <section className="panel directory-panel">
        <div className="directory-toolbar">
          <label className="search-box"><Search size={17} /><input placeholder="Search name or email" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} aria-label="Search users by name or email" /><kbd>↵</kbd></label>
          <div className="filter-group">
            <label className="sr-only" htmlFor="role-filter">Filter by role</label><select id="role-filter" value={role} onChange={(event) => setRole(event.target.value)}><option value="">All roles</option>{roles.map((item) => <option value={item} key={item}>{item[0] + item.slice(1).toLowerCase()}</option>)}</select>
            <label className="sr-only" htmlFor="status-filter">Filter by status</label><select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option value={item} key={item}>{item[0] + item.slice(1).toLowerCase()}</option>)}</select>
            <label className="sr-only" htmlFor="sort-filter">Sort users</label><select id="sort-filter" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>{sortFields.map(([value, label]) => <option key={value} value={value}>Sort: {label}</option>)}</select>
            <button className="icon-button sort-direction" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')} title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`} aria-label={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}>{sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}</button>
          </div>
        </div>
        <div className="directory-summary"><span>{meta.total.toLocaleString()} account{meta.total === 1 ? '' : 's'}</span><span>Updated from live directory</span></div>
        {loading ? <div className="table-loading"><LoadingState label="Loading accounts" /></div> : error ? <div className="inline-error" role="alert"><span>{error}</span><button className="button button-secondary" onClick={() => void loadUsers()}>Retry</button></div> : users.length === 0 ? (
          <EmptyState title="No matching accounts" description={searchValue || role || status ? 'Try adjusting the search or filters.' : 'Accounts created through the API will appear here.'} />
        ) : (
          <div className="table-scroll"><table className="user-table"><thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">MFA</th><th scope="col">Date added</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {users.map((item) => <tr key={item.id}>
              <td><div className="table-person"><div className="avatar avatar-row">{initials(item.name)}</div><span><strong>{item.name}</strong><small>{item.email}</small></span></div></td>
              <td><span className={`role-label role-${item.role.toLowerCase()}`}>{item.role.toLowerCase()}</span></td>
              <td><span className={`status-pill status-${item.status.toLowerCase()}`}><i />{item.status.toLowerCase()}</span></td>
              <td><span className={`mfa-cell ${item.mfaEnabled ? 'mfa-on' : ''}`}>{item.mfaEnabled ? 'Enabled' : 'Off'}</span></td>
              <td className="date-cell">{new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
              <td><Link className="icon-button row-action" to={`/users/${item.id}`} aria-label={`View ${item.name}`} title="View account"><Eye size={16} /></Link></td>
            </tr>)}
          </tbody></table></div>
        )}
        <div className="pagination-bar"><span>Page {meta.page} of {Math.max(1, meta.totalPages)}</span><div><button className="icon-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page"><ChevronLeft size={17} /></button><button className="icon-button" disabled={page >= meta.totalPages || loading} onClick={() => setPage((value) => Math.min(meta.totalPages, value + 1))} aria-label="Next page"><ChevronRight size={17} /></button></div></div>
      </section>
    </>
  );
}

export function UserDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const notify = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<UpdateUserInput>({});
  const isAdmin = currentUser?.role === 'ADMIN';
  const isSelf = currentUser?.id === id;

  async function loadUser() {
    setLoading(true);
    try {
      const response = await request<User>(`/users/${encodeURIComponent(id)}`, { validateData: isUser });
      setUser(response.data);
      setForm({ name: response.data.name, bio: response.data.bio ?? '', role: response.data.role, status: response.data.status, isEmailVerified: response.data.isEmailVerified });
    } catch (error) {
      notify(error instanceof ApiClientError ? error.message : 'Account details could not be loaded.', 'error');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadUser(); }, [id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    try {
      const patch: UpdateUserInput = isAdmin ? form : { name: form.name, bio: form.bio };
      const response = await request<User>(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch), validateData: isUser });
      setUser(response.data);
      setForm({ ...form, name: response.data.name, bio: response.data.bio ?? '', role: response.data.role, status: response.data.status, isEmailVerified: response.data.isEmailVerified });
      notify('Account details saved.');
    } catch (error) { notify(error instanceof ApiClientError ? error.message : 'Changes could not be saved.', 'error'); }
    finally { setBusy(false); }
  }

  async function deleteUser() {
    if (busy) return;
    setBusy(true);
    try {
      await request<null>(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      notify('Account was deactivated.');
      window.location.assign('/users');
    } catch (error) { notify(error instanceof ApiClientError ? error.message : 'Account could not be deleted.', 'error'); }
    finally { setBusy(false); setConfirmDelete(false); }
  }

  if (loading) return <LoadingState label="Loading account details" />;
  if (!user) return <><PageHeading eyebrow="DIRECTORY / ACCOUNT" title="Account unavailable" description="The account could not be found or you do not have access." /><Link className="button button-secondary" to={currentUser?.role === 'USER' ? '/' : '/users'}><ArrowLeft size={16} />Return</Link></>;

  return (
    <>
      <PageHeading eyebrow="DIRECTORY / ACCOUNT" title="Account details" description="Review identity information and current access state." action={<Link className="button button-secondary" to="/users"><ArrowLeft size={16} />Back to directory</Link>} />
      <div className="detail-hero panel"><div className="avatar avatar-large">{initials(user.name)}</div><div className="detail-hero-copy"><span className="eyebrow">ACCOUNT ID · {user.id.slice(0, 8).toUpperCase()}</span><h2>{user.name}</h2><p>{user.email}</p></div><div className="detail-hero-badges"><span className={`role-label role-${user.role.toLowerCase()}`}>{user.role.toLowerCase()}</span><span className={`status-pill status-${user.status.toLowerCase()}`}><i />{user.status.toLowerCase()}</span></div></div>
      <div className="detail-grid">
        <form className="panel form-panel detail-form" onSubmit={save}>
          <div className="panel-heading"><div><span className="eyebrow">IDENTITY</span><h2>Profile information</h2></div></div>
          <div className="form-grid">
            <label className="field"><span>Full name</span><input value={form.name ?? ''} maxLength={80} minLength={2} disabled={!isAdmin} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label className="field"><span>Email address</span><input value={user.email} disabled /><small>Email address cannot be edited by this API.</small></label>
            <label className="field field-wide"><span>Bio</span><textarea rows={3} maxLength={300} value={form.bio ?? ''} disabled={!isAdmin} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
            {isAdmin && <>
              <label className="field"><span>Role</span><select value={form.role} disabled={isSelf} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select>{isSelf && <small>Your own role cannot be changed here.</small>}</label>
              <label className="field"><span>Status</span><select value={form.status} disabled={isSelf} onChange={(event) => setForm({ ...form, status: event.target.value as UserStatus })}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>{isSelf && <small>Your own account cannot be suspended here.</small>}</label>
              <label className="checkbox-field field-wide"><input type="checkbox" checked={Boolean(form.isEmailVerified)} onChange={(event) => setForm({ ...form, isEmailVerified: event.target.checked })} /><span>Email verified</span></label>
            </>}
          </div>
          {isAdmin && <div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>}
        </form>
        <aside className="panel account-facts"><span className="eyebrow">ACCOUNT SECURITY</span><div className="fact-row"><span>Multi-factor authentication</span><strong className={user.mfaEnabled ? 'fact-positive' : ''}>{user.mfaEnabled ? 'Enabled' : 'Not enabled'}</strong></div><div className="fact-row"><span>Email verification</span><strong className={user.isEmailVerified ? 'fact-positive' : ''}>{user.isEmailVerified ? 'Verified' : 'Unverified'}</strong></div><div className="fact-row"><span>Last sign-in</span><strong>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'No sign-in recorded'}</strong></div><div className="fact-row"><span>Joined</span><strong>{new Date(user.createdAt).toLocaleDateString()}</strong></div>
          {isAdmin && !isSelf && <button className="button button-danger account-delete" onClick={() => setConfirmDelete(true)}><Trash2 size={16} />Deactivate account</button>}
        </aside>
      </div>
      <ConfirmDialog open={confirmDelete} title="Deactivate this account?" description={`This will soft-delete ${user.name} and revoke their active sessions. This action cannot be undone from this interface.`} confirmLabel="Deactivate account" busy={busy} onConfirm={() => void deleteUser()} onCancel={() => setConfirmDelete(false)} />
    </>
  );
}