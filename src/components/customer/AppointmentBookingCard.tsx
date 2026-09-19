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
        ? (language === 'ta' ? 'இன்று' : 'Today')
        : i === 1
        ? (language === 'ta' ? 'நாளை' : 'Tomorrow')
        : d.toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-US', { weekday: 'short' });
      const label = d.toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-US', { month: 'short', day: 'numeric' });
      dates.push({ dateStr, label, dayName });
    }
    return dates;
  }, [language]);

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
      toastError(language === 'ta' ? 'தயவுசெய்து சேவையைத் தேர்வு செய்யவும்.' : 'Please select a service or doctor.');
      return;
    }
    if (!selectedSlot) {
      toastError(language === 'ta' ? 'கிடைக்கக்கூடிய நேரத்தைத் தேர்வு செய்யவும்.' : 'Please select an available time slot.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      toastError(language === 'ta' ? 'பெயர் மற்றும் தொலைபேசி எண்ணை உள்ளிடுங்கள்.' : 'Please provide your contact name and phone number.');
      return;
    }

    if (!user) {
      toastError(language === 'ta' ? 'முன்பதிவு செய்ய தயவுசெய்து உள்நுழையவும்.' : 'Please sign in to reserve an appointment.');
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
                      {srv.base_price ? `₹${srv.base_price}` : (language === 'ta' ? 'கட்டணம்' : 'Consultation Fee')}
                    </div>
                  </div>

                  {srv.description && (
                    <p className="vaango-service-card__desc">{srv.description}</p>
                  )}

                  <div className="vaango-service-card__footer">
                    {srv.duration_minutes && (
                      <span className="vaango-service-duration">
                        <Clock size={14} />
                        {srv.duration_minutes} {language === 'ta' ? 'நிமிடம்' : 'mins'}
                      </span>
                    )}
                    {isSelected ? (
                      <span className="vaango-selected-tag">
                        <CheckCircle2 size={16} /> {language === 'ta' ? 'தேர்ந்தெடுக்கப்பட்டது' : 'Selected'}
                      </span>
                    ) : (
                      <span className="vaango-select-prompt">
                        {language === 'ta' ? 'தேர்வு செய்ய தட்டவும்' : 'Tap to Select'}
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
            {language === 'ta' ? 'நேரத்தைத் தேர்வு செய்க' : 'Select Time Slot'}
          </h2>
        </div>

        {/* Legend for accessibility */}
        <div className="vaango-slot-legend">
          <span className="vaango-legend-item">
            <span className="vaango-legend-dot vaango-legend-dot--available" /> {language === 'ta' ? 'கிடைக்கக்கூடியது' : 'Available'}
          </span>
          <span className="vaango-legend-item">
            <span className="vaango-legend-dot vaango-legend-dot--selected" /> {language === 'ta' ? 'தேர்ந்தெடுக்கப்பட்டது' : 'Selected'}
          </span>
          <span className="vaango-legend-item">
            <span className="vaango-legend-dot vaango-legend-dot--booked" /> {language === 'ta' ? 'நிரம்பியது' : 'Booked'}
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
            {language === 'ta' ? 'இந்தத் தேதியில் நேர இடைவெளிகள் எதுவும் இல்லை.' : 'No available appointment slots for this date.'}
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
                        <CheckCircle2 size={15} /> {language === 'ta' ? 'தேர்வு செய்யப்பட்டது' : 'Selected'}
                      </span>
                    ) : isAvailable ? (
                      <span className="vaango-slot-status--text-avail">
                        {capacity > 1 && remaining <= 3
                          ? (language === 'ta' ? `${remaining} உள்ளது` : `${remaining} left`)
                          : (language === 'ta' ? 'உள்ளது' : 'Available')}
                      </span>
                    ) : (
                      <span className="vaango-slot-status--text-booked">
                        {language === 'ta' ? 'நிரம்பியது' : 'Full'}
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
                placeholder={language === 'ta' ? 'உங்கள் பெயரை உள்ளிடுக' : 'Enter visitor/patient name'}
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
                placeholder={language === 'ta' ? '10 இலக்க மொபைல் எண்' : '10-digit mobile number'}
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
                placeholder={language === 'ta' ? 'கூடுதல் தகவல்கள்...' : 'e.g. Specific checkup / notes'}
                leftIcon={<FileText size={16} />}
              />
            </div>

            {/* Review Summary Box */}
            <div className="vaango-review-box">
              <div className="vaango-review-row">
                <span className="vaango-review-label">{language === 'ta' ? 'சேவை:' : 'Service:'}</span>
                <strong className="vaango-review-value">{selectedService.name}</strong>
              </div>
              {selectedService.provider_name && (
                <div className="vaango-review-row">
                  <span className="vaango-review-label">{language === 'ta' ? 'நிபுணர்:' : 'Provider:'}</span>
                  <span className="vaango-review-value">{selectedService.provider_name}</span>
                </div>
              )}
              <div className="vaango-review-row">
                <span className="vaango-review-label">{language === 'ta' ? 'தேதி & நேரம்:' : 'Date & Time:'}</span>
                <strong className="vaango-review-value">
                  {selectedSlot.slot_date} at {selectedSlot.start_time} – {selectedSlot.end_time}
                </strong>
              </div>
              <div className="vaango-review-row">
                <span className="vaango-review-label">{language === 'ta' ? 'மதிப்பீட்டுக் கட்டணம்:' : 'Estimated Fee:'}</span>
                <strong className="vaango-review-value text-primary">
                  {selectedService.base_price ? `₹${selectedService.base_price}` : (language === 'ta' ? 'நேரில் செலுத்தவும்' : 'Pay at shop')}
                </strong>
              </div>
              <div className="vaango-review-notice">
                <span>ℹ️ <strong>{language === 'ta' ? 'குறிப்பு:' : 'Note:'}</strong> {language === 'ta' ? 'உங்கள் முன்பதிவு கடைக்காரரின் ஒப்புதலுக்கு அனுப்பப்படும்.' : 'Your appointment will be reviewed and confirmed by the merchant.'}</span>
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
