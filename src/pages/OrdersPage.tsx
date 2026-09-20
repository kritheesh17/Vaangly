import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  ArrowRight,
  Store,
  Clock,
  Calendar,
  Wrench,
  ShoppingBag,
} from 'lucide-react';
import { Request } from '../types/database';
import { WorkflowGroupCode } from '../types/workflow';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { getStoredDemoRequests, resetDemoData } from '../lib/demoData';
import './OrdersPage.css';

interface DecodedNotes {
  items?: { product_id: string; name: string; price: number; unit: string; quantity: number; subtotal: number }[];
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
type StatusFilter = 'active' | 'completed' | 'all';

export const OrdersPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<Request[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('ALL');

  useEffect(() => {
    let isMounted = true;

    async function fetchRequests() {
      if (isSupabaseConfigured && user) {
        try {
          const { data, error } = await supabase
            .from('requests')
            .select('*')
            .eq('customer_id', user.id)
            .order('created_at', { ascending: false });

          if (!error && data && isMounted) {
            setRequests(data as Request[]);
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        const stored = getStoredDemoRequests();
        if (isMounted) {
          setRequests(stored);
        }
      }
      if (isMounted) setIsLoading(false);
    }

    fetchRequests();

    const handleDataChanged = () => {
      if (!isSupabaseConfigured) {
        setRequests(getStoredDemoRequests());
      }
    };
    window.addEventListener('vaango-requests-changed', handleDataChanged);

    return () => {
      isMounted = false;
      window.removeEventListener('vaango-requests-changed', handleDataChanged);
    };
  }, [user]);

  const filteredRequests = requests.filter((req) => {
    // 1. Filter by workflow group
    const reqGroup: WorkflowGroupCode = (req.workflow_group_code || 'ORDER') as WorkflowGroupCode;
    if (groupFilter !== 'ALL' && reqGroup !== groupFilter) return false;

    // 2. Filter by status (active vs completed/terminal)
    const isCompleted = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'].includes(req.current_state);
    if (statusFilter === 'active') return !isCompleted;
    if (statusFilter === 'completed') return isCompleted;
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
            <span className="text-sm font-semibold">{t('merchantNoticeLoggedIn')}</span>
          </div>
          <button
            type="button"
            className="vaango-btn vaango-btn--primary vaango-btn--sm"
            onClick={() => navigate('/shopkeeper/requests')}
          >
            {t('goToMerchantInbox')}
          </button>
        </div>
      )}

      <div className="vaango-orders-header">
        <div>
          <h1 className="vaango-orders-title">{t('ordersHeaderTitle')}</h1>
          <p className="vaango-orders-subtitle">
            {t('ordersHeaderSubtitle')}
          </p>
        </div>

        {/* Workflow Group Filter Strip */}
        <div className="vaango-orders-group-tabs" role="tablist" aria-label="Filter by type">
          <button
            type="button"
            className={`vaango-group-pill ${groupFilter === 'ALL' ? 'vaango-group-pill--active' : ''}`}
            onClick={() => setGroupFilter('ALL')}
          >
            {t('filterAll')}
          </button>
          <button
            type="button"
            className={`vaango-group-pill ${groupFilter === 'ORDER' ? 'vaango-group-pill--active' : ''}`}
            onClick={() => setGroupFilter('ORDER')}
          >
            <ShoppingBag size={14} /> {t('navOrder')}
          </button>
          <button
            type="button"
            className={`vaango-group-pill ${groupFilter === 'APPOINTMENT' ? 'vaango-group-pill--active' : ''}`}
            onClick={() => setGroupFilter('APPOINTMENT')}
          >
            <Calendar size={14} /> {t('navAppointments')}
          </button>
          <button
            type="button"
            className={`vaango-group-pill ${groupFilter === 'SERVICE' ? 'vaango-group-pill--active' : ''}`}
            onClick={() => setGroupFilter('SERVICE')}
          >
            <Wrench size={14} /> {t('navServices')}
          </button>
        </div>

        {/* Status Tab Filters */}
        <div className="vaango-orders-tabs" role="tablist" aria-label="Filter by status">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'active'}
            className={`vaango-orders-tab ${statusFilter === 'active' ? 'vaango-orders-tab--active' : ''}`}
            onClick={() => setStatusFilter('active')}
          >
            {t('filterActive')} ({requests.filter((r) => !['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'].includes(r.current_state)).length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'completed'}
            className={`vaango-orders-tab ${statusFilter === 'completed' ? 'vaango-orders-tab--active' : ''}`}
            onClick={() => setStatusFilter('completed')}
          >
            {t('filterCompleted')} ({requests.filter((r) => ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'].includes(r.current_state)).length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'all'}
            className={`vaango-orders-tab ${statusFilter === 'all' ? 'vaango-orders-tab--active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            {t('filterAll')} ({requests.length})
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="vaango-orders-loading">
          <Skeleton height={120} />
          <Skeleton height={120} />
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

            const reqGroup = (req.workflow_group_code || 'ORDER') as WorkflowGroupCode;
            const shopName = decoded.shop_name || t('localStoreFallback');
            const items = decoded.items || [];

            return (
              <Card
                key={req.id}
                variant="default"
                padding="md"
                interactive
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
                  {getStatusBadge(req.current_state, reqGroup)}
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
                        <span>{items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</span>
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
            title={statusFilter === 'active' ? t('noActiveActivityTitle') : t('noActivityFoundTitle')}
            description={
              statusFilter === 'active'
                ? t('noActiveActivityDesc')
                : t('noActivityFoundDesc')
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
    </div>
  );
};
