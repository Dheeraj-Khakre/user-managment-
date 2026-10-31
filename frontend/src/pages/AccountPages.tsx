import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Copy, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { ApiClientError, request } from '../api/client';
import { isMfaSetup, isStepUpOtpData, isStepUpVerifyData, isUser } from '../api/guards';
import { useAuth } from '../auth/AuthProvider';
import { PageHeading, useToast } from '../components/ui';
import type { MfaSetupData, StepUpPurpose, User } from '../types';

const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`])[A-Za-z\d@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`]{8,128}$/;

interface StepUpGrant {
  token: string;
  fallbackPassword: string | null;
}

function requestStepUpOtp(purpose: StepUpPurpose) {
  return request('/auth/security/otp', {
    method: 'POST',
    body: JSON.stringify({ purpose }),
    validateData: isStepUpOtpData,
  });
}

function StepUpGate({ purpose, children }: { purpose: StepUpPurpose; children: (grant: StepUpGrant) => ReactNode }) {
  const { user } = useAuth();
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [method, setMethod] = useState<'otp' | 'password'>('otp');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [grant, setGrant] = useState<StepUpGrant | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendInSeconds, setResendInSeconds] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    requestStepUpOtp(purpose).then((response) => {
      if (!active) return;
      setDeliveryAvailable(response.data.deliveryAvailable);
      setChallengeId(response.data.challengeId ?? '');
      setMethod(response.data.deliveryAvailable ? 'otp' : 'password');
      setResendInSeconds(response.data.deliveryAvailable ? 60 : 0);
    }).catch((requestError) => {
      if (active) {
        setMethod('password');
        setError(requestError instanceof ApiClientError ? requestError.message : 'Identity verification could not be started.');
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [purpose]);

  useEffect(() => {
    if (resendInSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendInSeconds((remaining) => Math.max(0, remaining - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendInSeconds]);

  async function resendCode() {
    if (resending || resendInSeconds > 0) return;
    setResending(true);
    setError('');
    try {
      const response = await requestStepUpOtp(purpose);
      setDeliveryAvailable(response.data.deliveryAvailable);
      setChallengeId(response.data.challengeId ?? '');
      setMethod(response.data.deliveryAvailable ? 'otp' : 'password');
      setCode('');
      setResendInSeconds(response.data.deliveryAvailable ? 60 : 0);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : 'A new verification code could not be sent.');
    } finally {
      setResending(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (method === 'otp' && (!challengeId || !/^\d{6}$/.test(code))) {
      setError('Enter the 6-digit code sent to your verified email.');
      return;
    }
    if (method === 'password' && !password) {
      setError('Enter your current password to continue.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const body = method === 'otp'
        ? { method, purpose, challengeId, code }
        : { method, purpose, password };
      const response = await request('/auth/security/verify', {
        method: 'POST',
        body: JSON.stringify(body),
        validateData: isStepUpVerifyData,
      });
      setGrant({ token: response.data.stepUpToken, fallbackPassword: method === 'password' ? password : null });
      setPassword('');
      setCode('');
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : 'Identity verification failed.');
    } finally {
      setBusy(false);
    }
  }

  if (grant) return <>{children(grant)}</>;

  const maskedEmail = user?.email.replace(/^(.).+(@.*)$/, '$1••••$2') ?? 'your verified email';
  return (
    <section className="panel step-up-card" aria-labelledby="step-up-title">
      <div className="step-up-icon"><ShieldCheck size={22} /></div>
      <p className="eyebrow">SECURITY CHECKPOINT</p>
      <h2 id="step-up-title">Verify it’s you</h2>
      <p className="step-up-description">Confirm your identity before opening these sensitive settings. This verification is scoped to this page and expires after five minutes.</p>
      {loading ? <div className="step-up-loading">Preparing secure verification…</div> : (
        <form className="step-up-form" onSubmit={verify} noValidate>
          {method === 'otp' ? (
            <>
              <div className="step-up-delivery"><Mail size={16} /><span>We sent a 6-digit code to <strong>{maskedEmail}</strong>. It expires in 10 minutes.</span></div>
              <label className="field"><span>Email verification code</span><input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} aria-invalid={Boolean(error)} required /></label>
              <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}<ArrowRight size={16} /></button>
              <button type="button" className="text-link step-up-fallback" onClick={() => void resendCode()} disabled={resending || resendInSeconds > 0}>
                {resending ? 'Sending a new code…' : resendInSeconds > 0 ? `Resend code in ${Math.floor(resendInSeconds / 60)}:${String(resendInSeconds % 60).padStart(2, '0')}` : 'Resend code'}
              </button>
              <button type="button" className="text-link step-up-fallback" onClick={() => { setMethod('password'); setError(''); }}>Use your current password instead</button>
            </>
          ) : (
            <>
              <div className="step-up-delivery"><LockKeyhole size={16} /><span>{deliveryAvailable ? 'Email verification is optional; you can verify with your password instead.' : 'Email OTP is unavailable for this account. Verify with your current password to continue.'}</span></div>
              <label className="field"><span>Current password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error)} required /></label>
              <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}<ArrowRight size={16} /></button>
              {deliveryAvailable && <button type="button" className="text-link step-up-fallback" onClick={() => { setMethod('otp'); setError(''); }}>Use email code instead</button>}
            </>
          )}
          {error && <p className="inline-form-error" role="alert">{error}</p>}
        </form>
      )}
      <p className="security-footnote"><ShieldCheck size={14} />Codes are single-use and verification attempts are limited.</p>
    </section>
  );
}

