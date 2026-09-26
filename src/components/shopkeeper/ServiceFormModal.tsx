import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  AlertCircle,
  Calendar,
  Wrench,
  Clock,
  User,
  Tag,
  IndianRupee,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Coffee,
} from 'lucide-react';
import { ShopService, PriceType, SlotConfig, SlotBreak } from '../../types/database';
import { WorkflowGroupCode } from '../../types/workflow';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { formatINR, formatPriceRangeINR } from '../../lib/currency';
import { parseTimeToMinutes } from '../../lib/appointmentServiceApi';
import './ServiceFormModal.css';

export type CatalogueItemType = 'appointment' | 'service';
export type AppointmentStep = 'TYPE' | 'DETAILS' | 'PRICING' | 'SCHEDULE' | 'RULES' | 'REVIEW';
export type ServiceStep = 'TYPE' | 'DETAILS' | 'PRICING' | 'OPTIONS' | 'REVIEW';

export interface ServiceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceToEdit?: ShopService | null;
  workflowGroup: WorkflowGroupCode;
  onSave: (serviceData: {
    id?: string;
    name: string;
    description: string | null;
    price_type: PriceType;
    base_price: number | null;
    min_price: number | null;
    max_price: number | null;
    duration_minutes: number | null;
    provider_name: string | null;
    specialization: string | null;
    service_category: string | null;
    is_available: boolean;
    item_type?: CatalogueItemType;
    slot_config?: SlotConfig;
  }) => Promise<{ success: boolean; error?: string }>;
}

const DAY_NAMES = [
  { dayIndex: 1, name: 'Monday', short: 'Mon' },
  { dayIndex: 2, name: 'Tuesday', short: 'Tue' },
  { dayIndex: 3, name: 'Wednesday', short: 'Wed' },
  { dayIndex: 4, name: 'Thursday', short: 'Thu' },
  { dayIndex: 5, name: 'Friday', short: 'Fri' },
  { dayIndex: 6, name: 'Saturday', short: 'Sat' },
  { dayIndex: 0, name: 'Sunday', short: 'Sun' },
];

