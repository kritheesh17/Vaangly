import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store,
  Phone,
  Clock,
  Truck,
  QrCode,
  LogOut,
  Save,
  User,
  ShieldCheck,
  Lock,
  KeyRound,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Shop, ShopSubscription, TimeRange } from '../../types/database';
import { getShopkeeperShop, updateShopProfile, updateSlotConfig } from '../../lib/shopkeeperApi';
import { MOCK_SHOP_TYPES } from '../../data/mockData';
import { fetchShopSubscription, calculateTrialWindow, updateShopBillingCycle } from '../../lib/adminApi';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Checkbox } from '../../components/ui/Checkbox';
import { TimePicker12h } from '../../components/ui/TimePicker12h';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Switch } from '../../components/ui/Switch';
import { CreditCard, Info } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import './ShopkeeperProfilePage.css';

export const ShopkeeperProfilePage: React.FC = () => {
  const { user, signOut, switchDemoRole, updatePassword } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const { t } = useLanguage();

  const [shop, setShop] = useState<Shop | null>(null);
  const [subscription, setSubscription] = useState<ShopSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Editable fields
  const [tagline, setTagline] = useState('');
  const [phone, setPhone] = useState('');
  const [openingTime, setOpeningTime] = useState('07:30');
  const [closingTime, setClosingTime] = useState('21:30');
  const [isOpenToday, setIsOpenToday] = useState(true);
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState('20');
  const [upiId, setUpiId] = useState('');
  const [isBillingSaving, setIsBillingSaving] = useState(false);
  const [slotDuration, setSlotDuration] = useState(30);
  const [availableDays, setAvailableDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [timeRanges, setTimeRanges] = useState<TimeRange[]>([{ id: 'range-1', start: '09:00', end: '17:00', concurrent: 1 }]);
  const [upiQrFile, setUpiQrFile] = useState<File | null>(null);
  const [customisedCakeAvailable, setCustomisedCakeAvailable] = useState(false);

  // Security & Password states
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  useEffect(() => {
    async function loadShop() {
      if (!user) return;
      try {
        const data = await getShopkeeperShop(user.id);
        if (data) {
          setShop(data);
          setTagline(data.tagline || '');
          setPhone(data.phone || '');
          setOpeningTime(data.opening_time || '08:00');
          setClosingTime(data.closing_time || '21:00');
          setIsOpenToday(data.is_open_today);
          setDeliveryAvailable(data.delivery_available);
          setDeliveryFee(data.delivery_fee.toString());
          setUpiId(data.upi_id || '');
          setCustomisedCakeAvailable(Boolean(data.customised_cake_available));
          if (data.slot_config) {
            setSlotDuration(data.slot_config.slotDurationMinutes);
            setAvailableDays(data.slot_config.availableDays);
            const legacyConfig = data.slot_config as typeof data.slot_config & { openTime?: string; closeTime?: string };
            setTimeRanges(data.slot_config.ranges?.length ? data.slot_config.ranges : [{ id: 'range-1', start: legacyConfig.openTime || data.opening_time || '09:00', end: legacyConfig.closeTime || data.closing_time || '17:00', concurrent: 1 }]);
          }

          const sub = await fetchShopSubscription(data.id);
          setSubscription(sub);
        }
      } catch (err) {
        console.error('Error fetching shop settings:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadShop();
  }, [user]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;

    setIsSaving(true);
    try {
      const parsedFee = parseFloat(deliveryFee);

      const res = await updateShopProfile(shop.id, {
        tagline: tagline.trim() || null,
        phone: phone.trim(),
        opening_time: openingTime,
        closing_time: closingTime,
        is_open_today: isOpenToday,
        delivery_available: deliveryAvailable,
        delivery_fee: isNaN(parsedFee) ? 0 : Math.max(0, parsedFee),
        upi_id: upiId.trim() || null,
        customised_cake_available: customisedCakeAvailable,
      });

      if (res.success && res.shop) {
        setShop(res.shop);
        if (MOCK_SHOP_TYPES.find((type) => type.id === shop.shop_type_id)?.workflow_group_code === 'APPOINTMENT') {
          const slotResult = await updateSlotConfig(shop.id, { ranges: timeRanges, slotDurationMinutes: slotDuration, availableDays });
          if (!slotResult.success) toastError(slotResult.error || t('failedSaveSlots'));
        }
        success(t('shopSettingsSaved'));
      } else {
        toastError(res.error || t('failedSaveSettings'));
      }
      if (res.success && shop && upiQrFile && isSupabaseConfigured) {
        const path = `shop-photos/${shop.id}/upi_qr.jpg`;
        const { error } = await supabase.storage.from('shop-photos').upload(path, upiQrFile, { upsert: true });
        if (error) toastError(error.message);
        else {
          const upiQrUrl = supabase.storage.from('shop-photos').getPublicUrl(path).data.publicUrl;
          const qrResult = await updateShopProfile(shop.id, { upi_qr_url: upiQrUrl });
          if (qrResult.success && qrResult.shop) setShop(qrResult.shop);
        }
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleBillingCycleChange = async (cycle: ShopSubscription['billing_cycle']) => {
    if (!subscription || cycle === subscription.billing_cycle) return;
    setIsBillingSaving(true);
    try {
      const result = await updateShopBillingCycle(subscription.id, cycle);
      if (result.success && result.subscription) {
        setSubscription(result.subscription);
        success(t('billingCycleChanged', { cycle: cycle.toLowerCase() }));
      } else {
        toastError(result.error || t('failedChangeBilling'));
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setIsBillingSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container vaango-shop-settings">
        <p>Loading shop profile...</p>
      </div>
    );
  }

  return (
    <div className="container vaango-shop-settings">
      {/* Header */}
      <div className="vaango-shop-settings__header">
        <div>
          <span className="vaango-shop-settings__kicker">Merchant Settings</span>
          <h1 className="vaango-shop-settings__title">Shop Profile & Fulfillment</h1>
          <p className="vaango-shop-settings__subtitle">
            Manage your storefront details, delivery capabilities, and direct UPI payment info.
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="vaango-shop-settings__form">
        {/* Verified Store Identity (Controlled / Read-only identity attributes) */}
        <Card variant="default" padding="lg" className="vaango-settings-card">
          <div className="vaango-settings-card__header">
            <Store size={20} className="text-primary" />
            <h2 className="vaango-settings-card__title">Verified Storefront Information</h2>
          </div>

          <div className="vaango-settings-identity-grid">
            <div className="vaango-identity-item">
              <span className="vaango-identity-label">Shop Name</span>
              <span className="vaango-identity-val font-bold">{shop?.name || 'Store'}</span>
            </div>

            <div className="vaango-identity-item">
              <span className="vaango-identity-label">Registered Owner</span>
              <span className="vaango-identity-val">{user?.full_name}</span>
            </div>

            <div className="vaango-identity-item">
              <span className="vaango-identity-label">Address</span>
              <span className="vaango-identity-val">{shop?.address_line}</span>
            </div>

            <div className="vaango-identity-item">
              <span className="vaango-identity-label">Verified GPS Coordinates</span>
              <span className="vaango-identity-val font-mono">
                {shop?.gps_lat && shop?.gps_lng ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <ShieldCheck size={14} />
                    {shop.gps_lat.toFixed(4)}°, {shop.gps_lng.toFixed(4)}°
                  </span>
                ) : (
                  <span className="text-secondary">GPS recorded during onboarding</span>
                )}
              </span>
            </div>
          </div>

          <div className="vaango-form-group mt-4">
            <label className="vaango-form-label" htmlFor="shop-tagline">
              Shop Tagline / Customer Welcome Note
            </label>
            <Input
              id="shop-tagline"
              placeholder="e.g. Farm-fresh daily groceries, country pulses & pure spices"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
            />
          </div>

          <div className="vaango-form-group mt-3">
            <label className="vaango-form-label" htmlFor="shop-phone">
              Store Contact Phone Number
            </label>
            <Input
              id="shop-phone"
              type="tel"
              placeholder="+91 98765 12345"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              leftIcon={<Phone size={18} />}
              required
            />
          </div>
        </Card>

        {/* Operating Hours & Today Status */}
        <Card variant="default" padding="lg" className="vaango-settings-card">
          <div className="vaango-settings-card__header">
            <Clock size={20} className="text-primary" />
            <h2 className="vaango-settings-card__title">Operating Hours</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="vaango-form-group">
              <label className="vaango-form-label" htmlFor="opening-time">
                Daily Opening Time
              </label>
              <TimePicker12h id="opening-time" value={openingTime} onChange={setOpeningTime} />
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label" htmlFor="closing-time">
                Daily Closing Time
              </label>
              <TimePicker12h id="closing-time" value={closingTime} onChange={setClosingTime} />
            </div>
          </div>

          <div className="vaango-checkbox-row mt-4">
            <label className="vaango-switch" htmlFor="open-today-toggle">
              <input
                id="open-today-toggle"
                type="checkbox"
                checked={isOpenToday}
                onChange={(e) => setIsOpenToday(e.target.checked)}
              />
              <span className="vaango-switch__slider" />
            </label>
            <div>
              <span className="vaango-checkbox-label">
                {isOpenToday ? 'Shop is Open Today' : 'Shop is Closed Today (Holiday)'}
              </span>
              <span className="vaango-checkbox-hint">
                Turn off when closed for holidays or maintenance.
              </span>
            </div>
          </div>
        </Card>

        {/* Delivery Configuration */}
        {shop && MOCK_SHOP_TYPES.find((type) => type.id === shop.shop_type_id)?.workflow_group_code === 'APPOINTMENT' && (
          <Card variant="default" padding="lg" className="vaango-settings-card" id="slots">
            <div className="vaango-settings-card__header"><Clock size={20} className="text-primary" /><h2 className="vaango-settings-card__title">Appointment Slots</h2></div>
            <p className="vaango-settings-card__desc">Choose the duration and days customers can book.</p>
            <label className="vaango-form-label" htmlFor="slot-duration">Slot duration</label>
            <select id="slot-duration" className="vaango-select-input" value={slotDuration} onChange={(e) => setSlotDuration(Number(e.target.value))}>{[15, 20, 30, 45, 60].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select>
            {timeRanges.map((range) => <div key={range.id} className="vaango-time-range-row">
              <TimePicker12h id={`range-start-${range.id}`} value={range.start} onChange={(value) => setTimeRanges((ranges) => ranges.map((item) => item.id === range.id ? { ...item, start: value } : item))} />
              <TimePicker12h id={`range-end-${range.id}`} value={range.end} onChange={(value) => setTimeRanges((ranges) => ranges.map((item) => item.id === range.id ? { ...item, end: value } : item))} />
              <select className="vaango-select-input" value={range.concurrent} onChange={(e) => setTimeRanges((ranges) => ranges.map((item) => item.id === range.id ? { ...item, concurrent: Number(e.target.value) } : item))}>{Array.from({ length: 10 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{value} customers at once</option>)}</select>
              {timeRanges.length > 1 && <Button type="button" variant="outline" size="sm" onClick={() => setTimeRanges((ranges) => ranges.filter((item) => item.id !== range.id))}>Remove</Button>}
            </div>)}
            <Button type="button" variant="outline" size="sm" onClick={() => setTimeRanges((ranges) => [...ranges, { id: `range-${Date.now()}`, start: '09:00', end: '17:00', concurrent: 1 }])}>+ Add Time Range</Button>
            <div className="vaango-slot-days">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => <label key={day}><input type="checkbox" checked={availableDays.includes(index)} onChange={(e) => setAvailableDays((days) => e.target.checked ? [...days, index].sort() : days.filter((item) => item !== index))} /> {day}</label>)}</div>
          </Card>
        )}

        {/* Delivery Configuration */}
        <Card variant="default" padding="lg" className="vaango-settings-card">
          <div className="vaango-settings-card__header">
            <Truck size={20} className="text-primary" />
            <h2 className="vaango-settings-card__title">Local Delivery Option</h2>
          </div>

          <p className="vaango-settings-card__desc">
            Shops can optionally offer doorstep delivery to nearby customers. You deliver directly or via local boy.
          </p>

          <div className="vaango-checkbox-row mb-4">
            <label className="vaango-switch" htmlFor="delivery-toggle">
              <input
                id="delivery-toggle"
                type="checkbox"
                checked={deliveryAvailable}
                onChange={(e) => setDeliveryAvailable(e.target.checked)}
              />
              <span className="vaango-switch__slider" />
            </label>
            <div>
              <span className="vaango-checkbox-label">
                {deliveryAvailable ? 'Home Delivery Available' : 'Counter Pickup Only'}
              </span>
              <span className="vaango-checkbox-hint">
                When enabled, customers can choose delivery during checkout.
              </span>
            </div>
          </div>

          {deliveryAvailable && (
            <div className="vaango-form-group">
              <label className="vaango-form-label" htmlFor="delivery-fee">
                Delivery Charge (₹)
              </label>
              <Input
                id="delivery-fee"
                type="number"
                min="0"
                step="5"
                placeholder="20"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
              />
              <span className="text-xs text-secondary mt-1">
                Added to order estimate. Customer pays you directly upon delivery.
              </span>
            </div>
          )}
        </Card>

        {/* Direct UPI Payment Details (No Platform Processing) */}
        <Card variant="default" padding="lg" className="vaango-settings-card">
          <div className="vaango-settings-card__header">
            <QrCode size={20} className="text-primary" />
            <h2 className="vaango-settings-card__title">Direct UPI / QR Information</h2>
          </div>

          <p className="vaango-settings-card__desc">
            Vaango does not process payments or deduct commissions. Customers pay you directly at your counter or delivery. Enter your shop's UPI ID so customers can pay straight to your bank.
          </p>

          <div className="vaango-form-group">
            <label className="vaango-form-label" htmlFor="upi-id">
              Merchant UPI ID / VPA
            </label>
            <Input
              id="upi-id"
              placeholder="e.g. muruganstores@okaxis or 9876512345@upi"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
            />
            <span className="text-xs text-secondary mt-1">
              Displayed to customer upon order ready/pickup.
            </span>
            <label className="vaango-form-label mt-3" htmlFor="shop-upi-qr">UPI QR Photo</label>
            <input id="shop-upi-qr" type="file" accept="image/*" className="vaango-file-input" onChange={(e) => setUpiQrFile(e.target.files?.[0] || null)} />
          </div>
        </Card>

        {shop && MOCK_SHOP_TYPES.find((type) => type.id === shop.shop_type_id)?.code === 'bakery' && (
          <Card variant="default" padding="lg" className="vaango-settings-card">
            <Switch id="customised-cake-toggle" label="Accept customised cake orders" description="Let customers submit flavour, weight, design, and occasion requests." checked={customisedCakeAvailable} onChange={setCustomisedCakeAvailable} />
          </Card>
        )}

        {/* Save Button */}
        <div className="vaango-shop-settings__submit-bar">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSaving}
            leftIcon={<Save size={18} />}
          >
            Save Settings
          </Button>
        </div>
      </form>

      {/* Shopkeeper Subscription Status & Payment Instructions */}
      <Card variant="default" padding="lg" className="vaango-settings-card mt-6">
        <div className="vaango-settings-card__header">
          <CreditCard size={20} className="text-primary" />
          <h2 className="vaango-settings-card__title">Shopkeeper Subscription</h2>
        </div>

        {subscription ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="text-sm text-secondary">Subscription Status:</span>
              <Badge
                variant={
                  subscription.status === 'ACTIVE'
                    ? 'success'
                    : subscription.status === 'OVERDUE'
                    ? 'error'
                    : subscription.status === 'SUSPENDED'
                    ? 'neutral'
                    : 'primary'
                }
                size="sm"
                withDot
              >
                {subscription.status}
              </Badge>
            </div>

            {subscription.status === 'TRIAL' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-sm text-secondary">60-Day Trial Window:</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                  {calculateTrialWindow(subscription.go_live_date).daysRemaining} days remaining
                </span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="text-sm text-secondary">Daily Platform Rate:</span>
              <span className="text-sm font-bold">₹{subscription.daily_rate}/day (Cap: ₹20/day)</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="text-sm text-secondary">Billing Cycle:</span>
              <select
                value={subscription.billing_cycle}
                disabled={isBillingSaving}
                onChange={(event) => handleBillingCycleChange(event.target.value as ShopSubscription['billing_cycle'])}
                className="vaango-select-input"
                aria-label="Billing cycle"
              >
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <div className="text-xs text-secondary">
              ₹{subscription.daily_rate}/day x {subscription.billing_cycle === 'WEEKLY' ? 7 : 30} days = ₹{subscription.billing_cycle === 'WEEKLY' ? subscription.daily_rate * 7 : subscription.daily_rate * 30}
            </div>

            {subscription.amount_due > 0 && subscription.status !== 'TRIAL' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--color-error)' }}>Amount Due:</span>
                <span className="text-lg font-bold" style={{ color: 'var(--color-error)' }}>₹{subscription.amount_due}</span>
              </div>
            )}

            {subscription.last_payment_date && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-sm text-secondary">Last Payment Recorded:</span>
                <span className="text-sm">
                  {new Date(subscription.last_payment_date).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}

            {subscription.amount_due <= 0 && subscription.status !== 'OVERDUE' && (
              <div className="vaango-auth-info-banner" style={{ marginTop: '10px' }}>
                <Info size={15} className="vaango-auth-info-icon" />
                <span>No platform amount is due during the current staging free period.</span>
              </div>
            )}
          </div>
        ) : (
          <p className="vaango-settings-card__desc">
            No active subscription record found for your storefront.
          </p>
        )}
      </Card>

      {/* Security & Password */}
      <Card variant="default" padding="lg" className="vaango-settings-card mt-6">
        <div className="vaango-settings-card__header">
          <Lock size={20} className="text-primary" />
          <h2 className="vaango-settings-card__title">Security & Password</h2>
        </div>
        <p className="vaango-settings-card__desc">
          Update your merchant account password to sign in directly with email.
        </p>

        <form onSubmit={handleUpdatePassword} style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
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
              id="shopkeeper-new-password"
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
              id="shopkeeper-show-password"
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

      {/* Account & Role Switcher */}
      <Card variant="default" padding="lg" className="vaango-settings-card mt-6">
        <div className="vaango-settings-card__header">
          <User size={20} className="text-primary" />
          <h2 className="vaango-settings-card__title">Account & Demo Role</h2>
        </div>

        <p className="vaango-settings-card__desc">
          Logged in as <strong>{user?.email}</strong> with role <strong>{user?.role}</strong>.
        </p>

        <div className="flex flex-wrap gap-2 mt-3 mb-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              switchDemoRole('customer');
              navigate('/');
            }}
          >
            Switch to Customer Mode (Ananya)
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              switchDemoRole('shopkeeper');
            }}
          >
            Switch to Merchant Mode (Murugan)
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="text-error"
          onClick={handleSignOut}
          leftIcon={<LogOut size={16} />}
        >
          Sign Out of Account
        </Button>
      </Card>
    </div>
  );
};
