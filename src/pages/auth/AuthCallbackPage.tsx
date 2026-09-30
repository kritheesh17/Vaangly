import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { isValidIndianMobile, normalizeIndianPhone } from '../../lib/phoneUtils';
import './Auth.css';

type CallbackState = 'loading' | 'success' | 'error';

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { resendEmailConfirmation, refreshUser } = useAuth();
  const [state, setState] = useState<CallbackState>('loading');
  const [message, setMessage] = useState('Completing your authentication...');
  const [email, setEmail] = useState('');
  const exchangePromiseRef = useRef<Promise<any> | null>(null);

  useEffect(() => {
    let mounted = true;
    const completeConfirmation = async () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const errorParam = query.get('error') || hash.get('error');
      const errorDescription = query.get('error_description') || hash.get('error_description');
      const pendingEmail = localStorage.getItem('vaangly_pending_confirmation_email') || '';
      if (pendingEmail) setEmail(pendingEmail);

      // 1. Google Cancelled / Access Denied
      if (errorParam === 'access_denied' || (errorDescription && /access_denied|cancelled/i.test(errorDescription))) {
        if (mounted) {
          setState('error');
          setMessage('Google sign-in was cancelled.');
        }
        return;
      }

      // 2. Generic OAuth / confirmation errors
      if (errorDescription || errorParam) {
        if (mounted) {
          if (query.get('type') === 'recovery' || hash.get('type') === 'recovery' || query.get('redirect') === '/reset-password') {
            navigate(`/reset-password${window.location.search}${window.location.hash}`, { replace: true });
            return;
          }
          setState('error');
          const rawError = (errorDescription || errorParam || '').replace(/\+/g, ' ');
          setMessage(/expired/i.test(rawError)
            ? 'This confirmation link has expired. Request a new confirmation email.'
            : /invalid|missing/i.test(rawError)
              ? 'This confirmation link is invalid. Request a new confirmation email.'
              : rawError);
        }
        return;
      }

      // 3. Legacy Implicit Hash Fallback Handling (Section 5)
      const hasLegacyHashToken = hash.has('access_token') || Boolean(hash.get('access_token'));
      if (hasLegacyHashToken) {
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        }
        if (mounted) {
          setState('error');
          setMessage('Your sign-in session used an outdated authentication flow. Please return to login and try again.');
        }
        return;
      }

      const code = query.get('code');
      const tokenHash = query.get('token_hash');
      const otpType = (query.get('type') || hash.get('type') || 'signup') as any;

      const isRecovery =
        otpType === 'recovery' ||
        query.get('type') === 'recovery' ||
        hash.get('type') === 'recovery' ||
        query.get('redirect') === '/reset-password';

      let flowError: string | null = null;

      // 4. Primary Google OAuth PKCE Flow (?code=...)
      if (code) {
        if (!exchangePromiseRef.current) {
          exchangePromiseRef.current = (async () => {
            // Check if client auto-detection already established the session
            const { data: existingSession } = await supabase.auth.getSession();
            if (existingSession?.session) {
              return { data: existingSession, error: null };
            }
            return await supabase.auth.exchangeCodeForSession(code);
          })();
        }
        try {
          const { error: exchangeErr } = await exchangePromiseRef.current;
          if (exchangeErr) {
            console.warn('exchangeCodeForSession warning:', exchangeErr.message);
            // If the code was already exchanged during this load, check getSession
            const { data: fallbackSession } = await supabase.auth.getSession();
            if (!fallbackSession?.session) {
              flowError = exchangeErr.message;
            }
          }
        } catch (exchangeErr: any) {
          console.error('Error exchanging code for session:', exchangeErr);
          flowError = exchangeErr?.message || 'Code exchange failed';
        }
      }
      // 5. OTP / Magic Link Token Hash Verify (?token_hash=...)
      else if (tokenHash) {
        if (!exchangePromiseRef.current) {
          exchangePromiseRef.current = supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
        }
        try {
          const { error: verifyErr } = await exchangePromiseRef.current;
          if (verifyErr) {
            console.warn('verifyOtp warning:', verifyErr.message);
            flowError = verifyErr.message;
          }
        } catch (verifyErr: any) {
          console.error('Error verifying OTP token hash:', verifyErr);
          flowError = verifyErr?.message || 'OTP verification failed';
        }
      }

      if (isRecovery) {
        navigate('/reset-password', { replace: true });
        return;
      }

      // Check authenticated session
      let { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error || !data.session?.user) {
        setState('error');
        if (code && flowError) {
          setMessage('Authentication code exchange failed. Please try signing in again.');
        } else {
          setMessage(error ? 'A network or Auth error prevented authentication. Please try again.' : 'This authentication session is missing, invalid, or expired.');
        }
        return;
      }

      const confirmedUser = data.session.user;
      const isGoogleOAuth = confirmedUser.app_metadata?.provider === 'google' ||
        Boolean(confirmedUser.identities?.some((id: { provider?: string }) => id.provider === 'google'));
      const isEmailConfirmed = Boolean(confirmedUser.email_confirmed_at || confirmedUser.confirmed_at || isGoogleOAuth);
      if (!isEmailConfirmed) {
        setState('error');
        setMessage('Your account confirmation could not be completed. Please request a new confirmation email.');
        return;
      }

      setEmail(confirmedUser.email || '');
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', confirmedUser.id)
        .maybeSingle();

      const metadata = confirmedUser.user_metadata || {};
      const metadataPhone = normalizeIndianPhone(metadata.phone) || normalizeIndianPhone(confirmedUser.phone) || null;
      let activeProfile = profile;

      if (!activeProfile) {
        const { data: createdProfile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: confirmedUser.id,
            role: 'customer',
            full_name: metadata.full_name || metadata.name || confirmedUser.email?.split('@')[0] || 'Customer',
            email: confirmedUser.email || null,
            phone: metadataPhone,
            avatar_url: metadata.avatar_url || metadata.picture || null,
            is_verified: isEmailConfirmed,
          })
          .select('*')
          .maybeSingle();

        if (profileError) {
          if (profileError.code === '23505') {
            // Concurrent insert race condition handled safely
            const { data: existingProfile, error: fetchExistingError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', confirmedUser.id)
              .maybeSingle();
            if (fetchExistingError || !existingProfile) {
              if (mounted) {
                setState('error');
                setMessage('Profile exists but could not be loaded. Please sign in again.');
              }
              return;
            }
            activeProfile = existingProfile;
          } else {
            console.error('Could not insert profile on callback:', profileError);
            if (mounted) {
              setState('error');
              setMessage(profileError.message || 'Failed to initialize your profile. Please try signing in again.');
            }
            return;
          }
        } else {
          activeProfile = createdProfile;
        }
      }

      if (!activeProfile) {
        if (mounted) {
          setState('error');
          setMessage('Unable to load or create your profile. Please try signing in again.');
        }
        return;
      }

      // If active profile exists but phone is missing in profiles, sync it from metadata
      if (activeProfile && !activeProfile.phone && metadataPhone) {
        await supabase
          .from('profiles')
          .update({ phone: metadataPhone })
          .eq('id', confirmedUser.id);
        activeProfile.phone = metadataPhone;
      }

      // Check profile completeness for customer strictly from authoritative public.profiles
      // Existing shopkeeper and admin profiles are never downgraded to customer
      const targetRole = activeProfile?.role || 'customer';
      const resolvedName = activeProfile?.full_name || '';
      const resolvedPhone = activeProfile?.phone || '';
      const resolvedAddress = activeProfile?.address || '';

      const isComplete =
        targetRole !== 'customer' ||
        (Boolean(resolvedName.trim()) &&
         Boolean(resolvedPhone.trim() && isValidIndianMobile(resolvedPhone.trim())) &&
         Boolean(resolvedAddress.trim()));

      localStorage.removeItem('vaangly_pending_confirmation_email');
      await refreshUser();
      setState('success');
      setMessage('Authentication confirmed. Redirecting you now...');
      window.setTimeout(() => {
        const queryRedirect = query.get('redirect');
        const sessionRedirect = sessionStorage.getItem('vaangly_auth_redirect');
        const localRedirect = localStorage.getItem('vaangly_auth_redirect');
        const pendingRedirect = queryRedirect || sessionRedirect || localRedirect;

        if (sessionRedirect) sessionStorage.removeItem('vaangly_auth_redirect');
        if (localRedirect) localStorage.removeItem('vaangly_auth_redirect');

        if (pendingRedirect && pendingRedirect.startsWith('/reset-password')) {
          navigate(pendingRedirect, { replace: true });
        } else if (targetRole === 'admin') {
          navigate('/admin/dashboard', { replace: true });
        } else if (targetRole === 'shopkeeper') {
          navigate('/shopkeeper/dashboard', { replace: true });
        } else if (pendingRedirect) {
          navigate(pendingRedirect, { replace: true });
        } else if (!isComplete) {
          navigate('/complete-profile', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }, 700);
    };
    completeConfirmation().catch(() => {
      if (mounted) {
        setState('error');
        setMessage('A network error prevented confirmation. Please try again.');
      }
    });
    return () => { mounted = false; };
  }, [navigate]);

  const handleResend = async () => {
    if (!email) return;
    setState('loading');
    setMessage('Sending a new confirmation email...');
    const result = await resendEmailConfirmation(email);
    setState(result.success ? 'success' : 'error');
    setMessage(result.success ? 'A new confirmation email has been sent.' : result.error || 'Unable to send a new confirmation email.');
  };

  return (
    <div className="container vaango-auth-container">
      <div className="vaango-auth-card">
        <div className="vaango-auth-header">
          <div className="vaango-auth-logo"><span>V</span></div>
          <h1 className="vaango-auth-title">Account authentication</h1>
          <p className="vaango-auth-subtitle">{message}</p>
        </div>
        {state === 'loading' && <RefreshCw size={22} className="vaango-spin text-primary" aria-label="Loading" />}
        {state === 'success' && <CheckCircle2 size={22} className="text-success" aria-label="Success" />}
        {state === 'error' && <AlertCircle size={22} className="text-error" aria-label="Error" />}
        {state === 'error' && email ? (
          <Button type="button" variant="primary" fullWidth onClick={handleResend}>Resend confirmation email</Button>
        ) : state === 'error' ? (
          <Button type="button" variant="primary" fullWidth onClick={() => navigate('/login')}>Back to Login</Button>
        ) : null}
        <div className="vaango-auth-footer">
          <Link to="/login" className="vaango-auth-link">Return to sign in</Link>{' · '}
          <Link to="/register" className="vaango-auth-link">Create an account</Link>
        </div>
      </div>
    </div>
  );
};