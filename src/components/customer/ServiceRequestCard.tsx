import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Phone,
  FileText,
  Tag,
  Info,
} from 'lucide-react';
import { Shop, ShopService } from '../../types/database';
import { fetchShopServices, submitServiceRequest } from '../../lib/appointmentServiceApi';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useToast } from '../../context/ToastContext';
import './ServiceRequestCard.css';

interface ServiceRequestCardProps {
  shop: Shop;
}

export const ServiceRequestCard: React.FC<ServiceRequestCardProps> = ({ shop }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [services, setServices] = useState<ShopService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');

  // Customer contact details
  const [customerName, setCustomerName] = useState(user?.full_name || 'Valued Customer');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '+91 98765 00000');
  const [notes, setNotes] = useState('');

  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

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

  const selectedService = useMemo(() => {
    return services.find((s) => s.id === selectedServiceId) || null;
  }, [services, selectedServiceId]);

  const handleSubmitRequest = async () => {
    if (!selectedService) {
      toastError('Please select a service.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      toastError('Please provide your name and phone number.');
      return;
    }

    setIsSubmitting(true);
    setServiceError(null);

    const res = await submitServiceRequest({
      shopId: shop.id,
      shopName: shop.name,
      shopAddress: shop.address_line,
      shopPhone: shop.phone,
      service: selectedService,
      customerId: user?.id || 'cust-demo-guest',
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      notes: notes.trim(),
    });

    setIsSubmitting(false);

    if (res.success && res.request) {
      success('Service request submitted! The shopkeeper will review and accept.');
      navigate(`/requests/${res.request.id}`);
    } else {
      setServiceError(res.error || 'Failed to submit service request.');
    }
  };

  return (
    <div className="vaango-service-request" aria-label="Service request workflow">
      {/* 1. Service Selection */}
      <section className="vaango-service-section">
        <div className="vaango-service-section__header">
          <Wrench size={20} className="text-primary" />
          <h2 className="vaango-service-section__title">1. Select Required Service</h2>
        </div>

        {isLoadingServices ? (
          <div className="vaango-service-loading">Loading available services...</div>
        ) : services.length === 0 ? (
          <div className="vaango-service-empty">This shop has not listed any services yet.</div>
        ) : (
          <div className="vaango-services-grid" role="radiogroup" aria-label="Available Services">
            {services.map((srv) => {
              const isSelected = srv.id === selectedServiceId;
              const isRange = srv.price_type === 'range';

              return (
                <button
                  key={srv.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={!srv.is_available}
                  className={`vaango-service-item ${isSelected ? 'vaango-service-item--selected' : ''} ${
                    !srv.is_available ? 'vaango-service-item--disabled' : ''
                  }`}
                  onClick={() => setSelectedServiceId(srv.id)}
                >
                  <div className="vaango-service-item__top">
                    <div>
                      <div className="vaango-service-category-badge">
                        <Tag size={12} />
                        <span>{srv.service_category || 'Service'}</span>
                      </div>
                      <h3 className="vaango-service-item__name">{srv.name}</h3>
                      {srv.provider_name && (
                        <span className="vaango-service-item__provider">
                          <User size={13} /> {srv.provider_name}
                        </span>
                      )}
                    </div>

                    <div className="vaango-service-item__price-block">
                      {isRange ? (
                        <div className="vaango-price-range">
                          <span className="vaango-price-range__label">Estimated</span>
                          <span className="vaango-price-range__amount">
                            ₹{srv.min_price} – ₹{srv.max_price}
                          </span>
                        </div>
                      ) : (
                        <div className="vaango-price-fixed">
                          <span className="vaango-price-fixed__label">Fixed Rate</span>
                          <span className="vaango-price-fixed__amount">₹{srv.base_price}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {srv.description && (
                    <p className="vaango-service-item__desc">{srv.description}</p>
                  )}

                  <div className="vaango-service-item__bottom">
                    {srv.duration_minutes && (
                      <span className="vaango-service-item__duration">
                        <Clock size={13} /> Approx {srv.duration_minutes} mins
                      </span>
                    )}
                    {isSelected ? (
                      <span className="vaango-service-item__selected-label">
                        <CheckCircle2 size={16} /> Selected
                      </span>
                    ) : (
                      <span className="vaango-service-item__select-prompt">Tap to Select</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Customer Details & Notes */}
      {selectedService && (
        <section className="vaango-service-section">
          <div className="vaango-service-section__header">
            <User size={20} className="text-primary" />
            <h2 className="vaango-service-section__title">2. Request Details & Requirements</h2>
          </div>

          <Card variant="default" padding="lg" className="vaango-service-form-card">
            {serviceError && (
              <div className="vaango-service-alert vaango-service-alert--error" role="alert">
                <AlertCircle size={18} />
                <span>{serviceError}</span>
              </div>
            )}

            <div className="vaango-form-group">
              <label htmlFor="srv-customer-name" className="vaango-form-label">
                Your Name <span className="text-error">*</span>
              </label>
              <Input
                id="srv-customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
                leftIcon={<User size={16} />}
              />
            </div>

            <div className="vaango-form-group">
              <label htmlFor="srv-customer-phone" className="vaango-form-label">
                Phone Number <span className="text-error">*</span>
              </label>
              <Input
                id="srv-customer-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="10-digit mobile number"
                leftIcon={<Phone size={16} />}
              />
            </div>

            <div className="vaango-form-group">
              <label htmlFor="srv-notes" className="vaango-form-label">
                Item Details / Specific Requirements
              </label>
              <Input
                id="srv-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Bike model: Hero Splendor Plus / Screen cracked on corner"
                leftIcon={<FileText size={16} />}
              />
            </div>

            {/* Price Clarification & Review */}
            <div className="vaango-service-summary-box">
              <div className="vaango-service-summary-row">
                <span className="vaango-summary-label">Selected Service:</span>
                <strong className="vaango-summary-val">{selectedService.name}</strong>
              </div>

              <div className="vaango-service-summary-row">
                <span className="vaango-summary-label">Price Model:</span>
                <span className="vaango-summary-val">
                  {selectedService.price_type === 'range' ? (
                    <strong className="text-accent">
                      Estimated: ₹{selectedService.min_price} – ₹{selectedService.max_price}
                    </strong>
                  ) : (
                    <strong className="text-primary">Fixed: ₹{selectedService.base_price}</strong>
                  )}
                </span>
              </div>

              {selectedService.price_type === 'range' && (
                <div className="vaango-range-clarification">
                  <Info size={16} />
                  <span>
                    The final price will be confirmed by the merchant when your request is accepted
                    or inspected at the counter.
                  </span>
                </div>
              )}
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full mt-4"
              isLoading={isSubmitting}
              onClick={handleSubmitRequest}
            >
              Submit Service Request
            </Button>
          </Card>
        </section>
      )}
    </div>
  );
};
