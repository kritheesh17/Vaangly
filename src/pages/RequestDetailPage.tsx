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
} from 'lucide-react';
import { Request } from '../types/database';
import { WorkflowStateCode, WorkflowGroupCode } from '../types/workflow';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { cancelCustomerRequest } from '../lib/appointmentServiceApi';
import { markRequestCustomerPaid } from '../lib/shopkeeperApi';
import { RequestTimeline } from '../components/customer/RequestTimeline';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StarRating } from '../components/ui/StarRating';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import './RequestDetailPage.css';

interface DecodedPayload {
  // Order payload
  items?: { product_id: string; name: string; price: number; unit: string; quantity: number; subtotal: number }[];
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

  const [request, setRequest] = useState<Request | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [hasRated, setHasRated] = useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  const groupCode: WorkflowGroupCode = (request?.workflow_group_code || 'ORDER') as WorkflowGroupCode;

  const handleCustomerMarkPaid = async () => {
    if (!request || !user) return;
    setIsMarkingPaid(true);
    const result = await markRequestCustomerPaid(request.id, user.id);
    setIsMarkingPaid(false);
    if (result.success && result.request) {
      setRequest(result.request);
      success('Payment marked. The shopkeeper has been notified.');
    } else {
      toastError(result.error || 'Unable to mark payment.');
    }
  };

