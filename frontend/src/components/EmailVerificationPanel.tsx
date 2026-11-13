import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import { ApiClientError, request } from '../api/client';
import { isEmailVerificationOtpData, isUser } from '../api/guards';
import { useAuth } from '../auth/AuthProvider';

interface EmailVerificationPanelProps {
  autoStart?: boolean;
  onVerified?: () => void;
  onContinue?: () => void;
}

export function EmailVerificationPanel({ autoStart = false, onVerified, onContinue }: EmailVerificationPanelProps) {
  const { user, updateUser } = useAuth();
  const autoStarted = useRef(false);
  const [deliveryAvailable, setDeliveryAvailable] = useState<boolean | null>(null);
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendInSeconds, setResendInSeconds] = useState(0);
  const [error, setError] = useState('');

  async function sendCode() {
    if (sending || resendInSeconds > 0) return;
    setSending(true);
    setError('');
    try {
      const response = await request('/auth/email/verification/otp', {
        method: 'POST',
        body: JSON.stringify({}),
        validateData: isEmailVerificationOtpData,
      });
      setDeliveryAvailable(response.data.deliveryAvailable);
      setChallengeId(response.data.challengeId ?? '');
      setCode('');
      setResendInSeconds(response.data.deliveryAvailable ? 60 : 0);
      if (!response.data.deliveryAvailable) setError(response.message);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : 'A verification code could not be sent.');
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (autoStart && !autoStarted.current) {
      autoStarted.current = true;
      void sendCode();
    }
  }, [autoStart]);

  useEffect(() => {
    if (resendInSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendInSeconds((remaining) => Math.max(0, remaining - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendInSeconds]);

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!challengeId || !/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code sent to your email.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await request('/auth/email/verification/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId, code }),
        validateData: isUser,
      });
      updateUser(response.data);
      setCode('');
      onVerified?.();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : 'Email verification failed.');
    } finally {
      setBusy(false);
    }
  }

  const maskedEmail = user?.email.replace(/^(.).+(@.*)$/, '$1••••$2') ?? 'your email address';
  return (
    <section className="panel step-up-card" aria-labelledby="email-verification-title">
      <div className="step-up-icon"><ShieldCheck size={22} /></div>
      <p className="eyebrow">EMAIL VERIFICATION</p>
      <h2 id="email-verification-title">Verify your email</h2>
      <p className="step-up-description">Confirm your email address to use email codes for sensitive security checks.</p>
      {deliveryAvailable ? (
        <form className="step-up-form" onSubmit={(event) => void verify(event)} noValidate>
          <div className="step-up-delivery"><Mail size={16} /><span>We sent a 6-digit code to <strong>{maskedEmail}</strong>. It expires in 10 minutes.</span></div>
          <label className="field"><span>Email verification code</span><input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} aria-invalid={Boolean(error)} required /></label>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Verifying…' : 'Verify email'}<ArrowRight size={16} /></button>
          <button type="button" className="text-link step-up-fallback" onClick={() => void sendCode()} disabled={sending || resendInSeconds > 0}>
            {sending ? 'Sending a new code…' : resendInSeconds > 0 ? `Resend code in ${Math.floor(resendInSeconds / 60)}:${String(resendInSeconds % 60).padStart(2, '0')}` : 'Resend code'}
          </button>
          {onContinue && <button type="button" className="text-link step-up-fallback" onClick={onContinue}>Continue without verifying</button>}
          {error && <p className="inline-form-error" role="alert">{error}</p>}
        </form>
      ) : (
        <div className="step-up-form">
          <div className="step-up-delivery"><Mail size={16} /><span>{deliveryAvailable === false ? error || 'Email delivery is unavailable. Configure SMTP and try again.' : 'A one-time code will be sent to your email address.'}</span></div>
          <button type="button" className="button button-primary" onClick={() => void sendCode()} disabled={sending || resendInSeconds > 0}>{sending ? 'Sending code…' : 'Send verification code'}<ArrowRight size={16} /></button>
          {error && deliveryAvailable !== false && <p className="inline-form-error" role="alert">{error}</p>}
          {onContinue && <button type="button" className="text-link step-up-fallback" onClick={onContinue}>Continue without verifying</button>}
        </div>
      )}
    </section>
  );
}
