import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Phone,
  FileText,
} from 'lucide-react';
import { Shop, ShopService, AppointmentSlot } from '../../types/database';
import { fetchShopServices, fetchAppointmentSlots, bookAppointmentRequest } from '../../lib/appointmentServiceApi';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
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

  // Date selection: Next 7 days
  const dateOptions = useMemo(() => {
    const dates: { dateStr: string; label: string; dayName: string }[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = i === 0
        ? t('today')
        : i === 1
        ? t('tomorrow')
        : d.toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-US', { weekday: 'short' });
      const label = d.toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-US', { month: 'short', day: 'numeric' });
      dates.push({ dateStr, label, dayName });
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

  // 2. Fetch slots whenever selectedDateStr changes
  useEffect(() => {
    let isMounted = true;
    async function loadSlots() {
      setIsLoadingSlots(true);
      setBookingError(null);
      try {
        const fetchedSlots = await fetchAppointmentSlots(shop.id, selectedDateStr);
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
  }, [shop.id, selectedDateStr]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const handleLocalSlotChange = (event: Event) => {
        const detail = (event as CustomEvent<{ shopId?: string; dateStr?: string }>).detail;
        if ((!detail.shopId || detail.shopId === shop.id) && (!detail.dateStr || detail.dateStr === selectedDateStr)) {
          void fetchAppointmentSlots(shop.id, selectedDateStr).then(setSlots);
        }
      };
      window.addEventListener('vaango-slots-changed', handleLocalSlotChange);
      return () => window.removeEventListener('vaango-slots-changed', handleLocalSlotChange);
    }

    const channel = supabase
      .channel(`appointment-slots-${shop.id}-${selectedDateStr}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointment_slots', filter: `shop_id=eq.${shop.id}` },
        () => void fetchAppointmentSlots(shop.id, selectedDateStr).then(setSlots)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [shop.id, selectedDateStr]);

  const selectedService = useMemo(() => {
    return services.find((s) => s.id === selectedServiceId) || null;
  }, [services, selectedServiceId]);

  const selectedSlot = useMemo(() => {
    return slots.find((s) => s.id === selectedSlotId) || null;
  }, [slots, selectedSlotId]);

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

    setIsSubmitting(true);
    setBookingError(null);

    try {
      const res = await bookAppointmentRequest({
        shopId: shop.id,
        shopName: shop.name,
        shopAddress: shop.address_line,
        shopPhone: shop.phone,
        service: selectedService,
        slot: selectedSlot,
        customerId: user.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        notes: notes.trim(),
      });

      if (res.success && res.request) {
        success(t('appointmentSuccessMsg'));
        navigate(`/requests/${res.request.id}`);
      } else {
        setBookingError(res.error || t('genericError'));
        // Refresh slots immediately to show latest availability
        const updatedSlots = await fetchAppointmentSlots(shop.id, selectedDateStr);
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
      {/* 1. Service / Doctor Selection */}
      <section className="vaango-booking-section">
        <div className="vaango-booking-section__header">
          <Sparkles size={20} className="text-primary" />
          <h2 className="vaango-booking-section__title">{t('chooseServiceDoctor')}</h2>
        </div>

        {isLoadingServices ? (
          <div className="vaango-booking-loading">{t('loadingText')}</div>
        ) : services.length === 0 ? (
          <div className="vaango-booking-empty">
            {language === 'ta' ? 'இந்த கடையில் சேவைகள் எதுவும் சேர்க்கப்படவில்லை.' : "This shop hasn't added any appointment services yet."}
          </div>
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

                  {srv.description && (
                    <p className="vaango-service-card__desc">{srv.description}</p>
                  )}

                  <div className="vaango-service-card__footer">
                    {srv.duration_minutes && (
                      <span className="vaango-service-duration">
                        <Clock size={14} />
                        {srv.duration_minutes} {t('durationMinutesUnit')}
                      </span>
                    )}
                    {isSelected ? (
                      <span className="vaango-selected-tag">
                        <CheckCircle2 size={16} /> {t('itemSelected')}
                      </span>
                    ) : (
                      <span className="vaango-select-prompt">
                        {t('tapToSelect')}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Date Selection */}
      <section className="vaango-booking-section">
        <div className="vaango-booking-section__header">
          <CalendarIcon size={20} className="text-primary" />
          <h2 className="vaango-booking-section__title">{t('chooseDateSlot')}</h2>
        </div>

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
                <span className="vaango-date-pill__date">{d.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Time Slot Selection */}
      <section className="vaango-booking-section">
        <div className="vaango-booking-section__header">
          <Clock size={20} className="text-primary" />
          <h2 className="vaango-booking-section__title">
            {t('selectTimeSlot')}
          </h2>
        </div>

        {/* Legend for accessibility */}
        <div className="vaango-slot-legend">
          <span className="vaango-legend-item">
            <span className="vaango-legend-dot vaango-legend-dot--available" /> {t('legendAvailable')}
          </span>
          <span className="vaango-legend-item">
            <span className="vaango-legend-dot vaango-legend-dot--selected" /> {t('legendSelected')}
          </span>
          <span className="vaango-legend-item">
            <span className="vaango-legend-dot vaango-legend-dot--booked" /> {t('legendBooked')}
          </span>
        </div>

        {bookingError && (
          <div className="vaango-booking-alert vaango-booking-alert--error" role="alert">
            <AlertCircle size={20} />
            <span>{bookingError}</span>
          </div>
        )}

        {isLoadingSlots ? (
          <div className="vaango-booking-loading">{t('loadingText')}</div>
        ) : slots.length === 0 ? (
          <div className="vaango-booking-empty">
            {t('noSlotsForDate')}
          </div>
        ) : (
          <div className="vaango-slots-grid" role="radiogroup" aria-label="Appointment Time Slots">
            {slots.map((slot) => {
              const isSelected = slot.id === selectedSlotId;
              const capacity = slot.concurrent_capacity || 1;
              const bookedCount = slot.booked_count || 0;
              const remaining = Math.max(0, capacity - bookedCount);
              const isAvailable = remaining > 0;

              return (
                <button
                  key={slot.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={!isAvailable || isSubmitting}
                  className={`vaango-slot-btn ${isSelected ? 'vaango-slot-btn--selected' : ''} ${!isAvailable ? 'vaango-slot-btn--booked' : ''}`}
                  onClick={() => {
                    if (isAvailable) {
                      setSelectedSlotId(slot.id);
                      setBookingError(null);
                    }
                  }}
                  aria-label={`${slot.start_time} to ${slot.end_time}, ${isAvailable ? `${remaining} left` : 'Full'}`}
                >
                  <div className="vaango-slot-time">
                    {slot.start_time} – {slot.end_time}
                  </div>
                  <div className="vaango-slot-status">
                    {isSelected ? (
                      <span className="vaango-slot-status--text-selected">
                        <CheckCircle2 size={15} /> {t('itemSelected')}
                      </span>
                    ) : isAvailable ? (
                      <span className="vaango-slot-status--text-avail">
                        {capacity > 1 && remaining <= 3
                          ? t('slotsRemainingCount', { count: remaining })
                          : t('legendAvailable')}
                      </span>
                    ) : (
                      <span className="vaango-slot-status--text-booked">
                        {t('legendBooked')}
                      </span>
                    )}
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
                {t('bookingNotesPlaceholder')}
              </label>
              <Input
                id="customer-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('appointmentNotesPlaceholder')}
                leftIcon={<FileText size={16} />}
              />
            </div>

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
                  {selectedService.base_price ? `₹${selectedService.base_price}` : t('payAtShop')}
                </strong>
              </div>
              <div className="vaango-review-notice">
                <span>ℹ️ <strong>{t('note')}</strong> {t('appointmentReviewNotice')}</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full mt-4"
              isLoading={isSubmitting}
              onClick={handleBookAppointment}
            >
              {isSubmitting ? t('bookingAppointment') : t('bookAppointmentBtn')}
            </Button>
          </Card>
        </section>
      )}
    </div>
  );
};
