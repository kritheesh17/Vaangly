import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Shield, MapPin, Phone, Mail, LogOut, CheckCircle2, Languages, Lock, KeyRound, AlertCircle, Edit3, Save, X, Smartphone, Bell, Navigation, Download, RefreshCw, Sparkles, Info, Calendar, ShoppingBag, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLocationContext } from '../context/LocationContext';
import { usePermissions } from '../context/PermissionContext';
import { usePwaUpdate } from '../context/PwaUpdateContext';
import { useToast } from '../context/ToastContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { Checkbox } from '../components/ui/Checkbox';
import { Switch } from '../components/ui/Switch';
import { UserRole } from '../types/database';
import { Language } from '../lib/i18n';
import { useLanguage } from '../context/LanguageContext';
import { isValidIndianMobile, formatPhoneDisplay } from '../lib/phoneUtils';
import './ProfilePage.css';

export const ProfilePage: React.FC = () => {
  const { user, role, switchDemoRole, signOut, updatePassword, updateCustomerProfile } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const { selectedLocation, setIsLocationModalOpen } = useLocationContext();
  const { success, error: toastError } = useToast();
  const {
    notificationStatus,
    locationStatus,
    isInstallable,
    isInstalled,
    notificationPrefs,
    updateNotificationPrefs,
    promptInstall,
    requestNotificationPermission,
    requestLocationPermission,
    sendTestNotification,
    setIsManualInstallOpen,
  } = usePermissions();

  const {
    appVersion,
    buildId,
    isCheckingForUpdates,
    isUpdateAvailable,
    checkForUpdates,
    applyUpdate,
  } = usePwaUpdate();

  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);
  const [isSendingTestAlert, setIsSendingTestAlert] = useState(false);
  const navigate = useNavigate();

  const { language, setLanguage, t } = useLanguage();

  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Profile details editing
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactName, setContactName] = useState(user?.full_name || '');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
  const [contactAddress, setContactAddress] = useState(user?.address || '');
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactFeedback, setContactFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (user) {
      setContactName(user.full_name || '');
      setContactPhone(user.phone || '');
      setContactAddress(user.address || '');
    }
  }, [user]);

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactFeedback(null);
    if (!contactName.trim()) {
      setContactFeedback({ type: 'error', message: 'Name cannot be empty.' });
      return;
    }
    if (!contactPhone.trim() || !isValidIndianMobile(contactPhone.trim())) {
      setContactFeedback({ type: 'error', message: 'Please enter a valid 10-digit Indian phone number.' });
      return;
    }
    setIsSavingContact(true);
    try {
      const res = await updateCustomerProfile({
        full_name: contactName.trim(),
        phone: contactPhone.trim(),
        address: contactAddress.trim() || (user?.address || 'Self Pickup / Not Specified'),
      });
      if (res.success) {
        setContactFeedback({ type: 'success', message: 'Contact details saved successfully!' });
        setIsEditingContact(false);
      } else {
        setContactFeedback({ type: 'error', message: res.error || 'Failed to save contact details.' });
      }
    } catch (err: unknown) {
      setContactFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Error saving profile' });
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);
    if (!newPassword || newPassword.length < 6) {
      setPasswordFeedback({ type: 'error', message: 'Password must be at least 6 characters long.' });
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const res = await updatePassword(newPassword);
      if (res.success) {
        setPasswordFeedback({ type: 'success', message: 'Password updated successfully!' });
        setNewPassword('');
      } else {
        setPasswordFeedback({ type: 'error', message: res.error || 'Failed to update password.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating password';
      setPasswordFeedback({ type: 'error', message: msg });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const getRoleDescription = (r?: UserRole | null) => {
    switch (r) {
      case 'shopkeeper':
        return t('roleDescShopkeeper');
      case 'admin':
        return t('roleDescAdmin');
      default:
        return t('roleDescCustomer');
    }
  };

  return (
    <div className="container vaango-profile">
      <div className="vaango-profile__header">
        <h1 className="vaango-profile__title">{t('accountAndPreferences')}</h1>
        <p className="vaango-profile__subtitle">
          {t('accountSubtitle')}
        </p>
      </div>

      <div className="vaango-profile__grid">
        {/* User Identity Card */}
        <Card variant="elevated" padding="lg" className="vaango-profile-card">
          <div className="vaango-profile-card__avatar-row">
            <div className="vaango-profile-card__avatar">
              <User size={36} />
            </div>
            <div>
              <div className="vaango-profile-card__name-row">
                <h2 className="vaango-profile-card__name">{user?.full_name || 'Customer'}</h2>
                {user?.is_verified && (
                  <Badge variant="success" size="sm" withDot>
                    {t('verifiedCustomer')}
                  </Badge>
                )}
              </div>
              <div className="vaango-profile-card__role-tag">
                <Shield size={14} />
                <span>{t('activePersona')} <strong>{role ? role.toUpperCase() : 'CUSTOMER'}</strong></span>
              </div>
            </div>
          </div>

          {contactFeedback && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-3)',
                fontSize: 'var(--font-size-sm)',
                backgroundColor: contactFeedback.type === 'success' ? 'var(--color-success-bg, rgba(46, 125, 50, 0.1))' : 'var(--color-error-bg, rgba(211, 47, 47, 0.1))',
                color: contactFeedback.type === 'success' ? 'var(--color-success, #2e7d32)' : 'var(--color-error, #d32f2f)',
              }}
            >
              {contactFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{contactFeedback.message}</span>
            </div>
          )}

          {isEditingContact ? (
            <form onSubmit={handleSaveContact} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <FormField id="profile-edit-name" label="Full Name" required>
                <Input
                  id="profile-edit-name"
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Your Full Name"
                />
              </FormField>

              <FormField id="profile-edit-phone" label="Mobile Number" required hint="10-digit Indian mobile number for order delivery">
                <Input
                  id="profile-edit-phone"
                  type="tel"
                  required
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="9876543210"
                />
              </FormField>

              <FormField id="profile-edit-address" label="Delivery Address" hint="House / Flat, Street, Area">
                <Input
                  id="profile-edit-address"
                  type="text"
                  value={contactAddress}
                  onChange={(e) => setContactAddress(e.target.value)}
                  placeholder="House / Street / Landmark"
                />
              </FormField>

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <Button type="submit" variant="primary" size="sm" isLoading={isSavingContact} leftIcon={<Save size={16} />}>
                  Save Changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSavingContact}
                  onClick={() => {
                    setIsEditingContact(false);
                    setContactFeedback(null);
                    setContactName(user?.full_name || '');
                    setContactPhone(user?.phone || '');
                    setContactAddress(user?.address || '');
                  }}
                  leftIcon={<X size={16} />}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="vaango-profile-card__details">
              <div className="vaango-profile-card__item" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <Phone size={18} className="vaango-profile-card__item-icon" />
                  <span>{user?.phone ? formatPhoneDisplay(user.phone) : 'No phone number provided'}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setIsEditingContact(true); setContactFeedback(null); }}>
                  <Edit3 size={15} style={{ marginRight: '4px' }} /> Edit
                </Button>
              </div>
              <div className="vaango-profile-card__item">
                <Mail size={18} className="vaango-profile-card__item-icon" />
                <span>{user?.email || 'customer@vaangly.in'}</span>
              </div>
              {user?.address && (
                <div className="vaango-profile-card__item">
                  <MapPin size={18} className="vaango-profile-card__item-icon" />
                  <span>{user.address}</span>
                </div>
              )}
              <div className="vaango-profile-card__item" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <MapPin size={18} className="vaango-profile-card__item-icon" />
                  <span>{selectedLocation.name}, {selectedLocation.state}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setIsLocationModalOpen(true)}>
                  {t('changeBtn')}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Language Preference */}
        <Card variant="default" padding="lg" className="vaango-profile-card">
          <div className="vaango-profile-card__section-head">
            <Languages className="vaango-section-icon" />
            <div>
              <h3 className="vaango-card-heading">{t('languageFoundation')}</h3>
              <p className="vaango-card-subheading">
                {t('chooseLanguage')}
              </p>
            </div>
          </div>

          <div className="vaango-role-selector" role="radiogroup" aria-label={t('chooseLanguage')}>
            <button
              type="button"
              role="radio"
              aria-checked={language === 'en'}
              className={`vaango-role-opt ${language === 'en' ? 'vaango-role-opt--active' : ''}`}
              onClick={() => handleLanguageChange('en')}
            >
              <div className="vaango-role-opt__header">
                <span className="vaango-role-opt__title">English</span>
                {language === 'en' && <CheckCircle2 size={18} className="vaango-role-opt__check" />}
              </div>
              <p className="vaango-role-opt__desc">{t('defaultLanguageDesc')}</p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={language === 'ta'}
              className={`vaango-role-opt ${language === 'ta' ? 'vaango-role-opt--active' : ''}`}
              onClick={() => handleLanguageChange('ta')}
            >
              <div className="vaango-role-opt__header">
                <span className="vaango-role-opt__title">தமிழ் (Tamil)</span>
                {language === 'ta' && <CheckCircle2 size={18} className="vaango-role-opt__check" />}
              </div>
              <p className="vaango-role-opt__desc">{t('tamilLanguageDesc')}</p>
            </button>
          </div>
        </Card>

        {/* Role Architecture Testing / Switcher */}
        {import.meta.env.DEV && <Card variant="default" padding="lg" className="vaango-profile-card">
          <div className="vaango-profile-card__section-head">
            <Shield className="vaango-section-icon" />
            <div>
              <h3 className="vaango-card-heading">Platform Role Testing</h3>
              <p className="vaango-card-subheading">
                Switch active roles to test customer vs shopkeeper vs admin navigation:
              </p>
            </div>
          </div>

          <div className="vaango-role-selector" role="radiogroup" aria-label="Select platform persona">
            {(['customer', 'shopkeeper', 'admin'] as UserRole[]).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                className={`vaango-role-opt ${role === r ? 'vaango-role-opt--active' : ''}`}
                onClick={() => switchDemoRole(r)}
              >
                <div className="vaango-role-opt__header">
                  <span className="vaango-role-opt__title">
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </span>
                  {role === r && <CheckCircle2 size={18} className="vaango-role-opt__check" />}
                </div>
                <p className="vaango-role-opt__desc">{getRoleDescription(r)}</p>
              </button>
            ))}
          </div>
        </Card>}

        {/* Security & Password */}
        <Card variant="default" padding="lg" className="vaango-profile-card">
          <div className="vaango-profile-card__section-head">
            <Lock className="vaango-section-icon" />
            <div>
              <h3 className="vaango-card-heading">Security & Password</h3>
              <p className="vaango-card-subheading">
                Update your account password to sign in directly with email.
              </p>
            </div>
          </div>

          <form onSubmit={handleUpdatePassword} style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {passwordFeedback && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-xs)',
                  backgroundColor: passwordFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: passwordFeedback.type === 'success' ? 'var(--color-success, #16a34a)' : 'var(--color-error, #dc2626)',
                  border: `1px solid ${passwordFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                }}
              >
                {passwordFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{passwordFeedback.message}</span>
              </div>
            )}

            <div>
              <Input
                id="profile-new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                leftIcon={<KeyRound size={18} />}
                disabled={isUpdatingPassword}
              />
            </div>

            <div style={{ marginTop: '2px' }}>
              <Checkbox
                id="profile-show-password"
                label="Show password"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                disabled={isUpdatingPassword}
              />
            </div>

            <Button
              type="submit"
              variant="outline"
              size="md"
              isLoading={isUpdatingPassword}
              disabled={!newPassword || newPassword.length < 6}
              style={{ alignSelf: 'flex-start' }}
            >
              Update Password
            </Button>
          </form>
        </Card>

        {/* App Options & Update Hub (Part 2 & Part 4) */}
        <Card variant="default" padding="lg" className="vaango-profile-card">
          <div className="vaango-profile-card__section-head" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Smartphone className="vaango-section-icon" />
              <div>
                <h3 className="vaango-card-heading">App Options & Updates</h3>
                <p className="vaango-card-subheading">
                  Manage application installation, version lifecycle, and offline updates.
                </p>
              </div>
            </div>
            {isInstalled && (
              <Button
                variant="outline"
                size="sm"
                isLoading={isCheckingForUpdates}
                onClick={async () => {
                  setUpdateFeedback(null);
                  const hasUpdate = await checkForUpdates();
                  if (hasUpdate) {
                    setUpdateFeedback('A new version of Vaangly is ready!');
                  } else {
                    setUpdateFeedback('Vaangly is up to date.');
                    setTimeout(() => setUpdateFeedback(null), 4000);
                  }
                }}
                leftIcon={<RefreshCw size={13} />}
              >
                Check for Updates
              </Button>
            )}
          </div>

          <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Install Status Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--color-bg-secondary, #f8fafc)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Smartphone size={20} style={{ color: 'var(--color-primary)' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                    Vaangly App {isInstalled ? `(v${appVersion})` : ''}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    {isInstalled
                      ? `Running as installed PWA • Build ${buildId}`
                      : isInstallable
                      ? 'Ready to install on home screen'
                      : 'Browsing via web browser'}
                  </div>
                </div>
              </div>
              <div>
                {isInstalled ? (
                  <Badge variant="success">Installed ✓</Badge>
                ) : isInstallable ? (
                  <Button variant="primary" size="sm" onClick={() => promptInstall()} leftIcon={<Download size={14} />}>
                    Install Vaangly
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setIsManualInstallOpen(true)}>
                    How to Install
                  </Button>
                )}
              </div>
            </div>

            {/* In-app Update Notice if available */}
            {isUpdateAvailable && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(27, 77, 62, 0.08)', border: '1px solid rgba(27, 77, 62, 0.2)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-primary)' }}>
                  <Sparkles size={16} />
                  <span>A new version of Vaangly is ready!</span>
                </div>
                <Button variant="primary" size="sm" onClick={applyUpdate}>
                  Update Now
                </Button>
              </div>
            )}

            {updateFeedback && !isUpdateAvailable && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success, #16a34a)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={14} />
                <span>{updateFeedback}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Notifications & Channels Management Card (Part 13) */}
        <Card variant="default" padding="lg" className="vaango-profile-card">
          <div className="vaango-profile-card__section-head" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Bell className="vaango-section-icon" />
              <div>
                <h3 className="vaango-card-heading">Notifications & Channels</h3>
                <p className="vaango-card-subheading">
                  Configure real-time alerts for appointments, queue position, and order tracking.
                </p>
              </div>
            </div>
            {notificationStatus === 'granted' ? (
              <Button
                variant="outline"
                size="sm"
                isLoading={isSendingTestAlert}
                onClick={async () => {
                  setIsSendingTestAlert(true);
                  const res = await sendTestNotification(user?.id);
                  if (res.success) {
                    success('Test notification delivered to your device! 🔔');
                  } else {
                    toastError(res.message);
                  }
                  setIsSendingTestAlert(false);
                }}
              >
                Send Test Alert
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => requestNotificationPermission()}
              >
                Enable
              </Button>
            )}
          </div>

          <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Master Permission State */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--color-bg-secondary, #f8fafc)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Bell size={18} style={{ color: notificationStatus === 'granted' ? 'var(--color-success, #16a34a)' : 'var(--color-text-secondary)' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Push Notifications Master</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    {notificationStatus === 'granted'
                      ? 'Browser permission granted and active'
                      : notificationStatus === 'denied'
                      ? 'Blocked by browser settings'
                      : 'Permission pending user authorization'}
                  </div>
                </div>
              </div>
              <Badge variant={notificationStatus === 'granted' ? 'success' : notificationStatus === 'denied' ? 'error' : 'warning'}>
                {notificationStatus === 'granted' ? 'Enabled' : notificationStatus === 'denied' ? 'Blocked' : 'Default'}
              </Badge>
            </div>

            {/* Channel Toggles */}
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary, #f8fafc)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Calendar size={16} style={{ color: 'var(--color-primary)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-xs)' }}>Appointment Updates</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Confirmations, token reminders, and reschedule alerts</div>
                  </div>
                </div>
                <Switch
                  label="Appointment Updates"
                  checked={notificationPrefs.appointments}
                  onChange={(checked) => updateNotificationPrefs({ appointments: checked })}
                  disabled={notificationStatus === 'denied'}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary, #f8fafc)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShoppingBag size={16} style={{ color: 'var(--color-primary)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-xs)' }}>Order Tracking</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Accepted, dispatched, or ready-for-pickup notifications</div>
                  </div>
                </div>
                <Switch
                  label="Order Tracking"
                  checked={notificationPrefs.orders}
                  onChange={(checked) => updateNotificationPrefs({ orders: checked })}
                  disabled={notificationStatus === 'denied'}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary, #f8fafc)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Clock size={16} style={{ color: 'var(--color-primary)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-xs)' }}>Queue Position Alerts</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Live updates when you are next in line</div>
                  </div>
                </div>
                <Switch
                  label="Queue Alerts"
                  checked={notificationPrefs.queue}
                  onChange={(checked) => updateNotificationPrefs({ queue: checked })}
                  disabled={notificationStatus === 'denied'}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Location & Discovery Permissions Card */}
        <Card variant="default" padding="lg" className="vaango-profile-card">
          <div className="vaango-profile-card__section-head" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Navigation className="vaango-section-icon" />
              <div>
                <h3 className="vaango-card-heading">Device Location (GPS)</h3>
                <p className="vaango-card-subheading">
                  Discover verified neighborhood shops within your immediate radius.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/permissions')}
            >
              Full Center
            </Button>
          </div>

          <div style={{ marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--color-bg-secondary, #f8fafc)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Navigation size={20} style={{ color: locationStatus === 'granted' ? 'var(--color-success, #16a34a)' : 'var(--color-text-secondary)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>GPS Coordinate Discovery</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  {locationStatus === 'granted'
                    ? 'Active — accurate distance calculation enabled'
                    : locationStatus === 'denied'
                    ? 'Blocked — using default town mode'
                    : 'Optional — enable for distance sorting'}
                </div>
              </div>
            </div>
            <div>
              {locationStatus === 'granted' ? (
                <Badge variant="success">Active</Badge>
              ) : locationStatus === 'denied' ? (
                <Badge variant="error">Blocked</Badge>
              ) : (
                <Button variant="outline" size="sm" onClick={() => requestLocationPermission()}>
                  Enable
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Appearance & System Settings */}
        <Card variant="default" padding="lg" className="vaango-profile-card">
          <h3 className="vaango-card-heading">{t('appearanceAndDisplay')}</h3>
          <p className="vaango-card-subheading">
            {t('appearanceSubtitle')}
          </p>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <Switch
              checked={isDark}
              onChange={toggleTheme}
              label={isDark ? t('darkThemeActive') : t('lightThemeActive')}
              description={t('themeSavedNotice')}
            />
          </div>

          <div className="vaango-profile__theme-indicator">
            <span className="vaango-theme-chip" style={{ backgroundColor: '#0A7B83' }}>{t('themeChipTeal')}</span>
            <span className="vaango-theme-chip" style={{ backgroundColor: '#F59E0B', color: '#000' }}>{t('themeChipAmber')}</span>
            <span className="vaango-theme-chip" style={{ backgroundColor: '#0F1828', color: '#FFF' }}>{t('themeChipNavy')}</span>
          </div>
        </Card>

        {/* About Vaangly (Part 6 Requirement) */}
        <Card variant="default" padding="lg" className="vaango-profile-card">
          <div className="vaango-profile-card__section-head">
            <Info className="vaango-section-icon" />
            <div>
              <h3 className="vaango-card-heading">About Vaangly</h3>
              <p className="vaango-card-subheading">
                Hyperlocal discovery & commerce platform.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-4)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
            <div style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary, #f8fafc)' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>VERSION</div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, marginTop: '2px' }}>v{appVersion}</div>
            </div>
            <div style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary, #f8fafc)' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>BUILD ID</div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontFamily: 'monospace', fontWeight: 700, marginTop: '2px' }}>{buildId}</div>
            </div>
            <div style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary, #f8fafc)' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>MODE</div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, marginTop: '2px' }}>{isInstalled ? 'Installed PWA' : 'Web App'}</div>
            </div>
          </div>
        </Card>

        {/* Account Actions */}
        <div className="vaango-profile__logout-row">
          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={handleSignOut}
            leftIcon={<LogOut size={18} />}
          >
            {t('signOutPlatform')}
          </Button>
        </div>
      </div>
    </div>
  );
};
