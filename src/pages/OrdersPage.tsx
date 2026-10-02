import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  ArrowLeft,
  Store,
  Wrench,
  Star,
  ShoppingBag,
} from 'lucide-react';
import { Request } from '../types/database';
import { WorkflowGroupCode } from '../types/workflow';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { RatingModal } from '../components/customer/RatingModal';
import { getStoredDemoRequests } from '../lib/demoData';
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
  pickup_at?: string | null;
}

type GroupFilter = 'ALL' | 'ORDER' | 'APPOINTMENT' | 'SERVICE';
type StatusFilter = 'all' | 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled';

interface OrdersPageProps {
  defaultGroupFilter?: GroupFilter;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({ defaultGroupFilter = 'ALL' }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<Request[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>(defaultGroupFilter);
  const [ratingModalRequest, setRatingModalRequest] = useState<Request | null>(null);

  useEffect(() => {
    setGroupFilter(defaultGroupFilter);
  }, [defaultGroupFilter]);

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

  const isAppointmentView = groupFilter === 'APPOINTMENT';

  return (
    <div className="container vaango-orders-page">
      {user?.role === 'shopkeeper' && (
        <div className="vaango-merchant-notice-banner mb-3">
          <div className="flex items-center gap-2">
            <Store size={18} className="text-primary" />
            <span>You are signed in as a shopkeeper. Viewing personal customer orders.</span>
          </div>
          <button
            type="button"
            className="vaango-btn vaango-btn--secondary vaango-btn--sm"
            onClick={() => navigate('/shopkeeper/requests')}
          >
            Shop Management
          </button>
        </div>
      )}

      {/* Modern Top Header with Back Navigation (Reference Image 4) */}
      <div className="vaango-orders-topbar">
        <button
          type="button"
          className="vaango-back-circle-btn"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="vaango-orders-topbar__title">
          {isAppointmentView ? (t('navAppointments') || 'My Appointments') : (t('navOrders') || 'My Orders')}
        </h1>
      </div>

      {/* Filter Tabs matching Reference Image 4 */}
      <div className="vaango-orders-filter-pills" role="tablist">
        {isAppointmentView ? (
          <>
            <button
              type="button"
              className={`vaango-filter-pill ${statusFilter === 'all' || statusFilter === 'processing' ? 'vaango-filter-pill--active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'processing' ? 'all' : 'processing')}
            >
              Upcoming
            </button>
            <button
              type="button"
              className={`vaango-filter-pill ${statusFilter === 'completed' ? 'vaango-filter-pill--active' : ''}`}
              onClick={() => setStatusFilter('completed')}
            >
              Past
            </button>
            <button
              type="button"
              className={`vaango-filter-pill ${statusFilter === 'cancelled' ? 'vaango-filter-pill--active' : ''}`}
              onClick={() => setStatusFilter('cancelled')}
            >
              Cancelled
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`vaango-filter-pill ${statusFilter === 'all' ? 'vaango-filter-pill--active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`vaango-filter-pill ${statusFilter === 'processing' ? 'vaango-filter-pill--active' : ''}`}
              onClick={() => setStatusFilter('processing')}
            >
              Preparing
            </button>
            <button
              type="button"
              className={`vaango-filter-pill ${statusFilter === 'ready' ? 'vaango-filter-pill--active' : ''}`}
              onClick={() => setStatusFilter('ready')}
            >
              Ready
            </button>
            <button
              type="button"
              className={`vaango-filter-pill ${statusFilter === 'completed' ? 'vaango-filter-pill--active' : ''}`}
              onClick={() => setStatusFilter('completed')}
            >
              Completed
            </button>
          </>
        )}
      </div>

      {/* Main Orders / Appointments List */}
      {isLoading ? (
        <div className="vaango-orders-loading">
          <Skeleton height="80px" borderRadius="14px" />
          <Skeleton height="80px" borderRadius="14px" />
          <Skeleton height="80px" borderRadius="14px" />
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
            const shopName = decoded.shop_name || 'Selva Super Market';

            return (
              <div
                key={req.id}
                className="vaango-order-item-card"
                onClick={() => navigate(`/request/${req.id}`)}
              >
                {/* Thumbnail Icon */}
                <div className="vaango-order-item-card__thumb">
                  {reqGroup === 'APPOINTMENT' ? (
                    <Store size={22} className="text-primary" />
                  ) : reqGroup === 'SERVICE' ? (
                    <Wrench size={22} className="text-primary" />
                  ) : (
                    <ShoppingBag size={22} className="text-primary" />
                  )}
                </div>

                {/* Info Center */}
                <div className="vaango-order-item-card__info">
                  <div className="vaango-order-item-card__code">
                    #{req.reference_code || `ORD-${req.id.slice(0, 4)}`}
                  </div>
                  <div className="vaango-order-item-card__shop">
                    {shopName}
                  </div>
                  <div className="vaango-order-item-card__meta">
                    {reqGroup === 'APPOINTMENT' ? (
                      <span>{decoded.service_name || 'Consultation'} · {decoded.slot_date || 'Today'}</span>
                    ) : (
                      <span>
                        {items.length > 0 ? `${items.length} ${items.length === 1 ? 'item' : 'items'} · ` : '1 item · '}
                        ₹{req.total_estimate || decoded.confirmed_price || 126}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Status Badge */}
                <div className="vaango-order-item-card__status-col">
                  <span className={`vaango-order-status-badge vaango-order-status-badge--${req.current_state.toLowerCase()}`}>
                    {req.current_state === 'REQUESTED'
                      ? 'Pending'
                      : req.current_state === 'PREPARING' || req.current_state === 'IN_PROGRESS' || req.current_state === 'ACCEPTED'
                      ? 'Preparing'
                      : req.current_state === 'READY'
                      ? 'Ready'
                      : req.current_state === 'CONFIRMED'
                      ? 'Confirmed'
                      : req.current_state === 'COMPLETED'
                      ? 'Completed'
                      : req.current_state}
                  </span>
                  {req.current_state === 'COMPLETED' && (
                    <button
                      type="button"
                      className="vaango-order-rate-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRatingModalRequest(req);
                      }}
                    >
                      <Star size={11} fill="#EAB308" color="#EAB308" />
                      <span>Rate</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="vaango-orders-empty">
          <EmptyState
            icon={<ClipboardList size={44} />}
            title={isAppointmentView ? 'No appointments found' : 'No orders found'}
            description={
              isAppointmentView
                ? 'You have not booked any appointments in this status yet.'
                : 'You have not placed any orders in this status yet.'
            }
            actionLabel={isAppointmentView ? 'Book an Appointment' : 'Start Shopping'}
            onAction={() => navigate(isAppointmentView ? '/shops' : '/')}
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
