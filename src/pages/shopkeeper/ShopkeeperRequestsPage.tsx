import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowLeft,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Request, Shop } from '../../types/database';
import { WorkflowGroupCode, WorkflowStateCode } from '../../types/workflow';
import { MOCK_SHOP_TYPES } from '../../data/mockData';
import { getShopkeeperShop, getShopRequests, transitionRequestState } from '../../lib/shopkeeperApi';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { RequestCard } from '../../components/shopkeeper/RequestCard';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import './ShopkeeperRequestsPage.css';

type RequestFilterTab = 'all' | 'new' | 'active' | 'ready' | 'completed' | 'cancelled';

export const ShopkeeperRequestsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { success, error: toastError } = useToast();

  const [shop, setShop] = useState<Shop | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const activeTab = (searchParams.get('tab') as RequestFilterTab) || 'all';

  const loadRequests = useCallback(async () => {
    if (!user) return;
    try {
      const userShop = await getShopkeeperShop(user.id);
      setShop(userShop);

      if (userShop) {
        const reqList = await getShopRequests(userShop.id);
        setRequests(reqList);
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
        () => {
          loadRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
  const shopType = MOCK_SHOP_TYPES.find((t) => t.id === shop?.shop_type_id);
  const workflowGroup: WorkflowGroupCode = (shopType?.workflow_group_code || 'ORDER') as WorkflowGroupCode;

  const handleQuickTransition = async (req: Request, nextState: WorkflowStateCode) => {
    if (!user) return;
    setActionLoadingId(req.id);

    let note = 'Transitioned by merchant.';
    if (nextState === 'CONFIRMED') note = 'Appointment confirmed by shopkeeper.';
    if (nextState === 'ACCEPTED') note = 'Request accepted by merchant.';
    if (nextState === 'IN_PROGRESS') note = 'Work / appointment in progress.';
    if (nextState === 'READY') note = 'Order / service is ready for customer.';
    if (nextState === 'COMPLETED') note = 'Completed.';

    try {
      const res = await transitionRequestState(
        req.id,
        req.current_state,
        nextState,
        user.id,
        note
      );

      if (res.success && res.request) {
        setRequests((prev) => prev.map((r) => (r.id === req.id ? res.request! : r)));
        success(`Request #${req.reference_code} updated to ${nextState}`);
      } else {
        toastError(res.error || t('genericError'));
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter requests by tab and search
  const filteredRequests = requests.filter((req) => {
    // Tab filter
    if (activeTab === 'new' && req.current_state !== 'REQUESTED') return false;
    if (activeTab === 'active' && !['ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'DELAYED'].includes(req.current_state)) return false;
    if (activeTab === 'ready' && !['READY', 'IN_PROGRESS'].includes(req.current_state)) return false;
    if (activeTab === 'completed' && req.current_state !== 'COMPLETED') return false;
    if (activeTab === 'cancelled' && !['REJECTED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(req.current_state)) return false;

    // Search filter (by reference code or customer notes)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const refMatch = req.reference_code.toLowerCase().includes(q);
      const notesMatch = (req.notes || '').toLowerCase().includes(q);
      return refMatch || notesMatch;
    }

    return true;
  });

  const counts = {
    all: requests.length,
    new: requests.filter((r) => r.current_state === 'REQUESTED').length,
    active: requests.filter((r) => ['ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'DELAYED'].includes(r.current_state)).length,
    ready: requests.filter((r) => ['READY', 'IN_PROGRESS'].includes(r.current_state)).length,
    completed: requests.filter((r) => r.current_state === 'COMPLETED').length,
    cancelled: requests.filter((r) => ['REJECTED', 'CANCELLED', 'NO_SHOW'].includes(r.current_state)).length,
  };

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
            <h1 className="vaango-shop-reqs__title">Customer Requests Inbox</h1>
            <p className="vaango-shop-reqs__subtitle">
              Manage incoming pre-orders and fulfill customer counter requests.
            </p>
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

        {/* Search Input */}
        <div className="vaango-shop-reqs__search-wrap">
          <Input
            type="search"
            placeholder="Search by Order ID (e.g. ORD-9421) or customer notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={18} />}
          />
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
            All ({counts.all})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'new'}
            className={`vaango-req-tab ${activeTab === 'new' ? 'vaango-req-tab--active' : ''}`}
            onClick={() => handleTabChange('new')}
          >
            New ({counts.new})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'active'}
            className={`vaango-req-tab ${activeTab === 'active' ? 'vaango-req-tab--active' : ''}`}
            onClick={() => handleTabChange('active')}
          >
            Active ({counts.active})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ready'}
            className={`vaango-req-tab ${activeTab === 'ready' ? 'vaango-req-tab--active' : ''}`}
            onClick={() => handleTabChange('ready')}
          >
            {workflowGroup === 'APPOINTMENT' ? 'In Progress' : 'Ready'} ({counts.ready})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'completed'}
            className={`vaango-req-tab ${activeTab === 'completed' ? 'vaango-req-tab--active' : ''}`}
            onClick={() => handleTabChange('completed')}
          >
            Completed ({counts.completed})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'cancelled'}
            className={`vaango-req-tab ${activeTab === 'cancelled' ? 'vaango-req-tab--active' : ''}`}
            onClick={() => handleTabChange('cancelled')}
          >
            Cancelled ({counts.cancelled})
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
        ) : filteredRequests.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag size={48} />}
            title="No orders found"
            description={
              activeTab === 'new'
                ? 'No new pending requests right now. As customers place orders, they will pop up here in realtime.'
                : 'No orders matching the selected filter.'
            }
          />
        ) : (
          <div className="vaango-shop-reqs__list">
            {filteredRequests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                onQuickTransition={handleQuickTransition}
                isActionLoading={actionLoadingId === req.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
