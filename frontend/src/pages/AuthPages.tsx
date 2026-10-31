import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Fingerprint, KeyRound, ShieldCheck, UserRound, X } from 'lucide-react';
import { ApiClientError, request } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../components/ui';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`])[A-Za-z\d@$!%*?&#^()_+\-=[\]{};':"\\|,.<>/~`]{8,128}$/;

function AuthBackdrop() {
  return (
    <aside className="auth-visual" aria-label="Nexus Control">
      <div className="auth-visual-top"><div className="brand-symbol" aria-hidden="true"><span /></div><span className="brand-name">NEXUS<span> / CONTROL</span></span></div>
      <div className="auth-visual-content"><div className="auth-orbit"><div className="auth-orbit-ring ring-one" /><div className="auth-orbit-ring ring-two" /><div className="auth-orbit-ring ring-three" /><div className="auth-orbit-center"><Fingerprint size={39} strokeWidth={1.3} /></div><span className="auth-orbit-dot dot-one" /><span className="auth-orbit-dot dot-two" /><span className="auth-orbit-dot dot-three" /></div><p className="eyebrow">IDENTITY OPERATIONS</p><h1>Access,<br /><em>in focus.</em></h1><p className="auth-visual-caption">A considered view of every account, role, and security signal in your workspace.</p></div>
      <div className="auth-visual-bottom"><span><ShieldCheck size={15} />Protected workspace</span><span>EST. 2025</span></div>
    </aside>
  );
}

