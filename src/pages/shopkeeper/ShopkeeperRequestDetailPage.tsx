import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  User,
  Phone,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Package,
  AlertCircle,
  History,
  Wrench,
  IndianRupee,
  UserX,
  Maximize2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Request, RequestEvent } from '../../types/database';
import { WorkflowStateCode, WorkflowGroupCode } from '../../types/workflow';
import { markRequestCustomerPaid, recordPayAtShopRefund, rejectRequestPayment, transitionRequestState } from '../../lib/shopkeeperApi';
import { confirmServicePrice } from '../../lib/appointmentServiceApi';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { resolvePaymentProofUrl } from '../../lib/paymentProof';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { formatPickupTime } from '../../lib/orderPickupUtils';
import './ShopkeeperRequestDetailPage.css';

interface DecodedPayload {
  // Order
  items?: { product_id: string; name: string; price: number; unit: string; quantity: number; effective_quantity?: number; offer_type?: string; subtotal: number; variant_id?: string | null; variant_label?: string | null; variant_price?: number | null; variant_attributes?: Record<string, string> }[];
  // Appointment
  service_name?: string;
  provider_name?: string;
  specialization?: string;
  slot_date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  // Service
  service_category?: string;
  price_type?: 'fixed' | 'range';
  min_price?: number;
  max_price?: number;
  confirmed_price?: number;
  // Shared
  notes?: string | null;
  customer_name?: string;
  customer_phone?: string;
  fulfillment_type?: 'parcel' | 'dine_in' | null;
  delivery_type?: string;
  payment_method?: 'cash' | 'upi' | 'pay_at_shop' | 'online' | string | null;
  pickup_at?: string | null;
}

