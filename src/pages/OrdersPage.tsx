import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  ArrowRight,
  Store,
  Clock,
  Calendar,
  Wrench,
  Star,
} from 'lucide-react';
import { Request } from '../types/database';
import { WorkflowGroupCode } from '../types/workflow';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { NotificationBadge } from '../components/ui/NotificationBadge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { RatingModal } from '../components/customer/RatingModal';
import { getStoredDemoRequests, resetDemoData } from '../lib/demoData';
import './OrdersPage.css';

interface DecodedNotes {
  items?: { product_id: string; name: string; price: number; unit: string; quantity: number; subtotal: number; variant_label?: string; variant_attributes?: Record<string, string> }[];
  service_name?: string;
  provider_name?: string;
  slot_date?: string;
  start_time?: string;
  end_time?: string;
  service_category?: string;
  price_type?: 'fixed' | 'range';
  min_price?: number;
  max_price?: number;
  confirmed_price?: number;
  shop_name?: string;
}

type GroupFilter = 'ALL' | 'ORDER' | 'APPOINTMENT' | 'SERVICE';
type StatusFilter = 'all' | 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled';

export const OrdersPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<Request[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('ALL');
  const [ratingModalRequest, setRatingModalRequest] = useState<Request | null>(null);

  const fetchRequests = async () => {
    if (isSupabaseConfigured && user) {
      try {
        const { data, error } = await supabase
          .from('requests')
          .select('*')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          setRequests(data as Request[]);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      const stored = getStoredDemoRequests();
      setRequests(stored);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRequests();

    // Supabase Realtime channel subscription for live updates
    let channel: any = null;
    if (isSupabaseConfigured && user) {
      channel = supabase
        .channel(`customer_requests_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'requests',
            filter: `customer_id=eq.${user.id}`,
          },
          () => {
            fetchRequests();
          }
        )
        .subscribe();
    }

    const handleDataChanged = () => {
      if (!isSupabaseConfigured) {
        setRequests(getStoredDemoRequests());
      }
    };
    window.addEventListener('vaango-requests-changed', handleDataChanged);

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      window.removeEventListener('vaango-requests-changed', handleDataChanged);
    };
  }, [user]);

  // Status Counts
  const counts = {
    all: requests.length,
    pending: requests.filter((r) => r.current_state === 'REQUESTED').length,
    processing: requests.filter((r) =>
      ['ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'DELAYED'].includes(r.current_state)
    ).length,
    ready: requests.filter((r) => r.current_state === 'READY').length,
    completed: requests.filter((r) => r.current_state === 'COMPLETED').length,
    cancelled: requests.filter((r) =>
      ['REJECTED', 'CANCELLED', 'NO_SHOW'].includes(r.current_state)
    ).length,
  };

  const filteredRequests = requests.filter((req) => {
    // 1. Filter by workflow group
    const reqGroup: WorkflowGroupCode = (req.workflow_group_code || 'ORDER') as WorkflowGroupCode;
    if (groupFilter !== 'ALL' && reqGroup !== groupFilter) return false;

    // 2. Filter by status
    if (statusFilter === 'pending' && req.current_state !== 'REQUESTED') return false;
    if (
      statusFilter === 'processing' &&
      !['ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'DELAYED'].includes(req.current_state)
    )
      return false;
    if (statusFilter === 'ready' && req.current_state !== 'READY') return false;
    if (statusFilter === 'completed' && req.current_state !== 'COMPLETED') return false;
    if (
      statusFilter === 'cancelled' &&
      !['REJECTED', 'CANCELLED', 'NO_SHOW'].includes(req.current_state)
    )
      return false;

    return true;
  });

  const getStatusBadge = (state: string, _group?: WorkflowGroupCode) => {
    const key = `status_${state}` as any;
    const label = t(key) || state;

    switch (state) {
      case 'READY':
        return <Badge variant="success" size="sm" withDot>{label}</Badge>;
      case 'CONFIRMED':
        return <Badge variant="success" size="sm" withDot>{label}</Badge>;
      case 'PREPARING':
        return <Badge variant="accent" size="sm" withDot>{label}</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="accent" size="sm" withDot>{label}</Badge>;
      case 'ACCEPTED':
        return <Badge variant="primary" size="sm" withDot>{label}</Badge>;
      case 'COMPLETED':
        return <Badge variant="success" size="sm">{label}</Badge>;
      case 'DELAYED':
        return <Badge variant="warning" size="sm">{label}</Badge>;
      case 'NO_SHOW':
        return <Badge variant="error" size="sm">{label}</Badge>;
      case 'CANCELLED':
      case 'REJECTED':
        return <Badge variant="error" size="sm">{label}</Badge>;
      default:
        return <Badge variant="primary" size="sm" withDot>{t('status_REQUESTED')}</Badge>;
    }
  };

  return (
    <div className="container vaango-orders-page">
      {user?.role === 'shopkeeper' && (
        <div className="vaango-merchant-notice-banner mb-4">
          <div className="flex items-center gap-2">
            <Store size={18} className="text-primary" />
            <span>You are signed in as a shopkeeper. Viewing your personal customer orders.</span>
          </div>
          <button
            type="button"
            className="vaango-btn vaango-btn--secondary vaango-btn--sm"
            onClick={() => navigate('/shopkeeper/requests')}
          >
            Go to Shop Management
          </button>
        </div>
      )}

      {/* Header */}
      <div className="vaango-orders-header">
        <div>
          <h1 className="vaango-orders-title">Your Orders & Activity</h1>
          <p className="vaango-orders-subtitle">
            Track real-time progress and order fulfillment across your local stores.
          </p>
        </div>

        {/* Order Status Metrics Grid */}
        <div className="vaango-order-metrics-grid" role="region" aria-label="Order Status Metrics">
          <button
            type="button"
            className={`vaango-order-metric-card ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            <span className="vaango-metric-label">All Orders</span>
            <strong className="vaango-metric-val">{counts.all}</strong>
          </button>
          <button
            type="button"
            className={`vaango-order-metric-card ${statusFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            <span className="vaango-metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span>Pending</span>
              <NotificationBadge count={counts.pending} size="sm" />
            </span>
            <strong className="vaango-metric-val text-primary">{counts.pending}</strong>
          </button>
          <button
            type="button"
            className={`vaango-order-metric-card ${statusFilter === 'processing' ? 'active' : ''}`}
            onClick={() => setStatusFilter('processing')}
          >
            <span className="vaango-metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span>Processing</span>
              <NotificationBadge count={counts.processing} size="sm" />
            </span>
            <strong className="vaango-metric-val text-accent">{counts.processing}</strong>
          </button>
          <button
            type="button"
            className={`vaango-order-metric-card ${statusFilter === 'ready' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ready')}
          >
            <span className="vaango-metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span>Ready for Pickup</span>
              <NotificationBadge count={counts.ready} size="sm" />
            </span>
            <strong className="vaango-metric-val text-success">{counts.ready}</strong>
          </button>
          <button
            type="button"
            className={`vaango-order-metric-card ${statusFilter === 'completed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('completed')}
          >
            <span className="vaango-metric-label">Completed</span>
            <strong className="vaango-metric-val text-success">{counts.completed}</strong>
          </button>
          <button
            type="button"
            className={`vaango-order-metric-card ${statusFilter === 'cancelled' ? 'active' : ''}`}
            onClick={() => setStatusFilter('cancelled')}
          >
            <span className="vaango-metric-label">Cancelled</span>
            <strong className="vaango-metric-val text-error">{counts.cancelled}</strong>
          </button>
        </div>

        {/* Workflow Group Tabs */}
        <div className="vaango-group-filter-tabs">
          <button
            type="button"
            className={`vaango-group-filter-btn ${groupFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setGroupFilter('ALL')}
          >
            All Types
          </button>
          <button
            type="button"
            className={`vaango-group-filter-btn ${groupFilter === 'ORDER' ? 'active' : ''}`}
            onClick={() => setGroupFilter('ORDER')}
          >
            Store Orders
          </button>
          <button
            type="button"
            className={`vaango-group-filter-btn ${groupFilter === 'APPOINTMENT' ? 'active' : ''}`}
            onClick={() => setGroupFilter('APPOINTMENT')}
          >
            Appointments
          </button>
          <button
            type="button"
            className={`vaango-group-filter-btn ${groupFilter === 'SERVICE' ? 'active' : ''}`}
            onClick={() => setGroupFilter('SERVICE')}
          >
            Services & Repairs
          </button>
        </div>
      </div>

      {/* Main Stream */}
      {isLoading ? (
        <div className="vaango-orders-loading">
          <Skeleton height="120px" borderRadius="12px" />
          <Skeleton height="120px" borderRadius="12px" />
          <Skeleton height="120px" borderRadius="12px" />
        </div>
      ) : filteredRequests.length > 0 ? (
        <div className="vaango-orders-list">
          {filteredRequests.map((req) => {
            let decoded: DecodedNotes = {};
            try {
              if (req.notes) decoded = JSON.parse(req.notes);
            } catch {
              // ignore
            }

            const items = decoded.items || [];
            const reqGroup: WorkflowGroupCode = (req.workflow_group_code || 'ORDER') as WorkflowGroupCode;
            const shopName = decoded.shop_name || 'Local Store';

            return (
              <Card
                key={req.id}
                variant="default"
                padding="md"
                className="vaango-order-card"
                onClick={() => navigate(`/request/${req.id}`)}
              >
                <div className="vaango-order-card__header">
                  <div className="vaango-order-card__shop-row">
                    <div className="vaango-order-card__shop-icon">
                      {reqGroup === 'APPOINTMENT' ? (
                        <Calendar size={20} className="text-primary" />
                      ) : reqGroup === 'SERVICE' ? (
                        <Wrench size={20} className="text-primary" />
                      ) : (
                        <Store size={20} className="text-primary" />
                      )}
                    </div>
                    <div>
                      <h3 className="vaango-order-card__shop-name">{shopName}</h3>
                      <span className="vaango-order-card__ref">Ref: {req.reference_code}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {getStatusBadge(req.current_state, reqGroup)}
                    {req.current_state === 'COMPLETED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Star size={14} color="#f59e0b" fill="#f59e0b" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRatingModalRequest(req);
                        }}
                      >
                        Rate & Review
                      </Button>
                    )}
                  </div>
                </div>

                <div className="vaango-order-card__body">
                  {reqGroup === 'APPOINTMENT' ? (
                    <div className="vaango-order-card__appointment-preview">
                      <strong className="text-primary">{decoded.service_name || 'Appointment'}</strong>
                      {decoded.provider_name && <span> with {decoded.provider_name}</span>}
                      {decoded.slot_date && (
                        <div className="text-xs text-muted mt-1">
                          📅 {decoded.slot_date} • ⏰ {decoded.start_time} – {decoded.end_time}
                        </div>
                      )}
                    </div>
                  ) : reqGroup === 'SERVICE' ? (
                    <div className="vaango-order-card__service-preview">
                      <strong className="text-primary">{decoded.service_name || 'Service Request'}</strong>
                      {decoded.service_category && <span> ({decoded.service_category})</span>}
                      {decoded.confirmed_price ? (
                        <div className="text-xs text-success font-semibold mt-1">
                          {t('confirmedLabel')}: ₹{decoded.confirmed_price}
                        </div>
                      ) : decoded.price_type === 'range' ? (
                        <div className="text-xs text-accent mt-1">
                          {t('estimatedLabel')}: ₹{decoded.min_price} – ₹{decoded.max_price}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="vaango-order-card__items-preview">
                      {items.length > 0 ? (
                        <span>
                          {items
                            .map((i) => `${i.quantity}x ${i.name}${i.variant_label ? ` (${i.variant_label})` : ''}`)
                            .join(', ')}
                        </span>
                      ) : (
                        <span>Items order</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="vaango-order-card__footer">
                  <div className="vaango-order-card__time">
                    <Clock size={14} />
                    <span>
                      {new Date(req.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} at{' '}
                      {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="vaango-order-card__amount-row">
                    <span className="vaango-order-card__amount">
                      {decoded.confirmed_price
                        ? `₹${decoded.confirmed_price}`
                        : req.total_estimate
                        ? `₹${req.total_estimate}`
                        : t('priceUponConfirmation')}
                    </span>
                    <span className="vaango-order-card__track-arrow">
                      <span>{t('detailsBtn')}</span>
                      <ArrowRight size={16} />
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="vaango-orders-empty">
          <EmptyState
            icon={<ClipboardList size={48} />}
            title={statusFilter === 'all' ? t('noActivityFoundTitle') : `No ${statusFilter} orders`}
            description={
              statusFilter === 'all'
                ? t('noActivityFoundDesc')
                : `There are currently no orders in the "${statusFilter}" state.`
            }
            actionLabel={t('discoverLocalServices')}
            onAction={() => navigate('/shops')}
            secondaryActionLabel={t('restoreSampleOrders')}
            onSecondaryAction={() => {
              resetDemoData();
              setRequests(getStoredDemoRequests());
            }}
          />
        </div>
      )}

      {/* Customer Rating Modal */}
      {ratingModalRequest && (
        <RatingModal
          request={ratingModalRequest}
          isOpen={Boolean(ratingModalRequest)}
          onClose={() => setRatingModalRequest(null)}
          onSuccess={() => fetchRequests()}
        />
      )}
    </div>
  );
};