  const handleSubmitPaymentProof = async () => {
    if (!request || !user || !paymentProofFile) return;
    setIsSubmittingProof(true);
    try {
      if (!isSupabaseConfigured) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        setRequest((prev) => prev ? { ...prev, payment_screenshot_url: URL.createObjectURL(paymentProofFile) } : prev);
        success('Payment proof submitted in demo mode. It is not persisted to the server.');
        setPaymentProofFile(null);
        setPaymentProofPreview(null);
        return;
      }
      const path = `requests/${request.id}/${Date.now()}-${paymentProofFile.name}`;
      const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(path, paymentProofFile);
      if (uploadError) throw uploadError;
      const { data, error } = await supabase.from('requests').update({ payment_screenshot_url: path }).eq('id', request.id).eq('customer_id', user.id).select().single();
      if (error || !data) throw error || new Error('Unable to save payment proof.');
      setRequest(data as Request);
      success('Payment proof submitted. The shopkeeper will review it.');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Unable to submit payment proof.');
    } finally {
      setIsSubmittingProof(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!userRating || !request || !user) return;
    setIsSubmittingRating(true);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('shop_ratings').insert({
          shop_id: request.shop_id,
          customer_id: user.id,
          request_id: request.id,
          rating: userRating,
        });
        if (error) throw error;
      }
      setHasRated(true);
      success('Thank you for your rating!');
    } catch {
      toastError('Could not save rating. Please try again.');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const handleCustomerCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request || !user) return;
    setIsCancelling(true);
    const res = await cancelCustomerRequest(request.id, user.id, cancelReason);
    setIsCancelling(false);
    if (res.success && res.request) {
      setRequest(res.request);
      setCancelModalOpen(false);
      success('Your request has been cancelled.');
    } else {
      toastError(res.error || 'Failed to cancel request.');
    }
  };

  const notifyStateChange = useCallback(
    (newState: WorkflowStateCode, group: WorkflowGroupCode) => {
      if (group === 'APPOINTMENT') {
        switch (newState) {
          case 'CONFIRMED':
            success('🎉 Appointment confirmed! Your slot has been reserved.');
            break;
          case 'IN_PROGRESS':
            info('Your appointment is now in progress.');
            break;
          case 'COMPLETED':
            success('Appointment successfully completed.');
            break;
          case 'DELAYED':
            warning('Notice: Shopkeeper indicated your appointment is delayed.');
            break;
          case 'NO_SHOW':
            warning('Appointment marked as No-Show.');
            break;
          default:
            info(`Appointment status updated to ${newState}`);
            break;
        }
      } else if (group === 'SERVICE') {
        switch (newState) {
          case 'ACCEPTED':
            success('Shop accepted your service request.');
            break;
          case 'IN_PROGRESS':
            info('Work on your service / repair is now in progress.');
            break;
          case 'READY':
            success('🎉 Your service is READY for pickup at the shop!');
            break;
          case 'COMPLETED':
            success('Service order completed.');
            break;
          case 'DELAYED':
            warning('Notice: Shopkeeper reported a delay in service delivery.');
            break;
          default:
            info(`Service status updated to ${newState}`);
            break;
        }
      } else {
        // Group A: Order
        switch (newState) {
          case 'ACCEPTED':
            success('Shop confirmed! Your pre-order has been accepted.');
            break;
          case 'PREPARING':
            info('The merchant is now packing your order.');
            break;
          case 'READY':
            success('🎉 Your order is READY for pickup at the counter!');
            break;
          case 'COMPLETED':
            success('Order successfully completed.');
            break;
          case 'DELAYED':
            warning('Notice: Shopkeeper indicated a slight delay.');
            break;
          default:
            info(`Order status updated to ${newState}`);
            break;
        }
      }
    },
    [success, warning, info]
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
          title="Request Not Found"
          description="We could not find the details for this request."
          actionLabel="View All Requests"
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
          aria-label="Back to requests list"
        >
          <ArrowLeft size={18} />
          <span>All Requests</span>
        </button>
      </div>

      {/* Header Info */}
      <div className="vaango-request-header-card">
        <div className="vaango-request-header__top">
          <div>
            <span className="vaango-request-ref-label">
              {groupCode === 'APPOINTMENT'
                ? 'Appointment Booking'
                : groupCode === 'SERVICE'
                ? 'Service Request'
                : 'Order Reference'}
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
            {request.current_state}
          </Badge>
        </div>

        {/* Ready for Pickup Callout Banner */}
        {request.current_state === 'READY' && (
          <div className="vaango-ready-banner" role="status">
            <ShoppingBag size={24} className="vaango-ready-banner__icon" />
            <div>
              <strong className="vaango-ready-banner__title">
                {groupCode === 'SERVICE' ? 'Your service is ready!' : 'Your order is ready!'}
              </strong>
              <p className="vaango-ready-banner__desc">
                Please visit <strong>{shopName}</strong> at {shopAddress}. Show reference code{' '}
                <code>{request.reference_code}</code> to collect your item.
              </p>
            </div>
          </div>
        )}

        {/* Confirmed Appointment Banner */}
        {groupCode === 'APPOINTMENT' && request.current_state === 'CONFIRMED' && (
          <div className="vaango-ready-banner" role="status">
            <Calendar size={24} className="vaango-ready-banner__icon" />
            <div>
              <strong className="vaango-ready-banner__title">Appointment Confirmed!</strong>
              <p className="vaango-ready-banner__desc">
                Your slot is reserved for <strong>{payload.slot_date} at {payload.start_time}</strong>. Please arrive 5 minutes prior at <strong>{shopName}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Delay Notice Banner */}
        {request.current_state === 'DELAYED' && (
          <div className="vaango-delay-banner" role="status">
            <AlertTriangle size={24} className="text-warning" />
            <div>
              <strong className="text-warning">Merchant Reported a Delay</strong>
              <p className="vaango-ready-banner__desc">
                The shopkeeper notified that there is a slight delay. Please check with the shopkeeper if you have urgent timing constraints.
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
            <span>{(request.fulfillment_type || payload.fulfillment_type) === 'dine_in' ? '🍽️ Eat there' : '🥡 Parcel'}</span>
          </div>
        )}
        {groupCode === 'ORDER' && payload.payment_method === 'upi' && payload.shop_upi_id && !request.customer_paid && (
          <div className="vaango-upi-payment-card">
            <h3>Pay via UPI</h3>
            <p className="text-secondary text-sm">Open your UPI app to pay the shopkeeper directly.</p>
            {payload.shop_upi_qr_url && <img src={payload.shop_upi_qr_url} alt="Shop UPI QR code" className="vaango-upi-qr" />}
            <a className="vaango-upi-open-btn" href={`upi://pay?pa=${payload.shop_upi_id}&pn=${encodeURIComponent(payload.shop_name || 'Shop')}&cu=INR`}>Open UPI App to Pay</a>
            <p className="text-xs text-secondary mt-2">UPI ID: {payload.shop_upi_id}</p>
            {!request.payment_screenshot_url ? <>
              <label className="vaango-form-label mt-3" htmlFor="payment-proof">Upload Payment Screenshot</label>
              <input id="payment-proof" type="file" accept="image/*" className="vaango-file-input" onChange={(e) => { const file = e.target.files?.[0] || null; setPaymentProofFile(file); setPaymentProofPreview(file ? URL.createObjectURL(file) : null); }} />
              {paymentProofPreview && <img src={paymentProofPreview} alt="Payment screenshot preview" className="vaango-payment-proof-preview" />}
              <Button type="button" variant="primary" size="sm" isLoading={isSubmittingProof} disabled={!paymentProofFile} onClick={() => void handleSubmitPaymentProof()}>Submit Payment Proof</Button>
            </> : <Badge variant="warning" size="md">Payment Screenshot Submitted — waiting for shopkeeper</Badge>}
            <Button type="button" variant="primary" size="sm" isLoading={isMarkingPaid} onClick={() => void handleCustomerMarkPaid()}>I have paid</Button>
          </div>
        )}
        {request.customer_paid && <div className="vaango-paid-confirm">Payment confirmed</div>}
      </div>

      {/* Timeline Section */}
      <Card variant="default" padding="lg" className="vaango-timeline-card">
        <div className="vaango-timeline-card__header">
          <h2 className="vaango-timeline-card__title">Status Timeline</h2>
          <span className="vaango-timeline-card__realtime-indicator">
            <span className="vaango-pulse-dot" />
            <span>Live Updates Active</span>
          </span>
        </div>

        <RequestTimeline
          currentState={request.current_state}
          workflowGroupCode={groupCode}
          updatedAt={request.updated_at}
        />
      </Card>

      {request.current_state === 'COMPLETED' && !hasRated && (
        <Card variant="default" padding="lg" className="vaango-rating-prompt">
          <h3>How was your experience?</h3>
          <p className="text-sm text-secondary">Rate {shopName}</p>
          <StarRating value={userRating} onChange={setUserRating} size="lg" />
          {userRating > 0 && <Button variant="primary" size="md" isLoading={isSubmittingRating} onClick={() => void handleSubmitRating()}>Submit Rating</Button>}
        </Card>
      )}
      {hasRated && (
        <Card variant="default" padding="md">
          <div className="vaango-rating-submitted"><StarRating value={userRating} readonly size="sm" /><span className="text-sm text-secondary">Rating submitted - thank you!</span></div>
        </Card>
      )}

      {/* Group-specific Content */}
      {groupCode === 'APPOINTMENT' ? (
        /* Appointment Details Card */
        <Card variant="default" padding="lg" className="vaango-items-card">
          <div className="vaango-items-card__header">
            <h2 className="vaango-items-card__title">Appointment Details</h2>
            <span className="vaango-items-card__total">₹{request.total_estimate}</span>
          </div>

          <div className="vaango-appointment-info-rows">
            <div className="vaango-info-row">
              <span className="vaango-info-label">Service:</span>
              <strong className="vaango-info-val">{payload.service_name || 'Consultation / Service'}</strong>
            </div>

            {payload.provider_name && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">Doctor / Stylist:</span>
                <span className="vaango-info-val">
                  {payload.provider_name} {payload.specialization && `(${payload.specialization})`}
                </span>
              </div>
            )}

            <div className="vaango-info-row">
              <span className="vaango-info-label">Scheduled Date:</span>
              <strong className="vaango-info-val">{payload.slot_date}</strong>
            </div>

            <div className="vaango-info-row">
              <span className="vaango-info-label">Time Slot:</span>
              <strong className="vaango-info-val text-primary">
                {payload.start_time} – {payload.end_time}
              </strong>
            </div>

            {payload.duration_minutes && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">Approx Duration:</span>
                <span className="vaango-info-val">{payload.duration_minutes} minutes</span>
              </div>
            )}

            {payload.customer_name && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">Visitor / Patient:</span>
                <span className="vaango-info-val">{payload.customer_name} ({payload.customer_phone})</span>
              </div>
            )}

            {payload.notes && (
              <div className="vaango-item-notes-box mt-2">
                <strong>Symptoms / Special Request:</strong> &ldquo;{payload.notes}&rdquo;
              </div>
            )}
          </div>
        </Card>
      ) : groupCode === 'SERVICE' ? (
        /* Service Details Card */
        <Card variant="default" padding="lg" className="vaango-items-card">
          <div className="vaango-items-card__header">
            <h2 className="vaango-items-card__title">Service Request Details</h2>
            <div className="text-right">
              {payload.confirmed_price ? (
                <div>
                  <span className="text-xs text-muted block">Confirmed Price</span>
                  <span className="vaango-items-card__total text-success">₹{payload.confirmed_price}</span>
                </div>
              ) : payload.price_type === 'range' ? (
                <div>
                  <span className="text-xs text-muted block">Estimated Range</span>
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
              <span className="vaango-info-label">Requested Service:</span>
              <strong className="vaango-info-val">{payload.service_name}</strong>
            </div>

            {payload.service_category && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">Category:</span>
                <span className="vaango-info-val">{payload.service_category}</span>
              </div>
            )}

            {payload.provider_name && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">Assigned Specialist:</span>
                <span className="vaango-info-val">{payload.provider_name}</span>
              </div>
            )}

            <div className="vaango-info-row">
              <span className="vaango-info-label">Pricing Mode:</span>
              <span className="vaango-info-val">
                {payload.price_type === 'range' ? 'Price Range (Estimate)' : 'Fixed Pricing'}
              </span>
            </div>

            {payload.confirmed_price && (
              <div className="vaango-info-row vaango-info-row--highlight">
                <span className="vaango-info-label">Confirmed Final Price:</span>
                <strong className="vaango-info-val text-success">₹{payload.confirmed_price}</strong>
              </div>
            )}

            {payload.customer_name && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">Contact:</span>
                <span className="vaango-info-val">{payload.customer_name} ({payload.customer_phone})</span>
              </div>
            )}

            {payload.notes && (
              <div className="vaango-item-notes-box mt-2">
                <strong>Item & Instructions:</strong> &ldquo;{payload.notes}&rdquo;
              </div>
            )}
          </div>
        </Card>
      ) : (
        /* Order Items Section (Group A) */
        <Card variant="default" padding="lg" className="vaango-items-card">
          <div className="vaango-items-card__header">
            <h2 className="vaango-items-card__title">Order Items ({items.length})</h2>
            <span className="vaango-items-card__total">₹{request.total_estimate}</span>
          </div>

          <div className="vaango-items-list">
            {items.map((item, idx) => (
              <div key={idx} className="vaango-item-row">
                <div>
                  <span className="vaango-item-row__name">{item.name}</span>
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
              <strong>Customer Note:</strong> &ldquo;{payload.notes}&rdquo;
            </div>
          )}
        </Card>
      )}

      {/* Customer Cancellation Option (Only available while request is pre-fulfillment) */}
      {['REQUESTED', 'ACCEPTED', 'CONFIRMED'].includes(request.current_state) && (
        <Card variant="outlined" padding="md" style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--color-text)' }}>
              Need to cancel this request?
            </strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              You can safely cancel without fee while the shop has not started preparing.
            </span>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setCancelModalOpen(true)}
            leftIcon={<XCircle size={16} />}
          >
            Cancel Request
          </Button>
        </Card>
      )}

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Request"
        maxWidth="sm"
      >
        <form onSubmit={handleCustomerCancel}>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Are you sure you want to cancel request <strong>{request.reference_code}</strong>?
            {groupCode === 'APPOINTMENT' && ' Your reserved appointment slot will be released for others to book.'}
          </p>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="cancel-reason" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
              Reason for cancellation (optional)
            </label>
            <Input
              id="cancel-reason"
              placeholder="e.g. Schedule conflict, placed by mistake"
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
              Keep Request
            </Button>
            <Button
              type="submit"
              variant="danger"
              isLoading={isCancelling}
            >
              Confirm Cancellation
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