function AuthFrame({ children, mode }: { children: React.ReactNode; mode: AuthMode }) {
  const [searchParams] = useSearchParams();
  const resetHasToken = Boolean(searchParams.get('token'));
  const titles: Record<AuthMode, { title: string; caption: string }> = {
    login: { title: 'Welcome back', caption: 'Sign in to continue to your workspace.' },
    register: { title: 'Create your account', caption: 'Set up your identity to get started.' },
    forgot: { title: 'Reset your password', caption: 'Enter the email address associated with your account.' },
    reset: { title: 'Choose a new password', caption: resetHasToken ? 'Set a new password for your account.' : 'Enter the reset token from your secure reset link.' },
  };
  return (
    <div className="auth-page">
      <AuthBackdrop />
      <main className="auth-main">
        <div className="auth-mobile-brand"><div className="brand-symbol" aria-hidden="true"><span /></div><span className="brand-name">NEXUS<span> / CONTROL</span></span></div>
        <div className="auth-form-wrap">
          <div className="auth-form-heading"><span className="eyebrow">SECURE SIGN-IN</span><h2>{titles[mode].title}</h2><p>{titles[mode].caption}</p></div>
          {children}
        </div>
        <div className="auth-legal"><span>© {new Date().getFullYear()} Northstar Labs</span><span>Secure identity workspace</span></div>
      </main>
    </div>
  );
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const { signIn, signUp, completeMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mfaToken, setMfaToken] = useState('');
  const [showMfa, setShowMfa] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState(searchParams.get('token') ?? '');
  const [resetComplete, setResetComplete] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (mode === 'reset' && searchParams.has('token')) {
      navigate('/reset-password', { replace: true });
    }
  }, [mode, navigate, searchParams]);

  function localValidation() {
    const next: Record<string, string> = {};
    if (mode !== 'reset' && !emailPattern.test(email.trim())) next.email = 'Enter a valid email address.';
    if (mode === 'login' && !password) next.password = 'Enter your password.';
    if (mode === 'register' && (name.trim().length < 2 || name.trim().length > 80)) next.name = 'Name must be between 2 and 80 characters.';
    if (['register', 'reset'].includes(mode) && !strongPassword.test(password)) next.password = 'Use 8–128 characters with uppercase, lowercase, a number, and a symbol.';
    if (mode === 'register' && password !== confirmation) next.confirmation = 'Passwords do not match.';
    if (mode === 'reset' && !resetToken.trim()) next.token = 'Enter the token from your password reset link.';
    if (mode === 'reset' && password !== confirmation) next.confirmation = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (mode !== 'forgot' && !localValidation()) return;
    if (mode === 'forgot') {
      const emailError = emailPattern.test(email.trim()) ? '' : 'Enter a valid email address.';
      setErrors(emailError ? { email: emailError } : {});
      if (emailError) return;
    }
    setBusy(true);
    setErrors({});
    try {
      if (mode === 'login' && !showMfa) {
        const result = await signIn(email.trim(), password);
        if (result.mfaRequired) {
          setMfaToken(result.mfaToken);
          setShowMfa(true);
          return;
        }
        notify('You are signed in.');
        const requestedPath = (location.state as { from?: string } | null)?.from;
        const safePath = requestedPath?.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/';
        navigate(safePath, { replace: true });
      } else if (mode === 'login') {
        if (!/^\d{6}$/.test(code)) {
          setErrors({ code: 'Enter the 6-digit code from your authenticator app.' });
          return;
        }
        await completeMfa(mfaToken, code);
        notify('Multi-factor verification complete.');
        navigate('/', { replace: true });
      } else if (mode === 'register') {
        await signUp({ name: name.trim(), email: email.trim(), password });
        notify('Your account is ready.');
        navigate('/', { replace: true });
      } else if (mode === 'forgot') {
        await request<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim() }), retryAuth: false });
        setSubmitted(true);
      } else {
        await request<null>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: resetToken.trim(), newPassword: password }), retryAuth: false });
        setResetComplete(true);
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fields);
        notify(error.message, 'error');
      } else notify('The request could not be completed.', 'error');
    } finally { setBusy(false); }
  }

  return (
    <AuthFrame mode={mode}>
      {mode === 'forgot' && submitted ? (
        <div className="auth-success" role="status"><span className="success-mark"><ShieldCheck size={23} /></span><h3>Check your inbox</h3><p>If an account matches that email, reset instructions will be sent through the configured delivery channel.</p><Link className="button button-primary button-full" to="/login"><ArrowLeft size={16} />Back to sign in</Link></div>
      ) : mode === 'reset' && resetComplete ? (
        <div className="auth-success" role="status"><span className="success-mark"><ShieldCheck size={23} /></span><h3>Password updated</h3><p>Your password has been reset. Sign in with your new credentials.</p><Link className="button button-primary button-full" to="/login">Continue to sign in<ArrowRight size={16} /></Link></div>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          {mode === 'login' && showMfa ? <>
            <div className="mfa-challenge"><span className="mfa-challenge-icon"><KeyRound size={20} /></span><div><strong>Authenticator check</strong><span>Enter the 6-digit code from your authenticator app.</span></div><button type="button" className="icon-button" onClick={() => { setShowMfa(false); setCode(''); setMfaToken(''); }} aria-label="Return to sign in"><X size={17} /></button></div>
            <label className="field"><span>Verification code</span><input autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} aria-invalid={Boolean(errors.code)} /><ErrorLine>{errors.code}</ErrorLine></label>
            <button className="button button-primary button-full" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}<ArrowRight size={16} /></button>
          </> : <>
            {mode === 'register' && <label className="field"><span>Full name</span><input autoComplete="name" maxLength={80} required value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(errors.name)} /><ErrorLine>{errors.name}</ErrorLine></label>}
            {mode !== 'reset' && <label className="field"><span>Email address</span><input type="email" autoComplete="email" maxLength={150} required value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(errors.email)} /><ErrorLine>{errors.email}</ErrorLine></label>}
            {mode === 'reset' && !searchParams.get('token') && <label className="field"><span>Reset token</span><input type="password" autoComplete="off" required value={resetToken} onChange={(event) => setResetToken(event.target.value)} aria-invalid={Boolean(errors.token)} /><small>Use the token from your secure reset message.</small><ErrorLine>{errors.token}</ErrorLine></label>}
            {mode !== 'forgot' && <label className="field"><span>{mode === 'reset' ? 'New password' : 'Password'}</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(errors.password)} /><ErrorLine>{errors.password}</ErrorLine></label>}
            {['register', 'reset'].includes(mode) && <label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-invalid={Boolean(errors.confirmation)} /><ErrorLine>{errors.confirmation}</ErrorLine></label>}
            {mode === 'login' && <div className="auth-inline-link"><span>Session renews securely</span><Link to="/forgot-password">Forgot password?</Link></div>}
            {mode === 'reset' && <p className="password-hint"><ShieldCheck size={15} />8+ characters, mixed case, a number, and a symbol.</p>}
            <button className="button button-primary button-full" disabled={busy}>{busy ? 'Please wait…' : submitLabel(mode)}<ArrowRight size={16} /></button>
          </>}
          {mode === 'login' && !showMfa && <p className="auth-switch">New to this workspace? <Link to="/register">Create an account</Link></p>}
          {mode === 'register' && <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>}
          {(mode === 'forgot' || mode === 'reset') && <p className="auth-switch"><Link to="/login"><ArrowLeft size={14} />Return to sign in</Link></p>}
        </form>
      )}
    </AuthFrame>
  );
}

function submitLabel(mode: AuthMode) {
  if (mode === 'login') return 'Sign in';
  if (mode === 'register') return 'Create account';
  if (mode === 'forgot') return 'Send reset instructions';
  return 'Update password';
}

function ErrorLine({ children }: { children?: string }) {
  return children ? <span className="field-error">{children}</span> : null;
}

export function UnauthorizedPage() {
  return <main className="unauthorized-page"><div className="unauthorized-mark"><ShieldCheck size={28} /></div><span className="eyebrow">ACCESS CONTROL</span><h1>That area is restricted.</h1><p>Your current role does not grant access to this page.</p><Link className="button button-primary" to="/"><UserRound size={16} />Return to your workspace</Link></main>;
}