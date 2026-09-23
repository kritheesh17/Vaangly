import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Store,
  MapPin,
  Phone,
  ShoppingBag,
  Sparkles,
  Calendar,
  AlertTriangle,
  XCircle,
  Star,
} from 'lucide-react';
import { Request } from '../types/database';
import { WorkflowStateCode, WorkflowGroupCode } from '../types/workflow';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { cancelCustomerRequest } from '../lib/appointmentServiceApi';
import { RequestTimeline } from '../components/customer/RequestTimeline';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { RatingModal } from '../components/customer/RatingModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { validatePaymentProofFile } from '../lib/paymentProof';
import { isValidUpiQrUrl } from '../lib/upi';
import './RequestDetailPage.css';

interface DecodedPayload {
  // Order payload
  items?: { product_id: string; name: string; price: number; unit: string; quantity: number; subtotal: number; variant_label?: string | null; variant_attributes?: Record<string, string> }[];
  // Appointment payload
  service_id?: string;
  service_name?: string;
  provider_name?: string;
  specialization?: string;
  slot_id?: string;
  slot_date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  price?: number;
  // Service payload
  service_category?: string;
  price_type?: 'fixed' | 'range';
  estimated_price?: number;
  min_price?: number;
  max_price?: number;
  confirmed_price?: number;
  // Shared
  customer_name?: string;
  customer_phone?: string;
  fulfillment_type?: 'parcel' | 'dine_in' | null;
  notes?: string | null;
  shop_name?: string;
  shop_address?: string;
  shop_phone?: string;
  shop_upi_id?: string | null;
  shop_upi_qr_url?: string | null;
  payment_method?: 'cash' | 'upi';
}

