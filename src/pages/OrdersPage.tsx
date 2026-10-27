import React, { useState, useEffect, useMemo } from 'react';
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
import { OrderCancellationModal } from '../components/customer/OrderCancellationModal';
import { getStoredDemoRequests } from '../lib/demoData';
import { useDebounce } from '../hooks/useDebounce';
import { SearchFilterBar } from '../components/common/SearchFilterBar';
import { PaginationControls } from '../components/common/PaginationControls';
import { CopyableText } from '../components/common/CopyableText';
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
  const [cancellationModalRequest, setCancellationModalRequest] = useState<Request | null>(null);

  // Search & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const debouncedSearch = useDebounce(searchQuery, 250);

  useEffect(() => {
    setGroupFilter(defaultGroupFilter);
  }, [defaultGroupFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, groupFilter]);

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

  // Decode helper
  const decodeNotes = (notes: string | null): DecodedNotes => {
    if (!notes) return {};
    try {
      return JSON.parse(notes);
    } catch {
      return {};
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
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

      // 3. Search query: reference code, shop name, item names, service name
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase();
        const refMatch = (req.reference_code || '').toLowerCase().includes(q);
        const idMatch = (req.id || '').toLowerCase().includes(q);
        const decoded = decodeNotes(req.notes);
        const shopMatch = (decoded.shop_name || '').toLowerCase().includes(q);
        const serviceMatch = (decoded.service_name || '').toLowerCase().includes(q);
        const itemMatch = (decoded.items || []).some((item) =>
          item.name.toLowerCase().includes(q)
        );

        if (!refMatch && !idMatch && !shopMatch && !serviceMatch && !itemMatch) {
          return false;
        }
      }

      return true;
    });
  }, [requests, groupFilter, statusFilter, debouncedSearch]);

  const totalFilteredCount = filteredRequests.length;
  const paginatedRequests = useMemo(() => {
    return filteredRequests.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredRequests, currentPage, pageSize]);

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

      {/* Modern Top Header with Back Navigation */}
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

      {/* Search and Retrieval Bar */}
      <div className="vaango-orders-search-bar mb-3">
        <SearchFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          placeholder={
            isAppointmentView
              ? 'Search by booking code, doctor, clinic, or service...'
              : 'Search by order ID (#ORD-...), shop, or item name...'
          }
          totalCount={requests.length}
          filteredCount={totalFilteredCount}
          isFiltered={Boolean(searchQuery || statusFilter !== 'all')}
          onResetFilters={() => {
            setSearchQuery('');
            setStatusFilter('all');
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Filter Tabs */}
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
      ) : paginatedRequests.length > 0 ? (
        <>
          <div className="vaango-orders-list">
            {paginatedRequests.map((req) => {
              const decoded = decodeNotes(req.notes);
              const items = decoded.items || [];
              const reqGroup: WorkflowGroupCode = (req.workflow_group_code || 'ORDER') as WorkflowGroupCode;
              const shopName = decoded.shop_name || 'Selva Super Market';
              const refCode = req.reference_code || `ORD-${req.id.slice(0, 4)}`;

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
                    <div
                      className="vaango-order-item-card__code"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <CopyableText text={refCode} label="Order reference" />
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

                  {/* Right Status Badge & Actions */}
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
                        : req.current_state === 'CANCELLED'
                        ? 'Cancelled'
                        : req.current_state}
                    </span>
                    {req.cancellation_request_status === 'pending' && (
                      <span className="vaango-order-status-badge vaango-order-status-badge--cancel-pending">
                        Cancel Pending
                      </span>
                    )}

                    <div className="vaango-order-item-card__btn-group">
                      {/* Cancel Order: Only visible when order is genuinely eligible for immediate cancellation */}
                      {((reqGroup === 'APPOINTMENT' && ['REQUESTED', 'ACCEPTED', 'CONFIRMED'].includes(req.current_state)) ||
                        (reqGroup !== 'APPOINTMENT' && req.current_state === 'REQUESTED')) &&
                        req.cancellation_request_status !== 'pending' && (
                        <button
                          type="button"
                          className="vaango-order-cancel-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCancellationModalRequest(req);
                          }}
                          aria-label={`Cancel ${reqGroup === 'APPOINTMENT' ? 'appointment' : 'order'} ${refCode}`}
                        >
                          Cancel
                        </button>
                      )}

                      {/* View Details Button */}
                      <button
                        type="button"
                        className="vaango-order-view-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/request/${req.id}`);
                        }}
                        aria-label={`View details for ${refCode}`}
                      >
                        View Order
                      </button>

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
                </div>
              );
            })}
          </div>

          <PaginationControls
            currentPage={currentPage}
            pageSize={pageSize}
            totalItems={totalFilteredCount}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            pageSizeOptions={[10, 20, 50]}
          />
        </>
      ) : (
        <div className="vaango-orders-empty">
          <EmptyState
            icon={<ClipboardList size={44} />}
            title={
              searchQuery
                ? 'No matching orders found'
                : isAppointmentView
                ? 'No appointments found'
                : 'No orders found'
            }
            description={
              searchQuery
                ? `No records found matching "${searchQuery}". Try a different keyword or clear the search.`
                : isAppointmentView
                ? 'You have not booked any appointments in this status yet.'
                : 'You have not placed any orders in this status yet.'
            }
            actionLabel={
              searchQuery
                ? 'Clear Search'
                : isAppointmentView
                ? 'Book an Appointment'
                : 'Start Shopping'
            }
            onAction={() => {
              if (searchQuery) {
                setSearchQuery('');
              } else {
                navigate(isAppointmentView ? '/shops' : '/');
              }
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

      {/* Customer Order Cancellation Modal */}
      {cancellationModalRequest && (
        <OrderCancellationModal
          request={cancellationModalRequest}
          isOpen={Boolean(cancellationModalRequest)}
          onClose={() => setCancellationModalRequest(null)}
          onSuccess={() => fetchRequests()}
        />
      )}
    </div>
  );
};