function SecurityPageCard({ to, title, description, icon: Icon, status }: { to: string; title: string; description: string; icon: typeof LockKeyhole; status: string }) {
  return (
    <Link className="panel security-option-card" to={to}>
      <span className="security-card-icon"><Icon size={19} /></span>
      <span className="security-option-copy"><strong>{title}</strong><span>{description}</span><small>{status}</small></span>
      <ArrowRight size={17} aria-hidden="true" />
    </Link>
  );
}

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
  const { user } = useAuth();
  return (
    <>
      <PageHeading eyebrow="ACCOUNT / SECURITY" title="Security settings" description="Choose a security task. Each sensitive page requires fresh identity verification." />
      <div className="security-options">
        <SecurityPageCard to="/security/password" title="Change password" description="Update your password and revoke existing sessions." icon={LockKeyhole} status="Fresh verification required" />
        <SecurityPageCard to="/security/mfa" title="Multi-factor authentication" description="Enroll or manage your authenticator app." icon={ShieldCheck} status={user?.mfaEnabled ? 'Authenticator enabled' : 'Authenticator not enabled'} />
      </div>
    </>
  );
}

export function ChangePasswordPage() {
  const { signOut } = useAuth();
  const notify = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function changePassword(event: FormEvent, stepUpToken: string, fallbackPassword: string | null) {
    event.preventDefault();
    if (busy) return;
    const existingPassword = fallbackPassword ?? currentPassword;
    if (!existingPassword) return setError('Enter your current password.');
    if (!strongPassword.test(newPassword)) return setError('Use 8–128 characters with uppercase, lowercase, a number, and a symbol.');
    if (newPassword !== confirmPassword) return setError('New passwords do not match.');
    if (newPassword === existingPassword) return setError('Choose a password different from your current one.');
    setBusy(true);
    setError('');
    try {
      await request<null>('/auth/change-password', {
        method: 'POST',
        headers: { 'X-Step-Up-Token': stepUpToken },
        body: JSON.stringify({ currentPassword: existingPassword, newPassword }),
      });
      notify('Password updated. Please sign in again.');
      await signOut();
    } catch (requestError) {
      const message = requestError instanceof ApiClientError ? requestError.message : 'Password could not be changed.';
      setError(message);
      notify(message, 'error');
    } finally { setBusy(false); }
  }

  return (
    <StepUpGate purpose="password_change">
      {({ token, fallbackPassword }) => (
        <>
          <PageHeading eyebrow="SECURITY / PASSWORD" title="Change password" description="A fresh verification is required. Updating your password signs out other active sessions." action={<Link className="button button-secondary" to="/security"><ArrowLeft size={16} />Security settings</Link>} />
          <section className="panel security-card security-page-card">
            <div className="security-card-heading"><span className="security-card-icon"><LockKeyhole size={19} /></span><div><h2>Choose a new password</h2><p>Use a unique password that you don’t use for another account.</p></div></div>
            <form className="security-form" onSubmit={(event) => void changePassword(event, token, fallbackPassword)} noValidate>
              {!fallbackPassword && <label className="field"><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>}
              <label className="field"><span>New password</span><input type="password" autoComplete="new-password" maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><small>8–128 characters; uppercase, lowercase, number, and symbol.</small></label>
              <label className="field"><span>Confirm new password</span><input type="password" autoComplete="new-password" maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
              {error && <p className="inline-form-error" role="alert">{error}</p>}
              <button className="button button-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
            </form>
          </section>
        </>
      )}
    </StepUpGate>
  );
}

