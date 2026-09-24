import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, Phone, MapPin, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import { Checkbox } from '../../components/ui/Checkbox';
import { isValidIndianMobile } from '../../lib/phoneUtils';
import './Auth.css';

export const CompleteProfilePage: React.FC = () => {
  const { user, isAuthenticated, isProfileComplete, updateCustomerProfile, updatePassword, isLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get('redirect');
  const rawFrom = redirectParam || (location.state as { from?: { pathname?: string } })?.from?.pathname;
  const roleDefault = user?.role === 'admin' ? '/admin/dashboard' : user?.role === 'shopkeeper' ? '/shopkeeper/dashboard' : '/';
  const targetPath = rawFrom && !rawFrom.startsWith('/complete-profile') ? rawFrom : roleDefault;

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Sync initial state if user profile loads after render
  useEffect(() => {
    if (user) {
      if (!fullName && user.full_name && user.full_name !== 'User') {
        setFullName(user.full_name);
      }
      if (!phone && user.phone) {
        setPhone(user.phone);
      }
      if (!address && user.address) {
        setAddress(user.address);
      }
    }
  }, [user, fullName, phone, address]);

  // If unauthenticated, redirect to login
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login', { state: { from: location }, replace: true });
    }
  }, [isLoading, isAuthenticated, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();
    const cleanAddress = address.trim();

    if (!cleanName) {
      setErrorMessage(t('enterNamePrompt'));
      return;
    }

    if (!cleanPhone || !isValidIndianMobile(cleanPhone)) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (!cleanAddress || cleanAddress.length < 5) {
      setErrorMessage(t('fullAddressPrompt'));
      return;
    }

    const cleanPassword = password.trim();
    if (cleanPassword.length > 0 && cleanPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (cleanPassword.length >= 6) {
        await updatePassword(cleanPassword);
      }

      const result = await updateCustomerProfile({
        full_name: cleanName,
        phone: cleanPhone,
        address: cleanAddress,
      });

      if (result.success) {
        setIsSuccess(true);
        setTimeout(() => {
          navigate(targetPath, { replace: true });
        }, 600);
      } else {
        let msg = result.error || t('genericError');
        if (msg.includes('Failed to fetch') || msg.includes('network')) {
          msg = 'Unable to connect to server. Please check your internet connection and try again.';
        }
        setErrorMessage(msg);
      }
    } catch (err: any) {
      let msg = err?.message || t('genericError');
      if (msg.includes('Failed to fetch') || msg.includes('network') || msg.includes('NetworkError')) {
        msg = 'Unable to connect to server. Please check your internet connection and try again.';
      }
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container vaango-auth-container">
      <Card variant="elevated" padding="lg" className="vaango-auth-card">
        <div className="vaango-auth-header">
          <div className="vaango-auth-logo">
            <span>V</span>
          </div>
          <h1 className="vaango-auth-title">{t('completeProfileTitle')}</h1>
          <p className="vaango-auth-subtitle">
            {t('completeProfileSubtitle')}
          </p>
        </div>

        {isSuccess && (
          <div className="vaango-auth-status-alert vaango-auth-status-alert--success" role="status">
            <CheckCircle2 size={18} className="text-success" />
            <span>{t('profileSavedSuccess')}</span>
          </div>
        )}

        {isProfileComplete && !isSuccess && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-xs)',
              backgroundColor: 'rgba(10, 123, 131, 0.08)',
              color: 'var(--color-primary, #0A7B83)',
              border: '1px solid rgba(10, 123, 131, 0.2)',
              marginBottom: '16px',
            }}
          >
            <Info size={16} className="flex-shrink-0" />
            <span>Your profile is active. You can update your phone, address, or account password below.</span>
          </div>
        )}

        {errorMessage && (
          <div className="vaango-auth-status-alert vaango-auth-status-alert--error" role="alert">
            <AlertCircle size={18} className="text-error" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="vaango-auth-form">
          <FormField
            id="onboard-full-name"
            label={t('fullNameLabel')}
            required
          >
            <Input
              id="onboard-full-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ananya Raman"
              leftIcon={<User size={18} />}
              disabled={isSubmitting || isSuccess}
            />
          </FormField>

          <FormField
            id="onboard-phone"
            label={t('phoneLabel')}
            hint={t('validPhonePrompt')}
            required
          >
            <Input
              id="onboard-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              leftIcon={<Phone size={18} />}
              disabled={isSubmitting || isSuccess}
            />
          </FormField>

          <FormField
            id="onboard-address"
            label={t('addressLineLabel')}
            hint="Door No., Street, Area / Town, and Pincode"
            required
          >
            <Input
              id="onboard-address"
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 14 Cutcherry Street, Town / Area"
              leftIcon={<MapPin size={18} />}
              disabled={isSubmitting || isSuccess}
            />
          </FormField>

          <FormField
            id="onboard-password"
            label="Account Password (Optional)"
            hint="Set a password to sign in directly with your email in the future (min 6 characters)."
          >
            <Input
              id="onboard-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create account password"
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
              disabled={isSubmitting || isSuccess}
            />
            <div style={{ marginTop: '8px' }}>
              <Checkbox
                id="complete-profile-show-password"
                label="Show password"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                disabled={isSubmitting || isSuccess}
              />
            </div>
          </FormField>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isSubmitting}
            disabled={isSuccess}
            rightIcon={<ArrowRight size={18} />}
          >
            {isSuccess ? t('actionSuccess') : t('saveProfileBtn')}
          </Button>
        </form>

        <div className="vaango-auth-footer">
          <p className="text-xs text-muted">
            Signed in with Google as <strong>{user?.email || 'Customer'}</strong>
          </p>
        </div>
      </Card>
    </div>
  );
};
