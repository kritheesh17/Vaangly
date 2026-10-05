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
  Clock,
  Camera,
  Image as ImageIcon,
} from 'lucide-react';
import { Request } from '../types/database';
import { WorkflowStateCode, WorkflowGroupCode } from '../types/workflow';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { cancelCustomerRequest, confirmAppointmentOnlinePayment } from '../lib/appointmentServiceApi';
import { notifyOrderLifecycle } from '../lib/notificationApi';
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
import { formatPickupTime } from '../lib/orderPickupUtils';
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
  pickup_at?: string | null;
  payment_method?: 'cash' | 'upi' | 'pay_at_shop' | 'online';
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
  const [paymentEvents, setPaymentEvents] = useState<{ id: string; notes: string | null; created_at: string; actor_role?: string | null }[]>([]);
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
        const demoProofUrl = URL.createObjectURL(paymentProofFile);
        if (groupCode === 'APPOINTMENT') {
          const result = await confirmAppointmentOnlinePayment(request.id, demoProofUrl);
          if (!result.success) throw new Error(result.error || 'Unable to submit payment proof.');
        }
        setRequest((prev) => prev ? {
          ...prev,
          payment_screenshot_url: demoProofUrl,
          payment_status: 'PAYMENT_PROOF_SUBMITTED',
          hold_expires_at: null,
        } : prev);

        try {
          const demoShops = JSON.parse(localStorage.getItem('vaango_demo_shops') || '[]');
          const demoShop = demoShops.find((s: any) => s.id === request.shop_id);
          if (demoShop?.owner_id) {
            void notifyOrderLifecycle({
              event: 'PAYMENT_PROOF_UPLOADED',
              requestId: request.id,
              referenceCode: request.reference_code,
              recipientId: demoShop.owner_id,
              recipientRole: 'shopkeeper',
              shopId: request.shop_id,
            });
          }
        } catch { /* demo fallback */ }

        success(t('paymentProofDemo'));
        setPaymentProofFile(null);
        setPaymentProofPreview(null);
        return;
      }
      const extension = paymentProofFile.type.split('/')[1] || 'jpg';
      const path = `requests/${request.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(path, paymentProofFile);
      if (uploadError) throw uploadError;
      if (groupCode === 'APPOINTMENT') {
        const result = await confirmAppointmentOnlinePayment(request.id, path);
        if (!result.success) throw new Error(result.error || 'Unable to submit payment proof.');
        const { data, error } = await supabase.from('requests').select('*, shops(owner_id)').eq('id', request.id).single();
        if (error || !data) throw error || new Error('Unable to reload appointment payment.');
        setRequest(data as Request);

        const shopOwnerId = (data as any)?.shops?.owner_id;
        if (shopOwnerId) {
          void notifyOrderLifecycle({
            event: 'PAYMENT_PROOF_UPLOADED',
            requestId: data.id,
            referenceCode: data.reference_code,
            recipientId: shopOwnerId,
            recipientRole: 'shopkeeper',
            shopId: data.shop_id,
          });
        }
      } else {
        const { data, error } = await supabase
          .from('requests')
          .update({
            payment_screenshot_url: path,
            payment_status: 'PAYMENT_PROOF_SUBMITTED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.id)
          .eq('customer_id', user.id)
          .select('*, shops(owner_id)')
          .single();
        if (error || !data) throw error || new Error('Unable to save payment proof.');
        setRequest(data as Request);

        const shopOwnerId = (data as any)?.shops?.owner_id;
        if (shopOwnerId) {
          void notifyOrderLifecycle({
            event: 'PAYMENT_PROOF_UPLOADED',
            requestId: data.id,
            referenceCode: data.reference_code,
            recipientId: shopOwnerId,
            recipientRole: 'shopkeeper',
            shopId: data.shop_id,
          });
        }
      }
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
            const { data: events } = await supabase
              .from('request_events')
              .select('id, notes, created_at, actor_role')
              .eq('request_id', data.id)
              .order('created_at', { ascending: false });
            if (isMounted) setPaymentEvents(events || []);
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
          const events = JSON.parse(localStorage.getItem('vaango_demo_request_events') || '[]')
            .filter((event: { request_id?: string }) => event.request_id === match.id)
            .sort((a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at));
          setPaymentEvents(events);
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
          void supabase
            .from('request_events')
            .select('id, notes, created_at, actor_role')
            .eq('request_id', payload.new.id)
            .order('created_at', { ascending: false })
            .then(({ data }) => setPaymentEvents(data || []));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'request_events',
          filter: `request_id=eq.${requestId}`,
        },
        (payload: { new: { id: string; notes: string | null; created_at: string; actor_role?: string | null } }) => {
          setPaymentEvents((current) => [payload.new, ...current]);
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
  const rawPaymentMethod = request.payment_method || payload.payment_method || 'cash';
  const isOnlinePayment = ['upi', 'online'].includes(rawPaymentMethod.toLowerCase());
  const isPayAtShopPayment = ['cash', 'pay_at_shop'].includes(rawPaymentMethod.toLowerCase());
  const paymentAmount = request.payment_amount ?? request.total_estimate ?? payload.price ?? payload.confirmed_price ?? 0;
  const isPaymentVerified = request.payment_status === 'PAYMENT_VERIFIED' || request.payment_status === 'paid' || request.customer_paid;
  const isPaymentRefunded = request.payment_status === 'refunded' || request.refund_status === 'refunded';
  const refundAmount = request.refund_amount ?? paymentAmount;
  const paymentActivity = paymentEvents.filter((event) => /payment|refund/i.test(event.notes || ''));
  const paymentMethodLabel = isOnlinePayment ? 'Online / UPI' : isPayAtShopPayment ? 'Pay at Shop' : 'Payment method unavailable';

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
          {groupCode === 'APPOINTMENT' ? (
            <div className="vaango-apt-detail-status-grid">
              <div className="vaango-apt-detail-status-item">
                <span className="vaango-apt-detail-status-label">Appointment Status</span>
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
                  {(t as any)(`status_${request.current_state}`) || (request.current_state === 'NO_SHOW' ? 'Customer No-Show' : request.current_state)}
                </Badge>
              </div>

              <div className="vaango-apt-detail-status-item">
                <span className="vaango-apt-detail-status-label">Payment Status</span>
                <Badge
                  variant={isPaymentVerified ? 'success' : 'neutral'}
                  size="md"
                  withDot
                >
                  {isPaymentVerified ? (t('paidBadge') || 'Paid') : 'Unpaid'}
                </Badge>
                {isPaymentVerified && (
                  <div className="vaango-apt-detail-payment-sub">
                    <span className="vaango-apt-detail-payment-amount">
                      ₹{request.total_estimate || payload.confirmed_price || (payload as any).base_price || 0} received
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
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
          )}
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

        {groupCode === 'ORDER' && (
          <div
            className="vaango-customer-pickup-card"
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              backgroundColor: 'var(--color-surface-sunken, #f9fafb)',
              border: '1px solid var(--color-border, #e5e7eb)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                Pickup
              </span>
              <Badge variant={(request.pickup_at || payload.pickup_at) ? 'primary' : 'neutral'} size="sm">
                {(request.pickup_at || payload.pickup_at) ? 'Scheduled Pickup' : 'ASAP'}
              </Badge>
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Clock size={16} className="text-primary" />
              <span>
                {(request.pickup_at || payload.pickup_at)
                  ? formatPickupTime(request.pickup_at || payload.pickup_at)
                  : 'ASAP'}
              </span>
            </div>
            {(request.pickup_at || payload.pickup_at) && (
              <small style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                Target collection time selected when placing your order.
              </small>
            )}
          </div>
        )}

        <div className={`vaango-customer-payment-card ${isPayAtShopPayment ? 'vaango-pay-at-shop-card' : ''}`}>
          <div className="vaango-customer-payment-card__header">
            <span>Payment</span>
            {isPaymentRefunded ? (
              <Badge variant="success" size="sm" withDot>Refunded</Badge>
            ) : isPaymentVerified ? (
              <Badge variant="success" size="sm" withDot>{isOnlinePayment ? 'Payment Verified' : 'Paid'}</Badge>
            ) : (
              <Badge variant="neutral" size="sm" withDot>{isOnlinePayment ? 'Pending verification' : 'Awaiting Payment'}</Badge>
            )}
          </div>
          <strong className="vaango-customer-payment-card__amount">₹{paymentAmount}</strong>
          <div className="vaango-customer-payment-card__row"><span>Payment method</span><strong>{paymentMethodLabel}</strong></div>
          <div className="vaango-customer-payment-card__row"><span>Status</span><strong>{isPaymentRefunded ? 'Refunded' : isPaymentVerified ? (isOnlinePayment ? 'Payment verified' : 'Paid') : isOnlinePayment ? 'Awaiting payment verification' : 'Awaiting Payment'}</strong></div>

          {isOnlinePayment && !isPaymentVerified && !isPaymentRefunded && (
            <div className="vaango-customer-payment-card__upi">
              {isValidUpiQrUrl(payload.shop_upi_qr_url) && payload.shop_upi_id ? <>
                <h3>{t('payViaUpiTitle')}</h3>
                <p className="text-secondary text-sm">Scan the shop's QR using any UPI app, then upload a payment screenshot. Uploading proof does not verify payment.</p>
                <img src={payload.shop_upi_qr_url} alt={`${shopName} UPI QR code`} className="vaango-upi-qr" />
                <p className="text-xs text-secondary mt-2">UPI ID: <strong>{payload.shop_upi_id}</strong> · Amount: <strong>₹{paymentAmount}</strong></p>
                <div className="vaango-customer-payment-card__actions">
                  <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(payload.shop_upi_id || '').then(() => success('UPI ID copied.')).catch(() => toastError('Unable to copy UPI ID.'))}>Copy UPI ID</Button>
                  <a className="vaango-upi-open-btn" href={`upi://pay?pa=${encodeURIComponent(payload.shop_upi_id)}&pn=${encodeURIComponent(shopName)}&am=${encodeURIComponent(String(paymentAmount))}&cu=INR`}>{t('openUpiAppBtn')}</a>
                </div>
                {!request.payment_screenshot_url || request.payment_status === 'PAYMENT_REJECTED' ? <>
                  <label className="vaango-form-label mt-3" htmlFor="payment-proof">I've Paid — Upload Payment Proof</label>
                  <div className="vaango-payment-proof-buttons flex gap-2 mt-1 mb-2">
                    <label className="vaango-payment-proof-upload" title="Choose screenshot from Gallery or Files">
                      <ImageIcon size={16} />
                      <span>Choose from Gallery</span>
                      <input
                        id="payment-proof-gallery"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="vaango-file-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setPaymentProofFile(file);
                          setPaymentProofPreview(file ? URL.createObjectURL(file) : null);
                        }}
                      />
                    </label>
                    <label className="vaango-payment-proof-upload vaango-payment-proof-upload--camera" title="Take a new photo with camera">
                      <Camera size={16} />
                      <span>Take Photo</span>
                      <input
                        id="payment-proof-camera"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        capture="environment"
                        className="vaango-file-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setPaymentProofFile(file);
                          setPaymentProofPreview(file ? URL.createObjectURL(file) : null);
                        }}
                      />
                    </label>
                  </div>
                  {paymentProofPreview && <img src={paymentProofPreview} alt="Payment screenshot preview" className="vaango-payment-proof-preview mb-2" />}
                  <Button type="button" variant="primary" size="sm" isLoading={isSubmittingProof} disabled={!paymentProofFile} onClick={() => void handleSubmitPaymentProof()}>{t('submitPaymentProofBtn')}</Button>
                </> : <Badge variant="warning" size="md">{t('paymentScreenshotSubmittedBadge')}</Badge>}
              </> : <p className="vaango-cart-payment-error">Online payment is currently unavailable for this shop. No merchant QR is displayed.</p>}
            </div>
          )}

          {isPayAtShopPayment && !isPaymentVerified && !isPaymentRefunded && <p className="text-xs text-secondary mb-0">Please pay ₹{paymentAmount} at the shop or counter.</p>}
          {isPaymentVerified && !isPaymentRefunded && <div className="vaango-paid-confirm">{t('paymentConfirmedBanner')}</div>}
        </div>

        {request.refund_status && request.refund_status !== 'not_required' && (
          <div className={`vaango-customer-refund-card vaango-customer-refund-card--${request.refund_status}`}>
            <div className="vaango-customer-payment-card__header"><span>Refund</span><Badge variant={request.refund_status === 'refunded' ? 'success' : request.refund_status === 'failed' ? 'error' : 'warning'} size="sm" withDot>{request.refund_status.replace('_', ' ')}</Badge></div>
            <strong className="vaango-customer-payment-card__amount">₹{refundAmount}</strong>
            {request.refund_status === 'refunded' ? <p>{isPayAtShopPayment ? `₹${refundAmount} was collected and has been marked as returned by the shopkeeper.` : `₹${refundAmount} has been refunded.`}</p> : request.refund_status === 'initiated' ? <p>Refund initiated. The merchant is completing the return through their payment provider.</p> : request.refund_status === 'failed' ? <p>Refund could not be completed yet. Please contact the shop for an update.</p> : <p>Refund required: this request was cancelled after a verified payment. The shop must return ₹{refundAmount}.</p>}
          </div>
        )}

        {paymentActivity.length > 0 && <div className="vaango-payment-activity"><strong>Payment Activity</strong>{paymentActivity.slice(0, 4).map((event) => <div className="vaango-payment-activity__event" key={event.id}><span>{new Date(event.created_at).toLocaleString()}</span><p>{event.notes}</p>{event.actor_role === 'shopkeeper' && <small>Recorded by: Shopkeeper</small>}</div>)}</div>}
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
