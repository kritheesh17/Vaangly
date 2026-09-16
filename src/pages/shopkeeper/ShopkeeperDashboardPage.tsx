import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Package,
  CheckCircle,
  AlertCircle,
  Plus,
  ArrowRight,
  Sparkles,
  ShoppingBag,
  Radio,
  Calendar,
  Wrench,
  TrendingUp,
  BarChart3,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Shop, Request, ShopProduct } from '../../types/database';
import { WorkflowGroupCode, WorkflowStateCode } from '../../types/workflow';
import { MOCK_SHOP_TYPES } from '../../data/mockData';
import {
  getShopkeeperShop,
  getShopProductsList,
  getShopRequests,
  toggleShopLive,
  transitionRequestState,
  getLatestApplication,
  updateShopSubscriptionTier,
} from '../../lib/shopkeeperApi';
import { useToast } from '../../context/ToastContext';
import { ShopStatusCard } from '../../components/shopkeeper/ShopStatusCard';
import { RequestCard } from '../../components/shopkeeper/RequestCard';
import { NotificationBell } from '../../components/shopkeeper/NotificationBell';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { resetDemoData } from '../../lib/demoData';
import './ShopkeeperDashboardPage.css';

export const ShopkeeperDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError, info } = useToast();

  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [applicationStatus, setApplicationStatus] = useState<'submitted' | 'under_review' | 'approved' | 'rejected' | undefined>(undefined);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTogglingLive, setIsTogglingLive] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // 1. Fetch shop
      const shopData = await getShopkeeperShop(user.id);
      setShop(shopData);

      if (shopData) {
        // 2. Fetch products
        const prodData = await getShopProductsList(shopData.id);
        setProducts(prodData);

        // 3. Fetch requests
        const reqData = await getShopRequests(shopData.id);
        setRequests(reqData);
      } else {
        // Check for onboarding application
        const app = await getLatestApplication(user.id);
        if (app) {
          setApplicationStatus(app.status);
          setRejectionReason(app.review_notes);
        }
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadDashboardData();

    const handleUpdate = () => {
      loadDashboardData();
    };
    window.addEventListener('vaango-requests-changed', handleUpdate);
    window.addEventListener('vaango-shops-changed', handleUpdate);

    return () => {
      window.removeEventListener('vaango-requests-changed', handleUpdate);
      window.removeEventListener('vaango-shops-changed', handleUpdate);
    };
  }, [loadDashboardData]);

  // Handle Go Live Toggle
  const handleToggleLive = async (targetLive: boolean) => {
    if (!shop) return;
    setIsTogglingLive(true);

    const res = await toggleShopLive(shop.id, targetLive);
    if (res.success && res.shop) {
      setShop(res.shop);
      if (res.shop.is_live) {
        success('🎉 Your shop is now LIVE! Customers in town can discover and send pre-orders.');
      } else {
        info('Store set to Offline. Customers cannot place new orders until re-enabled.');
      }
    } else {
      toastError(res.error || 'Failed to toggle live state.');
    }
    setIsTogglingLive(false);
  };

  // Quick transition from dashboard
  const handleQuickTransition = async (req: Request, nextState: WorkflowStateCode) => {
    if (!user) return;
    setActionLoadingId(req.id);

    let note = 'Transitioned by merchant.';
    if (nextState === 'CONFIRMED') note = 'Appointment confirmed by shopkeeper.';
    if (nextState === 'ACCEPTED') note = 'Request accepted by merchant.';
    if (nextState === 'IN_PROGRESS') note = 'Work / appointment in progress.';
    if (nextState === 'READY') note = 'Order / service is ready for customer.';
    if (nextState === 'COMPLETED') note = 'Completed.';

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
      toastError(res.error || 'Failed to update request state.');
    }
    setActionLoadingId(null);
  };

  if (isLoading) {
    return (
      <div className="container vaango-shop-dash">
        <Skeleton height="160px" borderRadius="16px" className="mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Skeleton height="90px" borderRadius="12px" />
          <Skeleton height="90px" borderRadius="12px" />
          <Skeleton height="90px" borderRadius="12px" />
          <Skeleton height="90px" borderRadius="12px" />
        </div>
        <Skeleton height="280px" borderRadius="16px" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="vaango-pending-screen">
        <div className="vaango-pending-screen__icon">⏳</div>
        <h2 className="vaango-pending-screen__title">Waiting for Admin Approval</h2>
        <p className="vaango-pending-screen__desc">Your shop application has been submitted successfully. The Vaango admin will review your details and photos and notify you once approved.</p>
        <div className="vaango-pending-screen__steps">
          <div className="vaango-pending-step vaango-pending-step--done"><span className="vaango-pending-step__icon">✓</span><span>Application submitted</span></div>
          <div className="vaango-pending-step vaango-pending-step--active"><span className="vaango-pending-step__icon">⏳</span><span>Admin review in progress</span></div>
          <div className="vaango-pending-step"><span className="vaango-pending-step__icon">○</span><span>Approved - set up your catalogue</span></div>
          <div className="vaango-pending-step"><span className="vaango-pending-step__icon">○</span><span>Go live and receive orders</span></div>
        </div>
        <p className="vaango-pending-screen__note">Approval typically takes 24-48 hours. Make sure your phone number is reachable.</p>
        <Button
          variant="primary"
          size="md"
          className="mt-4"
          onClick={() => {
            resetDemoData();
            loadDashboardData();
            success('Demo live shop, catalogue & orders restored!');
          }}
        >
          Load Verified Demo Shop & Orders
        </Button>
      </div>
    );
  }

  const shopType = MOCK_SHOP_TYPES.find((t) => t.id === shop?.shop_type_id);
  const workflowGroup: WorkflowGroupCode = (shopType?.workflow_group_code || 'ORDER') as WorkflowGroupCode;

  // 1. Calculate Daily Operational Metrics (Requirement 7 - Free Shopkeeper Operations)
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysRequests = requests.filter((r) => r.created_at.slice(0, 10) === todayStr);
  const todaysOrdersCount = todaysRequests.length;
  const todaysCompletedCount = todaysRequests.filter((r) => r.current_state === 'COMPLETED').length;
  const todaysPendingCount = todaysRequests.filter((r) =>
    !['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(r.current_state)
  ).length;

  const isPro = shop?.subscription_tier === 'PRO';

  const handleToggleTier = async () => {
    if (!shop) return;
    const nextTier = shop.subscription_tier === 'PRO' ? 'FREE' : 'PRO';
    const res = await updateShopSubscriptionTier(shop.id, nextTier);
    if (res.success && res.shop) {
      setShop(res.shop);
      success(`Switched shop subscription tier to ${nextTier}`);
    } else {
      toastError(res.error || 'Failed to update subscription tier.');
    }
  };

  // 2. Calculate Active Pipeline Metrics adapted by workflow group
  const newRequests = requests.filter((r) => r.current_state === 'REQUESTED');
  const midStageRequests = requests.filter((r) =>
    workflowGroup === 'APPOINTMENT'
      ? ['CONFIRMED', 'DELAYED'].includes(r.current_state)
      : workflowGroup === 'SERVICE'
      ? ['ACCEPTED', 'IN_PROGRESS', 'DELAYED'].includes(r.current_state)
      : ['ACCEPTED', 'PREPARING', 'DELAYED'].includes(r.current_state)
  );
  const actionReadyRequests = requests.filter((r) =>
    workflowGroup === 'APPOINTMENT'
      ? r.current_state === 'IN_PROGRESS'
      : r.current_state === 'READY'
  );
  const completedOrders = requests.filter((r) => r.current_state === 'COMPLETED');

  return (
    <div className="container vaango-shop-dash">
      {/* Header Welcome Bar */}
      <div className="vaango-shop-dash__welcome">
        <div>
          <span className="vaango-shop-dash__kicker">Merchant Control Center</span>
          <h1 className="vaango-shop-dash__title">
            {shop ? shop.name : user?.full_name || 'Merchant Dashboard'}
          </h1>
        </div>

        <div className="vaango-shop-dash__header-actions">
          {shop && <NotificationBell shopId={shop.id} />}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/shopkeeper/catalogue')}
            leftIcon={
              workflowGroup === 'APPOINTMENT' ? (
                <Calendar size={16} />
              ) : workflowGroup === 'SERVICE' ? (
                <Wrench size={16} />
              ) : (
                <Plus size={16} />
              )
            }
          >
            {workflowGroup === 'APPOINTMENT'
              ? 'Manage Appointments & Services'
              : workflowGroup === 'SERVICE'
              ? 'Manage Services'
              : 'Add Product'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/shopkeeper/requests')}
            leftIcon={<ClipboardList size={16} />}
          >
            All Requests ({requests.length})
          </Button>
        </div>
      </div>

      {/* Primary Shop Status Card */}
      <div className="vaango-shop-dash__status-section">
        <ShopStatusCard
          shop={shop}
          applicationStatus={applicationStatus}
          rejectionReason={rejectionReason}
          productCount={products.length}
          onToggleLive={handleToggleLive}
          isToggling={isTogglingLive}
        />
      </div>

      {/* Daily Operational Statistics (Requirement 7: Free Shopkeeper Operations) */}
      <div className="vaango-daily-stats-section">
        <div className="vaango-daily-stats-header">
          <h3>
            <Clock size={16} /> Today's Operations ({new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })})
          </h3>
          <span className="vaango-daily-stats-sub">Free Shopkeeper Operational Metrics</span>
        </div>
        <div className="vaango-daily-stats-grid">
          <div className="vaango-daily-stat-card">
            <span className="vaango-daily-stat-card__label">Today's Orders</span>
            <span className="vaango-daily-stat-card__value">{todaysOrdersCount}</span>
            <span className="vaango-daily-stat-card__sub">Incoming today</span>
          </div>
          <div className="vaango-daily-stat-card">
            <span className="vaango-daily-stat-card__label">Today's Requests</span>
            <span className="vaango-daily-stat-card__value">{todaysOrdersCount}</span>
            <span className="vaango-daily-stat-card__sub">Total received</span>
          </div>
          <div className="vaango-daily-stat-card">
            <span className="vaango-daily-stat-card__label">Today's Pending</span>
            <span className="vaango-daily-stat-card__value" style={{ color: todaysPendingCount > 0 ? 'var(--color-primary)' : 'inherit' }}>
              {todaysPendingCount}
            </span>
            <span className="vaango-daily-stat-card__sub">Action required</span>
          </div>
          <div className="vaango-daily-stat-card">
            <span className="vaango-daily-stat-card__label">Today's Completed</span>
            <span className="vaango-daily-stat-card__value" style={{ color: 'var(--color-success)' }}>
              {todaysCompletedCount}
            </span>
            <span className="vaango-daily-stat-card__sub">Fulfilled sales</span>
          </div>
        </div>
      </div>

      {/* Paid Business Analytics Feature Entry / Teaser Banner */}
      <div className="vaango-analytics-teaser">
        <div className="vaango-analytics-teaser__left">
          <div className="vaango-analytics-teaser__icon">
            <BarChart3 size={24} />
          </div>
          <div>
            <div className="vaango-analytics-teaser__title-row">
              <h3>Business Analytics</h3>
              <Badge variant={isPro ? 'primary' : 'neutral'} size="sm">
                {isPro ? 'PRO TIER ACTIVE' : 'FREE TIER (PRO PREVIEW)'}
              </Badge>
            </div>
            <p className="vaango-analytics-teaser__desc">
              Understand revenue growth, best-selling products, customer retention, peak ordering hours, and export CSV reports.
            </p>
            <div className="vaango-analytics-teaser__features">
              <span className="vaango-analytics-pill">Revenue Trends</span>
              <span className="vaango-analytics-pill">Best Sellers</span>
              <span className="vaango-analytics-pill">Peak Hours</span>
              <span className="vaango-analytics-pill">Customer Retention</span>
              <span className="vaango-analytics-pill">CSV Reports</span>
            </div>
          </div>
        </div>
        <div className="vaango-analytics-teaser__actions">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleTier}
            title="Toggle between Free locked state and Pro unlocked state for evaluation"
          >
            {isPro ? 'Test as Free Tier' : 'Test as Pro Tier'}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => navigate('/shopkeeper/analytics')}
            leftIcon={<TrendingUp size={16} />}
          >
            {isPro ? 'Open Pro Analytics' : 'Explore Pro Analytics'}
          </Button>
        </div>
      </div>

      {shop && !shop.is_live && products.length === 0 && (
        <div className="vaango-onboarding-checklist">
          <h3>🎉 Your shop is approved! Complete setup to go live.</h3>
          <div className="vaango-checklist-steps">
            <div className="vaango-checklist-step">
              <span className="vaango-step-number">1</span>
              <div>
                <strong>{workflowGroup === 'APPOINTMENT' ? 'Add your services & pricing' : workflowGroup === 'SERVICE' ? 'Add your services & base prices' : 'Add products to your catalogue'}</strong>
                <p>{workflowGroup === 'APPOINTMENT' ? 'List the services customers can book.' : workflowGroup === 'SERVICE' ? 'List services with pricing.' : 'Add the items you sell with prices and units.'}</p>
                <Button variant="primary" size="sm" onClick={() => navigate('/shopkeeper/catalogue')}>Add {workflowGroup === 'ORDER' ? 'Products' : 'Services'} &rarr;</Button>
              </div>
            </div>
            {workflowGroup === 'APPOINTMENT' && <div className="vaango-checklist-step"><span className="vaango-step-number">2</span><div><strong>Set up your available time slots</strong><p>Configure when customers can book appointments.</p><Button variant="outline" size="sm" onClick={() => navigate('/shopkeeper/profile#slots')}>Configure Slots &rarr;</Button></div></div>}
            <div className="vaango-checklist-step"><span className="vaango-step-number">{workflowGroup === 'APPOINTMENT' ? '3' : '2'}</span><div><strong>Turn your shop LIVE</strong><p>Toggle your shop live once setup is complete.</p></div></div>
          </div>
        </div>
      )}

      {/* Urgent Action Alert: "Tell me what I need to do right now" */}
      {newRequests.length > 0 && (
        <div className="vaango-shop-dash__urgent-banner" role="alert">
          <div className="vaango-shop-dash__urgent-icon">
            <Radio size={24} className="vaango-spin-pulse" />
          </div>
          <div className="vaango-shop-dash__urgent-text">
            <strong>
              {newRequests.length} new {workflowGroup === 'APPOINTMENT' ? 'appointment' : 'customer'}{' '}
              {newRequests.length === 1 ? 'request' : 'requests'} waiting for your response!
            </strong>
            <span>Review and accept promptly to ensure customer fulfillment.</span>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/shopkeeper/requests')}
            rightIcon={<ArrowRight size={14} />}
          >
            View New Requests
          </Button>
        </div>
      )}

      {/* Operational Metrics */}
      <div className="vaango-shop-dash__metrics-grid">
        <Card
          variant="default"
          padding="md"
          className={`vaango-metric-card ${newRequests.length > 0 ? 'vaango-metric-card--alert' : ''}`}
          onClick={() => navigate('/shopkeeper/requests?tab=new')}
        >
          <div className="vaango-metric-card__header">
            <span className="vaango-metric-card__label">
              {workflowGroup === 'APPOINTMENT' ? 'New Appointments' : 'New Requests'}
            </span>
            <AlertCircle size={18} className="vaango-metric-card__icon vaango-metric-card__icon--primary" />
          </div>
          <div className="vaango-metric-card__value">{newRequests.length}</div>
          <div className="vaango-metric-card__hint">Requires acceptance</div>
        </Card>

        <Card
          variant="default"
          padding="md"
          className="vaango-metric-card"
          onClick={() => navigate('/shopkeeper/requests?tab=active')}
        >
          <div className="vaango-metric-card__header">
            <span className="vaango-metric-card__label">
              {workflowGroup === 'APPOINTMENT'
                ? 'Confirmed Slots'
                : workflowGroup === 'SERVICE'
                ? 'In Progress'
                : 'Preparing'}
            </span>
            {workflowGroup === 'APPOINTMENT' ? (
              <Calendar size={18} className="vaango-metric-card__icon vaango-metric-card__icon--accent" />
            ) : (
              <Package size={18} className="vaango-metric-card__icon vaango-metric-card__icon--accent" />
            )}
          </div>
          <div className="vaango-metric-card__value">{midStageRequests.length}</div>
          <div className="vaango-metric-card__hint">
            {workflowGroup === 'APPOINTMENT'
              ? 'Slots reserved'
              : workflowGroup === 'SERVICE'
              ? 'Work underway'
              : 'In packing/kitchen'}
          </div>
        </Card>

        <Card
          variant="default"
          padding="md"
          className="vaango-metric-card"
          onClick={() => navigate('/shopkeeper/requests?tab=ready')}
        >
          <div className="vaango-metric-card__header">
            <span className="vaango-metric-card__label">
              {workflowGroup === 'APPOINTMENT' ? 'In Progress' : 'Ready for Pickup'}
            </span>
            <CheckCircle size={18} className="vaango-metric-card__icon vaango-metric-card__icon--success" />
          </div>
          <div className="vaango-metric-card__value">{actionReadyRequests.length}</div>
          <div className="vaango-metric-card__hint">
            {workflowGroup === 'APPOINTMENT'
              ? 'Currently underway'
              : 'At counter waiting'}
          </div>
        </Card>

        <Card
          variant="default"
          padding="md"
          className="vaango-metric-card"
          onClick={() => navigate('/shopkeeper/requests?tab=completed')}
        >
          <div className="vaango-metric-card__header">
            <span className="vaango-metric-card__label">Completed</span>
            <ClipboardList size={18} className="vaango-metric-card__icon" />
          </div>
          <div className="vaango-metric-card__value">{completedOrders.length}</div>
          <div className="vaango-metric-card__hint">Fulfilled requests</div>
        </Card>
      </div>

      {/* Actionable Incoming Requests Stream */}
      <div className="vaango-shop-dash__section">
        <div className="vaango-shop-dash__section-header">
          <div>
            <h2 className="vaango-shop-dash__section-title">Active Orders Needing Attention</h2>
            <p className="vaango-shop-dash__section-subtitle">
              Prioritized list of customer pre-orders waiting to be accepted or packed.
            </p>
          </div>
          {requests.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/shopkeeper/requests')}
              rightIcon={<ArrowRight size={14} />}
            >
              See All
            </Button>
          )}
        </div>

        {requests.length === 0 ? (
          <Card variant="default" padding="lg" className="vaango-shop-dash__empty">
            <ShoppingBag size={48} className="vaango-empty-icon" />
            <h3 className="vaango-empty-title">No customer requests yet</h3>
            <p className="vaango-empty-desc">
              {shop?.is_live
                ? 'Your shop is LIVE. Customer requests will appear here in realtime as soon as they are placed.'
                : 'Turn your shop LIVE above so neighborhood customers can discover your catalogue and send pre-orders.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                resetDemoData();
                loadDashboardData();
                success('Sample orders and appointments loaded!');
              }}
            >
              Load Sample Orders & Appointments
            </Button>
          </Card>
        ) : (
          <div className="vaango-shop-dash__requests-list">
            {/* Show urgent/active first */}
            {[...newRequests, ...midStageRequests, ...actionReadyRequests].slice(0, 3).map((req) => (
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

      {/* Quick Navigation Cards */}
      <div className="vaango-shop-dash__quick-links">
        <Card
          variant="default"
          padding="md"
          className="vaango-quick-card"
          onClick={() => navigate('/shopkeeper/catalogue')}
        >
          <div className="vaango-quick-card__icon">
            <Package size={24} />
          </div>
          <div className="vaango-quick-card__content">
            <h3 className="vaango-quick-card__title">Manage Catalogue</h3>
            <p className="vaango-quick-card__desc">
              Add products, update rates, or toggle out-of-stock items ({products.length} products).
            </p>
          </div>
          <ArrowRight size={18} className="vaango-quick-card__arrow" />
        </Card>

        <Card
          variant="default"
          padding="md"
          className="vaango-quick-card"
          onClick={() => navigate('/shopkeeper/profile')}
        >
          <div className="vaango-quick-card__icon vaango-quick-card__icon--amber">
            <Sparkles size={24} />
          </div>
          <div className="vaango-quick-card__content">
            <h3 className="vaango-quick-card__title">Shop Settings & Delivery</h3>
            <p className="vaango-quick-card__desc">
              Configure delivery fee, direct UPI ID, operating hours & storefront GPS.
            </p>
          </div>
          <ArrowRight size={18} className="vaango-quick-card__arrow" />
        </Card>
      </div>
    </div>
  );
};