export const ServiceFormModal: React.FC<ServiceFormModalProps> = ({
  isOpen,
  onClose,
  serviceToEdit,
  workflowGroup,
  onSave,
}) => {
  // Step state
  const [itemType, setItemType] = useState<CatalogueItemType | null>(null);
  const [appointmentStep, setAppointmentStep] = useState<AppointmentStep>('TYPE');
  const [serviceStep, setServiceStep] = useState<ServiceStep>('TYPE');

  // Common fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Pricing fields (both)
  const [priceType, setPriceType] = useState<PriceType>('fixed');
  const [basePrice, setBasePrice] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [isStartingFrom, setIsStartingFrom] = useState(false);

  // Appointment specific fields
  const [providerName, setProviderName] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [inclusions, setInclusions] = useState('');
  const [slotDuration, setSlotDuration] = useState<number>(30);
  const [bufferMinutes, setBufferMinutes] = useState<number>(5);
  const [concurrentCapacity, setConcurrentCapacity] = useState<number>(1);
  const [advanceBookingDays, setAdvanceBookingDays] = useState<number>(7);
  const [noticeHours, setNoticeHours] = useState<number>(2);
  const [allowCancellation, setAllowCancellation] = useState<boolean>(true);
  const [cancellationNoticeHours, setCancellationNoticeHours] = useState<number>(2);

  // Appointment working days & hours
  const [openDays, setOpenDays] = useState<number[]>([1, 2, 3, 4, 5, 6]); // Mon-Sat
  const [workingPeriods, setWorkingPeriods] = useState<{ id: string; start: string; end: string }[]>([
    { id: 'wp-1', start: '09:00 AM', end: '01:00 PM' },
    { id: 'wp-2', start: '02:00 PM', end: '06:00 PM' },
  ]);
  const [breaks, setBreaks] = useState<SlotBreak[]>([
    { id: 'br-1', title: 'Lunch Break', start: '01:00 PM', end: '02:00 PM' },
  ]);

  // Service specific fields
  const [exclusions, setExclusions] = useState('');
  const [serviceDuration, setServiceDuration] = useState<number>(45);
  const [requestMethod, setRequestMethod] = useState<'request' | 'time' | 'contact'>('request');
  const [serviceLocationMode, setServiceLocationMode] = useState<'shop' | 'pickup' | 'visit'>('shop');
  const [customerRequirements, setCustomerRequirements] = useState('');

  // Initialization when modal opens or edits
  useEffect(() => {
    if (!isOpen) return;

    if (serviceToEdit) {
      // Determine if appointment or service based on category or workflowGroup
      const isApt =
        serviceToEdit.service_category?.toLowerCase().includes('appointment') ||
        serviceToEdit.service_category?.toLowerCase().includes('consultation') ||
        workflowGroup === 'APPOINTMENT' ||
        Boolean(serviceToEdit.provider_name && serviceToEdit.duration_minutes);

      const detectedType: CatalogueItemType = isApt ? 'appointment' : 'service';
      setItemType(detectedType);
      if (detectedType === 'appointment') {
        setAppointmentStep('DETAILS');
      } else {
        setServiceStep('DETAILS');
      }

      setName(serviceToEdit.name);
      setDescription(serviceToEdit.description || '');
      setCategory(serviceToEdit.service_category || '');
      setPriceType(serviceToEdit.price_type || 'fixed');
      setBasePrice(serviceToEdit.base_price ? String(serviceToEdit.base_price) : '');
      setMinPrice(serviceToEdit.min_price ? String(serviceToEdit.min_price) : '');
      setMaxPrice(serviceToEdit.max_price ? String(serviceToEdit.max_price) : '');
      setProviderName(serviceToEdit.provider_name || '');
      setSpecialization(serviceToEdit.specialization || '');
      setIsAvailable(serviceToEdit.is_available);

      if (serviceToEdit.duration_minutes) {
        setSlotDuration(serviceToEdit.duration_minutes);
        setServiceDuration(serviceToEdit.duration_minutes);
      }
    } else {
      // Clean initialization for new creation -> FIRST ask what they are creating!
      setItemType(null);
      setAppointmentStep('TYPE');
      setServiceStep('TYPE');

      setName('');
      setCategory('');
      setDescription('');
      setInclusions('');
      setExclusions('');
      setPriceType('fixed');
      setBasePrice('');
      setMinPrice('');
      setMaxPrice('');
      setIsStartingFrom(false);
      setProviderName('');
      setSpecialization('');
      setCustomerRequirements('');
      setIsAvailable(true);

      // Defaults for appointment
      setSlotDuration(30);
      setBufferMinutes(5);
      setConcurrentCapacity(1);
      setAdvanceBookingDays(7);
      setNoticeHours(2);
      setOpenDays([1, 2, 3, 4, 5, 6]);
      setWorkingPeriods([
        { id: 'wp-1', start: '09:00 AM', end: '01:00 PM' },
        { id: 'wp-2', start: '02:00 PM', end: '06:00 PM' },
      ]);
      setBreaks([
        { id: 'br-1', title: 'Lunch Break', start: '01:00 PM', end: '02:00 PM' },
      ]);

      // Defaults for service
      setServiceDuration(45);
      setRequestMethod('request');
      setServiceLocationMode('shop');
    }
    setFormError(null);
  }, [isOpen, serviceToEdit, workflowGroup]);

  if (!isOpen) return null;

  // Validation functions
  const validateAppointmentStep = (currentStep: AppointmentStep): boolean => {
    setFormError(null);

    if (currentStep === 'DETAILS') {
      if (!name.trim()) {
        setFormError('Please enter an appointment or consultation name.');
        return false;
      }
      return true;
    }

    if (currentStep === 'PRICING') {
      if (priceType === 'fixed') {
        const p = parseFloat(basePrice);
        if (isNaN(p) || p <= 0) {
          setFormError('Please enter a valid fixed price greater than ₹0.');
          return false;
        }
      } else {
        const minP = parseFloat(minPrice);
        const maxP = parseFloat(maxPrice);
        if (isNaN(minP) || minP <= 0 || isNaN(maxP) || maxP <= 0) {
          setFormError('Both minimum and maximum price must be greater than ₹0.');
          return false;
        }
        if (minP > maxP) {
          setFormError('Maximum price must be greater than or equal to minimum price.');
          return false;
        }
      }
      return true;
    }

    if (currentStep === 'SCHEDULE') {
      if (openDays.length === 0) {
        setFormError('Please select at least one working day for appointment availability.');
        return false;
      }
      if (workingPeriods.length === 0) {
        setFormError('Please configure at least one working period.');
        return false;
      }

      // Check each working period
      for (const period of workingPeriods) {
        const startMin = parseTimeToMinutes(period.start);
        const endMin = parseTimeToMinutes(period.end);
        if (startMin >= endMin) {
          setFormError(`Opening time (${period.start}) must be earlier than closing time (${period.end}).`);
          return false;
        }
      }

      // Check breaks
      for (const brk of breaks) {
        const bStart = parseTimeToMinutes(brk.start);
        const bEnd = parseTimeToMinutes(brk.end);
        if (bStart >= bEnd) {
          setFormError(`Break start time (${brk.start}) must be earlier than break end time (${brk.end}).`);
          return false;
        }
        // Must fall inside at least one working period
        const insidePeriod = workingPeriods.some((p) => {
          const pStart = parseTimeToMinutes(p.start);
          const pEnd = parseTimeToMinutes(p.end);
          return bStart >= pStart && bEnd <= pEnd;
        });

        if (!insidePeriod) {
          setFormError(`Break "${brk.title}" (${brk.start} – ${brk.end}) must fall completely inside a working period.`);
          return false;
        }
      }
      return true;
    }

    if (currentStep === 'RULES') {
      if (!slotDuration || slotDuration <= 0) {
        setFormError('Appointment duration must be greater than 0 minutes.');
        return false;
      }
      return true;
    }

    return true;
  };

  const validateServiceStep = (currentStep: ServiceStep): boolean => {
    setFormError(null);

    if (currentStep === 'DETAILS') {
      if (!name.trim()) {
        setFormError('Please enter a service name.');
        return false;
      }
      return true;
    }

    if (currentStep === 'PRICING') {
      if (priceType === 'fixed' || isStartingFrom) {
        const p = parseFloat(basePrice);
        if (isNaN(p) || p <= 0) {
          setFormError('Please enter a valid price greater than ₹0.');
          return false;
        }
      } else {
        const minP = parseFloat(minPrice);
        const maxP = parseFloat(maxPrice);
        if (isNaN(minP) || minP <= 0 || isNaN(maxP) || maxP <= 0) {
          setFormError('Both minimum and maximum price must be greater than ₹0.');
          return false;
        }
        if (minP > maxP) {
          setFormError('Maximum price must be greater than or equal to minimum price.');
          return false;
        }
      }
      return true;
    }

    return true;
  };

  // Submission handler
  const handleSave = async () => {
    setFormError(null);

    let parsedBase: number | null = null;
    let parsedMin: number | null = null;
    let parsedMax: number | null = null;

    if (priceType === 'fixed' || isStartingFrom) {
      parsedBase = parseFloat(basePrice);
      parsedMin = parsedBase;
      parsedMax = parsedBase;
    } else {
      parsedMin = parseFloat(minPrice);
      parsedMax = parseFloat(maxPrice);
      parsedBase = Math.round((parsedMin + parsedMax) / 2);
    }

    let combinedDescription = description.trim();
    if (inclusions.trim()) {
      combinedDescription += `\n\nIncludes: ${inclusions.trim()}`;
    }
    if (exclusions.trim()) {
      combinedDescription += `\n\nExcludes: ${exclusions.trim()}`;
    }
    if (customerRequirements.trim()) {
      combinedDescription += `\n\nInstructions: ${customerRequirements.trim()}`;
    }

    setIsSubmitting(true);

    try {
      if (itemType === 'appointment') {
        const ranges = workingPeriods.map((wp) => ({
          id: wp.id,
          start: wp.start,
          end: wp.end,
          concurrent: concurrentCapacity,
        }));

        const slotConfigPayload: SlotConfig = {
          ranges,
          slotDurationMinutes: slotDuration,
          availableDays: openDays,
          breaks,
          bufferMinutes,
          advanceBookingDays,
          noticeHours,
          allowCancellation,
        };

        const res = await onSave({
          id: serviceToEdit?.id,
          name: name.trim(),
          description: combinedDescription || null,
          price_type: priceType,
          base_price: parsedBase,
          min_price: parsedMin,
          max_price: parsedMax,
          duration_minutes: slotDuration,
          provider_name: providerName.trim() || null,
          specialization: specialization.trim() || null,
          service_category: category.trim() || 'Appointment',
          is_available: isAvailable,
          item_type: 'appointment',
          slot_config: slotConfigPayload,
        });

        if (res.success) {
          onClose();
        } else {
          setFormError(res.error || "Couldn't save this appointment right now. Your entered information has been preserved. Please try again.");
        }
      } else {
        // Service
        const res = await onSave({
          id: serviceToEdit?.id,
          name: name.trim(),
          description: combinedDescription || null,
          price_type: priceType,
          base_price: parsedBase,
          min_price: parsedMin,
          max_price: parsedMax,
          duration_minutes: serviceDuration,
          provider_name: providerName.trim() || null,
          specialization: specialization.trim() || null,
          service_category: category.trim() || 'Service',
          is_available: isAvailable,
          item_type: 'service',
        });

        if (res.success) {
          onClose();
        } else {
          setFormError(res.error || "Couldn't save this service right now. Your entered information has been preserved. Please try again.");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't save right now. Please try again.";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to toggle open day
  const toggleDay = (dayIndex: number) => {
    setOpenDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex]
    );
  };

  // Helper to add working period
  const addWorkingPeriod = () => {
    setWorkingPeriods((prev) => [
      ...prev,
      { id: `wp-${Date.now()}`, start: '06:00 PM', end: '09:00 PM' },
    ]);
  };

  const removeWorkingPeriod = (id: string) => {
    if (workingPeriods.length <= 1) {
      setFormError('At least one working period is required.');
      return;
    }
    setWorkingPeriods((prev) => prev.filter((p) => p.id !== id));
  };

  // Helper to add break
  const addBreak = () => {
    setBreaks((prev) => [
      ...prev,
      { id: `br-${Date.now()}`, title: 'Evening Break', start: '04:30 PM', end: '05:00 PM' },
    ]);
  };

  const removeBreak = (id?: string) => {
    setBreaks((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="vaango-service-modal-overlay" role="dialog" aria-modal="true">
      <div className="vaango-service-modal-guided">
        {/* Header */}
        <div className="vaango-guided-header">
          <div className="vaango-guided-header__titles">
            <h2 className="vaango-guided-header__title">
              {!itemType
                ? 'What would you like to add?'
                : itemType === 'appointment'
                ? serviceToEdit
                  ? 'Edit Appointment'
                  : 'Add New Appointment'
                : serviceToEdit
                ? 'Edit Service'
                : 'Add New Service'}
            </h2>
            <p className="vaango-guided-header__subtitle">
              {!itemType
                ? 'Choose whether you are setting up bookable time slots or a standard service.'
                : itemType === 'appointment'
                ? 'Configure appointment details, working hours, break times, and slot duration.'
                : 'Configure service details, pricing, duration, and customer request method.'}
            </p>
          </div>
          <button
            type="button"
            className="vaango-guided-header__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step Progress Bar (when a type has been chosen) */}
        {itemType === 'appointment' && (
          <div className="vaango-step-progress" role="navigation" aria-label="Appointment Progress">
            <button
              type="button"
              className={`vaango-step-pill ${appointmentStep === 'DETAILS' ? 'vaango-step-pill--active' : 'vaango-step-pill--completed'}`}
              onClick={() => validateAppointmentStep(appointmentStep) && setAppointmentStep('DETAILS')}
            >
              <span className="vaango-step-num">1</span>
              <span>Details</span>
            </button>
            <div className="vaango-step-divider" />
            <button
              type="button"
              className={`vaango-step-pill ${appointmentStep === 'PRICING' ? 'vaango-step-pill--active' : ''}`}
              onClick={() => validateAppointmentStep('DETAILS') && setAppointmentStep('PRICING')}
            >
              <span className="vaango-step-num">2</span>
              <span>Pricing</span>
            </button>
            <div className="vaango-step-divider" />
            <button
              type="button"
              className={`vaango-step-pill ${appointmentStep === 'SCHEDULE' ? 'vaango-step-pill--active' : ''}`}
              onClick={() => validateAppointmentStep('DETAILS') && validateAppointmentStep('PRICING') && setAppointmentStep('SCHEDULE')}
            >
              <span className="vaango-step-num">3</span>
              <span>Hours & Breaks</span>
            </button>
            <div className="vaango-step-divider" />
            <button
              type="button"
              className={`vaango-step-pill ${appointmentStep === 'RULES' ? 'vaango-step-pill--active' : ''}`}
              onClick={() => validateAppointmentStep('DETAILS') && validateAppointmentStep('PRICING') && validateAppointmentStep('SCHEDULE') && setAppointmentStep('RULES')}
            >
              <span className="vaango-step-num">4</span>
              <span>Rules</span>
            </button>
            <div className="vaango-step-divider" />
            <button
              type="button"
              className={`vaango-step-pill ${appointmentStep === 'REVIEW' ? 'vaango-step-pill--active' : ''}`}
              onClick={() => {
                if (validateAppointmentStep('DETAILS') && validateAppointmentStep('PRICING') && validateAppointmentStep('SCHEDULE') && validateAppointmentStep('RULES')) {
                  setAppointmentStep('REVIEW');
                }
              }}
            >
              <span className="vaango-step-num">5</span>
              <span>Review</span>
            </button>
          </div>
        )}

        {itemType === 'service' && (
          <div className="vaango-step-progress" role="navigation" aria-label="Service Progress">
            <button
              type="button"
              className={`vaango-step-pill ${serviceStep === 'DETAILS' ? 'vaango-step-pill--active' : 'vaango-step-pill--completed'}`}
              onClick={() => setServiceStep('DETAILS')}
            >
              <span className="vaango-step-num">1</span>
              <span>Details</span>
            </button>
            <div className="vaango-step-divider" />
            <button
              type="button"
              className={`vaango-step-pill ${serviceStep === 'PRICING' ? 'vaango-step-pill--active' : ''}`}
              onClick={() => validateServiceStep('DETAILS') && setServiceStep('PRICING')}
            >
              <span className="vaango-step-num">2</span>
              <span>Pricing</span>
            </button>
            <div className="vaango-step-divider" />
            <button
              type="button"
              className={`vaango-step-pill ${serviceStep === 'OPTIONS' ? 'vaango-step-pill--active' : ''}`}
              onClick={() => validateServiceStep('DETAILS') && validateServiceStep('PRICING') && setServiceStep('OPTIONS')}
            >
              <span className="vaango-step-num">3</span>
              <span>Duration & Mode</span>
            </button>
            <div className="vaango-step-divider" />
            <button
              type="button"
              className={`vaango-step-pill ${serviceStep === 'REVIEW' ? 'vaango-step-pill--active' : ''}`}
              onClick={() => {
                if (validateServiceStep('DETAILS') && validateServiceStep('PRICING')) {
                  setServiceStep('REVIEW');
                }
              }}
            >
              <span className="vaango-step-num">4</span>
              <span>Review</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="vaango-guided-body">
          {formError && (
            <div className="vaango-guided-alert vaango-guided-alert--error" role="alert">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 1: WHAT WOULD YOU LIKE TO ADD?                       */}
          {/* ========================================================= */}
          {!itemType && (
            <div className="vaango-type-selection-container">
              {/* Card 1: 📅 Appointment */}
              <button
                type="button"
                className="vaango-type-card"
                onClick={() => {
                  setItemType('appointment');
                  setAppointmentStep('DETAILS');
                }}
              >
                <div className="vaango-type-card__icon-wrap vaango-type-card__icon-wrap--appointment">
                  <Calendar size={28} />
                </div>
                <div className="vaango-type-card__content">
                  <h3 className="vaango-type-card__title">
                    <span>📅 Appointment</span>
                    <ChevronRight size={18} className="text-muted" />
                  </h3>
                  <p className="vaango-type-card__desc">
                    Manage bookable appointment slots, working hours, breaks and booking rules.
                  </p>
                  <div className="vaango-type-card__tags">
                    <span className="vaango-type-card__tag">Doctor consultations</span>
                    <span className="vaango-type-card__tag">Salon & Stylist sessions</span>
                    <span className="vaango-type-card__tag">Clinic slots</span>
                  </div>
                </div>
              </button>

              {/* Card 2: 🛠 Service */}
              <button
                type="button"
                className="vaango-type-card"
                onClick={() => {
                  setItemType('service');
                  setServiceStep('DETAILS');
                }}
              >
                <div className="vaango-type-card__icon-wrap vaango-type-card__icon-wrap--service">
                  <Wrench size={28} />
                </div>
                <div className="vaango-type-card__content">
                  <h3 className="vaango-type-card__title">
                    <span>🛠 Service</span>
                    <ChevronRight size={18} className="text-muted" />
                  </h3>
                  <p className="vaango-type-card__desc">
                    Offer a service customers can request or book.
                  </p>
                  <div className="vaango-type-card__tags">
                    <span className="vaango-type-card__tag">Repairs & Alterations</span>
                    <span className="vaango-type-card__tag">Tailoring</span>
                    <span className="vaango-type-card__tag">Cleaning & Maintenance</span>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* ========================================================= */}
          {/* APPOINTMENT FLOW                                          */}
          {/* ========================================================= */}
          {itemType === 'appointment' && (
            <>
              {/* APPOINTMENT STEP 1: DETAILS */}
              {appointmentStep === 'DETAILS' && (
                <div className="vaango-form-section">
                  <div className="vaango-form-section__header">
                    <h3 className="vaango-form-section__title">Appointment Details</h3>
                    <p className="vaango-form-section__hint">
                      Specify the name, department, and doctor or staff member offering this session.
                    </p>
                  </div>

                  <div className="vaango-form-group">
                    <label className="vaango-form-label" htmlFor="apt-name">
                      <span>Appointment / Consultation Name <span className="text-error">*</span></span>
                    </label>
                    <Input
                      id="apt-name"
                      placeholder="e.g. General Consultation, Dental Checkup, Skin Consultation"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="vaango-form-row">
                    <div className="vaango-form-group">
                      <label className="vaango-form-label" htmlFor="apt-category">
                        <span>Category</span>
                        <span className="vaango-form-label-optional">(Optional)</span>
                      </label>
                      <Input
                        id="apt-category"
                        placeholder="e.g. Dental, Skin, Hair Care, Wellness"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        leftIcon={<Tag size={16} />}
                      />
                    </div>

                    <div className="vaango-form-group">
                      <label className="vaango-form-label" htmlFor="apt-provider">
                        <span>Professional / Staff Name</span>
                        <span className="vaango-form-label-optional">(Optional)</span>
                      </label>
                      <Input
                        id="apt-provider"
                        placeholder="e.g. Dr. Rajesh Kumar, Master Arun"
                        value={providerName}
                        onChange={(e) => setProviderName(e.target.value)}
                        leftIcon={<User size={16} />}
                      />
                    </div>
                  </div>

                  <div className="vaango-form-group">
                    <label className="vaango-form-label" htmlFor="apt-specialization">
                      <span>Specialization / Department</span>
                      <span className="vaango-form-label-optional">(Optional)</span>
                    </label>
                    <Input
                      id="apt-specialization"
                      placeholder="e.g. General Medicine, Orthopedics, Hair Styling"
                      value={specialization}
                      onChange={(e) => setSpecialization(e.target.value)}
                      leftIcon={<Sparkles size={16} />}
                    />
                  </div>

                  <div className="vaango-form-group">
                    <label className="vaango-form-label" htmlFor="apt-description">
                      <span>Description / Instructions</span>
                      <span className="vaango-form-label-optional">(Optional)</span>
                    </label>
                    <textarea
                      id="apt-description"
                      className="vaango-input vaango-textarea"
                      rows={3}
                      placeholder="Explain what the appointment is for, instructions or documents customer should bring..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="vaango-form-group">
                    <label className="vaango-form-label" htmlFor="apt-inclusions">
                      <span>What the appointment includes</span>
                      <span className="vaango-form-label-optional">(Optional)</span>
                    </label>
                    <Input
                      id="apt-inclusions"
                      placeholder="e.g. Preliminary diagnosis, BP check, digital prescription"
                      value={inclusions}
                      onChange={(e) => setInclusions(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* APPOINTMENT STEP 2: PRICING */}
              {appointmentStep === 'PRICING' && (
                <div className="vaango-form-section">
                  <div className="vaango-form-section__header">
                    <h3 className="vaango-form-section__title">Appointment Fee & Pricing</h3>
                    <p className="vaango-form-section__hint">
                      Set a transparent fee for the appointment in Indian Rupees (₹).
                    </p>
                  </div>

                  <div className="vaango-form-group">
                    <label className="vaango-form-label">Pricing Type</label>
                    <div className="vaango-segmented-control">
                      <button
                        type="button"
                        className={`vaango-segmented-btn ${priceType === 'fixed' ? 'vaango-segmented-btn--active' : ''}`}
                        onClick={() => setPriceType('fixed')}
                      >
                        Fixed Price
                      </button>
                      <button
                        type="button"
                        className={`vaango-segmented-btn ${priceType === 'range' ? 'vaango-segmented-btn--active' : ''}`}
                        onClick={() => setPriceType('range')}
                      >
                        Price Range (₹Min – ₹Max)
                      </button>
                    </div>
                  </div>

                  {priceType === 'fixed' ? (
                    <div className="vaango-form-group">
                      <label className="vaango-form-label" htmlFor="apt-fixed-price">
                        <span>Price (₹) <span className="text-error">*</span></span>
                      </label>
                      <Input
                        id="apt-fixed-price"
                        type="number"
                        min="1"
                        placeholder="e.g. 500"
                        value={basePrice}
                        onChange={(e) => setBasePrice(e.target.value)}
                        leftIcon={<IndianRupee size={16} />}
                        required
                        autoFocus
                      />
                      <span className="vaango-form-help">
                        Customers will pay or see this exact fee for the session.
                      </span>
                    </div>
                  ) : (
                    <div className="vaango-form-row">
                      <div className="vaango-form-group">
                        <label className="vaango-form-label" htmlFor="apt-min-price">
                          <span>Minimum Price (₹) <span className="text-error">*</span></span>
                        </label>
                        <Input
                          id="apt-min-price"
                          type="number"
                          min="1"
                          placeholder="e.g. 350"
                          value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                          leftIcon={<IndianRupee size={16} />}
                          required
                          autoFocus
                        />
                      </div>
                      <div className="vaango-form-group">
                        <label className="vaango-form-label" htmlFor="apt-max-price">
                          <span>Maximum Price (₹) <span className="text-error">*</span></span>
                        </label>
                        <Input
                          id="apt-max-price"
                          type="number"
                          min="1"
                          placeholder="e.g. 600"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(e.target.value)}
                          leftIcon={<IndianRupee size={16} />}
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* APPOINTMENT STEP 3: WORKING HOURS & BREAKS */}
              {appointmentStep === 'SCHEDULE' && (
                <div className="vaango-form-section">
                  <div className="vaango-form-section__header">
                    <h3 className="vaango-form-section__title">Appointment Availability</h3>
                    <p className="vaango-form-section__hint">
                      Select which days appointments are offered and configure working periods and breaks.
                    </p>
                  </div>

                  {/* Open Working Days */}
                  <div className="vaango-form-group">
                    <label className="vaango-form-label">
                      <span>Working Days <span className="text-error">*</span></span>
                    </label>
                    <div className="vaango-chips-row">
                      {DAY_NAMES.map((d) => {
                        const isOpenDay = openDays.includes(d.dayIndex);
                        return (
                          <button
                            key={d.dayIndex}
                            type="button"
                            className={`vaango-chip ${isOpenDay ? 'vaango-chip--active' : ''}`}
                            onClick={() => toggleDay(d.dayIndex)}
                            aria-pressed={isOpenDay}
                          >
                            {isOpenDay ? '✓ ' : ''}{d.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Working Hours Periods */}
                  <div className="vaango-form-group mt-2">
                    <label className="vaango-form-label">
                      <span>Working Periods (Hours)</span>
                    </label>
                    <p className="vaango-form-help">
                      Add morning and afternoon/evening shifts. Slots are generated inside these hours.
                    </p>

                    <div className="space-y-2 mt-1">
                      {workingPeriods.map((wp, idx) => (
                        <div key={wp.id} className="vaango-period-row">
                          <span className="text-xs font-bold text-muted w-14">Shift {idx + 1}:</span>
                          <input
                            type="text"
                            className="vaango-period-time-input"
                            value={wp.start}
                            onChange={(e) => {
                              const val = e.target.value;
                              setWorkingPeriods((prev) =>
                                prev.map((item) => (item.id === wp.id ? { ...item, start: val } : item))
                              );
                            }}
                            placeholder="09:00 AM"
                            aria-label={`Shift ${idx + 1} start time`}
                          />
                          <span className="text-muted text-xs">to</span>
                          <input
                            type="text"
                            className="vaango-period-time-input"
                            value={wp.end}
                            onChange={(e) => {
                              const val = e.target.value;
                              setWorkingPeriods((prev) =>
                                prev.map((item) => (item.id === wp.id ? { ...item, end: val } : item))
                              );
                            }}
                            placeholder="01:00 PM"
                            aria-label={`Shift ${idx + 1} end time`}
                          />
                          {workingPeriods.length > 1 && (
                            <button
                              type="button"
                              className="vaango-period-remove-btn"
                              onClick={() => removeWorkingPeriod(wp.id)}
                              aria-label={`Remove Shift ${idx + 1}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}

                      <button
                        type="button"
                        className="vaango-add-period-btn"
                        onClick={addWorkingPeriod}
                      >
                        <Plus size={14} /> Add Another Shift
                      </button>
                    </div>
                  </div>

                  {/* Break Times */}
                  <div className="vaango-form-group mt-3 pt-3 border-t border-border">
                    <label className="vaango-form-label">
                      <span>Break Times (e.g. Lunch Break)</span>
                    </label>
                    <p className="vaango-form-help">
                      Customers won't be able to book appointments during these breaks.
                    </p>

                    <div className="space-y-2 mt-2">
                      {breaks.map((b) => (
                        <div key={b.id} className="vaango-break-card">
                          <div className="flex items-center gap-2">
                            <Coffee size={16} className="text-primary flex-shrink-0" />
                            <input
                              type="text"
                              className="vaango-period-time-input"
                              value={b.title}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBreaks((prev) =>
                                  prev.map((item) => (item.id === b.id ? { ...item, title: val } : item))
                                );
                              }}
                              placeholder="Break Name"
                              aria-label="Break title"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              className="vaango-period-time-input"
                              value={b.start}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBreaks((prev) =>
                                  prev.map((item) => (item.id === b.id ? { ...item, start: val } : item))
                                );
                              }}
                              placeholder="01:00 PM"
                              aria-label="Break start time"
                            />
                            <span className="text-muted text-xs">to</span>
                            <input
                              type="text"
                              className="vaango-period-time-input"
                              value={b.end}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBreaks((prev) =>
                                  prev.map((item) => (item.id === b.id ? { ...item, end: val } : item))
                                );
                              }}
                              placeholder="02:00 PM"
                              aria-label="Break end time"
                            />
                            <button
                              type="button"
                              className="vaango-period-remove-btn"
                              onClick={() => removeBreak(b.id)}
                              aria-label="Remove break"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        className="vaango-add-period-btn"
                        onClick={addBreak}
                      >
                        <Plus size={14} /> Add Break Time
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* APPOINTMENT STEP 4: SLOT CONFIGURATION & BOOKING RULES */}
              {appointmentStep === 'RULES' && (
                <div className="vaango-form-section">
                  <div className="vaango-form-section__header">
                    <h3 className="vaango-form-section__title">Slot Duration & Booking Rules</h3>
                    <p className="vaango-form-section__hint">
                      Define how long each consultation lasts, buffer gaps, and advance booking rules.
                    </p>
                  </div>

                  {/* Duration */}
                  <div className="vaango-form-group">
                    <label className="vaango-form-label">
                      <span>Appointment Duration <span className="text-error">*</span></span>
                    </label>
                    <div className="vaango-chips-row">
                      {[15, 30, 45, 60, 90].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          className={`vaango-chip ${slotDuration === mins ? 'vaango-chip--active' : ''}`}
                          onClick={() => setSlotDuration(mins)}
                        >
                          {mins} minutes
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Buffer time */}
                  <div className="vaango-form-group mt-1">
                    <label className="vaango-form-label">
                      <span>Buffer time between appointments</span>
                      <span className="vaango-form-label-optional">(Optional)</span>
                    </label>
                    <p className="vaango-form-help">
                      Extra time between bookings for preparation or cleanup.
                    </p>
                    <div className="vaango-chips-row">
                      {[0, 5, 10, 15].map((buf) => (
                        <button
                          key={buf}
                          type="button"
                          className={`vaango-chip ${bufferMinutes === buf ? 'vaango-chip--active' : ''}`}
                          onClick={() => setBufferMinutes(buf)}
                        >
                          {buf === 0 ? 'No buffer' : `${buf} minutes`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Capacity per slot */}
                  <div className="vaango-form-group mt-2">
                    <label className="vaango-form-label">
                      <span>Maximum appointments per slot</span>
                    </label>
                    <div className="vaango-chips-row">
                      {[1, 2, 3, 4].map((cap) => (
                        <button
                          key={cap}
                          type="button"
                          className={`vaango-chip ${concurrentCapacity === cap ? 'vaango-chip--active' : ''}`}
                          onClick={() => setConcurrentCapacity(cap)}
                        >
                          {cap} {cap === 1 ? 'client' : 'clients'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Advance Booking Window */}
                  <div className="vaango-form-group mt-2">
                    <label className="vaango-form-label">
                      <span>Advance booking window</span>
                    </label>
                    <div className="vaango-chips-row">
                      {[
                        { days: 0, label: 'Same day only' },
                        { days: 1, label: '1 day' },
                        { days: 3, label: '3 days' },
                        { days: 7, label: '7 days' },
                        { days: 30, label: '30 days' },
                      ].map((win) => (
                        <button
                          key={win.days}
                          type="button"
                          className={`vaango-chip ${advanceBookingDays === win.days ? 'vaango-chip--active' : ''}`}
                          onClick={() => setAdvanceBookingDays(win.days)}
                        >
                          {win.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cancellation policy */}
                  <div className="vaango-form-group mt-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between">
                      <label className="vaango-form-label cursor-pointer" htmlFor="apt-cancellation-check">
                        <strong>Allow Customer Cancellation</strong>
                        <span className="text-xs text-muted block">
                          Customers can cancel before the designated notice window.
                        </span>
                      </label>
                      <input
                        id="apt-cancellation-check"
                        type="checkbox"
                        className="vaango-checkbox"
                        checked={allowCancellation}
                        onChange={(e) => setAllowCancellation(e.target.checked)}
                      />
                    </div>

                    {allowCancellation && (
                      <div className="mt-2 pl-4 border-l-2 border-primary/30">
                        <label className="text-xs font-semibold text-secondary">Minimum cancellation notice:</label>
                        <div className="vaango-chips-row mt-1">
                          {[2, 4, 12, 24].map((hrs) => (
                            <button
                              key={hrs}
                              type="button"
                              className={`vaango-chip ${cancellationNoticeHours === hrs ? 'vaango-chip--active' : ''}`}
                              onClick={() => setCancellationNoticeHours(hrs)}
                            >
                              {hrs} hours before
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* APPOINTMENT STEP 5: PREVIEW & REVIEW */}
              {appointmentStep === 'REVIEW' && (
                <div className="vaango-preview-container">
                  <div className="vaango-form-section__header">
                    <h3 className="vaango-form-section__title">Customer Preview</h3>
                    <p className="vaango-form-section__hint">
                      This is exactly what customers will see when booking this appointment.
                    </p>
                  </div>

                  <div className="vaango-preview-card">
                    <div className="vaango-preview-card__header">
                      <span className="font-bold flex items-center gap-1.5">
                        <Calendar size={18} /> Book Appointment
                      </span>
                      <span className="vaango-preview-card__badge">
                        {category || 'Appointment'}
                      </span>
                    </div>

                    <div className="vaango-preview-card__body">
                      <h3 className="vaango-preview-card__name">{name}</h3>

                      {providerName && (
                        <div className="text-sm font-semibold text-primary flex items-center gap-1.5">
                          <User size={15} />
                          <span>{providerName} {specialization && `• ${specialization}`}</span>
                        </div>
                      )}

                      <div className="vaango-preview-grid">
                        <div className="vaango-preview-stat">
                          <span className="vaango-preview-stat__label">Fee</span>
                          <span className="vaango-preview-stat__value vaango-preview-stat__value--price">
                            {priceType === 'fixed'
                              ? formatINR(basePrice)
                              : formatPriceRangeINR(minPrice, maxPrice)}
                          </span>
                        </div>

                        <div className="vaango-preview-stat">
                          <span className="vaango-preview-stat__label">Duration</span>
                          <span className="vaango-preview-stat__value flex items-center gap-1">
                            <Clock size={15} /> {slotDuration} mins
                          </span>
                        </div>

                        <div className="vaango-preview-stat">
                          <span className="vaango-preview-stat__label">Available Days</span>
                          <span className="vaango-preview-stat__value">
                            {openDays.length === 7
                              ? 'Mon–Sun (Every day)'
                              : openDays.length === 6 && !openDays.includes(0)
                              ? 'Mon–Sat'
                              : `${openDays.length} days/week`}
                          </span>
                        </div>

                        <div className="vaango-preview-stat">
                          <span className="vaango-preview-stat__label">Working Hours</span>
                          <span className="vaango-preview-stat__value text-xs">
                            {workingPeriods.map((wp) => `${wp.start}–${wp.end}`).join(', ')}
                          </span>
                        </div>
                      </div>

                      {breaks.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-muted bg-amber-500/10 text-amber-800 dark:text-amber-200 px-3 py-1.5 rounded-lg">
                          <Coffee size={14} />
                          <span>
                            Break: {breaks.map((b) => `${b.title} (${b.start}–${b.end})`).join(', ')}
                          </span>
                        </div>
                      )}

                      {description && (
                        <div className="vaango-preview-card__desc-box">
                          {description}
                        </div>
                      )}

                      {inclusions && (
                        <div className="text-xs text-secondary">
                          <strong>Includes:</strong> {inclusions}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ========================================================= */}
          {/* SERVICE FLOW                                              */}
          {/* ========================================================= */}
          {itemType === 'service' && (
            <>
              {/* SERVICE STEP 1: DETAILS & PROVIDER */}
              {serviceStep === 'DETAILS' && (
                <div className="vaango-form-section">
                  <div className="vaango-form-section__header">
                    <h3 className="vaango-form-section__title">Service Details</h3>
                    <p className="vaango-form-section__hint">
                      Describe what the customer receives, what is included, and any provider details.
                    </p>
                  </div>

                  <div className="vaango-form-group">
                    <label className="vaango-form-label" htmlFor="srv-name">
                      <span>Service Name <span className="text-error">*</span></span>
                    </label>
                    <Input
                      id="srv-name"
                      placeholder="e.g. Haircut & Styling, AC Deep Clean, Bike Servicing, Tailoring Alterations"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="vaango-form-row">
                    <div className="vaango-form-group">
                      <label className="vaango-form-label" htmlFor="srv-category">
                        <span>Category</span>
                        <span className="vaango-form-label-optional">(Optional)</span>
                      </label>
                      <Input
                        id="srv-category"
                        placeholder="e.g. Appliance Repair, Salon, Automobile, Tailoring"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        leftIcon={<Tag size={16} />}
                      />
                    </div>

                    <div className="vaango-form-group">
                      <label className="vaango-form-label" htmlFor="srv-provider">
                        <span>Professional / Staff Name</span>
                        <span className="vaango-form-label-optional">(Optional)</span>
                      </label>
                      <Input
                        id="srv-provider"
                        placeholder="e.g. Master Kumar, Senior Technician"
                        value={providerName}
                        onChange={(e) => setProviderName(e.target.value)}
                        leftIcon={<User size={16} />}
                      />
                    </div>
                  </div>

                  <div className="vaango-form-group">
                    <label className="vaango-form-label" htmlFor="srv-specialization">
                      <span>Department / Specialization</span>
                      <span className="vaango-form-label-optional">(Optional)</span>
                    </label>
                    <Input
                      id="srv-specialization"
                      placeholder="e.g. Split AC Specialist, Men's Grooming"
                      value={specialization}
                      onChange={(e) => setSpecialization(e.target.value)}
                    />
                  </div>

                  <div className="vaango-form-group">
                    <label className="vaango-form-label" htmlFor="srv-desc">
                      <span>Description</span>
                      <span className="vaango-form-label-optional">(Optional)</span>
                    </label>
                    <textarea
                      id="srv-desc"
                      className="vaango-input vaango-textarea"
                      rows={3}
                      placeholder="Explain what the service covers..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="vaango-form-row">
                    <div className="vaango-form-group">
                      <label className="vaango-form-label" htmlFor="srv-inclusions">
                        <span>What is included?</span>
                        <span className="vaango-form-label-optional">(Optional)</span>
                      </label>
                      <Input
                        id="srv-inclusions"
                        placeholder="e.g. Filter cleaning, gas pressure check"
                        value={inclusions}
                        onChange={(e) => setInclusions(e.target.value)}
                      />
                    </div>
                    <div className="vaango-form-group">
                      <label className="vaango-form-label" htmlFor="srv-exclusions">
                        <span>What is NOT included?</span>
                        <span className="vaango-form-label-optional">(Optional)</span>
                      </label>
                      <Input
                        id="srv-exclusions"
                        placeholder="e.g. Spare parts replacement cost"
                        value={exclusions}
                        onChange={(e) => setExclusions(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SERVICE STEP 2: PRICING */}
              {serviceStep === 'PRICING' && (
                <div className="vaango-form-section">
                  <div className="vaango-form-section__header">
                    <h3 className="vaango-form-section__title">Service Pricing</h3>
                    <p className="vaango-form-section__hint">
                      Choose whether you charge a fixed price, estimated range, or starting rate in ₹.
                    </p>
                  </div>

                  <div className="vaango-form-group">
                    <label className="vaango-form-label">Pricing Structure</label>
                    <div className="vaango-segmented-control">
                      <button
                        type="button"
                        className={`vaango-segmented-btn ${priceType === 'fixed' && !isStartingFrom ? 'vaango-segmented-btn--active' : ''}`}
                        onClick={() => {
                          setPriceType('fixed');
                          setIsStartingFrom(false);
                        }}
                      >
                        Fixed Price
                      </button>
                      <button
                        type="button"
                        className={`vaango-segmented-btn ${priceType === 'range' ? 'vaango-segmented-btn--active' : ''}`}
                        onClick={() => {
                          setPriceType('range');
                          setIsStartingFrom(false);
                        }}
                      >
                        Estimated Range
                      </button>
                      <button
                        type="button"
                        className={`vaango-segmented-btn ${isStartingFrom ? 'vaango-segmented-btn--active' : ''}`}
                        onClick={() => {
                          setPriceType('fixed');
                          setIsStartingFrom(true);
                        }}
                      >
                        Starting From
                      </button>
                    </div>
                  </div>

                  {priceType === 'fixed' || isStartingFrom ? (
                    <div className="vaango-form-group">
                      <label className="vaango-form-label" htmlFor="srv-base-price">
                        <span>{isStartingFrom ? 'Starting Price (₹)' : 'Price (₹)'} <span className="text-error">*</span></span>
                      </label>
                      <Input
                        id="srv-base-price"
                        type="number"
                        min="1"
                        placeholder={isStartingFrom ? 'e.g. 299' : 'e.g. 450'}
                        value={basePrice}
                        onChange={(e) => setBasePrice(e.target.value)}
                        leftIcon={<IndianRupee size={16} />}
                        required
                        autoFocus
                      />
                      <span className="vaango-form-help">
                        {isStartingFrom
                          ? 'Displayed as "Starting from ₹..." so customers know the base cost.'
                          : 'Customers pay this fixed rate for the completed service.'}
                      </span>
                    </div>
                  ) : (
                    <div className="vaango-form-row">
                      <div className="vaango-form-group">
                        <label className="vaango-form-label" htmlFor="srv-min-price">
                          <span>Minimum Price (₹) <span className="text-error">*</span></span>
                        </label>
                        <Input
                          id="srv-min-price"
                          type="number"
                          min="1"
                          placeholder="e.g. 300"
                          value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                          leftIcon={<IndianRupee size={16} />}
                          required
                          autoFocus
                        />
                      </div>
                      <div className="vaango-form-group">
                        <label className="vaango-form-label" htmlFor="srv-max-price">
                          <span>Maximum Price (₹) <span className="text-error">*</span></span>
                        </label>
                        <Input
                          id="srv-max-price"
                          type="number"
                          min="1"
                          placeholder="e.g. 700"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(e.target.value)}
                          leftIcon={<IndianRupee size={16} />}
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SERVICE STEP 3: DURATION, MODE & REQUIREMENTS */}
              {serviceStep === 'OPTIONS' && (
                <div className="vaango-form-section">
                  <div className="vaango-form-section__header">
                    <h3 className="vaango-form-section__title">Duration & Service Mode</h3>
                    <p className="vaango-form-section__hint">
                      How long does this take and how do customers request or receive this service?
                    </p>
                  </div>

                  {/* Approximate Duration */}
                  <div className="vaango-form-group">
                    <label className="vaango-form-label">
                      <span>Approximate Duration</span>
                    </label>
                    <div className="vaango-chips-row">
                      {[15, 30, 45, 60, 90, 120].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          className={`vaango-chip ${serviceDuration === mins ? 'vaango-chip--active' : ''}`}
                          onClick={() => setServiceDuration(mins)}
                        >
                          {mins} mins
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Request Method */}
                  <div className="vaango-form-group mt-2">
                    <label className="vaango-form-label">
                      <span>How can customers request this service?</span>
                    </label>
                    <div className="vaango-chips-row">
                      {[
                        { id: 'request', label: 'Send a service request' },
                        { id: 'time', label: 'Book an available time' },
                        { id: 'contact', label: 'Contact shop directly' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`vaango-chip ${requestMethod === m.id ? 'vaango-chip--active' : ''}`}
                          onClick={() => setRequestMethod(m.id as any)}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Location / Mode */}
                  <div className="vaango-form-group mt-2">
                    <label className="vaango-form-label">
                      <span>Service Location / Mode</span>
                    </label>
                    <div className="vaango-chips-row">
                      {[
                        { id: 'shop', label: 'At shop' },
                        { id: 'pickup', label: 'Customer pickup / drop' },
                        { id: 'visit', label: 'Home / service visit' },
                      ].map((loc) => (
                        <button
                          key={loc.id}
                          type="button"
                          className={`vaango-chip ${serviceLocationMode === loc.id ? 'vaango-chip--active' : ''}`}
                          onClick={() => setServiceLocationMode(loc.id as any)}
                        >
                          {loc.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Customer Requirements */}
                  <div className="vaango-form-group mt-2">
                    <label className="vaango-form-label" htmlFor="srv-reqs">
                      <span>Service Requirements (What customer should know)</span>
                      <span className="vaango-form-label-optional">(Optional)</span>
                    </label>
                    <Input
                      id="srv-reqs"
                      placeholder="e.g. Please bring original charger / Arrive 10 mins early"
                      value={customerRequirements}
                      onChange={(e) => setCustomerRequirements(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* SERVICE STEP 4: REVIEW & CONFIRMATION */}
              {serviceStep === 'REVIEW' && (
                <div className="vaango-preview-container">
                  <div className="vaango-form-section__header">
                    <h3 className="vaango-form-section__title">Customer Preview</h3>
                    <p className="vaango-form-section__hint">
                      This is how your service will appear to customers in your catalogue.
                    </p>
                  </div>

                  <div className="vaango-preview-card">
                    <div className="vaango-preview-card__header">
                      <span className="font-bold flex items-center gap-1.5">
                        <Wrench size={18} /> Request Service
                      </span>
                      <span className="vaango-preview-card__badge">
                        {category || 'Service'}
                      </span>
                    </div>

                    <div className="vaango-preview-card__body">
                      <h3 className="vaango-preview-card__name">{name}</h3>

                      {providerName && (
                        <div className="text-sm font-semibold text-primary flex items-center gap-1.5">
                          <User size={15} />
                          <span>{providerName} {specialization && `• ${specialization}`}</span>
                        </div>
                      )}

                      <div className="vaango-preview-grid">
                        <div className="vaango-preview-stat">
                          <span className="vaango-preview-stat__label">Price</span>
                          <span className="vaango-preview-stat__value vaango-preview-stat__value--price">
                            {isStartingFrom
                              ? `Starting from ${formatINR(basePrice)}`
                              : priceType === 'fixed'
                              ? formatINR(basePrice)
                              : formatPriceRangeINR(minPrice, maxPrice)}
                          </span>
                        </div>

                        <div className="vaango-preview-stat">
                          <span className="vaango-preview-stat__label">Duration</span>
                          <span className="vaango-preview-stat__value flex items-center gap-1">
                            <Clock size={15} /> Approx {serviceDuration} mins
                          </span>
                        </div>

                        <div className="vaango-preview-stat">
                          <span className="vaango-preview-stat__label">Service Mode</span>
                          <span className="vaango-preview-stat__value">
                            {serviceLocationMode === 'shop'
                              ? 'At shop'
                              : serviceLocationMode === 'pickup'
                              ? 'Pickup / Drop'
                              : 'Home visit'}
                          </span>
                        </div>

                        <div className="vaango-preview-stat">
                          <span className="vaango-preview-stat__label">Request Method</span>
                          <span className="vaango-preview-stat__value text-xs">
                            {requestMethod === 'request'
                              ? 'Send request & quote'
                              : requestMethod === 'time'
                              ? 'Book available time'
                              : 'Contact shop'}
                          </span>
                        </div>
                      </div>

                      {description && (
                        <div className="vaango-preview-card__desc-box">
                          {description}
                        </div>
                      )}

                      {inclusions && (
                        <div className="text-xs text-secondary">
                          <strong>Includes:</strong> {inclusions}
                        </div>
                      )}

                      {exclusions && (
                        <div className="text-xs text-muted">
                          <strong>Excludes:</strong> {exclusions}
                        </div>
                      )}

                      {customerRequirements && (
                        <div className="text-xs text-muted">
                          <strong>Instructions:</strong> {customerRequirements}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="vaango-guided-footer">
          <div>
            {!itemType ? (
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
            ) : itemType === 'appointment' && appointmentStep === 'DETAILS' && !serviceToEdit ? (
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setItemType(null);
                  setAppointmentStep('TYPE');
                }}
                leftIcon={<ChevronLeft size={16} />}
              >
                Change Type
              </Button>
            ) : itemType === 'service' && serviceStep === 'DETAILS' && !serviceToEdit ? (
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setItemType(null);
                  setServiceStep('TYPE');
                }}
                leftIcon={<ChevronLeft size={16} />}
              >
                Change Type
              </Button>
            ) : (
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  if (itemType === 'appointment') {
                    if (appointmentStep === 'PRICING') setAppointmentStep('DETAILS');
                    else if (appointmentStep === 'SCHEDULE') setAppointmentStep('PRICING');
                    else if (appointmentStep === 'RULES') setAppointmentStep('SCHEDULE');
                    else if (appointmentStep === 'REVIEW') setAppointmentStep('RULES');
                  } else {
                    if (serviceStep === 'PRICING') setServiceStep('DETAILS');
                    else if (serviceStep === 'OPTIONS') setServiceStep('PRICING');
                    else if (serviceStep === 'REVIEW') setServiceStep('OPTIONS');
                  }
                }}
                leftIcon={<ChevronLeft size={16} />}
              >
                Back
              </Button>
            )}
          </div>

          <div className="vaango-guided-footer__right">
            {itemType === 'appointment' && (
              <>
                {appointmentStep !== 'REVIEW' ? (
                  <Button
                    variant="primary"
                    type="button"
                    onClick={() => {
                      if (validateAppointmentStep(appointmentStep)) {
                        if (appointmentStep === 'DETAILS') setAppointmentStep('PRICING');
                        else if (appointmentStep === 'PRICING') setAppointmentStep('SCHEDULE');
                        else if (appointmentStep === 'SCHEDULE') setAppointmentStep('RULES');
                        else if (appointmentStep === 'RULES') setAppointmentStep('REVIEW');
                      }
                    }}
                    rightIcon={<ChevronRight size={16} />}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    type="button"
                    isLoading={isSubmitting}
                    onClick={handleSave}
                    leftIcon={<CheckCircle2 size={16} />}
                  >
                    {serviceToEdit ? 'Save Changes' : 'Save Appointment'}
                  </Button>
                )}
              </>
            )}

            {itemType === 'service' && (
              <>
                {serviceStep !== 'REVIEW' ? (
                  <Button
                    variant="primary"
                    type="button"
                    onClick={() => {
                      if (validateServiceStep(serviceStep)) {
                        if (serviceStep === 'DETAILS') setServiceStep('PRICING');
                        else if (serviceStep === 'PRICING') setServiceStep('OPTIONS');
                        else if (serviceStep === 'OPTIONS') setServiceStep('REVIEW');
                      }
                    }}
                    rightIcon={<ChevronRight size={16} />}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    type="button"
                    isLoading={isSubmitting}
                    onClick={handleSave}
                    leftIcon={<CheckCircle2 size={16} />}
                  >
                    {serviceToEdit ? 'Save Changes' : 'Save Service'}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