export const ShopkeeperRequestDetailPage: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [request, setRequest] = useState<Request | null>(null);
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null);
  const [isProofLoading, setIsProofLoading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [events, setEvents] = useState<RequestEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Modals for Rejection, Delay & Price Confirmation
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [delayModalOpen, setDelayModalOpen] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState('15');
  const [customDelayNote, setCustomDelayNote] = useState('');

  // Payment Rejection Modal
  const [isRejectPaymentModalOpen, setIsRejectPaymentModalOpen] = useState(false);
  const [paymentRejectionReason, setPaymentRejectionReason] = useState('');
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundMethod, setRefundMethod] = useState<'cash' | 'upi' | 'other'>('cash');
  const [refundReference, setRefundReference] = useState('');
  const [refundReason, setRefundReason] = useState('');

  // Service Price Confirmation Modal
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [nextStateAfterPrice, setNextStateAfterPrice] = useState<WorkflowStateCode | null>(null);

  const groupCode: WorkflowGroupCode = (request?.workflow_group_code || 'ORDER') as WorkflowGroupCode;

  const loadRequestAndHistory = useCallback(async () => {
    if (!requestId) return;

    if (isSupabaseConfigured) {
      try {
        let { data: reqData, error: reqErr } = await supabase
          .from('requests')
          .select('*')
          .eq('id', requestId)
          .single();

        // Notifications and legacy links may contain the human reference code.
        if (reqErr || !reqData) {
          const fallback = await supabase
            .from('requests')
            .select('*')
            .eq('reference_code', requestId)
            .maybeSingle();
          reqData = fallback.data;
          reqErr = fallback.error;
        }

        const resolvedRequestId = reqData?.id || requestId;

        if (!reqErr && reqData) {
          setRequest(reqData as Request);
          if (reqData.payment_screenshot_url) {
            setIsProofLoading(true);
            setProofError(null);
            try {
              const res = await resolvePaymentProofUrl(reqData.payment_screenshot_url);
              if (res.error === 'NONE' && res.url) {
                setPaymentProofUrl(res.url);
                setProofError(null);
              } else if (res.error === 'UNAVAILABLE') {
                setPaymentProofUrl(null);
                setProofError('Payment proof was submitted, but the uploaded file is currently unavailable.');
              } else {
                setPaymentProofUrl(null);
                setProofError('Unable to load payment proof. Try again.');
              }
            } catch {
              setPaymentProofUrl(null);
              setProofError('Unable to load payment proof. Try again.');
            } finally {
              setIsProofLoading(false);
            }
          } else {
            setPaymentProofUrl(null);
            setProofError(null);
            setIsProofLoading(false);
          }
        }

        const { data: evtsData } = await supabase
          .from('request_events')
          .select('*')
          .eq('request_id', resolvedRequestId)
          .order('created_at', { ascending: false });

        if (evtsData) {
          setEvents(evtsData as RequestEvent[]);
        }
      } catch (err) {
        console.error('Error loading request detail:', err);
      }
    } else {
      // Mock mode
      try {
        const rawReqs = localStorage.getItem('vaango_demo_requests');
        if (rawReqs) {
          const list: Request[] = JSON.parse(rawReqs);
          const match = list.find((r) => r.id === requestId);
          if (match) setRequest(match);
        }

        const rawEvents = localStorage.getItem('vaango_demo_request_events');
        if (rawEvents) {
          const allEvts: RequestEvent[] = JSON.parse(rawEvents);
          const matchedEvts = allEvts.filter((e) => e.request_id === requestId);
          setEvents(matchedEvts.reverse());
        }
      } catch (err) {
        console.error('Error reading mock data:', err);
      }
    }
    setIsLoading(false);
  }, [requestId]);

  useEffect(() => {
    loadRequestAndHistory();
  }, [loadRequestAndHistory]);

  // Realtime subscription
  useEffect(() => {
    if (!isSupabaseConfigured || !requestId) return;

    const channel = supabase.channel(`request_detail_${requestId}`);
    (channel as any)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'requests',
          filter: `id=eq.${requestId}`,
        },
        (payload: { new: Request }) => {
          setRequest(payload.new);
          loadRequestAndHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, loadRequestAndHistory]);

  // Handle State Machine Transition
  const handleTransition = async (nextState: WorkflowStateCode, notes?: string) => {
    if (!request || !user) return;
    setIsActionLoading(true);

    try {
      const res = await transitionRequestState(
        request.id,
        request.current_state,
        nextState,
        user.id,
        notes
      );

      if (res.success && res.request) {
        setRequest(res.request);
        success(`Request #${request.reference_code} updated to ${nextState}`);
        await loadRequestAndHistory();
      } else {
        toastError(res.error || t('genericError'));
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!request || !user) return;
    setIsActionLoading(true);
    try {
      const result = await markRequestCustomerPaid(request.id, user.id);
      if (result.success && result.request) {
        setRequest(result.request);
        success('Customer payment marked as received.');
        await loadRequestAndHistory();
      } else {
        toastError(result.error || t('genericError'));
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleConfirmRejectPayment = async () => {
    if (!request || !user) return;
    const cleanReason = paymentRejectionReason.trim();
    if (!cleanReason) {
      toastError('A payment rejection reason is required.');
      return;
    }
    setIsActionLoading(true);
    try {
      const result = await rejectRequestPayment(request.id, user.id, cleanReason);
      if (result.success && result.request) {
        setRequest(result.request);
        toastError('Payment proof rejected. The customer has been notified.');
        setIsRejectPaymentModalOpen(false);
        setPaymentRejectionReason('');
        await loadRequestAndHistory();
      } else {
        toastError(result.error || t('genericError'));
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRecordRefund = async () => {
    if (!request) return;
    setIsActionLoading(true);
    try {
      const result = await recordPayAtShopRefund(
        request.id,
        refundMethod,
        refundReference,
        refundReason,
      );
      if (result.success && result.request) {
        setRequest(result.request);
        setIsRefundModalOpen(false);
        setRefundReference('');
        setRefundReason('');
        success('Refund recorded as returned to the customer.');
        await loadRequestAndHistory();
      } else {
        toastError(result.error || t('genericError'));
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle Confirm Service Price & Transition
  const handleConfirmPriceAndTransition = async () => {
    if (!request || !user) return;
    const numPrice = parseFloat(priceInput);
    if (isNaN(numPrice) || numPrice <= 0) {
      toastError(t('validPriceRequired'));
      return;
    }

    setIsActionLoading(true);
    try {
      const priceRes = await confirmServicePrice(request.id, numPrice, user.id);
      if (!priceRes.success) {
        toastError(priceRes.error || t('genericError'));
        return;
      }

      if (nextStateAfterPrice) {
        await handleTransition(nextStateAfterPrice, `Price confirmed at ₹${numPrice}. Work initiated.`);
      } else {
        success(`Final price confirmed at ₹${numPrice}`);
        await loadRequestAndHistory();
      }

      setPriceModalOpen(false);
      setPriceInput('');
      setNextStateAfterPrice(null);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container vaango-req-detail-page">
        <Skeleton height="80px" borderRadius="12px" className="mb-4" />
        <Skeleton height="160px" borderRadius="16px" className="mb-4" />
        <Skeleton height="240px" borderRadius="16px" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="container vaango-req-detail-page">
        <Card variant="default" padding="lg" className="text-center">
          <AlertCircle size={48} className="mx-auto text-error mb-2" />
          <h2 className="text-lg font-bold">Request Not Found</h2>
          <p className="text-muted text-sm mb-4">
            The requested record could not be found or you do not have permission to view it.
          </p>
          <Button variant="primary" onClick={() => navigate('/shopkeeper/requests')}>
            Back to Inbox
          </Button>
        </Card>
      </div>
    );
  }

  // Parse notes
  let decoded: DecodedPayload = {};
  try {
    if (request.notes) decoded = JSON.parse(request.notes);
  } catch {
    // fallback
  }

  const items = decoded.items || [];

  const renderPaymentSection = () => {
    if (!request) return null;

    const rawMethod = request.payment_method || decoded.payment_method;
    const methodLower = (rawMethod || '').toLowerCase();

    const isPayAtShop = ['cash', 'pay_at_shop', 'cash_on_delivery', 'cash_on_pickup', 'counter'].includes(methodLower);
    const isOnline = ['upi', 'online', 'card', 'netbanking'].includes(methodLower);
    const isUnavailable = !isPayAtShop && !isOnline;

    const payableAmount = decoded.confirmed_price ?? request.total_estimate ?? request.payment_amount ?? 0;
    const isPaid = Boolean(
      request.customer_paid ||
      request.payment_status === 'PAYMENT_VERIFIED' ||
      request.payment_status === 'paid'
    );
    const isTerminal = ['REJECTED', 'CANCELLED'].includes(request.current_state);
    const refundAmount = request.refund_amount ?? request.payment_amount ?? payableAmount;

    if (isTerminal) {
      if (!request.refund_status || request.refund_status === 'not_required') return null;
      const isRefunded = request.refund_status === 'refunded' || request.payment_status === 'refunded';
      return (
        <div className="vaango-req-payment-section">
          <div className="vaango-req-payment-divider" />
          <div className="vaango-req-payment-header">
            <div className="vaango-req-payment-kicker">Refund</div>
            <Badge variant={isRefunded ? 'success' : request.refund_status === 'failed' ? 'error' : 'warning'} size="sm" withDot>
              {isRefunded ? 'Refunded' : request.refund_status === 'initiated' ? 'Refund Initiated' : request.refund_status === 'failed' ? 'Refund Failed' : 'Refund Required'}
            </Badge>
          </div>
          {isRefunded ? (
            <div className="vaango-req-payment-paid-msg">
              <CheckCircle size={16} className="text-success shrink-0" />
              <span>₹{refundAmount} was recorded as returned by the shopkeeper{request.refund_method ? ` via ${request.refund_method.toUpperCase()}` : ''}.</span>
            </div>
          ) : isPayAtShop ? (
            <div className="vaango-req-payment-pending-box">
              <p className="vaango-req-payment-desc"><strong>Refund required.</strong> Payment collected: <strong>₹{refundAmount}</strong>. This request was cancelled after payment was collected.</p>
              <p className="vaango-req-payment-question">Return the money to the customer, then record the completed return here.</p>
              <div className="vaango-req-payment-actions">
                <Button variant="accent" size="md" isLoading={isActionLoading} onClick={() => setIsRefundModalOpen(true)} leftIcon={<IndianRupee size={16} />}>Mark Refund Given</Button>
              </div>
            </div>
          ) : (
            <div className="vaango-req-payment-pending-box">
              <p className="vaango-req-payment-desc"><strong>Refund required.</strong> Online payment of <strong>₹{refundAmount}</strong> was verified before this request was cancelled.</p>
              <p className="vaango-req-payment-question">Vaangly has no connected payment gateway to initiate or confirm a UPI/bank refund. Return the money through the merchant's payment provider and do not mark this request refunded until that transfer is actually complete.</p>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="vaango-req-payment-section">
        <div className="vaango-req-payment-divider" />

        <div className="vaango-req-payment-header">
          <div className="vaango-req-payment-kicker">Payment Verification</div>
          <div className="vaango-req-payment-badge-wrap">
            {isPaid ? (
              <Badge variant="success" size="sm" withDot>
                Paid ✓
              </Badge>
            ) : request.payment_status === 'PAYMENT_REJECTED' ? (
              <Badge variant="error" size="sm" withDot>
                Proof Rejected
              </Badge>
            ) : isOnline && request.payment_screenshot_url ? (
              <Badge variant="warning" size="sm" withDot>
                Pending Verification
              </Badge>
            ) : isOnline ? (
              <Badge variant="neutral" size="sm" withDot>
                Pending / Awaiting Proof
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm" withDot>
                Unpaid
              </Badge>
            )}
          </div>
        </div>

        {/* PAY AT SHOP METHOD */}
        {isPayAtShop && (
          <div className="vaango-req-payment-content">
            <div className="vaango-req-payment-title-row">
              <span className="vaango-req-payment-icon" aria-hidden="true">💵</span>
              <h3 className="vaango-req-payment-title">Pay at Shop</h3>
            </div>

            {isPaid ? (
              <div className="vaango-req-payment-paid-msg">
                <CheckCircle size={16} className="text-success shrink-0" />
                <span>
                  Payment of <strong>₹{payableAmount}</strong> has been collected and recorded.
                </span>
              </div>
            ) : (
              <div className="vaango-req-payment-pending-box">
                <p className="vaango-req-payment-desc">
                  Customer chose to pay at the shop/pickup. Please collect the payment from the customer.
                </p>
                <p className="vaango-req-payment-question">
                  Did you collect <strong>₹{payableAmount}</strong> from the customer?
                </p>
                <div className="vaango-req-payment-actions">
                  <Button
                    variant="accent"
                    size="md"
                    isLoading={isActionLoading}
                    onClick={() => void handleMarkPaid()}
                    leftIcon={<IndianRupee size={16} />}
                  >
                    Mark Payment Collected
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ONLINE PAYMENT METHOD */}
        {isOnline && (
          <div className="vaango-req-payment-content">
            <div className="vaango-req-payment-title-row">
              <span className="vaango-req-payment-icon" aria-hidden="true">💳</span>
              <h3 className="vaango-req-payment-title">Online Payment (UPI)</h3>
            </div>

            {isPaid ? (
              <div className="vaango-req-payment-paid-box">
                <div className="vaango-req-payment-paid-msg">
                  <CheckCircle size={16} className="text-success shrink-0" />
                  <span>
                    Online payment of <strong>₹{payableAmount}</strong> has been verified.
                  </span>
                </div>
                {paymentProofUrl && (
                  <div className="mt-2.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsLightboxOpen(true)}
                      leftIcon={<Maximize2 size={14} />}
                    >
                      View Payment Proof
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="vaango-req-payment-pending-box">
                <p className="vaango-req-payment-desc">
                  The customer selected online payment. Please verify the payment before marking it as paid.
                </p>

                {request.payment_status === 'PAYMENT_REJECTED' && (
                  <div className="vaango-req-payment-rejected-alert">
                    <AlertTriangle size={16} className="text-error shrink-0" />
                    <span>
                      Payment proof rejected: &ldquo;{request.payment_rejection_reason}&rdquo;. Awaiting customer replacement proof.
                    </span>
                  </div>
                )}

                {/* Proof Thumbnail / State */}
                {request.payment_screenshot_url ? (
                  <div className="vaango-req-payment-proof-block">
                    <span className="text-xs font-semibold text-secondary mb-1.5 block">Payment Proof Submitted:</span>
                    {isProofLoading ? (
                      <div className="vaango-proof-state vaango-proof-state--loading">
                        <Loader2 size={16} className="vaango-spin text-primary" />
                        <span>Loading payment proof...</span>
                      </div>
                    ) : proofError ? (
                      <div className="vaango-proof-state vaango-proof-state--error">
                        <AlertTriangle size={16} className="text-warning shrink-0" />
                        <span>{proofError}</span>
                      </div>
                    ) : paymentProofUrl ? (
                      <div
                        className="vaango-proof-thumb-wrap"
                        onClick={() => setIsLightboxOpen(true)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsLightboxOpen(true)}
                        aria-label="Click to enlarge payment proof"
                      >
                        <img src={paymentProofUrl} alt="Payment proof thumbnail" className="vaango-payment-proof-preview" />
                        <div className="vaango-proof-zoom-overlay">
                          <Maximize2 size={16} />
                          <span>Inspect Proof</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-secondary italic mb-3">
                    Payment proof has not been uploaded yet. If you verified payment in your UPI app, you may verify it below.
                  </p>
                )}

                <div className="vaango-req-payment-actions">
                  {paymentProofUrl && (
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => setIsLightboxOpen(true)}
                      leftIcon={<Maximize2 size={16} />}
                    >
                      View Payment Proof
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="md"
                    isLoading={isActionLoading}
                    onClick={() => void handleMarkPaid()}
                    leftIcon={<CheckCircle size={16} />}
                  >
                    Verify & Mark Paid
                  </Button>
                  {request.payment_screenshot_url && request.payment_status !== 'PAYMENT_REJECTED' && (
                    <Button
                      variant="outline"
                      size="md"
                      disabled={isActionLoading}
                      onClick={() => setIsRejectPaymentModalOpen(true)}
                      leftIcon={<XCircle size={16} />}
                    >
                      Reject Proof
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* UNAVAILABLE / FALLBACK METHOD */}
        {isUnavailable && (
          <div className="vaango-req-payment-content">
            <div className="vaango-req-payment-title-row">
              <span className="vaango-req-payment-icon" aria-hidden="true">💳</span>
              <h3 className="vaango-req-payment-title">Payment Method Unavailable</h3>
            </div>

            {isPaid ? (
              <div className="vaango-req-payment-paid-msg">
                <CheckCircle size={16} className="text-success shrink-0" />
                <span>
                  Payment of <strong>₹{payableAmount}</strong> is recorded as paid.
                </span>
              </div>
            ) : (
              <div className="vaango-req-payment-pending-box">
                <p className="vaango-req-payment-desc">
                  Payment method was not recorded for this request. If payment of <strong>₹{payableAmount}</strong> was collected, you can mark it as paid.
                </p>
                <div className="vaango-req-payment-actions">
                  <Button
                    variant="accent"
                    size="md"
                    isLoading={isActionLoading}
                    onClick={() => void handleMarkPaid()}
                    leftIcon={<IndianRupee size={16} />}
                  >
                    Mark Payment Collected
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container vaango-req-detail-page">
      {/* Back link */}
      <div className="vaango-req-detail__nav">
        <button
          type="button"
          className="vaango-back-btn"
          onClick={() => navigate('/shopkeeper/requests')}
          aria-label="Back to requests list"
        >
          <ArrowLeft size={18} />
          <span>All Requests</span>
        </button>
      </div>

      {/* Header Info Card */}
      <Card variant="default" padding="lg" className="vaango-req-header-card">
        <div className="vaango-req-header__top">
          <div>
            <span className="vaango-req-header__kicker">
              {groupCode === 'APPOINTMENT'
                ? 'Appointment Slot Request'
                : groupCode === 'SERVICE'
                  ? 'Service & Repair Request'
                  : 'Customer Order'}
            </span>
            <h1 className="vaango-req-header__ref">{request.reference_code}</h1>
          </div>

          <Badge
            variant={
              ['READY', 'CONFIRMED', 'COMPLETED'].includes(request.current_state)
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

        {/* Customer Contact & Meta */}
        <div className="vaango-req-header__customer-grid">
          <div className="vaango-req-cust-col">
            <span className="vaango-req-label">Customer / Visitor</span>
            <div className="vaango-req-val">
              <User size={15} />
              <span>{decoded.customer_name || 'Counter Customer'}</span>
            </div>
          </div>

          {(request.customer_phone || decoded.customer_phone) && (
            <div className="vaango-req-cust-col">
              <span className="vaango-req-label">Phone</span>
              <div className="vaango-req-val">
                <Phone size={15} />
                <a href={`tel:${request.customer_phone || decoded.customer_phone}`} className="hover:underline">
                  {request.customer_phone || decoded.customer_phone}
                </a>
              </div>
            </div>
          )}

          <div className="vaango-req-cust-col">
            <span className="vaango-req-label">Submitted</span>
            <div className="vaango-req-val">
              <Clock size={15} />
              <span>
                {new Date(request.created_at).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                at{' '}
                {new Date(request.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
          {groupCode === 'ORDER' && (request.fulfillment_type || decoded.fulfillment_type) && (
            <div className="vaango-req-cust-col">
              <span className="vaango-req-label">Fulfillment</span>
              <div className="vaango-req-val"><span>{['DINE_IN', 'dine_in'].includes(request.fulfillment_type || decoded.fulfillment_type || '') ? '🍽️ Dine-in' : '📦 Parcel / Takeaway'}</span></div>
            </div>
          )}
          {groupCode === 'ORDER' && (
            <div className="vaango-req-cust-col">
              <span className="vaango-req-label">Pickup Timing</span>
              <div className="vaango-req-val">
                <Clock size={15} className="text-primary" />
                <strong className={(request.pickup_at || decoded.pickup_at) ? 'text-primary' : ''}>
                  {(request.pickup_at || decoded.pickup_at)
                    ? formatPickupTime(request.pickup_at || decoded.pickup_at)
                    : 'ASAP'}
                </strong>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Primary Action Bar ("Next Action What shopkeeper can do next") */}
      <Card variant="default" padding="lg" className="vaango-req-action-card">
        <div className="vaango-req-action-card__header">
          <h2 className="vaango-req-action-card__title">
            {groupCode === 'APPOINTMENT'
              ? 'Appointment Action'
              : groupCode === 'SERVICE'
                ? 'Service Action'
                : 'Order Action'}
          </h2>
          <span className="vaango-req-action-card__hint">
            Advancing status immediately communicates real-time updates to the customer.
          </span>
        </div>

        <div className="vaango-req-action-card__controls">
          {/* GROUP B: APPOINTMENT ACTIONS */}
          {groupCode === 'APPOINTMENT' && (
            <>
              {/* 1. If REQUESTED -> Confirm or Reject */}
              {request.current_state === 'REQUESTED' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => handleTransition('CONFIRMED', 'Shopkeeper confirmed appointment slot.')}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Confirm Appointment Slot
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={isActionLoading}
                    onClick={() => setRejectModalOpen(true)}
                    leftIcon={<XCircle size={18} />}
                  >
                    Reject Slot Request
                  </Button>
                </div>
              )}

              {/* 2. If CONFIRMED -> Start, Report Delay, or No-Show */}
              {request.current_state === 'CONFIRMED' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => handleTransition('IN_PROGRESS', 'Customer arrived; service/consultation started.')}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Start Service (In Progress)
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={isActionLoading}
                    onClick={() => setDelayModalOpen(true)}
                    leftIcon={<AlertTriangle size={18} />}
                  >
                    Report Delay
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={isActionLoading}
                    onClick={() => handleTransition('NO_SHOW', 'Customer did not arrive for scheduled slot.')}
                    leftIcon={<UserX size={18} />}
                  >
                    Mark No-Show
                  </Button>
                </div>
              )}

              {/* 3. If DELAYED -> Start or No-Show */}
              {request.current_state === 'DELAYED' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => handleTransition('IN_PROGRESS', 'Service started following delay.')}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Start Service (In Progress)
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={isActionLoading}
                    onClick={() => handleTransition('NO_SHOW', 'Customer did not arrive for appointment.')}
                    leftIcon={<UserX size={18} />}
                  >
                    Mark No-Show
                  </Button>
                </div>
              )}

              {/* 4. If IN_PROGRESS -> Complete */}
              {request.current_state === 'IN_PROGRESS' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => handleTransition('COMPLETED', 'Appointment completed.')}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Mark Appointment Completed
                  </Button>
                </div>
              )}

              {/* Terminal: Completed */}
              {request.current_state === 'COMPLETED' && (
                <div className="vaango-req-action-card__terminal">
                  <CheckCircle size={22} className="text-success" />
                  <span>Appointment successfully fulfilled and completed.</span>
                </div>
              )}

              {/* Terminal: No Show */}
              {request.current_state === 'NO_SHOW' && (
                <div className="vaango-req-action-card__terminal vaango-req-action-card__terminal--error">
                  <UserX size={22} className="text-error" />
                  <span>Marked as Customer No-Show. Slot has been freed.</span>
                </div>
              )}
            </>
          )}

          {/* GROUP C: SERVICE ACTIONS */}
          {groupCode === 'SERVICE' && (
            <>
              {/* 1. If REQUESTED -> Accept or Reject */}
              {request.current_state === 'REQUESTED' && (
                <div className="vaango-req-action-card__btn-group">
                  {decoded.price_type === 'range' && !decoded.confirmed_price ? (
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full sm:w-auto"
                      isLoading={isActionLoading}
                      onClick={() => {
                        setNextStateAfterPrice('ACCEPTED');
                        setPriceModalOpen(true);
                      }}
                      leftIcon={<CheckCircle size={18} />}
                    >
                      Accept & Confirm Price
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full sm:w-auto"
                      isLoading={isActionLoading}
                      onClick={() => handleTransition('ACCEPTED', 'Service request accepted by merchant.')}
                      leftIcon={<CheckCircle size={18} />}
                    >
                      Accept Service Request
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={isActionLoading}
                    onClick={() => setRejectModalOpen(true)}
                    leftIcon={<XCircle size={18} />}
                  >
                    Reject Request
                  </Button>
                </div>
              )}

              {/* 2. If ACCEPTED -> Start Work or Report Delay */}
              {request.current_state === 'ACCEPTED' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => handleTransition('IN_PROGRESS', 'Work started on service.')}
                    leftIcon={<Wrench size={18} />}
                  >
                    Start Work (In Progress)
                  </Button>
                  {decoded.price_type === 'range' && !decoded.confirmed_price && (
                    <Button
                      variant="outline"
                      size="lg"
                      disabled={isActionLoading}
                      onClick={() => {
                        setNextStateAfterPrice(null);
                        setPriceModalOpen(true);
                      }}
                      leftIcon={<IndianRupee size={18} />}
                    >
                      Confirm Exact Price
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={isActionLoading}
                    onClick={() => setDelayModalOpen(true)}
                    leftIcon={<AlertTriangle size={18} />}
                  >
                    Report Delay
                  </Button>
                </div>
              )}

              {/* 3. If IN_PROGRESS -> Mark Ready */}
              {request.current_state === 'IN_PROGRESS' && (
                <div className="vaango-req-action-card__btn-group">
                  {decoded.price_type === 'range' && !decoded.confirmed_price ? (
                    <Button
                      variant="accent"
                      size="lg"
                      className="w-full sm:w-auto"
                      isLoading={isActionLoading}
                      onClick={() => {
                        setNextStateAfterPrice('READY');
                        setPriceModalOpen(true);
                      }}
                      leftIcon={<CheckCircle size={18} />}
                    >
                      Confirm Price & Mark Ready
                    </Button>
                  ) : (
                    <Button
                      variant="accent"
                      size="lg"
                      className="w-full sm:w-auto"
                      isLoading={isActionLoading}
                      onClick={() => handleTransition('READY', 'Service completed; item ready for collection.')}
                      leftIcon={<CheckCircle size={18} />}
                    >
                      Mark Ready for Pickup
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={isActionLoading}
                    onClick={() => setDelayModalOpen(true)}
                    leftIcon={<AlertTriangle size={18} />}
                  >
                    Report Delay
                  </Button>
                </div>
              )}

              {/* 4. If DELAYED -> Resume or Mark Ready */}
              {request.current_state === 'DELAYED' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="accent"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => handleTransition('READY', 'Service completed; ready for pickup.')}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Mark Ready for Pickup
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={isActionLoading}
                    onClick={() => handleTransition('IN_PROGRESS', 'Work resumed.')}
                  >
                    Resume Work
                  </Button>
                </div>
              )}

              {/* 5. If READY -> Mark Completed */}
              {request.current_state === 'READY' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => void handleTransition('COMPLETED', 'Customer collected item.')}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Mark Completed (Customer Collected)
                  </Button>
                </div>
              )}

              {/* Terminal: Completed */}
              {request.current_state === 'COMPLETED' && (
                <div className="vaango-req-action-card__terminal">
                  <CheckCircle size={22} className="text-success" />
                  <span>Service completed, collected and fulfilled.</span>
                </div>
              )}
            </>
          )}

          {/* GROUP A: ORDER ACTIONS */}
          {groupCode === 'ORDER' && (
            <>
              {/* Customer Pickup Target Banner (Clarifies collection time vs completion time) */}
              <div
                className="vaango-req-pickup-target-banner"
                style={{
                  marginBottom: 16,
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: (request.pickup_at || decoded.pickup_at) ? 'var(--brand-primary-light, #eff6ff)' : 'var(--color-surface-hover, #f3f4f6)',
                  border: (request.pickup_at || decoded.pickup_at) ? '1px solid var(--brand-primary-light, #bfdbfe)' : '1px solid var(--color-border, #e5e7eb)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Clock size={20} className="text-primary" />
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-secondary)', fontWeight: 700 }}>
                      Customer Collection Target
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                      {(request.pickup_at || decoded.pickup_at)
                        ? formatPickupTime(request.pickup_at || decoded.pickup_at)
                        : 'ASAP (Immediate Collection)'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', maxWidth: 300 }}>
                  When customer intends to collect the order. (This is not the order completion deadline).
                </div>
              </div>

              {/* 1. If REQUESTED -> Accept or Reject */}
              {request.current_state === 'REQUESTED' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => handleTransition('ACCEPTED', 'Order accepted by merchant.')}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Accept Request
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={isActionLoading}
                    onClick={() => setRejectModalOpen(true)}
                    leftIcon={<XCircle size={18} />}
                  >
                    Reject Request
                  </Button>
                </div>
              )}

              {/* 2. If ACCEPTED -> Start Preparing */}
              {request.current_state === 'ACCEPTED' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => handleTransition('PREPARING', 'Merchant started preparing items.')}
                    leftIcon={<Package size={18} />}
                  >
                    Start Preparing Order
                  </Button>
                </div>
              )}

              {/* 3. If PREPARING -> Mark Ready or Report Delay */}
              {request.current_state === 'PREPARING' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="accent"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => handleTransition('READY', 'Order is ready for customer pickup.')}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Mark Ready for Pickup
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={isActionLoading}
                    onClick={() => setDelayModalOpen(true)}
                    leftIcon={<AlertTriangle size={18} />}
                  >
                    Report Delay
                  </Button>
                </div>
              )}

              {/* 4. If DELAYED -> Resume or Mark Ready */}
              {request.current_state === 'DELAYED' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="accent"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => handleTransition('READY', 'Order is ready for counter pickup.')}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Mark Ready for Pickup
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={isActionLoading}
                    onClick={() => handleTransition('PREPARING', 'Preparation resumed.')}
                  >
                    Resume Preparing
                  </Button>
                </div>
              )}

              {/* 5. If READY -> Mark Completed */}
              {request.current_state === 'READY' && (
                <div className="vaango-req-action-card__btn-group">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => void handleTransition('COMPLETED', 'Customer collected items at counter.')}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Mark Order Completed (Customer Collected)
                  </Button>
                </div>
              )}

              {/* 6. Completed State */}
              {request.current_state === 'COMPLETED' && (
                <div className="vaango-req-action-card__terminal">
                  <CheckCircle size={22} className="text-success" />
                  <span>This order is fully fulfilled and completed.</span>
                </div>
              )}
            </>
          )}

          {/* Terminal Rejected / Cancelled (all groups) */}
          {['REJECTED', 'CANCELLED'].includes(request.current_state) && (
            <div className="vaango-req-action-card__terminal vaango-req-action-card__terminal--error">
              <XCircle size={22} className="text-error" />
              <span>This request was {request.current_state.toLowerCase()}.</span>
            </div>
          )}
        </div>

        {/* Dedicated Payment Verification & Collection Section */}
        {renderPaymentSection()}
      </Card>

      {/* Details Card by Workflow Group */}
      {groupCode === 'APPOINTMENT' ? (
        <Card variant="default" padding="lg" className="vaango-req-items-card">
          <h2 className="vaango-req-items-card__title">Scheduled Appointment Details</h2>
          <div className="vaango-appointment-info-rows">
            <div className="vaango-info-row">
              <span className="vaango-info-label">Service:</span>
              <strong className="vaango-info-val">{decoded.service_name}</strong>
            </div>
            {decoded.provider_name && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">Doctor / Stylist:</span>
                <span className="vaango-info-val">
                  {decoded.provider_name} {decoded.specialization && `(${decoded.specialization})`}
                </span>
              </div>
            )}
            <div className="vaango-info-row">
              <span className="vaango-info-label">Reserved Date:</span>
              <strong className="vaango-info-val">{decoded.slot_date}</strong>
            </div>
            <div className="vaango-info-row">
              <span className="vaango-info-label">Time Slot:</span>
              <strong className="vaango-info-val text-primary">
                {decoded.start_time} – {decoded.end_time}
              </strong>
            </div>
            {decoded.duration_minutes && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">Allocated Duration:</span>
                <span className="vaango-info-val">{decoded.duration_minutes} minutes</span>
              </div>
            )}
            <div className="vaango-info-row">
              <span className="vaango-info-label">Consultation / Service Fee:</span>
              <strong className="vaango-info-val text-primary">₹{request.total_estimate}</strong>
            </div>
            {decoded.notes && (
              <div className="vaango-item-notes-box mt-2">
                <strong>Customer Request / Symptoms:</strong> &ldquo;{decoded.notes}&rdquo;
              </div>
            )}
          </div>
        </Card>
      ) : groupCode === 'SERVICE' ? (
        <Card variant="default" padding="lg" className="vaango-req-items-card">
          <h2 className="vaango-req-items-card__title">Service Request Details</h2>
          <div className="vaango-appointment-info-rows">
            <div className="vaango-info-row">
              <span className="vaango-info-label">Service:</span>
              <strong className="vaango-info-val">{decoded.service_name}</strong>
            </div>
            {decoded.service_category && (
              <div className="vaango-info-row">
                <span className="vaango-info-label">Category:</span>
                <span className="vaango-info-val">{decoded.service_category}</span>
              </div>
            )}
            <div className="vaango-info-row">
              <span className="vaango-info-label">Pricing Model:</span>
              <span className="vaango-info-val">
                {decoded.price_type === 'range' ? (
                  <span className="text-accent font-semibold">
                    Estimated: ₹{decoded.min_price} – ₹{decoded.max_price}
                  </span>
                ) : (
                  <span className="text-primary font-semibold">Fixed Rate: ₹{request.total_estimate}</span>
                )}
              </span>
            </div>
            {decoded.confirmed_price ? (
              <div className="vaango-info-row vaango-info-row--highlight">
                <span className="vaango-info-label">Authoritative Confirmed Price:</span>
                <strong className="vaango-info-val text-success">₹{decoded.confirmed_price}</strong>
              </div>
            ) : decoded.price_type === 'range' ? (
              <div className="vaango-info-row">
                <span className="vaango-info-label">Price Status:</span>
                <span className="vaango-info-val text-muted">
                  Awaiting exact price confirmation upon inspection
                </span>
              </div>
            ) : null}
            {decoded.notes && (
              <div className="vaango-item-notes-box mt-2">
                <strong>Item & Instructions:</strong> &ldquo;{decoded.notes}&rdquo;
              </div>
            )}
          </div>
        </Card>
      ) : (
        /* Order Items Table */
        <Card variant="default" padding="lg" className="vaango-req-items-card">
          <h2 className="vaango-req-items-card__title">Requested Items ({items.length})</h2>

          <div className="vaango-req-items-table">
            <div className="vaango-req-items-table__header">
              <span className="vaango-col-item">Item</span>
              <span className="vaango-col-rate">Unit Rate</span>
              <span className="vaango-col-qty">Quantity</span>
              <span className="vaango-col-total">Subtotal</span>
            </div>

            <div className="vaango-req-items-table__body">
              {items.map((it, idx) => (
                <div key={idx} className="vaango-req-items-table__row">
                  <div className="vaango-col-item">
                    <strong>{it.name}</strong>
                    {it.variant_label && (
                      <span className="vaango-item-variant-pill" style={{ display: 'inline-block', fontSize: '0.75rem', background: 'var(--color-surface-hover)', padding: '2px 8px', borderRadius: '4px', marginLeft: '8px' }}>
                        Option: {it.variant_label}
                      </span>
                    )}
                    {!it.variant_label && Object.keys(it.variant_attributes || {}).length > 0 && (
                      <span className="vaango-item-row__unit">Option: {Object.entries(it.variant_attributes || {}).map(([name, value]) => `${name}: ${value}`).join(' / ')}</span>
                    )}
                    {it.offer_type === 'bogo' && <span className="vaango-bogo-tag">BOGO - prepare {it.effective_quantity ?? it.quantity * 2} units</span>}
                  </div>
                  <div className="vaango-col-rate">
                    ₹{it.price} / {it.unit}
                  </div>
                  <div className="vaango-col-qty">
                    <span className="vaango-qty-badge">{it.quantity}</span>
                  </div>
                  <div className="vaango-col-total">
                    ₹{it.subtotal || it.price * it.quantity}
                  </div>
                </div>
              ))}
            </div>

            <div className="vaango-req-items-table__footer">
              <span className="vaango-table-total-label">Authoritative Total</span>
              <span className="vaango-table-total-amount">₹{request.total_estimate || 0}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Audit Trail & State Timeline */}
      <Card variant="default" padding="lg" className="vaango-req-audit-card">
        <div className="vaango-req-audit-card__header">
          <History size={18} />
          <h2 className="vaango-req-audit-card__title">Audit Event Trail</h2>
        </div>

        {events.length === 0 ? (
          <p className="vaango-audit-empty">Initial request event recorded.</p>
        ) : (
          <div className="vaango-audit-timeline">
            {events.map((evt) => (
              <div key={evt.id} className="vaango-audit-item">
                <div className="vaango-audit-item__marker" />
                <div className="vaango-audit-item__content">
                  <div className="vaango-audit-item__top">
                    <span className="vaango-audit-state">
                      {evt.from_state ? `${evt.from_state} → ` : ''}
                      <strong>{evt.to_state}</strong>
                    </span>
                    <span className="vaango-audit-time">
                      {new Date(evt.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {evt.notes && <p className="vaango-audit-notes">{evt.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal: Reject Request */}
      {rejectModalOpen && (
        <div className="vaango-modal-overlay" role="dialog" aria-modal="true">
          <div className="vaango-modal-content">
            <h3 className="vaango-modal-title">Reject Customer Request</h3>
            <p className="vaango-modal-desc">
              Please enter a concise reason for declining (e.g., "Doctor called for emergency surgery" or "Out of materials").
            </p>
            <Input
              id="rejection-reason-input"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              autoFocus
            />
            <div className="vaango-modal-actions mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectModalOpen(false);
                  setRejectionReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                isLoading={isActionLoading}
                disabled={!rejectionReason.trim()}
                onClick={() => {
                  handleTransition('REJECTED', rejectionReason);
                  setRejectModalOpen(false);
                }}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Report Delay */}
      {delayModalOpen && (
        <div className="vaango-modal-overlay" role="dialog" aria-modal="true">
          <div className="vaango-modal-content">
            <h3 className="vaango-modal-title">Communicate Delay to Customer</h3>
            <p className="vaango-modal-desc">
              Let the customer know how much longer it will take to avoid waiting at the shop.
            </p>
            <div className="vaango-form-group mb-3">
              <label className="vaango-form-label">Estimated Delay</label>
              <select
                className="vaango-input"
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(e.target.value)}
              >
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="20">20 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
                <option value="1440">1 day (for complex repair/tailoring)</option>
              </select>
            </div>
            <div className="vaango-form-group mb-4">
              <label className="vaango-form-label">Optional Note</label>
              <Input
                id="custom-delay-note"
                value={customDelayNote}
                onChange={(e) => setCustomDelayNote(e.target.value)}
                placeholder="e.g. Previous appointment running slightly over"
              />
            </div>
            <div className="vaango-modal-actions">
              <Button
                variant="outline"
                onClick={() => {
                  setDelayModalOpen(false);
                  setCustomDelayNote('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="accent"
                isLoading={isActionLoading}
                onClick={() => {
                  const delayLabel = delayMinutes === '1440' ? '1 day' : `${delayMinutes} mins`;
                  const note = customDelayNote.trim()
                    ? `Delayed by approx ${delayLabel}: ${customDelayNote}`
                    : `Delayed by approx ${delayLabel}`;
                  handleTransition('DELAYED', note);
                  setDelayModalOpen(false);
                }}
              >
                Send Delay Notice
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Authoritative Price Confirmation for Range-Priced Services */}
      {priceModalOpen && (
        <div className="vaango-modal-overlay" role="dialog" aria-modal="true">
          <div className="vaango-modal-content">
            <h3 className="vaango-modal-title">Confirm Final Service Price</h3>
            <p className="vaango-modal-desc">
              The customer saw an estimated range of <strong>₹{decoded.min_price} – ₹{decoded.max_price}</strong>.
              Enter the authoritative final price for this service.
            </p>
            <div className="vaango-form-group mb-4">
              <label className="vaango-form-label">Final Price (₹) *</label>
              <Input
                id="confirmed-price-input"
                type="number"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder={`e.g. ${decoded.min_price || 250}`}
                leftIcon={<IndianRupee size={16} />}
                autoFocus
              />
            </div>
            <div className="vaango-modal-actions">
              <Button
                variant="outline"
                onClick={() => {
                  setPriceModalOpen(false);
                  setPriceInput('');
                  setNextStateAfterPrice(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                isLoading={isActionLoading}
                disabled={!priceInput || parseFloat(priceInput) <= 0}
                onClick={handleConfirmPriceAndTransition}
              >
                Confirm & Proceed
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={isRefundModalOpen}
        onClose={() => {
          setIsRefundModalOpen(false);
          setRefundReference('');
          setRefundReason('');
        }}
        title="Record Pay-at-Shop Refund"
        description="Confirm this only after the money has actually been returned to the customer."
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5" htmlFor="refund-method">Refund method</label>
            <select id="refund-method" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as 'cash' | 'upi' | 'other')} className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-foreground">
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5" htmlFor="refund-reference">Refund reference (optional)</label>
            <Input id="refund-reference" value={refundReference} onChange={(e) => setRefundReference(e.target.value)} placeholder="Receipt or UPI reference" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5" htmlFor="refund-note">Refund note (optional)</label>
            <Input id="refund-note" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="How the money was returned" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="md" onClick={() => setIsRefundModalOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button variant="primary" size="md" isLoading={isActionLoading} onClick={() => void handleRecordRefund()}>Confirm Refund Given</Button>
          </div>
        </div>
      </Modal>

      {/* Payment Proof Rejection Modal */}
      <Modal
        isOpen={isRejectPaymentModalOpen}
        onClose={() => {
          setIsRejectPaymentModalOpen(false);
          setPaymentRejectionReason('');
        }}
        title="Reject Payment Proof"
        description="Provide a clear reason why this payment proof cannot be verified. The customer will be prompted to submit a replacement proof."
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Rejection Reason *
            </label>
            <textarea
              value={paymentRejectionReason}
              onChange={(e) => setPaymentRejectionReason(e.target.value)}
              placeholder="e.g. Screenshot amount does not match, transaction ID blurred, or duplicate proof"
              rows={3}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setIsRejectPaymentModalOpen(false);
                setPaymentRejectionReason('');
              }}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              isLoading={isActionLoading}
              disabled={!paymentRejectionReason.trim()}
              onClick={() => void handleConfirmRejectPayment()}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* Payment Proof Full-Size Lightbox Modal */}
      {paymentProofUrl && (
        <Modal
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          title={`Payment Proof — ${request?.reference_code || 'Order'}`}
          maxWidth="lg"
        >
          <div className="vaango-proof-lightbox">
            <div className="vaango-proof-lightbox__img-wrap">
              <img
                src={paymentProofUrl}
                alt="Full customer payment proof"
                className="vaango-proof-lightbox__img"
              />
            </div>
            <div className="vaango-proof-lightbox__footer">
              <a
                href={paymentProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="vaango-proof-lightbox__open-btn"
              >
                <ExternalLink size={15} />
                <span>Open in New Tab / Download</span>
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
