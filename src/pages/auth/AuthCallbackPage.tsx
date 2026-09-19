import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import './Auth.css';

type CallbackState = 'loading' | 'success' | 'error';

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { resendEmailConfirmation, refreshUser } = useAuth();
  const [state, setState] = useState<CallbackState>('loading');
  const [message, setMessage] = useState('Completing your authentication...');
  const [email, setEmail] = useState('');

  useEffect(() => {
    let mounted = true;
    const completeConfirmation = async () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const errorDescription = query.get('error_description') || hash.get('error_description');
      const pendingEmail = localStorage.getItem('vaangly_pending_confirmation_email') || '';
      if (pendingEmail) setEmail(pendingEmail);
      if (errorDescription) {
        if (mounted) {
          setState('error');
          const normalized = errorDescription.replace(/\+/g, ' ');
          setMessage(/expired/i.test(normalized)
            ? 'This confirmation link has expired. Request a new confirmation email.'
            : /invalid|missing/i.test(normalized)
              ? 'This confirmation link is invalid. Request a new confirmation email.'
              : normalized);
        }
        return;
      }

      const code = query.get('code');
      const tokenHash = query.get('token_hash');
      const otpType = (query.get('type') || 'signup') as any;

      if (code) {
        try {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) console.warn('exchangeCodeForSession warning:', exchangeErr.message);
        } catch (exchangeErr) {
          console.error('Error exchanging code for session:', exchangeErr);
        }
      } else if (tokenHash) {
        try {
          const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
          if (verifyErr) console.warn('verifyOtp warning:', verifyErr.message);
        } catch (verifyErr) {
          console.error('Error verifying OTP token hash:', verifyErr);
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error || !data.session?.user) {
        setState('error');
        setMessage(error ? 'A network or Auth error prevented authentication. Please try again.' : 'This authentication session is missing, invalid, or expired.');
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
      let activeProfile = profile;

      if (!activeProfile) {
        const { data: createdProfile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: confirmedUser.id,
            role: 'customer',
            full_name: metadata.full_name || metadata.name || confirmedUser.email?.split('@')[0] || 'Customer',
            email: confirmedUser.email || null,
            phone: confirmedUser.phone || null,
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

      // Check profile completeness for customer strictly from authoritative public.profiles
      // Existing shopkeeper and admin profiles are never downgraded to customer
      const targetRole = activeProfile?.role || 'customer';
      const resolvedName = activeProfile?.full_name || '';
      const resolvedPhone = activeProfile?.phone || '';
      const resolvedAddress = activeProfile?.address || '';

      const isComplete =
        targetRole !== 'customer' ||
        (Boolean(resolvedName.trim()) &&
         Boolean(resolvedPhone.trim().length >= 7) &&
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

        if (targetRole === 'admin') {
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
        {state === 'error' && email && <Button type="button" variant="primary" fullWidth onClick={handleResend}>Resend confirmation email</Button>}
        <div className="vaango-auth-footer">
          <Link to="/login" className="vaango-auth-link">Return to sign in</Link>{' · '}
          <Link to="/register" className="vaango-auth-link">Create an account</Link>
        </div>
      </div>
    </div>
  );
};