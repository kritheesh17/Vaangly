import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Request, Shop } from '../../types/database';
import { WorkflowGroupCode, WorkflowStateCode } from '../../types/workflow';
import { getShopType } from '../../data/mockData';
import { getShopkeeperShop, getShopRequests, transitionRequestState } from '../../lib/shopkeeperApi';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { RequestCard } from '../../components/shopkeeper/RequestCard';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Textarea';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { NotificationBadge } from '../../components/ui/NotificationBadge';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { sortRequestsChronologicalDesc, mergeAndSortRequests } from '../../lib/orderPickupUtils';
import { useDebounce } from '../../hooks/useDebounce';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { PaginationControls } from '../../components/common/PaginationControls';
import { ActionErrorBanner } from '../../components/ui/ActionErrorBanner';
import './ShopkeeperRequestsPage.css';

type RequestFilterTab = 'all' | 'new' | 'active' | 'ready' | 'completed' | 'cancelled';

export const ShopkeeperRequestsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { success } = useToast();

  const [shop, setShop] = useState<Shop | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Retrieval filters and pagination
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount_desc'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const debouncedSearch = useDebounce(searchQuery, 250);

  // Rejection modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingReq, setRejectingReq] = useState<Request | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const activeTab = (searchParams.get('tab') as RequestFilterTab) || 'all';

  const loadRequests = useCallback(async () => {
    if (!user) return;
    try {
      const userShop = await getShopkeeperShop(user.id);
      setShop(userShop);

      if (userShop) {
        const reqList = await getShopRequests(userShop.id);
        setRequests(sortRequestsChronologicalDesc(reqList));
      }
    } catch (err) {
      console.error('Error fetching shop requests:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, activeTab, paymentFilter, sortBy]);

  // Subscribe to Supabase Realtime updates on requests for this shop
  useEffect(() => {
    if (!isSupabaseConfigured || !shop) return;

    const channel = supabase.channel(`shop_requests_${shop.id}`);
    (channel as any)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'requests',
          filter: `shop_id=eq.${shop.id}`,
        },
        (payload: any) => {
          if ((payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') && payload.new) {
            setRequests((prev) => mergeAndSortRequests(prev, payload.new as Request));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setRequests((prev) => prev.filter((r) => r.id !== payload.old.id));
          } else {
            loadRequests();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shop, loadRequests]);

  // Listen for local mock / demo events for immediate updates without polling
  useEffect(() => {
    const handleLocalUpdate = (e: Event) => {
      const customEvt = e as CustomEvent<{ newRequest?: Request }>;
      const newReq = customEvt.detail?.newRequest;
      if (newReq && shop && newReq.shop_id === shop.id) {
        setRequests((prev) => mergeAndSortRequests(prev, newReq));
      } else {
        loadRequests();
      }
    };

    window.addEventListener('vaango-requests-changed', handleLocalUpdate);
    return () => {
      window.removeEventListener('vaango-requests-changed', handleLocalUpdate);
    };
  }, [shop, loadRequests]);

  const handleTabChange = (tab: RequestFilterTab) => {
    if (tab === 'all') {
      searchParams.delete('tab');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ tab });
    }
  };

  const { t } = useLanguage();
  const shopType = getShopType(shop?.shop_type_id);
  const workflowGroup: WorkflowGroupCode = (shopType?.workflow_group_code || 'ORDER') as WorkflowGroupCode;

  const handleQuickTransition = async (req: Request, nextState: WorkflowStateCode) => {
    if (!user) return;
    setActionLoadingId(req.id);

    try {
      const res = await transitionRequestState(req.id, req.current_state, nextState, user.id);
      if (res.success && res.request) {
        setRequests((prev) => mergeAndSortRequests(prev, res.request!));
        success(`Order #${req.reference_code} moved to ${t(`status_${nextState}`)}`);
      } else {
        console.error('Error transitioning order state:', res.error);
      }
    } catch (err) {
      console.error('Failed to update request state:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenReject = (req: Request) => {
    setRejectingReq(req);
    setRejectionReason('');
    setRejectError(null);
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectingReq || !user) return;
    if (!rejectionReason.trim()) {
      setRejectError('Please specify a rejection reason for customer transparency.');
      return;
    }

    setIsRejecting(true);
    setRejectError(null);
    try {
      const res = await transitionRequestState(
        rejectingReq.id,
        rejectingReq.current_state,
        'REJECTED' as WorkflowStateCode,
        user.id,
        rejectionReason.trim()
      );

      if (res.success && res.request) {
        setRequests((prev) => mergeAndSortRequests(prev, res.request!));
        success(`Order #${rejectingReq.reference_code} has been rejected.`);
        setRejectModalOpen(false);
        setRejectingReq(null);
      } else {
        setRejectError(res.error || 'Failed to reject order.');
      }
    } catch (err: unknown) {
      setRejectError(err instanceof Error ? err.message : 'Error rejecting order.');
    } finally {
      setIsRejecting(false);
    }
  };

  const activeGroup = searchParams.get('group') as WorkflowGroupCode | null;

  // Filter requests by group, tab, payment, and search
  const groupFilteredRequests = useMemo(() => {
    return requests.filter((req) => {
      if (activeGroup) {
        if (req.workflow_group_code !== activeGroup) return false;
      }
      return true;
    });
  }, [requests, activeGroup]);

  const filteredRequests = useMemo(() => {
    return groupFilteredRequests.filter((req) => {
      // Tab filter
      if (activeTab === 'new' && req.current_state !== 'REQUESTED') return false;
      if (activeTab === 'active' && !['ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'DELAYED'].includes(req.current_state)) return false;
      if (activeTab === 'ready' && !['READY', 'IN_PROGRESS'].includes(req.current_state)) return false;
      if (activeTab === 'completed' && req.current_state !== 'COMPLETED') return false;
      if (activeTab === 'cancelled' && !['REJECTED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(req.current_state)) return false;

      // Payment filter
      if (paymentFilter === 'paid') {
        const isPaid = Boolean(
          req.customer_paid ||
          req.payment_status === 'PAYMENT_VERIFIED' ||
          req.payment_status === 'paid'
        );
        if (!isPaid) return false;
      }
      if (paymentFilter === 'unpaid') {
        const isPaid = Boolean(
          req.customer_paid ||
          req.payment_status === 'PAYMENT_VERIFIED' ||
          req.payment_status === 'paid'
        );
        if (isPaid) return false;
      }

      // Search filter (by reference code, customer phone, notes, partial ID)
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase();
        const refMatch = (req.reference_code || '').toLowerCase().includes(q);
        const phoneMatch = (req.customer_phone || '').toLowerCase().includes(q);
        const notesMatch = (req.notes || '').toLowerCase().includes(q);
        const idMatch = (req.id || '').toLowerCase().includes(q);
        return refMatch || phoneMatch || notesMatch || idMatch;
      }

      return true;
    });
  }, [groupFilteredRequests, activeTab, paymentFilter, debouncedSearch]);

  // Sort orders
  const sortedRequests = useMemo(() => {
    const list = [...filteredRequests];
    if (sortBy === 'oldest') {
      return list.sort((a, b) => (new Date(a.created_at).getTime() || 0) - (new Date(b.created_at).getTime() || 0));
    }
    if (sortBy === 'amount_desc') {
      return list.sort((a, b) => (b.total_estimate || b.total_amount || 0) - (a.total_estimate || a.total_amount || 0));
    }
    return sortRequestsChronologicalDesc(list);
  }, [filteredRequests, sortBy]);

  const totalRequestsCount = sortedRequests.length;
  const paginatedRequests = useMemo(() => {
    return sortedRequests.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sortedRequests, currentPage, pageSize]);

  const counts = {
    all: groupFilteredRequests.length,
    new: groupFilteredRequests.filter((r) => r.current_state === 'REQUESTED').length,
    active: groupFilteredRequests.filter((r) => ['ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'DELAYED'].includes(r.current_state)).length,
    ready: groupFilteredRequests.filter((r) => ['READY', 'IN_PROGRESS'].includes(r.current_state)).length,
    completed: groupFilteredRequests.filter((r) => r.current_state === 'COMPLETED').length,
    cancelled: groupFilteredRequests.filter((r) => ['REJECTED', 'CANCELLED', 'NO_SHOW'].includes(r.current_state)).length,
  };

  const pageTitle =
    activeGroup === 'APPOINTMENT'
      ? 'Appointment Bookings'
      : activeGroup === 'ORDER'
      ? 'Customer Orders Inbox'
      : 'Customer Requests Inbox';

  const pageSubtitle =
    activeGroup === 'APPOINTMENT'
      ? 'Manage customer appointment confirmations, doctor schedules, and slot tokens.'
      : 'Manage incoming pre-orders and fulfill customer counter requests.';

  return (
    <div className="container vaango-shop-reqs">
      {/* Header */}
      <div className="vaango-shop-reqs__header">
        <button
          type="button"
          className="vaango-back-btn"
          onClick={() => navigate('/shopkeeper/dashboard')}
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={18} />
          <span>Dashboard</span>
        </button>

        <div className="vaango-shop-reqs__title-row">
          <div>
            <h1 className="vaango-shop-reqs__title">{pageTitle}</h1>
            <p className="vaango-shop-reqs__subtitle">{pageSubtitle}</p>
          </div>

          <button
            type="button"
            className="vaango-refresh-btn"
            onClick={() => {
              setIsRefreshing(true);
              loadRequests();
            }}
            disabled={isRefreshing}
            aria-label="Refresh requests"
          >
            <RefreshCw size={16} className={isRefreshing ? 'vaango-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Search & Composite Filters */}
        <div className="vaango-shop-reqs__search-wrap mb-3">
          <SearchFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            placeholder="Search by order ID (ORD-9421), phone, items, or notes..."
            totalCount={groupFilteredRequests.length}
            filteredCount={totalRequestsCount}
            isFiltered={Boolean(searchQuery || activeTab !== 'all' || paymentFilter !== 'all' || sortBy !== 'newest')}
            onResetFilters={() => {
              setSearchQuery('');
              setPaymentFilter('all');
              setSortBy('newest');
              handleTabChange('all');
              setCurrentPage(1);
            }}
          >
            <select
              className="vaango-admin-select"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as any)}
              aria-label="Filter by payment status"
            >
              <option value="all">Payment: All</option>
              <option value="paid">Paid & Verified</option>
              <option value="unpaid">Unpaid / Pending</option>
            </select>

            <select
              className="vaango-admin-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort orders"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="amount_desc">Sort: Amount (High–Low)</option>
            </select>
          </SearchFilterBar>
        </div>

        {/* Filter Tabs */}
        <div className="vaango-shop-reqs__tabs" role="tablist" aria-label="Filter orders by stage">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`vaango-req-tab ${activeTab === 'all' ? 'vaango-req-tab--active' : ''}`}
            onClick={() => handleTabChange('all')}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'new'}
            className={`vaango-req-tab ${activeTab === 'new' ? 'vaango-req-tab--active' : ''}`}
            onClick={() => handleTabChange('new')}
          >
            <span>{workflowGroup === 'APPOINTMENT' ? 'New Appointments' : 'New Requests'}</span>
            <NotificationBadge count={counts.new} size="sm" />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'active'}
            className={`vaango-req-tab ${activeTab === 'active' ? 'vaango-req-tab--active' : ''}`}
            onClick={() => handleTabChange('active')}
          >
            <span>Active</span>
            <NotificationBadge count={counts.active} size="sm" />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ready'}
            className={`vaango-req-tab ${activeTab === 'ready' ? 'vaango-req-tab--active' : ''}`}
            onClick={() => handleTabChange('ready')}
          >
            <span>{workflowGroup === 'APPOINTMENT' ? 'In Progress' : 'Ready'}</span>
            <NotificationBadge count={counts.ready} size="sm" />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'completed'}
            className={`vaango-req-tab ${activeTab === 'completed' ? 'vaango-req-tab--active' : ''}`}
            onClick={() => handleTabChange('completed')}
          >
            Completed
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'cancelled'}
            className={`vaango-req-tab ${activeTab === 'cancelled' ? 'vaango-req-tab--active' : ''}`}
            onClick={() => handleTabChange('cancelled')}
          >
            Cancelled
          </button>
        </div>
      </div>

      {/* Requests Stream */}
      <div className="vaango-shop-reqs__content">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton height="130px" borderRadius="12px" />
            <Skeleton height="130px" borderRadius="12px" />
            <Skeleton height="130px" borderRadius="12px" />
          </div>
        ) : paginatedRequests.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag size={48} />}
            title="No orders found"
            description={
              searchQuery || paymentFilter !== 'all'
                ? 'No orders match your search or filter criteria. Try resetting.'
                : activeTab === 'new'
                ? 'No new pending requests right now. As customers place orders, they will pop up here in realtime.'
                : 'No orders matching the selected filter.'
            }
          />
        ) : (
          <>
            <div className="vaango-shop-reqs__list">
              {paginatedRequests.map((req) => (
                <RequestCard
                  key={req.id}
                  request={req}
                  onQuickTransition={handleQuickTransition}
                  onReject={handleOpenReject}
                  isActionLoading={actionLoadingId === req.id}
                />
              ))}
            </div>

            <PaginationControls
              currentPage={currentPage}
              pageSize={pageSize}
              totalItems={totalRequestsCount}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              pageSizeOptions={[10, 20, 50]}
            />
          </>
        )}
      </div>

      {/* Reject Reason Confirmation Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title={`Reject Order #${rejectingReq?.reference_code || ''}?`}
        maxWidth="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Please provide a mandatory reason for rejecting this order so the customer is notified appropriately.
          </p>

          <div>
            <label htmlFor="reject-reason-input" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
              Rejection Reason <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <Textarea
              id="reject-reason-input"
              placeholder="e.g. Out of stock, item unavailable, shop closing early, etc."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              required
            />
          </div>

          {rejectError && (
            <ActionErrorBanner
              message={rejectError}
              action={{ label: 'Retry', onClick: handleConfirmReject }}
              onDismiss={() => setRejectError(null)}
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isRejecting}
              onClick={handleConfirmReject}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
