import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, Lock, Mail, AlertCircle, ArrowRight, ShieldCheck, CheckCircle2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import { Checkbox } from '../../components/ui/Checkbox';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import './Auth.css';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'recovery';

export const LoginPage: React.FC = () => {
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    signInWithGoogle,
    loginWithEmail,
    signUpWithEmail,
    resendEmailConfirmation,
    resetPasswordForEmail,
    updatePassword,
    refreshUser,
  } = useAuth();
  const { t } = useLanguage();

  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get('redirect');
  const from = redirectParam || (location.state as { from?: { pathname?: string; search?: string } })?.from?.pathname || '/';

  // Mode state: signin | signup | forgot | recovery
  const initialMode = (searchParams.get('mode') as AuthMode) || 'signin';
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);

  // If already authenticated upon arrival, redirect directly to destination once verified
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && user) {
      if (user.is_verified) {
        setSuccessMsg(null);
        setUnconfirmedEmail(null);
        navigate(from, { replace: true });
      } else {
        setUnconfirmedEmail(user.email?.trim().toLowerCase() || null);
      }
    }
  }, [isAuthLoading, isAuthenticated, user, navigate, from]);

  // Check URL hash or Supabase event for password recovery token
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setMode('recovery');
      setErrorMsg(null);
      setSuccessMsg(null);
    }

    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setMode('recovery');
          setErrorMsg(null);
          setSuccessMsg(null);
        }
      });
      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  // Customer / Partner: Continue with Google
  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsGoogleLoading(true);

    try {
      if (from && from !== '/') {
        sessionStorage.setItem('vaangly_auth_redirect', from);
        localStorage.setItem('vaangly_auth_redirect', from);
      }

      const result = await signInWithGoogle(from);
      if (!result.success) {
        setErrorMsg(result.error || t('genericError'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('genericError'));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Sign In submit
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setUnconfirmedEmail(null);

    if (!email.trim()) {
      setErrorMsg(t('enterEmailPrompt'));
      return;
    }
    if (!password) {
      setErrorMsg(t('enterPasswordPrompt'));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await loginWithEmail(email, password);
      if (result.success) {
        setSuccessMsg(null);
        setUnconfirmedEmail(null);
        navigate(from, { replace: true });
      } else {
        setErrorMsg(result.error || t('genericError'));
        if (result.isEmailUnconfirmed) {
          setUnconfirmedEmail(email.trim().toLowerCase());
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('genericError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sign Up submit
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setUnconfirmedEmail(null);

    if (!fullName.trim()) {
      setErrorMsg(t('enterNamePrompt'));
      return;
    }
    if (!email.trim()) {
      setErrorMsg(t('enterEmailPrompt'));
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg(t('passwordMinHint'));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg(t('passwordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (from && from !== '/') {
        sessionStorage.setItem('vaangly_auth_redirect', from);
        localStorage.setItem('vaangly_auth_redirect', from);
      }

      const result = await signUpWithEmail(email, password, fullName, 'customer', undefined, from);
      if (result.success) {
        if (result.requiresEmailConfirmation) {
          setSuccessMsg(
            result.message || t('verificationEmailSent')
          );
          setUnconfirmedEmail(email.trim().toLowerCase());
        } else {
          navigate(from, { replace: true });
        }
      } else {
        setErrorMsg(result.error || t('genericError'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('genericError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Forgot password submit
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim()) {
      setErrorMsg(t('enterEmailPrompt'));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await resetPasswordForEmail(email);
      if (result.success) {
        setSuccessMsg(t('verificationEmailSent'));
      } else {
        setErrorMsg(result.error || t('genericError'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('genericError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Password recovery (set new password) submit
  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!password || password.length < 6) {
      setErrorMsg(t('passwordMinHint'));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg(t('passwordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updatePassword(password);
      if (result.success) {
        setSuccessMsg(t('passwordUpdatedSuccess'));
        window.setTimeout(() => {
          navigate(from, { replace: true });
        }, 1200);
      } else {
        setErrorMsg(result.error || t('genericError'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('genericError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resend verification email
  const handleResendConfirmation = async () => {
    const targetEmail = unconfirmedEmail || email.trim().toLowerCase();
    if (!targetEmail) return;

    setIsResendingEmail(true);
    try {
      const result = await resendEmailConfirmation(targetEmail);
      if (result.success) {
        setSuccessMsg(t('verificationEmailSent'));
      } else {
        setErrorMsg(result.error || t('genericError'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('genericError'));
    } finally {
      setIsResendingEmail(false);
    }
  };

  return (
    <div className="container vaango-auth-container">
      <Card variant="elevated" padding="lg" className="vaango-auth-card">
        {/* Header */}
        <div className="vaango-auth-header">
          <div className="vaango-auth-logo">
            <span>V</span>
          </div>
          <h1 className="vaango-auth-title">
            {mode === 'signin' && t('signInTitle')}
            {mode === 'signup' && t('signUpTitle')}
            {mode === 'forgot' && t('authForgotTitle')}
            {mode === 'recovery' && t('authRecoveryTitle')}
          </h1>
          <p className="vaango-auth-subtitle">
            {mode === 'signin' &&
              (from.includes('/shopkeeper')
                ? t('authPartnerSignInSubtitle')
                : t('signInSubtitle'))}
            {mode === 'signup' &&
              (from.includes('/shopkeeper')
                ? t('authPartnerSignUpSubtitle')
                : t('signUpSubtitle'))}
            {mode === 'forgot' && t('authForgotSubtitle')}
            {mode === 'recovery' && t('authRecoverySubtitle')}
          </p>
        </div>

        {/* Tab Switcher for Sign In / Sign Up */}
        {(mode === 'signin' || mode === 'signup') && (
          <div className="vaango-auth-tabs" role="tablist" aria-label="Authentication modes">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={`vaango-auth-tab ${mode === 'signin' ? 'vaango-auth-tab--active' : ''}`}
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
                setSuccessMsg(null);
                setUnconfirmedEmail(null);
              }}
            >
              <Lock size={16} />
              <span>{t('signInSubmit')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={`vaango-auth-tab ${mode === 'signup' ? 'vaango-auth-tab--active' : ''}`}
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
                setSuccessMsg(null);
                setUnconfirmedEmail(null);
              }}
            >
              <User size={16} />
              <span>{t('signUpSubmit')}</span>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="vaango-auth-error" role="alert">
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="vaango-auth-status-alert vaango-auth-status-alert--success" role="status">
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Unconfirmed Email Action Banner */}
        {unconfirmedEmail && (
          <div
            style={{
              padding: 'var(--space-3)',
              background: 'var(--color-surface-sunken)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              {t('waitingEmailVerification', { email: unconfirmedEmail })}
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="primary"
                size="sm"
                isLoading={isCheckingVerification}
                onClick={async () => {
                  setErrorMsg(null);
                  setIsCheckingVerification(true);
                  try {
                    const updated = await refreshUser();
                    if (updated?.is_verified) {
                      setSuccessMsg(t('emailVerifiedRedirect'));
                      setUnconfirmedEmail(null);
                      setTimeout(() => navigate(from, { replace: true }), 500);
                    } else {
                      setErrorMsg(t('emailNotDetectedYet'));
                    }
                  } catch (err: any) {
                    setErrorMsg(err?.message || t('genericError'));
                  } finally {
                    setIsCheckingVerification(false);
                  }
                }}
              >
                {t('checkEmailVerificationBtn')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                isLoading={isResendingEmail}
                onClick={handleResendConfirmation}
              >
                {t('resendVerificationLink')}
              </Button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODE: SIGN IN */}
        {/* ========================================================= */}
        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="vaango-auth-form">
            <FormField id="signin-email" label={t('emailLabel')} required>
              <Input
                id="signin-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                leftIcon={<Mail size={18} />}
              />
            </FormField>

            <FormField id="signin-password" label={t('passwordLabel')} required>
              <Input
                id="signin-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={<Lock size={18} />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit' }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
            </FormField>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', marginBottom: '8px' }}>
              <Checkbox
                id="signin-show-password"
                label="Show password"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              <button
                type="button"
                className="vaango-auth-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-xs)' }}
                onClick={() => {
                  setMode('forgot');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
              >
                {t('forgotPasswordLink')}
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              rightIcon={<ArrowRight size={18} />}
            >
              {t('signInSubmit')}
            </Button>

            {/* Divider */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                margin: 'var(--space-2) 0',
                gap: 'var(--space-3)',
              }}
            >
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                {t('orDivider')}
              </span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
            </div>

            {/* Google Sign In */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              fullWidth
              isLoading={isGoogleLoading}
              onClick={handleGoogleSignIn}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                fontWeight: 600,
                fontSize: '1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{t('googleSignInBtn')}</span>
            </Button>
          </form>
        )}

        {/* ========================================================= */}
        {/* MODE: SIGN UP */}
        {/* ========================================================= */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="vaango-auth-form">
            <FormField id="signup-name" label={t('fullNameLabel')} required>
              <Input
                id="signup-name"
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                leftIcon={<User size={18} />}
              />
            </FormField>

            <FormField id="signup-email" label={t('emailLabel')} required>
              <Input
                id="signup-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                leftIcon={<Mail size={18} />}
              />
            </FormField>

            <FormField id="signup-password" label={t('passwordLabel')} required hint={t('passwordMinHint')}>
              <Input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordMinHint')}
                leftIcon={<Lock size={18} />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit' }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
            </FormField>

            <FormField id="signup-confirm-password" label={t('confirmPasswordLabel')} required>
              <Input
                id="signup-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('confirmPasswordLabel')}
                leftIcon={<Lock size={18} />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit' }}
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
            </FormField>

            <div style={{ marginTop: '4px', marginBottom: '8px' }}>
              <Checkbox
                id="signup-show-password"
                label="Show password"
                checked={showPassword && showConfirmPassword}
                onChange={(e) => {
                  setShowPassword(e.target.checked);
                  setShowConfirmPassword(e.target.checked);
                }}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              rightIcon={<ArrowRight size={18} />}
            >
              {t('signUpSubmit')}
            </Button>

            {/* Divider */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                margin: 'var(--space-2) 0',
                gap: 'var(--space-3)',
              }}
            >
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                {t('orDivider')}
              </span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
            </div>

            {/* Google Sign In */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              fullWidth
              isLoading={isGoogleLoading}
              onClick={handleGoogleSignIn}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                fontWeight: 600,
                fontSize: '1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{t('googleSignInBtn')}</span>
            </Button>
          </form>
        )}

        {/* ========================================================= */}
        {/* MODE: FORGOT PASSWORD */}
        {/* ========================================================= */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="vaango-auth-form">
            <FormField id="forgot-email" label={t('emailLabel')} required>
              <Input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                leftIcon={<Mail size={18} />}
              />
            </FormField>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              leftIcon={<KeyRound size={18} />}
            >
              {t('sendResetLinkBtn')}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="lg"
              fullWidth
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
            >
              {t('backToSignInBtn')}
            </Button>
          </form>
        )}

        {/* ========================================================= */}
        {/* MODE: PASSWORD RECOVERY */}
        {/* ========================================================= */}
        {mode === 'recovery' && (
          <form onSubmit={handlePasswordRecovery} className="vaango-auth-form">
            <FormField id="recovery-password" label={t('passwordLabel')} required hint={t('passwordMinHint')}>
              <Input
                id="recovery-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordMinHint')}
                leftIcon={<Lock size={18} />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit' }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
            </FormField>

            <FormField id="recovery-confirm-password" label={t('confirmPasswordLabel')} required>
              <Input
                id="recovery-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('confirmPasswordLabel')}
                leftIcon={<Lock size={18} />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit' }}
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
            </FormField>

            <div style={{ marginTop: '4px', marginBottom: '8px' }}>
              <Checkbox
                id="recovery-show-password"
                label="Show password"
                checked={showPassword && showConfirmPassword}
                onChange={(e) => {
                  setShowPassword(e.target.checked);
                  setShowConfirmPassword(e.target.checked);
                }}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              leftIcon={<ShieldCheck size={18} />}
            >
              {t('saveNewPasswordBtn')}
            </Button>
          </form>
        )}

        {/* Footer */}
        <div className="vaango-auth-footer">
          <p>
            {t('authMerchantPrompt')}{' '}
            <Link
              to={isAuthenticated ? '/shopkeeper/apply' : '/login?redirect=/shopkeeper/apply'}
              className="vaango-auth-link"
              onClick={() => {
                if (!isAuthenticated) {
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }
              }}
            >
              {t('authApplyPartner')}
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
};
