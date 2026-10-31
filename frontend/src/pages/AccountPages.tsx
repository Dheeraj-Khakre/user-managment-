import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { ApiClientError, request } from '../api/client';
import { isMfaSetup, isUser } from '../api/guards';
import { useAuth } from '../auth/AuthProvider';
import { PageHeading, useToast } from '../components/ui';
import type { MfaSetupData, User } from '../types';

const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`])[A-Za-z\d@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`]{8,128}$/;

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const notify = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setName(user?.name ?? ''); setBio(user?.bio ?? ''); }, [user]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      setError('Name must be between 2 and 80 characters.');
      return;
    }
    if (bio.length > 300) {
      setError('Bio cannot exceed 300 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await request<User>('/users/profile', { method: 'PATCH', body: JSON.stringify({ name: trimmed, bio: bio.trim() }), validateData: isUser });
      updateUser(response.data);
      notify('Profile saved.');
    } catch (requestError) {
      const message = requestError instanceof ApiClientError ? requestError.message : 'Profile changes could not be saved.';
      setError(message);
      notify(message, 'error');
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeading eyebrow="ACCOUNT / PROFILE" title="Your profile" description="Manage the personal details attached to your account." />
      <div className="account-page-grid">
        <form className="panel form-panel" onSubmit={save} noValidate>
          <div className="form-section-title"><span><UserRound size={17} /></span><div><h2>Personal details</h2><p>Only your name and bio can be edited here.</p></div></div>
          <div className="profile-identity"><div className="avatar avatar-large">{user?.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div><strong>{user?.name}</strong><span>{user?.email}</span></div></div>
          <div className="form-grid">
            <label className="field field-wide"><span>Full name</span><input autoComplete="name" maxLength={80} minLength={2} required value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(error)} /></label>
            <label className="field field-wide"><span>Bio</span><textarea rows={4} maxLength={300} value={bio} onChange={(event) => setBio(event.target.value)} /><small>{bio.length}/300</small></label>
            <label className="field field-wide"><span>Email address</span><input value={user?.email ?? ''} disabled /><small>Email address changes are not supported by this API.</small></label>
          </div>
          {error && <p className="inline-form-error" role="alert">{error}</p>}
          <div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
        </form>
        <aside className="panel account-facts"><span className="eyebrow">ACCOUNT INFORMATION</span><div className="fact-row"><span>Role</span><strong>{user?.role}</strong></div><div className="fact-row"><span>Account status</span><strong className={user?.status === 'ACTIVE' ? 'fact-positive' : 'fact-warning'}>{user?.status}</strong></div><div className="fact-row"><span>Email verified</span><strong className={user?.isEmailVerified ? 'fact-positive' : 'fact-warning'}>{user?.isEmailVerified ? 'Yes' : 'No'}</strong></div><div className="fact-row"><span>Member since</span><strong>{user ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</strong></div><div className="fact-row"><span>Last sign-in</span><strong>{user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Not recorded'}</strong></div></aside>
      </div>
    </>
  );
}

export function SecurityPage() {
  const { user, updateUser, signOut } = useAuth();
  const notify = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<MfaSetupData | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [mfaError, setMfaError] = useState('');

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (passwordBusy) return;
    if (!currentPassword) return setPasswordError('Enter your current password.');
    if (!strongPassword.test(newPassword)) return setPasswordError('Use 8–128 characters with uppercase, lowercase, a number, and a symbol.');
    if (newPassword !== confirmPassword) return setPasswordError('New passwords do not match.');
    if (newPassword === currentPassword) return setPasswordError('Choose a password different from your current one.');
    setPasswordBusy(true);
    setPasswordError('');
    try {
      await request<null>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      notify('Password updated. Please sign in again.');
      await signOut();
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'Password could not be changed.';
      setPasswordError(message);
      notify(message, 'error');
    } finally { setPasswordBusy(false); }
  }

  async function beginMfaSetup() {
    setMfaBusy(true);
    setMfaError('');
    try {
      const response = await request<MfaSetupData>('/auth/mfa/setup', { method: 'POST', body: JSON.stringify({}), validateData: isMfaSetup });
      setMfaSetup(response.data);
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'MFA setup could not be started.';
      setMfaError(message);
      notify(message, 'error');
    } finally { setMfaBusy(false); }
  }

  async function verifyMfa(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(mfaCode)) return setMfaError('Enter the 6-digit code from your authenticator app.');
    setMfaBusy(true);
    setMfaError('');
    try {
      await request<null>('/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ code: mfaCode }) });
      const updated = await request<User>('/auth/me', { validateData: isUser });
      updateUser(updated.data);
      setMfaSetup(null);
      setMfaCode('');
      notify('Multi-factor authentication is enabled.');
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'The code could not be verified.';
      setMfaError(message);
      notify(message, 'error');
    } finally { setMfaBusy(false); }
  }

  async function disableMfa(event: FormEvent) {
    event.preventDefault();
    if (!disablePassword) return setMfaError('Enter your password to disable MFA.');
    setMfaBusy(true);
    setMfaError('');
    try {
      await request<null>('/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password: disablePassword }) });
      const updated = await request<User>('/auth/me', { validateData: isUser });
      updateUser(updated.data);
      setDisablePassword('');
      notify('Multi-factor authentication is disabled.');
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'MFA could not be disabled.';
      setMfaError(message);
      notify(message, 'error');
    } finally { setMfaBusy(false); }
  }

  async function copySecret() {
    if (!mfaSetup) return;
    try {
      await navigator.clipboard.writeText(mfaSetup.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { notify('Clipboard access is unavailable in this browser.', 'error'); }
  }

  return (
    <>
      <PageHeading eyebrow="ACCOUNT / SECURITY" title="Security settings" description="Manage your password and multi-factor authentication." />
      <div className="security-layout">
        <section className="panel security-card">
          <div className="security-card-heading"><span className="security-card-icon"><LockKeyhole size={19} /></span><div><h2>Change password</h2><p>Changing your password revokes all active sessions.</p></div></div>
          <form className="security-form" onSubmit={changePassword} noValidate>
            <label className="field"><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
            <label className="field"><span>New password</span><input type="password" autoComplete="new-password" maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><small>8–128 characters; uppercase, lowercase, number, and symbol.</small></label>
            <label className="field"><span>Confirm new password</span><input type="password" autoComplete="new-password" maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
            {passwordError && <p className="inline-form-error" role="alert">{passwordError}</p>}
            <button className="button button-primary" disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Update password'}</button>
          </form>
        </section>

        <section className="panel security-card mfa-card">
          <div className="security-card-heading"><span className="security-card-icon security-card-icon-green"><ShieldCheck size={19} /></span><div><h2>Authenticator app</h2><p>Add a second verification step to your sign-in.</p></div><span className={`mfa-state ${user?.mfaEnabled ? 'mfa-state-on' : ''}`}><i />{user?.mfaEnabled ? 'Enabled' : 'Not enabled'}</span></div>
          {mfaError && <p className="inline-form-error" role="alert">{mfaError}</p>}
          {user?.mfaEnabled ? <form className="mfa-disable-form" onSubmit={disableMfa} noValidate><p>Enter your current password to disable this factor.</p><label className="field"><span>Password confirmation</span><input type="password" autoComplete="current-password" value={disablePassword} onChange={(event) => setDisablePassword(event.target.value)} required /></label><button className="button button-secondary" disabled={mfaBusy}>{mfaBusy ? 'Working…' : 'Disable MFA'}</button></form> : !mfaSetup ? <div className="mfa-empty"><div className="mfa-empty-mark"><KeyRound size={22} /></div><div><strong>Strengthen account access</strong><p>Use a time-based code from an authenticator app. Setup secrets are shown only during enrollment.</p></div><button className="button button-primary" onClick={() => void beginMfaSetup()} disabled={mfaBusy}>{mfaBusy ? 'Preparing…' : 'Set up authenticator'}</button></div> : <form className="mfa-enrollment" onSubmit={verifyMfa}>
            <div className="enrollment-step"><span>1</span><div><strong>Add this account to your authenticator</strong><p>Enter the setup key manually. Keep it private.</p></div></div>
            <div className="secret-field"><code>{mfaSetup.secret}</code><button className="icon-button" type="button" onClick={() => void copySecret()} aria-label="Copy MFA setup key" title="Copy setup key">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div>
            <a className="text-link otpauth-link" href={mfaSetup.otpAuthUrl}>Open authenticator link</a>
            <div className="enrollment-step"><span>2</span><div><strong>Verify the 6-digit code</strong><p>Enrollment is not active until this code is accepted.</p></div></div>
            <label className="field"><span>Authenticator code</span><input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
            <button className="button button-primary" disabled={mfaBusy}>{mfaBusy ? 'Verifying…' : 'Verify and enable'}</button>
          </form>}
          <p className="security-footnote"><ShieldCheck size={14} />Enrollment changes are verified by the server.</p>
        </section>
      </div>
    </>
  );
}