export const RequestDetailPage: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, warning, info, error: toastError } = useToast();
  const { t } = useLanguage();

  const [request, setRequest] = useState<Request | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [hasRated, setHasRated] = useState(false);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);

  const groupCode: WorkflowGroupCode = (request?.workflow_group_code || 'ORDER') as WorkflowGroupCode;

  const handleSubmitPaymentProof = async () => {
    if (!request || !user || !paymentProofFile) return;
    const validationError = validatePaymentProofFile(paymentProofFile);
    if (validationError) {
      toastError(validationError);
      return;
    }
    setIsSubmittingProof(true);
    try {
      if (!isSupabaseConfigured) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        setRequest((prev) => prev ? { ...prev, payment_screenshot_url: URL.createObjectURL(paymentProofFile) } : prev);
        success(t('paymentProofDemo'));
        setPaymentProofFile(null);
        setPaymentProofPreview(null);
        return;
      }
      const extension = paymentProofFile.type.split('/')[1] || 'jpg';
      const path = `requests/${request.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(path, paymentProofFile);
      if (uploadError) throw uploadError;
      const { data, error } = await supabase.from('requests').update({ payment_screenshot_url: path }).eq('id', request.id).eq('customer_id', user.id).select().single();
      if (error || !data) throw error || new Error('Unable to save payment proof.');
      setRequest(data as Request);
      success(t('paymentProofSuccess'));
    } catch (err) {
      toastError(err instanceof Error ? err.message : t('unableToSubmitProof'));
    } finally {
      setIsSubmittingProof(false);
    }
  };

  const handleCustomerCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request || !user) return;
    setIsCancelling(true);
    try {
      const res = await cancelCustomerRequest(request.id, user.id, cancelReason);
      if (res.success && res.request) {
        setRequest(res.request);
        setCancelModalOpen(false);
        success(t('requestCancelledSuccess'));
      } else {
        toastError(res.error || t('cancelRequestFailed'));
      }
    } catch (err: any) {
      toastError(err?.message || t('cancelRequestFailed'));
    } finally {
      setIsCancelling(false);
    }
  };

  const notifyStateChange = useCallback(
    (newState: WorkflowStateCode, group: WorkflowGroupCode) => {
      if (group === 'APPOINTMENT') {
        switch (newState) {
          case 'CONFIRMED':
            success(t('aptConfirmedNotify'));
            break;
          case 'IN_PROGRESS':
            info(t('aptInProgressNotify'));
            break;
          case 'COMPLETED':
            success(t('aptCompletedNotify'));
            break;
          case 'DELAYED':
            warning(t('aptDelayedNotify'));
            break;
          case 'NO_SHOW':
            warning(t('aptNoShowNotify'));
            break;
          default:
            info(`Appointment status: ${newState}`);
            break;
        }
      } else if (group === 'SERVICE') {
        switch (newState) {
          case 'ACCEPTED':
            success(t('serviceAcceptedNotify'));
            break;
          case 'IN_PROGRESS':
            info(t('serviceInProgressNotify'));
            break;
          case 'READY':
            success(t('serviceReadyNotify'));
            break;
          case 'COMPLETED':
            success(t('serviceCompletedNotify'));
            break;
          case 'DELAYED':
            warning(t('serviceDelayedNotify'));
            break;
          default:
            info(`Service status: ${newState}`);
            break;
        }
      } else {
        // Group A: Order
        switch (newState) {
          case 'ACCEPTED':
            success(t('orderAcceptedNotify'));
            break;
          case 'PREPARING':
            info(t('orderPreparingNotify'));
            break;
          case 'READY':
            success(t('orderReadyNotify'));
            break;
          case 'COMPLETED':
            success(t('orderCompletedNotify'));
            break;
          case 'DELAYED':
            warning(t('orderDelayedNotify'));
            break;
          default:
            info(`Order status: ${newState}`);
            break;
        }
      }
    },
    [success, warning, info, t]
  );

  // Load initial request
  useEffect(() => {
    let isMounted = true;

    async function fetchRequest() {
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase
            .from('requests')
            .select('*')
            .eq('id', requestId)
            .single();

          if (!error && data && isMounted) {
            setRequest(data as Request);
          }
        } catch (e) {
          console.error('Error fetching request detail:', e);
        }
      } else {
        const demoRequests: Request[] = JSON.parse(
          localStorage.getItem('vaango_demo_requests') || '[]'
        );
        const match = demoRequests.find((r) => r.id === requestId);
        if (match && isMounted) {
          setRequest(match);
        }
      }
      if (isMounted) setIsLoading(false);
    }

    fetchRequest();

    return () => {
      isMounted = false;
    };
  }, [requestId]);

  // Realtime updates
  useEffect(() => {
    if (!isSupabaseConfigured || !requestId) return;

    const channel = supabase
      .channel(`request_${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'requests',
          filter: `id=eq.${requestId}`,
        },
        (payload: { new: Request }) => {
          setRequest((prev) => {
            const updated = payload.new;
            if (prev && prev.current_state !== updated.current_state) {
              notifyStateChange(updated.current_state, updated.workflow_group_code as WorkflowGroupCode);
            }
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, notifyStateChange]);

  useEffect(() => {
    if (!request || !user || !isSupabaseConfigured) return;
    void supabase.from('shop_ratings').select('rating').eq('request_id', request.id).maybeSingle().then(({ data }) => {
      if (data) {
        setUserRating(data.rating);
        setHasRated(true);
      }
    });
  }, [request, user]);

  // Simulated transition for tester / evaluation
  const handleSimulateTransition = async (nextState: WorkflowStateCode) => {
    if (!request) return;

    const updatedRequest: Request = {
      ...request,
      current_state: nextState,
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      await supabase
        .from('requests')
        .update({ current_state: nextState, updated_at: new Date().toISOString() })
        .eq('id', request.id);

      await supabase.from('request_events').insert({
        request_id: request.id,
        from_state: request.current_state,
        to_state: nextState,
        actor_id: request.customer_id,
        actor_role: 'shopkeeper',
        notes: `Simulated shopkeeper transition to ${nextState}`,
      });
    } else {
      const demoRequests: Request[] = JSON.parse(
        localStorage.getItem('vaango_demo_requests') || '[]'
      );
      const updatedList = demoRequests.map((r) => (r.id === request.id ? updatedRequest : r));
      localStorage.setItem('vaango_demo_requests', JSON.stringify(updatedList));
    }

    setRequest(updatedRequest);
    notifyStateChange(nextState, groupCode);
  };

  if (isLoading) {
    return (
      <div className="container vaango-request-detail" style={{ paddingTop: 'var(--space-8)' }}>
        <Skeleton height={40} width="50%" style={{ marginBottom: 'var(--space-4)' }} />
        <Skeleton height={240} style={{ marginBottom: 'var(--space-4)' }} />
        <Skeleton height={180} />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="container vaango-request-detail">
        <EmptyState
          icon={<Store size={48} />}
          title={t('requestNotFoundTitle')}
          description={t('requestNotFoundDesc')}
          actionLabel={t('viewAllRequests')}
          onAction={() => navigate('/orders')}
        />
      </div>
    );
  }

  let payload: DecodedPayload = {};
  if (request.notes) {
    try {
      payload = JSON.parse(request.notes);
    } catch {
      payload = {};
    }
  }

  const items = payload.items || [];
  const shopName = payload.shop_name || 'Local Merchant';
  const shopAddress = payload.shop_address || 'Town Center';
  const shopPhone = payload.shop_phone || '+91 98765 12345';

  return (
    <div className="container vaango-request-detail">
      {/* Back button */}
      <div className="vaango-request-detail__nav">
        <button
          type="button"
          className="vaango-back-link"
          onClick={() => navigate('/orders')}
          aria-label={t('allRequests')}
        >
          <ArrowLeft size={18} />
          <span>{t('allRequests')}</span>
        </button>
      </div>

      {/* Header Info */}
      <div className="vaango-request-header-card">
        <div className="vaango-request-header__top">
          <div>
            <span className="vaango-request-ref-label">
              {groupCode === 'APPOINTMENT'
                ? t('appointmentBookingTitle')
                : groupCode === 'SERVICE'
                ? t('serviceRequestTitle')
                : t('orderReferenceTitle')}
            </span>
            <h1 className="vaango-request-ref-code">{request.reference_code}</h1>
          </div>
          <Badge
            variant={
              ['CONFIRMED', 'READY', 'COMPLETED'].includes(request.current_state)
                ? 'success'
                : request.current_state === 'DELAYED'
                ? 'warning'
                : ['REJECTED', 'CANCELLED', 'NO_SHOW'].includes(request.current_state)
                ? 'error'
                : 'primary'
            }
            size="md"
            withDot
          >
            {(t as any)(`status_${request.current_state}`) || request.current_state}
          </Badge>
        </div>

        {/* Ready for Pickup Callout Banner */}
        {request.current_state === 'READY' && (
          <div className="vaango-ready-banner" role="status">
            <ShoppingBag size={24} className="vaango-ready-banner__icon" />
            <div>
              <strong className="vaango-ready-banner__title">
                {groupCode === 'SERVICE' ? t('serviceReadyCallout') : t('orderReadyCallout')}
              </strong>
              <p className="vaango-ready-banner__desc">
                {t('pickupInstruction', { shopName, shopAddress, refCode: request.reference_code })}
              </p>
            </div>
          </div>
        )}

        {/* Confirmed Appointment Banner */}
        {groupCode === 'APPOINTMENT' && request.current_state === 'CONFIRMED' && (
          <div className="vaango-ready-banner" role="status">
            <Calendar size={24} className="vaango-ready-banner__icon" />
            <div>
              <strong className="vaango-ready-banner__title">{t('aptConfirmedCallout')}</strong>
              <p className="vaango-ready-banner__desc">
                {t('aptConfirmedInstruction', { slotDate: payload.slot_date || '', startTime: payload.start_time || '', shopName })}
              </p>
            </div>
          </div>
        )}

        {/* Delay Notice Banner */}
        {request.current_state === 'DELAYED' && (
          <div className="vaango-delay-banner" role="status">
            <AlertTriangle size={24} className="text-warning" />
            <div>
              <strong className="text-warning">{t('merchantDelayCallout')}</strong>
              <p className="vaango-ready-banner__desc">
                {t('merchantDelayInstruction')}
              </p>
            </div>
          </div>
        )}

        <div className="vaango-request-shop-info">
          <div className="vaango-shop-row">
            <Store size={18} className="vaango-shop-row__icon" />
            <span className="vaango-shop-row__name">{shopName}</span>
          </div>
          <div className="vaango-shop-row">
            <MapPin size={16} className="vaango-shop-row__icon" />
            <span>{shopAddress}</span>
          </div>
          <div className="vaango-shop-row">
            <Phone size={16} className="vaango-shop-row__icon" />
            <span>{shopPhone}</span>
          </div>
        </div>
        {groupCode === 'ORDER' && (request.fulfillment_type || payload.fulfillment_type) && (
          <div className="vaango-shop-row">
            <span>{['DINE_IN', 'dine_in'].includes(request.fulfillment_type || payload.fulfillment_type || '') ? '🍽️ Dine-in' : '📦 Parcel / Takeaway'}</span>
          </div>
        )}
        {groupCode === 'ORDER' && payload.payment_method === 'upi' && !request.customer_paid && (
          <div className="vaango-upi-payment-card">
            {!isValidUpiQrUrl(payload.shop_upi_qr_url) ? <p className="vaango-cart-payment-error">UPI payment is currently unavailable because this shop has not configured its UPI QR code.</p> : <>
              <h3>{t('payViaUpiTitle')}</h3>
              <p className="text-secondary text-sm">{t('payViaUpiSubtitle')}</p>
              <img src={payload.shop_upi_qr_url} alt="Shop UPI QR code" className="vaango-upi-qr" />
              {payload.shop_upi_id && <>
                <a className="vaango-upi-open-btn" href={`upi://pay?pa=${payload.shop_upi_id}&pn=${encodeURIComponent(payload.shop_name || 'Shop')}&cu=INR`}>{t('openUpiAppBtn')}</a>
                <p className="text-xs text-secondary mt-2">{t('upiIdLabel', { upiId: payload.shop_upi_id })}</p>
              </>}
              {!request.payment_screenshot_url || request.payment_status === 'PAYMENT_REJECTED' ? <>
                <label className="vaango-form-label mt-3" htmlFor="payment-proof">{t('uploadPaymentScreenshotLabel')}</label>
                <input id="payment-proof" type="file" accept="image/*" className="vaango-file-input" onChange={(e) => { const file = e.target.files?.[0] || null; setPaymentProofFile(file); setPaymentProofPreview(file ? URL.createObjectURL(file) : null); }} />
                {paymentProofPreview && <img src={paymentProofPreview} alt="Payment screenshot preview" className="vaango-payment-proof-preview" />}
                <Button type="button" variant="primary" size="sm" isLoading={isSubmittingProof} disabled={!paymentProofFile} onClick={() => void handleSubmitPaymentProof()}>{t('submitPaymentProofBtn')}</Button>
              </> : <Badge variant="warning" size="md">{t('paymentScreenshotSubmittedBadge')}</Badge>}
              {request.payment_status === 'PAYMENT_VERIFIED' ? <Badge variant="success" size="md">Payment verified by shop</Badge> : <Badge variant="warning" size="md">Payment proof submitted · awaiting verification</Badge>}
            </>}
          </div>
        )}
        {request.customer_paid && <div className="vaango-paid-confirm">{t('paymentConfirmedBanner')}</div>}
      </div>

      {/* Timeline Section */}
      <Card variant="default" padding="lg" className="vaango-timeline-card">
        <div className="vaango-timeline-card__header">
          <h2 className="vaango-timeline-card__title">{t('statusTimelineTitle')}</h2>
          <span className="vaango-timeline-card__realtime-indicator">
            <span className="vaango-pulse-dot" />
            <span>{t('liveUpdatesActiveText')}</span>
          </span>
        </div>

        <RequestTimeline
          currentState={request.current_state}
          workflowGroupCode={groupCode}
          updatedAt={request.updated_at}
        />
      </Card>

      {request.current_state === 'COMPLETED' && (
        <Card variant="default" padding="lg" className="vaango-rating-prompt">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Rate Your Purchase & Experience</h3>
              <p className="text-sm text-secondary" style={{ margin: '4px 0 0 0' }}>Share your feedback for {shopName} and the items you purchased.</p>
            </div>
            <Button
              variant="primary"
              size="md"
              leftIcon={<Star size={16} fill="#ffffff" />}
              onClick={() => setRatingModalOpen(true)}
            >
              {hasRated ? `Rated ${userRating > 0 ? `(${userRating}★)` : ''} · Update Review` : 'Rate & Write Review'}
            </Button>
          </div>
        </Card>
      )}

      {ratingModalOpen && (
        <RatingModal
          request={request}
          isOpen={ratingModalOpen}
          onClose={() => setRatingModalOpen(false)}
          onSuccess={() => {
            setHasRated(true);
          }}
        />
      )}

      {/* Group-specific Content */}
      {groupCode === 'APPOINTMENT' ? (
        /* Appointment Details Card */
        <Card variant="default" padding="lg" className="vaango-items-card">
          <div className="vaango-items-card__header">
            <h2 className="vaango-items-card__title">{t('aptDetailsTitle')}</h2>
            <span className="vaango-items-card__total">₹{request.total_estimate}</span>
          </div>

          <div className="vaango-appointment-info-rows">
            <div className="vaango-info-row">
              <span className="vaango-info-label">{t('serviceLabel')}</span>
              <strong className="vaango-info-val">{payload.service_name || t('consultationServiceFallback')}</strong>
            </div>

            {payload.provider_name && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">{t('doctorStylistLabel')}</span>
                <span className="vaango-info-val">
                  {payload.provider_name} {payload.specialization && `(${payload.specialization})`}
                </span>
              </div>
            )}

            <div className="vaango-info-row">
              <span className="vaango-info-label">{t('scheduledDateLabel')}</span>
              <strong className="vaango-info-val">{payload.slot_date}</strong>
            </div>

            <div className="vaango-info-row">
              <span className="vaango-info-label">{t('timeSlotLabel')}</span>
              <strong className="vaango-info-val text-primary">
                {payload.start_time} – {payload.end_time}
              </strong>
            </div>

            {payload.duration_minutes && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">{t('approxDurationLabel')}</span>
                <span className="vaango-info-val">{payload.duration_minutes} {t('durationMinutesUnit')}</span>
              </div>
            )}

            {payload.customer_name && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">{t('visitorPatientLabel')}</span>
                <span className="vaango-info-val">{payload.customer_name} ({payload.customer_phone})</span>
              </div>
            )}

            {payload.notes && (
              <div className="vaango-item-notes-box mt-2">
                <strong>{t('symptomsSpecialRequestLabel')}</strong> &ldquo;{payload.notes}&rdquo;
              </div>
            )}
          </div>
        </Card>
      ) : groupCode === 'SERVICE' ? (
        /* Service Details Card */
        <Card variant="default" padding="lg" className="vaango-items-card">
          <div className="vaango-items-card__header">
            <h2 className="vaango-items-card__title">{t('serviceDetailsTitle')}</h2>
            <div className="text-right">
              {payload.confirmed_price ? (
                <div>
                  <span className="text-xs text-muted block">{t('confirmedPrice')}</span>
                  <span className="vaango-items-card__total text-success">₹{payload.confirmed_price}</span>
                </div>
              ) : payload.price_type === 'range' ? (
                <div>
                  <span className="text-xs text-muted block">{t('estimatedRange')}</span>
                  <span className="vaango-items-card__total text-accent">
                    ₹{payload.min_price} – ₹{payload.max_price}
                  </span>
                </div>
              ) : (
                <span className="vaango-items-card__total">₹{request.total_estimate}</span>
              )}
            </div>
          </div>

          <div className="vaango-appointment-info-rows">
            <div className="vaango-info-row">
              <span className="vaango-info-label">{t('requestedServiceLabel')}</span>
              <strong className="vaango-info-val">{payload.service_name}</strong>
            </div>

            {payload.service_category && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">{t('categoryLabel')}</span>
                <span className="vaango-info-val">{payload.service_category}</span>
              </div>
            )}

            {payload.provider_name && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">{t('assignedSpecialistLabel')}</span>
                <span className="vaango-info-val">{payload.provider_name}</span>
              </div>
            )}

            <div className="vaango-info-row">
              <span className="vaango-info-label">{t('pricingModeLabel')}</span>
              <span className="vaango-info-val">
                {payload.price_type === 'range' ? t('priceRangeEstimate') : t('fixedPricing')}
              </span>
            </div>

            {payload.confirmed_price && (
              <div className="vaango-info-row vaango-info-row--highlight">
                <span className="vaango-info-label">{t('confirmedFinalPriceLabel')}</span>
                <strong className="vaango-info-val text-success">₹{payload.confirmed_price}</strong>
              </div>
            )}

            {payload.customer_name && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">{t('contactLabel')}</span>
                <span className="vaango-info-val">{payload.customer_name} ({payload.customer_phone})</span>
              </div>
            )}

            {payload.notes && (
              <div className="vaango-item-notes-box mt-2">
                <strong>{t('itemInstructionsLabel')}</strong> &ldquo;{payload.notes}&rdquo;
              </div>
            )}
          </div>
        </Card>
      ) : (
        /* Order Items Section (Group A) */
        <Card variant="default" padding="lg" className="vaango-items-card">
          <div className="vaango-items-card__header">
            <h2 className="vaango-items-card__title">{t('orderItemsTitle', { count: items.length })}</h2>
            <span className="vaango-items-card__total">₹{request.total_estimate}</span>
          </div>

          <div className="vaango-items-list">
            {items.map((item, idx) => (
              <div key={idx} className="vaango-item-row">
                <div>
                  <span className="vaango-item-row__name">{item.name}</span>
                  {(item.variant_label || Object.keys(item.variant_attributes || {}).length > 0) && (
                    <span className="vaango-item-row__unit">{item.variant_label || Object.entries(item.variant_attributes || {}).map(([name, value]) => `${name}: ${value}`).join(' / ')}</span>
                  )}
                  <span className="vaango-item-row__unit">
                    ₹{item.price} / {item.unit}
                  </span>
                </div>
                <div className="vaango-item-row__calc">
                  <span>x{item.quantity}</span>
                  <strong>₹{item.subtotal}</strong>
                </div>
              </div>
            ))}
          </div>

          {payload.notes && (
            <div className="vaango-item-notes-box">
              <strong>{t('customerNoteLabel')}</strong> &ldquo;{payload.notes}&rdquo;
            </div>
          )}
        </Card>
      )}

      {/* Customer Cancellation Option (Only available while request is pre-fulfillment) */}
      {['REQUESTED', 'ACCEPTED', 'CONFIRMED'].includes(request.current_state) && (
        <Card variant="outlined" padding="md" style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--color-text)' }}>
              {t('needToCancelQuestion')}
            </strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              {t('safeCancelNotice')}
            </span>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setCancelModalOpen(true)}
            leftIcon={<XCircle size={16} />}
          >
            {t('cancelRequestBtn')}
          </Button>
        </Card>
      )}

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title={t('cancelRequestBtn')}
        maxWidth="sm"
      >
        <form onSubmit={handleCustomerCancel}>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            {t('cancelModalPrompt', { refCode: request.reference_code })}
            {groupCode === 'APPOINTMENT' && ` ${t('cancelModalAptNotice')}`}
          </p>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="cancel-reason" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
              {t('cancelReasonLabel')}
            </label>
            <Input
              id="cancel-reason"
              placeholder={t('cancelReasonPlaceholder')}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelModalOpen(false)}
            >
              {t('keepRequestBtn')}
            </Button>
            <Button
              type="submit"
              variant="danger"
              isLoading={isCancelling}
            >
              {t('confirmCancellationBtn')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* State Simulator Tool */}
      <Card variant="sunken" padding="md" className="vaango-simulator-panel">
        <div className="vaango-simulator-header">
          <Sparkles size={18} />
          <div>
            <strong className="vaango-simulator-title">Tester & Reviewer State Simulator</strong>
            <p className="vaango-simulator-desc">
              Test live customer notifications and status timeline changes for {groupCode}:
            </p>
          </div>
        </div>

        <div className="vaango-simulator-buttons">
          <Button
            variant="secondary"
            size="sm"
            disabled={request.current_state === 'REQUESTED'}
            onClick={() => handleSimulateTransition('REQUESTED')}
          >
            Reset: REQUESTED
          </Button>

          {groupCode === 'APPOINTMENT' ? (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSimulateTransition('CONFIRMED')}
              >
                Shop CONFIRMED
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={() => handleSimulateTransition('IN_PROGRESS')}
              >
                IN_PROGRESS
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSimulateTransition('COMPLETED')}
              >
                COMPLETED
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleSimulateTransition('DELAYED')}
              >
                DELAYED
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSimulateTransition('NO_SHOW')}
              >
                Mark NO_SHOW
              </Button>
            </>
          ) : groupCode === 'SERVICE' ? (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSimulateTransition('ACCEPTED')}
              >
                Shop ACCEPTED
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={() => handleSimulateTransition('IN_PROGRESS')}
              >
                IN_PROGRESS
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSimulateTransition('READY')}
              >
                Mark READY
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSimulateTransition('COMPLETED')}
              >
                COMPLETED
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleSimulateTransition('DELAYED')}
              >
                DELAYED
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSimulateTransition('ACCEPTED')}
              >
                Advance to ACCEPTED
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={() => handleSimulateTransition('PREPARING')}
              >
                Advance to PREPARING
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSimulateTransition('READY')}
              >
                Mark as READY
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSimulateTransition('COMPLETED')}
              >
                Mark as COMPLETED
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleSimulateTransition('DELAYED')}
              >
                Mark as DELAYED
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
};
