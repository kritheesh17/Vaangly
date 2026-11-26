import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Store, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { ActionErrorBanner } from '../../components/ui/ActionErrorBanner';
import { scrollAndFocusError, classifyError } from '../../lib/errorUxUtils';
import { sanitizeRedirectUrl } from '../../lib/authUtils';
import './Auth.css';

export const LoginPage: React.FC = () => {
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    signInWithGoogle,
    refreshUser,
  } = useAuth();
  const { t } = useLanguage();

  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get('redirect');
  const from = sanitizeRedirectUrl(
    redirectParam || (location.state as { from?: { pathname?: string; search?: string } })?.from?.pathname || '/'
  );

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const clearAuthError = () => {
    if (errorMsg) setErrorMsg(null);
  };

  // If already authenticated upon arrival, redirect directly to destination once verified
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && user) {
      if (user.is_verified) {
        setSuccessMsg(null);
        navigate(from, { replace: true });
      }
    }
  }, [isAuthLoading, isAuthenticated, user, navigate, from]);

  // Handle active session sync and focus recovery
  useEffect(() => {
    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            const updated = await refreshUser();
            if (updated?.is_verified) {
              setSuccessMsg(null);
              navigate(from, { replace: true });
            }
          }
        }
      });

      const handleStorageChange = (e: StorageEvent) => {
        if (e.key?.includes('auth-token') || e.key === 'vaangly_demo_role' || e.key === 'vaango_demo_role') {
          refreshUser().then((updated) => {
            if (updated?.is_verified) {
              navigate(from, { replace: true });
            }
          });
        }
      };

      const handleWindowFocus = () => {
        if (isGoogleLoading) {
          refreshUser().then((updated) => {
            if (updated?.is_verified) {
              setIsGoogleLoading(false);
              navigate(from, { replace: true });
            }
          });
        }
      };

      window.addEventListener('storage', handleStorageChange);
      window.addEventListener('focus', handleWindowFocus);

      return () => {
        subscription.unsubscribe();
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('focus', handleWindowFocus);
      };
    }
  }, [from, isGoogleLoading, navigate, refreshUser]);

  // Primary Google OAuth Sign-In handler
  const handleGoogleSignIn = async () => {
    clearAuthError();
    setSuccessMsg(null);
    setIsGoogleLoading(true);

    try {
      if (from && from !== '/') {
        sessionStorage.setItem('vaangly_auth_redirect', from);
        localStorage.setItem('vaangly_auth_redirect', from);
      }

      const result = await signInWithGoogle(from);
      if (!result.success) {
        const errorText = result.error || t('genericError');
        setErrorMsg(errorText);
        scrollAndFocusError('signin-action-error', { focus: true });
      }
    } catch (err: any) {
      const errorText = err?.message || t('genericError');
      setErrorMsg(errorText);
      scrollAndFocusError('signin-action-error', { focus: true });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const isPartnerFlow = from.includes('/shopkeeper');

  return (
    <div className="container vaango-auth-container">
      <Card variant="elevated" padding="lg" className="vaango-auth-card">
        {/* Brand Header */}
        <div className="vaango-auth-header">
          <Link to="/" className="vaango-auth-brand" aria-label="Kartzo Home" onClick={clearAuthError}>
            <div className="vaango-header__logo-icon" aria-hidden="true">
              <span>V</span>
            </div>
            <span className="vaango-header__logo-text">KARTZO</span>
          </Link>
          <h1 className="vaango-auth-title">{t('signInTitle')}</h1>
          <p className="vaango-auth-subtitle">
            {isPartnerFlow
              ? t('authPartnerSignInSubtitle')
              : t('signInSubtitle')}
          </p>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="vaango-auth-status-alert vaango-auth-status-alert--success" role="status">
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Value Propositions / Key Features */}
        <div className="vaango-auth-value-props">
          <div className="vaango-auth-value-prop-item">
            <ShieldCheck size={20} className="vaango-auth-value-prop-icon" />
            <span>Fast, verified & secure one-click sign in</span>
          </div>
          <div className="vaango-auth-value-prop-item">
            <Store size={20} className="vaango-auth-value-prop-icon" />
            <span>Connect with neighbourhood stores & track orders</span>
          </div>
          <div className="vaango-auth-value-prop-item">
            <Sparkles size={20} className="vaango-auth-value-prop-icon" />
            <span>No passwords or SMS OTP codes required</span>
          </div>
        </div>

        {/* Action Error Banner */}
        {errorMsg && (
          <ActionErrorBanner
            id="signin-action-error"
            message={errorMsg}
            variant={classifyError(errorMsg).category === 'network' ? 'network' : 'error'}
            onDismiss={() => {
              if (errorMsg) setErrorMsg(null);
            }}
          />
        )}

        {/* Google Sign In CTA */}
        <div className="vaango-auth-google-section">
          <Button
            type="button"
            variant="outline"
            size="lg"
            fullWidth
            isLoading={isGoogleLoading}
            onClick={handleGoogleSignIn}
            className="vaango-auth-google-btn"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
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

          <p className="vaango-auth-subtitle" style={{ fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
            {t('googleOnlyAuthNotice') || 'Kartzo uses Google Sign-In for fast, secure, one-click access without passwords or OTPs.'}
          </p>
        </div>

        {/* Operational Phone Notice */}
        <div className="vaango-auth-note">
          <span>
            <strong>Delivery & Contact Information:</strong> Your phone number is used exclusively for order fulfillment and delivery coordination. No SMS verification is required.
          </span>
        </div>

        {/* Footer */}
        <div className="vaango-auth-footer">
          <p>
            {t('authMerchantPrompt')}{' '}
            <Link
              to="/shopkeeper/apply"
              className="vaango-auth-link"
              onClick={clearAuthError}
            >
              {t('authApplyPartner')}
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
};
