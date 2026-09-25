import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight, KeyRound, RefreshCw } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import './Auth.css';

type RecoveryState = 'verifying' | 'ready' | 'success' | 'error';

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();

  const [state, setState] = useState<RecoveryState>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const evaluateRecoverySession = async () => {
      // 1. Check for error parameters in query or hash (e.g. expired link)
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      
      const errorDesc = searchParams.get('error_description') || hashParams.get('error_description');
      const errorCode = searchParams.get('error_code') || hashParams.get('error_code');

      if (errorDesc || errorCode) {
        if (!isMounted) return;
        const normalized = (errorDesc || errorCode || '').replace(/\+/g, ' ');
        const isExpired = /expired/i.test(normalized);
        setErrorMessage(
          isExpired
            ? 'Your password reset link has expired. Please request a new one.'
            : 'Your password reset link is invalid or malformed. Please request a new one.'
        );
        setState('error');
        return;
      }

      if (!isSupabaseConfigured) {
        // Local preview fallback mode
        if (isMounted) setState('ready');
        return;
      }

      // 2. PKCE code exchange or token hash verification if present
      const code = searchParams.get('code');
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type') || hashParams.get('type');

      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.warn('PKCE exchangeCodeForSession error:', error.message);
          }
        } catch (err) {
          console.error('exchangeCodeForSession exception:', err);
        }
      } else if (tokenHash && type === 'recovery') {
        try {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
          if (error) {
            console.warn('verifyOtp error:', error.message);
          }
        } catch (err) {
          console.error('verifyOtp exception:', err);
        }
      }

      // 3. Inspect existing active session
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          setErrorMessage('Unable to verify reset session: ' + error.message);
          setState('error');
          return;
        }

        if (session?.user) {
          setState('ready');
        } else {
          // If no session is active yet, wait momentarily in case onAuthStateChange fires PASSWORD_RECOVERY
          // Give a short grace period for Supabase hash client handling
          setTimeout(async () => {
            if (!isMounted) return;
            const { data: retryData } = await supabase.auth.getSession();
            if (retryData?.session?.user) {
              setState('ready');
            } else {
              setErrorMessage('No active recovery session found. Please request a new password reset link.');
              setState('error');
            }
          }, 800);
        }
      } catch (err) {
        if (!isMounted) return;
        setErrorMessage(err instanceof Error ? err.message : 'Network error verifying reset link.');
        setState('error');
      }
    };

    evaluateRecoverySession();

    // Listen to Supabase auth events
    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY' || (session?.user && (state === 'verifying' || state === 'error'))) {
          if (isMounted) {
            setState('ready');
            setErrorMessage(null);
          }
        }
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validation
    if (!newPassword) {
      setValidationError('Password is required.');
      return;
    }
    if (newPassword.length < 6) {
      setValidationError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (error) {
          setValidationError(error.message || 'Failed to update password.');
          setIsSubmitting(false);
          return;
        }

        // Sign out temporary recovery session so user explicitly logs in fresh with new password
        try {
          await supabase.auth.signOut();
        } catch {
          // Signout error ignored
        }
      }

      setState('success');
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container vaango-auth-container">
      <Card variant="elevated" padding="lg" className="vaango-auth-card">
        {/* Brand Header */}
        <div className="vaango-auth-header">
          <Link to="/" className="vaango-auth-brand" aria-label="Vaangly Home">
            <span className="vaango-header__logo-icon">V</span>
            <span className="vaango-header__logo-text">Vaangly</span>
          </Link>
          <h1 className="vaango-auth-title">Set a new password</h1>
          <p className="vaango-auth-subtitle">
            {state === 'ready' && 'Enter and confirm your new account password below.'}
            {state === 'verifying' && 'Validating your password recovery link...'}
            {state === 'success' && 'Your account security has been updated.'}
            {state === 'error' && 'Password recovery link status'}
          </p>
        </div>

        {/* 1. VERIFYING STATE */}
        {state === 'verifying' && (
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            <RefreshCw
              size={32}
              className="animate-spin"
              style={{ margin: '0 auto var(--space-3)', color: 'var(--brand-primary)' }}
            />
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              Verifying your recovery session...
            </p>
          </div>
        )}

        {/* 2. ERROR STATE (Expired / Invalid Link) */}
        {state === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#b91c1c',
              }}
            >
              <AlertCircle size={22} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem', marginBottom: 4 }}>
                  Recovery Link Expired or Invalid
                </strong>
                <span style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                  {errorMessage || 'Your password reset link has expired or is invalid. Please request a new one.'}
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate('/login?mode=forgot')}
            >
              Request a New Reset Link
            </Button>

            <div style={{ textAlign: 'center', marginTop: 'var(--space-2)' }}>
              <Link
                to="/login"
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-text-secondary)',
                  textDecoration: 'none',
                }}
              >
                Back to Login
              </Link>
            </div>
          </div>
        )}

        {/* 3. READY STATE (Update Password Form) */}
        {state === 'ready' && (
          <form onSubmit={handlePasswordUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {validationError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#b91c1c',
                  fontSize: '0.85rem',
                }}
                role="alert"
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{validationError}</span>
              </div>
            )}

            {/* New Password */}
            <FormField id="new-password" label="New Password" required error={validationError && !newPassword ? 'Password is required.' : undefined}>
              <div style={{ position: 'relative' }}>
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password (min. 6 characters)"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  leftIcon={<Lock size={18} />}
                  required
                  autoFocus
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormField>

            {/* Confirm New Password */}
            <FormField id="confirm-new-password" label="Confirm New Password" required error={validationError && newPassword && newPassword !== confirmPassword ? 'Passwords do not match.' : undefined}>
              <div style={{ position: 'relative' }}>
                <Input
                  id="confirm-new-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  leftIcon={<KeyRound size={18} />}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormField>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
            >
              Update Password
            </Button>
          </form>
        )}

        {/* 4. SUCCESS STATE */}
        {state === 'success' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-2) 0' }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                color: 'var(--color-success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              <CheckCircle2 size={32} />
            </div>

            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 var(--space-1)' }}>
                Password updated successfully.
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
                Your account password has been updated. You can now log in securely with your new password.
              </p>
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate('/login', { replace: true })}
              rightIcon={<ArrowRight size={18} />}
            >
              Continue to Login
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
