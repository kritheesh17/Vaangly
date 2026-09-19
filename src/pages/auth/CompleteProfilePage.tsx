import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, Phone, MapPin, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import './Auth.css';

export const CompleteProfilePage: React.FC = () => {
  const { user, isAuthenticated, isProfileComplete, updateCustomerProfile, isLoading } = useAuth();
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

  // If already complete, skip directly to destination (returning customers)
  useEffect(() => {
    if (!isLoading && isAuthenticated && isProfileComplete && !isSubmitting && !isSuccess) {
      navigate(targetPath, { replace: true });
    }
  }, [isLoading, isAuthenticated, isProfileComplete, isSubmitting, isSuccess, navigate, targetPath]);

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

    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMessage(t('validPhonePrompt'));
      return;
    }

    if (!cleanAddress || cleanAddress.length < 5) {
      setErrorMessage(t('fullAddressPrompt'));
      return;
    }

    setIsSubmitting(true);
    try {
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
        setErrorMessage(result.error || t('genericError'));
      }
    } catch (err: any) {
      setErrorMessage(err?.message || t('genericError'));
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

        {errorMessage && (
          <div className="vaango-auth-error" role="alert">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="vaango-auth-form">
          <FormField id="onboard-fullname" label={t('fullNameLabel')} required>
            <Input
              id="onboard-fullname"
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
            hint={t('fullAddressPrompt')}
            required
          >
            <Input
              id="onboard-address"
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 14 Cutcherry Street, Kangeyam"
              leftIcon={<MapPin size={18} />}
              disabled={isSubmitting || isSuccess}
            />
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
