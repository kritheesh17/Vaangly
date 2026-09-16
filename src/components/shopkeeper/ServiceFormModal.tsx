import React, { useState, useEffect } from 'react';
import { X, Sparkles, AlertCircle, DollarSign, Clock, User, Tag } from 'lucide-react';
import { ShopService, PriceType } from '../../types/database';
import { WorkflowGroupCode } from '../../types/workflow';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import './ServiceFormModal.css';

interface ServiceFormModalProps {
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
  }) => Promise<{ success: boolean; error?: string }>;
}

export const ServiceFormModal: React.FC<ServiceFormModalProps> = ({
  isOpen,
  onClose,
  serviceToEdit,
  workflowGroup,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceType, setPriceType] = useState<PriceType>('fixed');
  const [basePrice, setBasePrice] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [providerName, setProviderName] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [category, setCategory] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (serviceToEdit) {
      setName(serviceToEdit.name);
      setDescription(serviceToEdit.description || '');
      setPriceType(serviceToEdit.price_type || 'fixed');
      setBasePrice(serviceToEdit.base_price ? String(serviceToEdit.base_price) : '');
      setMinPrice(serviceToEdit.min_price ? String(serviceToEdit.min_price) : '');
      setMaxPrice(serviceToEdit.max_price ? String(serviceToEdit.max_price) : '');
      setDurationMinutes(serviceToEdit.duration_minutes ? String(serviceToEdit.duration_minutes) : '');
      setProviderName(serviceToEdit.provider_name || '');
      setSpecialization(serviceToEdit.specialization || '');
      setCategory(serviceToEdit.service_category || '');
      setIsAvailable(serviceToEdit.is_available);
    } else {
      setName('');
      setDescription('');
      setPriceType('fixed');
      setBasePrice('');
      setMinPrice('');
      setMaxPrice('');
      setDurationMinutes(workflowGroup === 'APPOINTMENT' ? '30' : '');
      setProviderName('');
      setSpecialization('');
      setCategory('');
      setIsAvailable(true);
    }
    setFormError(null);
  }, [serviceToEdit, isOpen, workflowGroup]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Service name is required.');
      return;
    }

    let parsedBase: number | null = null;
    let parsedMin: number | null = null;
    let parsedMax: number | null = null;

    if (priceType === 'fixed') {
      parsedBase = parseFloat(basePrice);
      if (isNaN(parsedBase) || parsedBase <= 0) {
        setFormError('Please enter a valid fixed price greater than 0.');
        return;
      }
      parsedMin = parsedBase;
      parsedMax = parsedBase;
    } else {
      // Range pricing
      parsedMin = parseFloat(minPrice);
      parsedMax = parseFloat(maxPrice);
      if (isNaN(parsedMin) || parsedMin <= 0 || isNaN(parsedMax) || parsedMax <= 0) {
        setFormError('Both minimum and maximum price must be greater than 0.');
        return;
      }
      if (parsedMin >= parsedMax) {
        setFormError('Minimum price must be less than maximum price.');
        return;
      }
      parsedBase = Math.round((parsedMin + parsedMax) / 2);
    }

    const parsedDuration = durationMinutes ? parseInt(durationMinutes, 10) : null;

    setIsSubmitting(true);

    const res = await onSave({
      id: serviceToEdit?.id,
      name: name.trim(),
      description: description.trim() || null,
      price_type: priceType,
      base_price: parsedBase,
      min_price: parsedMin,
      max_price: parsedMax,
      duration_minutes: parsedDuration,
      provider_name: providerName.trim() || null,
      specialization: specialization.trim() || null,
      service_category: category.trim() || null,
      is_available: isAvailable,
    });

    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setFormError(res.error || 'Failed to save service.');
    }
  };

  return (
    <div className="vaango-modal-overlay" role="dialog" aria-modal="true">
      <div className="vaango-service-modal">
        <div className="vaango-modal-header">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-primary" />
            <h2 className="vaango-modal-title">
              {serviceToEdit ? 'Edit Service / Slot' : 'Add New Service / Slot'}
            </h2>
          </div>
          <button
            type="button"
            className="vaango-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="vaango-service-form">
          {formError && (
            <div className="vaango-form-alert vaango-form-alert--error" role="alert">
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          {/* Service Name */}
          <div className="vaango-form-group">
            <label className="vaango-form-label">
              Service Name <span className="text-error">*</span>
            </label>
            <Input
              id="srv-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Haircut & Styling / Screen Replacement / General Visit"
              required
              autoFocus
            />
          </div>

          {/* Category */}
          <div className="vaango-form-group">
            <label className="vaango-form-label">Category</label>
            <Input
              id="srv-cat-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Hair, Skin, Consultation, Alteration, Brakes"
              leftIcon={<Tag size={16} />}
            />
          </div>

          {/* Provider / Doctor Name & Specialization */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="vaango-form-group">
              <label className="vaango-form-label">
                {workflowGroup === 'APPOINTMENT' ? 'Doctor / Stylist Name' : 'Specialist / Master'}
              </label>
              <Input
                id="srv-provider-input"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="e.g. Dr. Senthil / Master Karthi"
                leftIcon={<User size={16} />}
              />
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label">Specialization / Department</label>
              <Input
                id="srv-spec-input"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                placeholder="e.g. Pediatrics / Men's Grooming"
              />
            </div>
          </div>

          {/* Price Model Toggle: Fixed vs Range */}
          <div className="vaango-form-group">
            <label className="vaango-form-label">Pricing Structure</label>
            <div className="vaango-price-type-toggle">
              <button
                type="button"
                className={`vaango-toggle-btn ${priceType === 'fixed' ? 'vaango-toggle-btn--active' : ''}`}
                onClick={() => setPriceType('fixed')}
              >
                Fixed Rate
              </button>
              <button
                type="button"
                className={`vaango-toggle-btn ${priceType === 'range' ? 'vaango-toggle-btn--active' : ''}`}
                onClick={() => setPriceType('range')}
              >
                Estimated Range (₹Min – ₹Max)
              </button>
            </div>
          </div>

          {/* Price Inputs */}
          {priceType === 'fixed' ? (
            <div className="vaango-form-group">
              <label className="vaango-form-label">
                Fixed Price (₹) <span className="text-error">*</span>
              </label>
              <Input
                id="srv-fixed-price"
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="e.g. 250"
                leftIcon={<DollarSign size={16} />}
                required
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="vaango-form-group">
                <label className="vaango-form-label">
                  Min Price (₹) <span className="text-error">*</span>
                </label>
                <Input
                  id="srv-min-price"
                  type="number"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="e.g. 350"
                  leftIcon={<DollarSign size={16} />}
                  required
                />
              </div>
              <div className="vaango-form-group">
                <label className="vaango-form-label">
                  Max Price (₹) <span className="text-error">*</span>
                </label>
                <Input
                  id="srv-max-price"
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="e.g. 750"
                  leftIcon={<DollarSign size={16} />}
                  required
                />
              </div>
            </div>
          )}

          {/* Duration in minutes */}
          <div className="vaango-form-group">
            <label className="vaango-form-label">Approx Duration (Minutes)</label>
            <Input
              id="srv-duration"
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="e.g. 30"
              leftIcon={<Clock size={16} />}
            />
          </div>

          {/* Description */}
          <div className="vaango-form-group">
            <label className="vaango-form-label">Description / Inclusions</label>
            <textarea
              className="vaango-input vaango-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what the service or consultation includes..."
            />
          </div>

          {/* Availability toggle */}
          <div className="vaango-switch-row">
            <label className="vaango-switch-label" htmlFor="srv-available-check">
              <strong>Available for Booking</strong>
              <span className="text-xs text-muted block">
                Turn off if temporarily unavailable or out of slots.
              </span>
            </label>
            <input
              id="srv-available-check"
              type="checkbox"
              className="vaango-checkbox"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
            />
          </div>

          <div className="vaango-modal-actions mt-4">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              {serviceToEdit ? 'Save Changes' : 'Add Service'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
