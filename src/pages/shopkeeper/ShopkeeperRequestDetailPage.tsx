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
  DollarSign,
  UserX,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Request, RequestEvent } from '../../types/database';
import { WorkflowStateCode, WorkflowGroupCode } from '../../types/workflow';
import { markRequestCustomerPaid, rejectRequestPayment, transitionRequestState } from '../../lib/shopkeeperApi';
import { confirmServicePrice } from '../../lib/appointmentServiceApi';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
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
  payment_method?: 'cash' | 'upi';
}

export const ShopkeeperRequestDetailPage: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [request, setRequest] = useState<Request | null>(null);
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<RequestEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Modals for Rejection, Delay & Price Confirmation
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [delayModalOpen, setDelayModalOpen] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState('15');
  const [customDelayNote, setCustomDelayNote] = useState('');

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
          if (reqData.payment_screenshot_url && isSupabaseConfigured) {
            const { data: signedData } = await supabase.storage
              .from('payment-proofs')
              .createSignedUrl(reqData.payment_screenshot_url, 600);
            setPaymentProofUrl(signedData?.signedUrl || null);
          } else {
            setPaymentProofUrl(reqData.payment_screenshot_url || null);
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

  const handleRejectPayment = async () => {
    if (!request || !user) return;
    const reason = window.prompt('Why is this payment proof being rejected?')?.trim();
    if (!reason) return;
    setIsActionLoading(true);
    try {
      const result = await rejectRequestPayment(request.id, user.id, reason);
      if (result.success && result.request) {
        setRequest(result.request);
        toastError('Payment proof rejected. The customer can submit a replacement proof.');
        await loadRequestAndHistory();
      } else {
        toastError(result.error || t('genericError'));
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCompleteWithPaymentCheck = async (notes: string) => {
    if (!request) return;
    if (!request.customer_paid) {
      const paid = window.confirm('This order is not marked as paid yet. Has the customer paid? Press OK to mark paid and complete, or Cancel to complete with payment unverified.');
      if (paid) await handleMarkPaid();
      await handleTransition('COMPLETED', paid ? 'Customer paid and collected item.' : `${notes} Payment status unverified.`);
      return;
    }
    await handleTransition('COMPLETED', notes);
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

            {request.payment_method === 'upi' && (
              <Card variant="outlined" padding="md" className="vaango-payment-review-card">
                <h2 className="vaango-proof-review__title">Payment Method: UPI</h2>
                <p className="text-secondary text-sm">Payment status: {request.payment_status || (request.payment_screenshot_url ? 'PAYMENT_PROOF_SUBMITTED' : 'PAYMENT_PENDING')}</p>
                {paymentProofUrl ? (
                  <a href={paymentProofUrl} target="_blank" rel="noopener noreferrer"><img src={paymentProofUrl} alt="Customer payment proof" className="vaango-payment-proof-preview" /></a>
                ) : (
                  <p className="text-secondary text-sm">Payment proof has not been submitted.</p>
                )}
                {request.payment_status !== 'PAYMENT_VERIFIED' && request.payment_status !== 'PAYMENT_REJECTED' && request.payment_screenshot_url ? <div className="vaango-req-action-card__btn-group"><Button variant="primary" onClick={() => void handleMarkPaid()} leftIcon={<CheckCircle size={16} />}>Confirm Payment Received</Button><Button variant="outline" onClick={() => void handleRejectPayment()} leftIcon={<AlertTriangle size={16} />}>Reject Proof</Button></div> : request.payment_status === 'PAYMENT_REJECTED' ? <p className="vaango-proof-verified-note">Rejected: {request.payment_rejection_reason || 'No reason provided.'}</p> : request.payment_status === 'PAYMENT_VERIFIED' ? <p className="vaango-proof-verified-note">Payment confirmed. Screenshot kept for your records.</p> : null}
              </Card>
            )}
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

          {decoded.customer_phone && (
            <div className="vaango-req-cust-col">
              <span className="vaango-req-label">Phone</span>
              <div className="vaango-req-val">
                <Phone size={15} />
                <a href={`tel:${decoded.customer_phone}`} className="hover:underline">
                  {decoded.customer_phone}
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
                      leftIcon={<DollarSign size={18} />}
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
                  {!request.customer_paid && (
                    <Button
                      variant="accent"
                      size="lg"
                      disabled={isActionLoading}
                      onClick={handleMarkPaid}
                      leftIcon={<DollarSign size={18} />}
                    >
                      Mark as Paid
                    </Button>
                  )}
                  {request.customer_paid && <Badge variant="success" size="md">Paid</Badge>}
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => void handleCompleteWithPaymentCheck('Customer collected item.')}
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
                  {!request.customer_paid && (
                    <Button
                      variant="accent"
                      size="lg"
                      disabled={isActionLoading}
                      onClick={handleMarkPaid}
                      leftIcon={<DollarSign size={18} />}
                    >
                      Mark as Paid
                    </Button>
                  )}
                  {request.customer_paid && <Badge variant="success" size="md">Paid</Badge>}
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full sm:w-auto"
                    isLoading={isActionLoading}
                    onClick={() => void handleCompleteWithPaymentCheck('Customer collected items at counter.')}
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
                leftIcon={<DollarSign size={16} />}
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
    </div>
  );
};
