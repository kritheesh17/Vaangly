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
  const { resendEmailConfirmation } = useAuth();
  const [state, setState] = useState<CallbackState>('loading');
  const [message, setMessage] = useState('Completing your email confirmation...');
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

      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error || !data.session?.user) {
        setState('error');
        setMessage(error ? 'A network or Auth error prevented confirmation. Please request a new email.' : 'This confirmation link is missing, invalid, or expired.');
        return;
      }

      const confirmedUser = data.session.user;
      const isEmailConfirmed = Boolean(confirmedUser.email_confirmed_at || confirmedUser.confirmed_at);
      if (!isEmailConfirmed) {
        setState('error');
        setMessage('Your email confirmation could not be completed. Please request a new confirmation email.');
        return;
      }

      setEmail(confirmedUser.email || '');
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', confirmedUser.id)
        .maybeSingle();

      if (!profile) {
        const metadata = confirmedUser.user_metadata || {};
        const { error: profileError } = await supabase.from('profiles').insert({
          id: confirmedUser.id,
          role: ['customer', 'shopkeeper'].includes(metadata.role) ? metadata.role : 'customer',
          full_name: metadata.full_name || confirmedUser.email?.split('@')[0] || 'User',
          email: confirmedUser.email || null,
          phone: metadata.phone || confirmedUser.phone || null,
          is_verified: isEmailConfirmed,
        });
        if (profileError && profileError.code !== '23505') throw profileError;
      }

      localStorage.removeItem('vaangly_pending_confirmation_email');
      setState('success');
      setMessage('Your email is confirmed. Redirecting you now...');
      window.setTimeout(() => {
        navigate(confirmedUser.user_metadata?.role === 'shopkeeper' ? '/shopkeeper/apply' : '/', { replace: true });
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
          <h1 className="vaango-auth-title">Email confirmation</h1>
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