export function MfaPage() {
  const { user, updateUser } = useAuth();
  const notify = useToast();
  const [mfaSetup, setMfaSetup] = useState<MfaSetupData | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function beginMfaSetup(stepUpToken: string) {
    setBusy(true);
    setError('');
    try {
      const response = await request<MfaSetupData>('/auth/mfa/setup', {
        method: 'POST',
        headers: { 'X-Step-Up-Token': stepUpToken },
        body: JSON.stringify({}),
        validateData: isMfaSetup,
      });
      setMfaSetup(response.data);
    } catch (requestError) {
      const message = requestError instanceof ApiClientError ? requestError.message : 'MFA setup could not be started.';
      setError(message);
      notify(message, 'error');
    } finally { setBusy(false); }
  }

  async function verifyMfa(event: FormEvent, stepUpToken: string) {
    event.preventDefault();
    if (!/^\d{6}$/.test(mfaCode)) return setError('Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    setError('');
    try {
      await request<null>('/auth/mfa/verify', { method: 'POST', headers: { 'X-Step-Up-Token': stepUpToken }, body: JSON.stringify({ code: mfaCode }) });
      const updated = await request<User>('/auth/me', { validateData: isUser });
      updateUser(updated.data);
      setMfaSetup(null);
      setMfaCode('');
      notify('Multi-factor authentication is enabled.');
    } catch (requestError) {
      const message = requestError instanceof ApiClientError ? requestError.message : 'The code could not be verified.';
      setError(message);
      notify(message, 'error');
    } finally { setBusy(false); }
  }

  async function disableMfa(event: FormEvent, stepUpToken: string, fallbackPassword: string | null) {
    event.preventDefault();
    const password = fallbackPassword ?? disablePassword;
    if (!password) return setError('Enter your current password to disable MFA.');
    setBusy(true);
    setError('');
    try {
      await request<null>('/auth/mfa/disable', { method: 'POST', headers: { 'X-Step-Up-Token': stepUpToken }, body: JSON.stringify({ password }) });
      const updated = await request<User>('/auth/me', { validateData: isUser });
      updateUser(updated.data);
      setDisablePassword('');
      notify('Multi-factor authentication is disabled.');
    } catch (requestError) {
      const message = requestError instanceof ApiClientError ? requestError.message : 'MFA could not be disabled.';
      setError(message);
      notify(message, 'error');
    } finally { setBusy(false); }
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
    <StepUpGate purpose="mfa_manage">
      {({ token, fallbackPassword }) => (
        <>
          <PageHeading eyebrow="SECURITY / MULTI-FACTOR" title="Multi-factor authentication" description="Manage your authenticator app. Changes require a fresh identity check." action={<Link className="button button-secondary" to="/security"><ArrowLeft size={16} />Security settings</Link>} />
          <section className="panel security-card security-page-card mfa-card">
            <div className="security-card-heading"><span className="security-card-icon security-card-icon-green"><ShieldCheck size={19} /></span><div><h2>Authenticator app</h2><p>Add a time-based code to strengthen sign-in security.</p></div><span className={`mfa-state ${user?.mfaEnabled ? 'mfa-state-on' : ''}`}><i />{user?.mfaEnabled ? 'Enabled' : 'Not enabled'}</span></div>
            {error && <p className="inline-form-error" role="alert">{error}</p>}
            {user?.mfaEnabled ? (
              <form className="mfa-disable-form" onSubmit={(event) => void disableMfa(event, token, fallbackPassword)} noValidate>
                <p>MFA is active for this account. Disabling it will reduce sign-in protection.</p>
                {!fallbackPassword && <label className="field"><span>Confirm current password</span><input type="password" autoComplete="current-password" value={disablePassword} onChange={(event) => setDisablePassword(event.target.value)} required /></label>}
                <button className="button button-secondary" disabled={busy}>{busy ? 'Working…' : 'Disable MFA'}</button>
              </form>
            ) : !mfaSetup ? (
              <div className="mfa-empty"><div className="mfa-empty-mark"><KeyRound size={22} /></div><div><strong>Set up an authenticator</strong><p>Use an authenticator app to generate secure, time-based sign-in codes. Your setup key is shown only during enrollment.</p></div><button className="button button-primary" onClick={() => void beginMfaSetup(token)} disabled={busy}>{busy ? 'Preparing…' : 'Set up authenticator'}</button></div>
            ) : (
              <form className="mfa-enrollment" onSubmit={(event) => void verifyMfa(event, token)}>
                <div className="enrollment-step"><span>1</span><div><strong>Add this account to your authenticator</strong><p>Enter the setup key manually. Keep it private.</p></div></div>
                <div className="secret-field"><code>{mfaSetup.secret}</code><button className="icon-button" type="button" onClick={() => void copySecret()} aria-label="Copy MFA setup key" title="Copy setup key">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div>
                <a className="text-link otpauth-link" href={mfaSetup.otpAuthUrl}>Open authenticator link</a>
                <div className="enrollment-step"><span>2</span><div><strong>Verify the 6-digit code</strong><p>Enrollment is not active until this code is accepted.</p></div></div>
                <label className="field"><span>Authenticator code</span><input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
                <button className="button button-primary" disabled={busy}>{busy ? 'Verifying…' : 'Verify and enable'}</button>
              </form>
            )}
            <p className="security-footnote"><ShieldCheck size={14} />Enrollment changes are verified by the server.</p>
          </section>
        </>
      )}
    </StepUpGate>
  );
}
