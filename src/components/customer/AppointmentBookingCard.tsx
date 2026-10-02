import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  AlertCircle,
  Sparkles,
  Phone,
  FileText,
  Star,
  MapPin,
  Store,
} from 'lucide-react';
import { Shop, ShopService, AppointmentSlot } from '../../types/database';
import {
  fetchShopServices,
  fetchAppointmentSlots,
  bookAppointmentRequest,
  filterFutureSlots,
  getShopCurrentDateTime,
  DEFAULT_SHOP_TIMEZONE,
} from '../../lib/appointmentServiceApi';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { isValidUpiQrUrl } from '../../lib/upi';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useToast } from '../../context/ToastContext';
import './AppointmentBookingCard.css';

interface AppointmentBookingCardProps {
  shop: Shop;
}

export const AppointmentBookingCard: React.FC<AppointmentBookingCardProps> = ({ shop }) => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [services, setServices] = useState<ShopService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');

  // Date selection: Next 7 days based on shop's local time
  const dateOptions = useMemo(() => {
    const dates: { dateStr: string; label: string; dayName: string; dayNum: string; monthShort: string }[] = [];
    const shopNow = getShopCurrentDateTime(DEFAULT_SHOP_TIMEZONE);
    const shopBaseDate = new Date(shopNow.year, shopNow.month - 1, shopNow.day);

    for (let i = 0; i < 7; i++) {
      const d = new Date(shopBaseDate);
      d.setDate(shopBaseDate.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      const dayName = i === 0
        ? t('today')
        : i === 1
        ? t('tomorrow')
        : d.toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-US', { weekday: 'short' });
      const label = d.toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-US', { month: 'short', day: 'numeric' });
      const dayNum = String(d.getDate());
      const monthShort = d.toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-US', { month: 'short' });
      dates.push({ dateStr, label, dayName, dayNum, monthShort });
    }
    return dates;
  }, [language, t]);

  const [selectedDateStr, setSelectedDateStr] = useState<string>(dateOptions[0].dateStr);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');

  // Customer contact details
  const [customerName, setCustomerName] = useState(user?.full_name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [notes, setNotes] = useState('');

  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // 1. Fetch shop services
  useEffect(() => {
    let isMounted = true;
    async function loadServices() {
      setIsLoadingServices(true);
      try {
        const srvs = await fetchShopServices(shop.id);
        if (isMounted) {
          setServices(srvs);
          const available = srvs.filter((s) => s.is_available);
          if (available.length > 0) {
            setSelectedServiceId(available[0].id);
          }
        }
      } catch (err) {
        console.error('Error fetching services:', err);
      } finally {
        if (isMounted) setIsLoadingServices(false);
      }
    }
    loadServices();
    return () => {
      isMounted = false;
    };
  }, [shop.id]);

  const [paymentMethod, setPaymentMethod] = useState<'pay_at_shop' | 'online'>('pay_at_shop');

  // 2. Fetch slots whenever selectedDateStr or selectedServiceId changes
  useEffect(() => {
    let isMounted = true;
    async function loadSlots() {
      if (!selectedServiceId) {
        setSlots([]);
        return;
      }
      setIsLoadingSlots(true);
      setBookingError(null);
      try {
        const fetchedSlots = await fetchAppointmentSlots(shop.id, selectedDateStr, selectedServiceId);
        if (isMounted) {
          setSlots(fetchedSlots);
          setSelectedSlotId('');
        }
      } catch (err) {
        console.error('Error fetching slots:', err);
      } finally {
        if (isMounted) setIsLoadingSlots(false);
      }
    }
    loadSlots();
    return () => {
      isMounted = false;
    };
  }, [shop.id, selectedDateStr, selectedServiceId]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const handleLocalSlotChange = (event: Event) => {
        const detail = (event as CustomEvent<{ shopId?: string; dateStr?: string }>).detail;
        if ((!detail.shopId || detail.shopId === shop.id) && (!detail.dateStr || detail.dateStr === selectedDateStr)) {
          void fetchAppointmentSlots(shop.id, selectedDateStr, selectedServiceId).then(setSlots);
        }
      };
      window.addEventListener('vaango-slots-changed', handleLocalSlotChange);
      return () => window.removeEventListener('vaango-slots-changed', handleLocalSlotChange);
    }

    const channel = supabase
      .channel(`appointment-slots-${shop.id}-${selectedDateStr}-${selectedServiceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointment_slots', filter: `shop_id=eq.${shop.id}` },
        () => void fetchAppointmentSlots(shop.id, selectedDateStr, selectedServiceId).then(setSlots)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [shop.id, selectedDateStr, selectedServiceId]);

  const bookableSlots = useMemo(() => {
    return filterFutureSlots(slots, selectedDateStr, DEFAULT_SHOP_TIMEZONE);
  }, [slots, selectedDateStr]);

  const selectedService = useMemo(() => {
    return services.find((s) => s.id === selectedServiceId) || null;
  }, [services, selectedServiceId]);

  const selectedSlot = useMemo(() => {
    return bookableSlots.find((s) => s.id === selectedSlotId) || null;
  }, [bookableSlots, selectedSlotId]);

  const hasAuthoritativeUpi = isValidUpiQrUrl(shop.upi_qr_url) && Boolean(shop.upi_id?.trim());
  const appointmentAmount = selectedService?.base_price ?? selectedService?.min_price ?? 0;

  useEffect(() => {
    if (selectedService?.payment_requirement === 'online_only') {
      if (hasAuthoritativeUpi) {
        setPaymentMethod('online');
      } else {
        setPaymentMethod('pay_at_shop');
      }
    } else if (selectedService?.payment_requirement === 'shop_only') {
      setPaymentMethod('pay_at_shop');
    }
  }, [selectedService?.payment_requirement, hasAuthoritativeUpi]);

  const copyMerchantUpiId = async () => {
    if (!shop.upi_id) return;
    try {
      await navigator.clipboard.writeText(shop.upi_id);
      success('UPI ID copied.');
    } catch {
      toastError('Unable to copy the UPI ID. Please copy it manually.');
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedService) {
      toastError(t('pleaseSelectService'));
      return;
    }
    if (!selectedSlot) {
      toastError(t('pleaseSelectTimeSlot'));
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      toastError(t('pleaseProvideNamePhone'));
      return;
    }

    if (!user) {
      toastError(t('signInToBookAppointment'));
      navigate('/login', { state: { from: { pathname: `/shop/${shop.id}` } } });
      return;
    }

    if (paymentMethod === 'online' && !hasAuthoritativeUpi) {
      setBookingError('Online payment is currently unavailable for this shop. Please choose Pay at Shop.');
      return;
    }

    setIsSubmitting(true);
    setBookingError(null);

    try {
      const res = await bookAppointmentRequest({
        shopId: shop.id,
        shopName: shop.name,
        shopAddress: shop.address_line,
        shopPhone: shop.phone,
        shopUpiId: shop.upi_id,
        shopUpiQrUrl: shop.upi_qr_url,
        service: selectedService,
        slot: selectedSlot,
        customerId: user.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        notes: notes.trim(),
        paymentMethod: paymentMethod,
        isOnlineHold: paymentMethod === 'online',
      });

      if (res.success && res.request) {
        success(t('appointmentSuccessMsg'));
        navigate(`/requests/${res.request.id}`);
      } else {
        setBookingError(res.error || t('genericError'));
        // Refresh slots immediately to show latest availability
        const updatedSlots = await fetchAppointmentSlots(shop.id, selectedDateStr, selectedServiceId);
        setSlots(updatedSlots);
        setSelectedSlotId('');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('genericError');
      setBookingError(message);
      toastError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="vaango-appointment-booking" aria-label="Appointment booking workflow">
      {/* Clinic / Shop Overview Card (Reference Image 1 & 4) */}
      <div className="vaango-appointment-clinic-card">
        <div className="vaango-appointment-clinic-thumb">
          {shop.photo_url ? (
            <img src={shop.photo_url} alt={shop.name} />
          ) : (
            <Store size={26} />
          )}
        </div>
        <div className="vaango-appointment-clinic-info">
          <h3 className="vaango-appointment-clinic-name">{shop.name}</h3>
          <div className="vaango-appointment-clinic-meta">
            <div className="vaango-appointment-clinic-rating">
              <Star size={13} fill="#EAB308" color="#EAB308" />
              <span>{(shop as any).rating || 4.6}</span>
              <span className="text-secondary">({(shop as any).review_count || 210})</span>
            </div>
            <span>·</span>
            <div className="vaango-appointment-clinic-dist">
              <MapPin size={13} />
              <span>{(shop as any).distance_km != null ? `${(shop as any).distance_km} km` : '0.5 km'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Service / Doctor Selection (if multiple) */}
      {services.length > 1 && (
        <section className="vaango-booking-section">
          <div className="vaango-booking-section__header">
            <Sparkles size={18} className="text-primary" />
            <h2 className="vaango-booking-section__title">{t('chooseServiceDoctor')}</h2>
          </div>

          {isLoadingServices ? (
            <div className="vaango-booking-loading">{t('loadingText')}</div>
          ) : (
            <div className="vaango-service-selector-grid" role="radiogroup" aria-label="Appointment Services">
              {services.map((srv) => {
                const isSelected = srv.id === selectedServiceId;
                return (
                  <button
                    key={srv.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={!srv.is_available}
                    className={`vaango-service-card ${isSelected ? 'vaango-service-card--selected' : ''} ${!srv.is_available ? 'vaango-service-card--disabled' : ''}`}
                    onClick={() => setSelectedServiceId(srv.id)}
                  >
                    <div className="vaango-service-card__top">
                      <div>
                        <h3 className="vaango-service-card__name">{srv.name}</h3>
                        {srv.provider_name && (
                          <span className="vaango-service-card__provider">
                            <User size={14} />
                            {srv.provider_name}
                            {srv.specialization && ` • ${srv.specialization}`}
                          </span>
                        )}
                      </div>
                      <div className="vaango-service-card__price">
                        {srv.base_price ? `₹${srv.base_price}` : t('consultationFee')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 2. Select Date (Reference Image 1 & 4) */}
      <section className="vaango-booking-section">
        <h3 className="vaango-booking-section__heading">Select Date</h3>

        <div className="vaango-date-strip" role="tablist" aria-label="Appointment Dates">
          {dateOptions.map((d) => {
            const isSelected = d.dateStr === selectedDateStr;
            return (
              <button
                key={d.dateStr}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`vaango-date-pill ${isSelected ? 'vaango-date-pill--active' : ''}`}
                onClick={() => setSelectedDateStr(d.dateStr)}
              >
                <span className="vaango-date-pill__day">{d.dayName}</span>
                <span className="vaango-date-pill__num">{d.dayNum}</span>
                <span className="vaango-date-pill__date">{d.dayNum} {d.monthShort}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Available Time Slots (Reference Image 1 & 4) */}
      <section className="vaango-booking-section">
        <h3 className="vaango-booking-section__heading">Available Time Slots</h3>

        {bookingError && (
          <div className="vaango-booking-alert vaango-booking-alert--error" role="alert">
            <AlertCircle size={18} />
            <span>{bookingError}</span>
          </div>
        )}

        {isLoadingSlots ? (
          <div className="vaango-booking-loading">{t('loadingText')}</div>
        ) : bookableSlots.length === 0 ? (
          <div className="vaango-booking-empty">
            {t('noSlotsForDate')}
          </div>
        ) : (
          <div className="vaango-slots-list" role="radiogroup" aria-label="Appointment Time Slots">
            {bookableSlots.map((slot) => {
              const isSelected = slot.id === selectedSlotId;
              const capacity = slot.capacity || slot.concurrent_capacity || 1;
              const bookedCount = slot.booked_count || slot.confirmed_count || 0;
              const remaining = Math.max(0, capacity - bookedCount);
              const isAvailable = remaining > 0 && slot.is_available !== false;

              return (
                <button
                  key={slot.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={!isAvailable || isSubmitting}
                  className={`vaango-slot-card ${isSelected ? 'vaango-slot-card--selected' : ''} ${!isAvailable ? 'vaango-slot-card--booked' : ''}`}
                  onClick={() => {
                    if (isAvailable) {
                      setSelectedSlotId(slot.id);
                      setBookingError(null);
                    }
                  }}
                  aria-label={`${slot.start_time} to ${slot.end_time}, ${isAvailable ? `${remaining} available` : 'Full'}`}
                >
                  <div className="vaango-slot-card__info">
                    <div className="vaango-slot-card__time">
                      {slot.start_time} – {slot.end_time}
                    </div>
                    <div className="vaango-slot-card__status">
                      {isAvailable ? (
                        <span className="vaango-slot-card__avail">
                          {remaining} {remaining === 1 ? 'slot available' : 'slots available'}
                        </span>
                      ) : (
                        <span className="vaango-slot-card__booked-text">
                          Fully booked
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={`vaango-slot-card__radio ${isSelected ? 'vaango-slot-card__radio--selected' : ''}`}>
                    {isSelected && <div className="vaango-slot-card__radio-inner" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Contact Info & Review */}
      {selectedService && selectedSlot && (
        <section className="vaango-booking-section">
          <div className="vaango-booking-section__header">
            <User size={20} className="text-primary" />
            <h2 className="vaango-booking-section__title">{t('contactDetailsTitle')}</h2>
          </div>

          <Card variant="default" padding="lg" className="vaango-contact-review-card">
            <div className="vaango-form-group">
              <label htmlFor="customer-name" className="vaango-form-label">
                {t('yourNameLabel')} <span className="text-error">*</span>
              </label>
              <Input
                id="customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t('visitorNamePlaceholder')}
                leftIcon={<User size={16} />}
              />
            </div>

            <div className="vaango-form-group">
              <label htmlFor="customer-phone" className="vaango-form-label">
                {t('yourPhoneLabel')} <span className="text-error">*</span>
              </label>
              <Input
                id="customer-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder={t('phoneTenDigits')}
                leftIcon={<Phone size={16} />}
              />
            </div>

            <div className="vaango-form-group">
              <label htmlFor="customer-notes" className="vaango-form-label">
                Reason for Visit
              </label>
              <Input
                id="customer-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. General checkup"
                leftIcon={<FileText size={16} />}
              />
            </div>

            {/* Payment Method Selector */}
            <div className="vaango-form-group mb-4">
              <label className="vaango-form-label">Payment Method</label>
              <div className="vaango-payment-methods flex gap-3">
                {(selectedService.payment_requirement !== 'online_only' || !hasAuthoritativeUpi) && (
                  <button
                    type="button"
                    className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                      paymentMethod === 'pay_at_shop'
                        ? 'border-primary bg-primary/5 text-primary font-semibold ring-2 ring-primary/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => setPaymentMethod('pay_at_shop')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">💵</span>
                      <span>{t('payAtShop')}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Get queue token immediately. Pay cash/UPI at counter.
                    </div>
                  </button>
                )}
                {selectedService.payment_requirement !== 'shop_only' && (
                  <button
                    type="button"
                    className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                      paymentMethod === 'online'
                        ? 'border-primary bg-primary/5 text-primary font-semibold ring-2 ring-primary/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                    disabled={!hasAuthoritativeUpi}
                    onClick={() => setPaymentMethod('online')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">📱</span>
                      <span>Pay Online (UPI)</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {hasAuthoritativeUpi
                        ? 'Reserve a 10-min hold while uploading payment proof.'
                        : 'Online payment is unavailable until this shop adds its UPI QR.'}
                    </div>
                  </button>
                )}
              </div>
            </div>

            {paymentMethod === 'online' && (
              <div className="vaango-appointment-upi-card" aria-live="polite">
                {hasAuthoritativeUpi ? (
                  <>
                    <div>
                      <strong>Pay Online (UPI)</strong>
                      <p>Scan the merchant QR using any UPI app. Payment is verified only after you upload proof and the shopkeeper reviews it.</p>
                    </div>
                    <img src={shop.upi_qr_url || undefined} alt={`${shop.name} UPI QR code`} className="vaango-appointment-upi-card__qr" />
                    <div className="vaango-appointment-upi-card__details">
                      <span>UPI ID</span>
                      <strong>{shop.upi_id}</strong>
                      <span>Amount</span>
                      <strong>₹{appointmentAmount}</strong>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void copyMerchantUpiId()}>
                      Copy UPI ID
                    </Button>
                    <p className="vaango-appointment-upi-card__hint">After you pay, use the booking button below to reserve the slot and upload your payment proof.</p>
                  </>
                ) : (
                  <div className="vaango-booking-alert vaango-booking-alert--error">
                    Online payment is currently unavailable for this shop. Please choose Pay at Shop.
                  </div>
                )}
              </div>
            )}

            {/* Review Summary Box */}
            <div className="vaango-review-box">
              <div className="vaango-review-row">
                <span className="vaango-review-label">{t('serviceLabel')}</span>
                <strong className="vaango-review-value">{selectedService.name}</strong>
              </div>
              {selectedService.provider_name && (
                <div className="vaango-review-row">
                  <span className="vaango-review-label">{t('providerLabel')}</span>
                  <span className="vaango-review-value">{selectedService.provider_name}</span>
                </div>
              )}
              <div className="vaango-review-row">
                <span className="vaango-review-label">{t('dateTimeLabel')}</span>
                <strong className="vaango-review-value">
                  {selectedSlot.slot_date} at {selectedSlot.start_time} – {selectedSlot.end_time}
                </strong>
              </div>
              <div className="vaango-review-row">
                <span className="vaango-review-label">{t('estimatedFeeLabel')}</span>
                <strong className="vaango-review-value text-primary">
                  {appointmentAmount ? `₹${appointmentAmount}` : t('payAtShop')}
                </strong>
              </div>
              <div className="vaango-review-notice">
                <span>ℹ️ <strong>{t('note')}</strong> {t('appointmentReviewNotice')}</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full mt-4 vaango-appointment-confirm-btn"
              isLoading={isSubmitting}
              onClick={handleBookAppointment}
            >
              {isSubmitting ? t('bookingAppointment') : paymentMethod === 'online' ? "I've Paid — Reserve & Upload Proof" : 'Confirm Appointment'}
            </Button>
          </Card>
        </section>
      )}
    </div>
  );
};
