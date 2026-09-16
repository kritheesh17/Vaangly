import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Phone, Lock, AlertCircle, CheckCircle2, ArrowRight, RefreshCw, KeyRound, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import { Badge } from '../../components/ui/Badge';
import { OtpInput } from '../../components/auth/OtpInput';
import './Auth.css';

type AuthMode = 'email' | 'phone';
type EmailStep = 'request' | 'verify';
type VerificationStatus = 'idle' | 'sending' | 'sent' | 'verifying' | 'success';

const RESEND_COOLDOWN_SECONDS = 60;
const MAX_RESEND_ATTEMPTS = 5;

export const LoginPage: React.FC = () => {
  const [authMode, setAuthMode] = useState<AuthMode>('email');

  // Email OTP state
  const [email, setEmail] = useState('');
  const [emailStep, setEmailStep] = useState<EmailStep>('request');
  const [otpCode, setOtpCode] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);
  const [resendAttempts, setResendAttempts] = useState<number>(0);
  const resendResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Secondary Password Mode (Retained for Administrator / Operational staff)
  const [showPasswordFallback, setShowPasswordFallback] = useState(false);
  const [password, setPassword] = useState('');

  // Phone OTP state
  const [phone, setPhone] = useState('+91 98765 43210');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpToken, setPhoneOtpToken] = useState('');
  const [isPhoneLoading, setIsPhoneLoading] = useState(false);

  const {
    requestEmailOtp,
    verifyEmailOtp,
    loginWithEmail,
    requestPhoneOtp,
    verifyPhoneOtp,
    isSupabaseLive,
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => () => {
    if (resendResetTimer.current) clearTimeout(resendResetTimer.current);
  }, []);

  // Step 1: Request Email OTP
  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    if (resendAttempts >= MAX_RESEND_ATTEMPTS) {
      setErrorMsg(
        'Too many attempts. The limit resets automatically in 10 minutes. ' +
        'Check your spam folder, or use code 123456 in local preview mode.'
      );
      return;
    }

    setVerificationStatus('sending');
    setStatusMessage('Sending verification code...');

    const result = await requestEmailOtp(cleanEmail);

    if (result.success) {
      setVerificationStatus('sent');
      setStatusMessage('Verification code sent to your email.');
      setEmailStep('verify');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      const newAttemptCount = resendAttempts + 1;
      setResendAttempts(newAttemptCount);
      if (newAttemptCount >= MAX_RESEND_ATTEMPTS) {
        resendResetTimer.current = setTimeout(() => {
          setResendAttempts(0);
          setErrorMsg(null);
          resendResetTimer.current = null;
        }, 10 * 60 * 1000);
      }
    } else {
      setVerificationStatus('idle');
      setStatusMessage(null);
      setErrorMsg(result.error || 'Unable to verify your email right now. Please try again.');
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || otpCode).trim();
    setErrorMsg(null);

    if (code.length !== 6) {
      setErrorMsg('That code is incorrect or has expired.');
      return;
    }

    setVerificationStatus('verifying');
    setStatusMessage('Verifying...');

    const result = await verifyEmailOtp(email, code);

    if (result.success) {
      setVerificationStatus('success');
      setStatusMessage('Email verified successfully.');
      setTimeout(() => {
        navigate(from, { replace: true });
      }, 700);
    } else {
      setVerificationStatus('idle');
      setStatusMessage(null);
      setErrorMsg(result.error || 'That code is incorrect or has expired.');
    }
  };

  // Resend code handler
  const handleResendCode = async () => {
    if (cooldown > 0) return;
    setOtpCode('');
    await handleRequestOtp();
  };

  // Change email handler (Return to Step 1)
  const handleChangeEmail = () => {
    setEmailStep('request');
    setOtpCode('');
    setErrorMsg(null);
    setStatusMessage(null);
    setVerificationStatus('idle');
  };

  // Admin / Password Fallback Submit
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setVerificationStatus('verifying');
    setStatusMessage('Verifying credentials...');

    const result = await loginWithEmail(email, password);
    setVerificationStatus('idle');
    setStatusMessage(null);

    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setErrorMsg(result.error || 'Invalid email or password.');
    }
  };

  // Phone OTP Submit
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsPhoneLoading(true);

    if (!phoneOtpSent) {
      const result = await requestPhoneOtp(phone);
      setIsPhoneLoading(false);
      if (result.success) {
        setPhoneOtpSent(true);
      } else {
        setErrorMsg(result.error || 'Failed to request OTP');
      }
    } else {
      const result = await verifyPhoneOtp(phone, phoneOtpToken);
      setIsPhoneLoading(false);
      if (result.success) {
        navigate(from, { replace: true });
      } else {
        setErrorMsg(result.error || 'Invalid OTP code');
      }
    }
  };

  return (
    <div className="container vaango-auth-container">
      <Card variant="elevated" padding="lg" className="vaango-auth-card">
        {/* Logo & Header */}
        <div className="vaango-auth-header">
          <div className="vaango-auth-logo">
            <span>V</span>
          </div>
          <h1 className="vaango-auth-title">Welcome to Vaango</h1>
          <p className="vaango-auth-subtitle">
            Sign in with verified email to explore neighborhood stores, pre-orders, and local services.
          </p>

          {!isSupabaseLive && (
            <div className="vaango-auth-badge">
              <Badge variant="accent" size="sm" withDot>
                Local Preview Mode (Code: 123456)
              </Badge>
            </div>
          )}
        </div>

        {/* Method Switcher */}
        <div className="vaango-auth-tabs" role="tablist" aria-label="Sign in method tabs">
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'email'}
            className={`vaango-auth-tab ${authMode === 'email' ? 'vaango-auth-tab--active' : ''}`}
            onClick={() => {
              setAuthMode('email');
              setErrorMsg(null);
            }}
          >
            <Mail size={16} />
            <span>Email</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'phone'}
            className={`vaango-auth-tab ${authMode === 'phone' ? 'vaango-auth-tab--active' : ''}`}
            onClick={() => {
              setAuthMode('phone');
              setErrorMsg(null);
            }}
          >
            <Phone size={16} />
            <span>Phone OTP</span>
          </button>
        </div>

        {/* Dynamic Status / Success Alerts */}
        {statusMessage && (
          <div
            className={`vaango-auth-status-alert ${
              verificationStatus === 'success' ? 'vaango-auth-status-alert--success' : ''
            }`}
            role="status"
          >
            {verificationStatus === 'success' ? (
              <CheckCircle2 size={18} className="text-success" />
            ) : (
              <RefreshCw size={16} className="vaango-spin text-primary" />
            )}
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="vaango-auth-error" role="alert">
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* EMAIL AUTHENTICATION FLOW */}
        {authMode === 'email' ? (
          showPasswordFallback ? (
            /* Staff / Admin Password Fallback */
            <form onSubmit={handlePasswordSubmit} className="vaango-auth-form">
              <FormField id="auth-email-pwd" label="Email Address" required>
                <Input
                  id="auth-email-pwd"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@vaango.in"
                  leftIcon={<Mail size={18} />}
                />
              </FormField>

              <FormField id="auth-password" label="Password" required>
                <Input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  leftIcon={<Lock size={18} />}
                />
              </FormField>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={verificationStatus === 'verifying'}
                rightIcon={<ArrowRight size={18} />}
              >
                Sign In with Password
              </Button>

              <div className="vaango-auth-switch-mode">
                <button
                  type="button"
                  className="vaango-link-btn text-xs text-secondary"
                  onClick={() => setShowPasswordFallback(false)}
                >
                  ← Return to Email Verification Code
                </button>
              </div>
            </form>
          ) : emailStep === 'request' ? (
            /* STEP 1: Request Verification Code */
            <form onSubmit={handleRequestOtp} className="vaango-auth-form">
              <FormField
                id="auth-email-step1"
                label="Email Address"
                hint="We will send a 6-digit verification code"
                required
              >
                <Input
                  id="auth-email-step1"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  leftIcon={<Mail size={18} />}
                />
              </FormField>

              {resendAttempts >= 2 && isSupabaseLive && (
                <div className="vaango-auth-info-banner" style={{ marginBottom: 'var(--space-3)' }}>
                  <Info size={15} className="vaango-auth-info-icon" />
                  <span>
                    Not receiving codes? Supabase&apos;s development email service is limited to 3 emails/hour. Check your spam folder, wait a few minutes, or configure a custom SMTP provider in the Supabase dashboard for unlimited delivery.
                  </span>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={verificationStatus === 'sending'}
                rightIcon={<ArrowRight size={18} />}
              >
                Send Verification Code
              </Button>

              <div className="vaango-auth-secondary-actions">
                <button
                  type="button"
                  className="vaango-link-btn text-xs text-muted"
                  onClick={() => setShowPasswordFallback(true)}
                >
                  <KeyRound size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  Staff or Admin? Sign in with password
                </button>
              </div>
            </form>
          ) : (
            /* STEP 2: Enter Verification Code */
            <div className="vaango-auth-otp-step">
              <div className="vaango-otp-dest-bar">
                <span className="vaango-otp-dest-label">Code sent to:</span>
                <span className="vaango-otp-dest-email">{email}</span>
                <button
                  type="button"
                  onClick={handleChangeEmail}
                  className="vaango-link-btn text-xs vaango-otp-change-btn"
                >
                  Change
                </button>
              </div>

              <FormField
                id="auth-otp-input"
                label="Enter Verification Code"
                hint="Enter the 6-digit verification code from your email"
                required
              >
                <OtpInput
                  value={otpCode}
                  onChange={setOtpCode}
                  length={6}
                  disabled={verificationStatus === 'verifying' || verificationStatus === 'success'}
                  hasError={Boolean(errorMsg)}
                  autoFocus
                  onComplete={(completedCode) => handleVerifyOtp(completedCode)}
                />
              </FormField>

              <Button
                type="button"
                variant="primary"
                size="lg"
                fullWidth
                disabled={otpCode.length !== 6 || verificationStatus === 'verifying'}
                isLoading={verificationStatus === 'verifying'}
                onClick={() => handleVerifyOtp()}
              >
                {verificationStatus === 'success' ? 'Email Verified!' : 'Verify & Continue'}
              </Button>

              <div className="vaango-otp-resend-row">
                {cooldown > 0 ? (
                  <span className="vaango-otp-cooldown-text">
                    Resend code in <strong>{cooldown}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="vaango-link-btn vaango-otp-resend-btn"
                    disabled={verificationStatus === 'sending'}
                    onClick={handleResendCode}
                  >
                    Resend code
                  </button>
                )}
              </div>
            </div>
          )
        ) : (
          /* PHONE OTP FLOW */
          <form onSubmit={handlePhoneSubmit} className="vaango-auth-form">
            {/* Informational Banner as specified in requirement 10 */}
            <div className="vaango-auth-info-banner">
              <Info size={16} className="vaango-auth-info-icon" />
              <span>
                <strong>Phone OTP Notice:</strong> In local preview mode, use code 123456. Production phone OTP requires a configured Supabase SMS provider.
              </span>
            </div>

            <FormField
              id="auth-phone"
              label="Mobile Number"
              hint="Indian mobile numbers (+91)"
              required
            >
              <Input
                id="auth-phone"
                type="tel"
                required
                disabled={phoneOtpSent}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                leftIcon={<Phone size={18} />}
              />
            </FormField>

            {phoneOtpSent && (
              <FormField id="auth-phone-otp" label="One-Time Password (OTP)" required>
                <Input
                  id="auth-phone-otp"
                  type="text"
                  required
                  value={phoneOtpToken}
                  onChange={(e) => setPhoneOtpToken(e.target.value)}
                  placeholder="6-digit code"
                />
              </FormField>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isPhoneLoading}
            >
              {phoneOtpSent ? 'Verify & Continue' : 'Send Verification OTP'}
            </Button>
          </form>
        )}

        {/* Footer */}
        <div className="vaango-auth-footer">
          <p>
            New to Vaango?{' '}
            <Link to="/register" className="vaango-auth-link">
              Create an account
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
};
