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
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dates.push({ dateStr, label, dayName });
    }
    return dates;
  }, []);

  const [selectedDateStr, setSelectedDateStr] = useState<string>(dateOptions[0].dateStr);
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');

  // Customer contact details
  const [customerName, setCustomerName] = useState(user?.full_name || 'Valued Customer');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '+91 98765 00000');
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
      const srvs = await fetchShopServices(shop.id);
      if (isMounted) {
        setServices(srvs);
        const available = srvs.filter((s) => s.is_available);
        if (available.length > 0) {
          setSelectedServiceId(available[0].id);
        }
        setIsLoadingServices(false);
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
      const fetchedSlots = await fetchAppointmentSlots(shop.id, selectedDateStr);
      if (isMounted) {
        setSlots(fetchedSlots);
        setSelectedSlotId('');
        setIsLoadingSlots(false);
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
      toastError('Please select a service or doctor.');
      return;
    }
    if (!selectedSlot) {
      toastError('Please select an available time slot.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      toastError('Please provide your contact name and phone number.');
      return;
    }

    setIsSubmitting(true);
    setBookingError(null);

    const res = await bookAppointmentRequest({
      shopId: shop.id,
      shopName: shop.name,
      shopAddress: shop.address_line,
      shopPhone: shop.phone,
      service: selectedService,
      slot: selectedSlot,
      customerId: user?.id || 'cust-demo-guest',
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      notes: notes.trim(),
    });

    setIsSubmitting(false);

    if (res.success && res.request) {
      success('Appointment request sent! Shopkeeper will confirm shortly.');
      navigate(`/requests/${res.request.id}`);
    } else {
      setBookingError(res.error || 'Failed to reserve appointment slot.');
      // Refresh slots immediately to show latest availability
      const updatedSlots = await fetchAppointmentSlots(shop.id, selectedDateStr);
      setSlots(updatedSlots);
      setSelectedSlotId('');
    }
  };

  return (
    <div className="vaango-appointment-booking" aria-label="Appointment booking workflow">
      {/* 1. Service / Doctor Selection */}
      <section className="vaango-booking-section">
        <div className="vaango-booking-section__header">
          <Sparkles size={20} className="text-primary" />
          <h2 className="vaango-booking-section__title">1. Choose Service or Doctor</h2>
        </div>

        {isLoadingServices ? (
          <div className="vaango-booking-loading">Loading available services...</div>
        ) : services.length === 0 ? (
          <div className="vaango-booking-empty">This shop hasn't added any appointment services yet.</div>
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
                      {srv.base_price ? `₹${srv.base_price}` : 'Consultation Fee'}
                    </div>
                  </div>

                  {srv.description && (
                    <p className="vaango-service-card__desc">{srv.description}</p>
                  )}

                  <div className="vaango-service-card__footer">
                    {srv.duration_minutes && (
                      <span className="vaango-service-duration">
                        <Clock size={14} />
                        {srv.duration_minutes} mins
                      </span>
                    )}
                    {isSelected ? (
                      <span className="vaango-selected-tag">
                        <CheckCircle2 size={16} /> Selected
                      </span>
                    ) : (
                      <span className="vaango-select-prompt">Tap to Select</span>
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
          <h2 className="vaango-booking-section__title">2. Select Date</h2>
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
          <h2 className="vaango-booking-section__title">3. Select Time Slot</h2>
        </div>

        {/* Legend for accessibility */}
        <div className="vaango-slot-legend">
          <span className="vaango-legend-item">
            <span className="vaango-legend-dot vaango-legend-dot--available" /> Available
          </span>
          <span className="vaango-legend-item">
            <span className="vaango-legend-dot vaango-legend-dot--selected" /> Selected
          </span>
          <span className="vaango-legend-item">
            <span className="vaango-legend-dot vaango-legend-dot--booked" /> Booked
          </span>
        </div>

        {bookingError && (
          <div className="vaango-booking-alert vaango-booking-alert--error" role="alert">
            <AlertCircle size={20} />
            <span>{bookingError}</span>
          </div>
        )}

        {isLoadingSlots ? (
          <div className="vaango-booking-loading">Loading appointment slots...</div>
        ) : slots.length === 0 ? (
          <div className="vaango-booking-empty">No available appointment slots for this date.</div>
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
                  className={`vaango-slot-btn ${
                    isSelected ? 'vaango-slot-btn--selected' : ''
                  } ${!isAvailable ? 'vaango-slot-btn--booked' : ''}`}
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
                        <CheckCircle2 size={15} /> Selected
                      </span>
                    ) : isAvailable ? (
                      <span className="vaango-slot-status--text-avail">
                        {capacity > 1 && remaining <= 3 ? `${remaining} left` : 'Available'}
                      </span>
                    ) : (
                      <span className="vaango-slot-status--text-booked">Full</span>
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
            <h2 className="vaango-booking-section__title">4. Patient / Visitor Contact Details</h2>
          </div>

          <Card variant="default" padding="lg" className="vaango-contact-review-card">
            <div className="vaango-form-group">
              <label htmlFor="customer-name" className="vaango-form-label">
                Name <span className="text-error">*</span>
              </label>
              <Input
                id="customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter visitor/patient name"
                leftIcon={<User size={16} />}
              />
            </div>

            <div className="vaango-form-group">
              <label htmlFor="customer-phone" className="vaango-form-label">
                Mobile Phone <span className="text-error">*</span>
              </label>
              <Input
                id="customer-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="10-digit mobile number"
                leftIcon={<Phone size={16} />}
              />
            </div>

            <div className="vaango-form-group">
              <label htmlFor="customer-notes" className="vaango-form-label">
                Special Request / Symptoms (Optional)
              </label>
              <Input
                id="customer-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Seasonal viral fever checkup / specific hairstyle"
                leftIcon={<FileText size={16} />}
              />
            </div>

            {/* Review Summary Box */}
            <div className="vaango-review-box">
              <div className="vaango-review-row">
                <span className="vaango-review-label">Service:</span>
                <strong className="vaango-review-value">{selectedService.name}</strong>
              </div>
              {selectedService.provider_name && (
                <div className="vaango-review-row">
                  <span className="vaango-review-label">Provider:</span>
                  <span className="vaango-review-value">{selectedService.provider_name}</span>
                </div>
              )}
              <div className="vaango-review-row">
                <span className="vaango-review-label">Date & Time:</span>
                <strong className="vaango-review-value">
                  {selectedSlot.slot_date} at {selectedSlot.start_time} – {selectedSlot.end_time}
                </strong>
              </div>
              <div className="vaango-review-row">
                <span className="vaango-review-label">Estimated Fee:</span>
                <strong className="vaango-review-value text-primary">
                  {selectedService.base_price ? `₹${selectedService.base_price}` : 'Pay at shop'}
                </strong>
              </div>
              <div className="vaango-review-notice">
                <span>ℹ️ <strong>Note:</strong> Your appointment starts in <strong>REQUESTED</strong> state. The shopkeeper will review and confirm your slot.</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full mt-4"
              isLoading={isSubmitting}
              onClick={handleBookAppointment}
            >
              Request Appointment Slot
            </Button>
          </Card>
        </section>
      )}
    </div>
  );
};
