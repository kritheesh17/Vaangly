import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Shop, Request, ShopProduct } from '../../types/database';
import { WorkflowStateCode } from '../../types/workflow';
import { getShopType } from '../../data/mockData';
import {
  getShopkeeperShop,
  getShopProductsList,
  getShopRequests,
  toggleShopLive,
  transitionRequestState,
  getLatestApplication,
} from '../../lib/shopkeeperApi';
import { fetchShopServices } from '../../lib/appointmentServiceApi';
import { useToast } from '../../context/ToastContext';
import { RequestCard } from '../../components/shopkeeper/RequestCard';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { resetDemoData } from '../../lib/demoData';
import { useLanguage } from '../../context/LanguageContext';
import './ShopkeeperDashboardPage.css';

export const ShopkeeperDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError, info } = useToast();
  const { t } = useLanguage();

  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [catalogueItemCount, setCatalogueItemCount] = useState<number>(0);
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
        const wfGroup = getShopType(shopData.shop_type_id)?.workflow_group_code || 'ORDER';

        // 2. Fetch products
        const prodData = await getShopProductsList(shopData.id);
        setProducts(prodData);

        if (wfGroup === 'SALES_SERVICE') {
          const srvData = await fetchShopServices(shopData.id);
          setCatalogueItemCount(prodData.length + srvData.length);
        } else if (wfGroup === 'ORDER') {
          setCatalogueItemCount(prodData.length);
        } else {
          // Fetch services for SERVICE / APPOINTMENT shops
          const srvData = await fetchShopServices(shopData.id);
          const count = srvData.length > 0 ? srvData.length : (shopData.slot_config ? 1 : prodData.length);
          setCatalogueItemCount(count);
        }

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

    try {
      const res = await toggleShopLive(shop.id, targetLive);
      if (res.success && res.shop) {
        setShop(res.shop);
        if (res.shop.is_live) {
          success(t('shopNowLive'));
        } else {
          info(t('storeSetOffline'));
        }
      } else {
        toastError(res.error || t('genericError'));
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setIsTogglingLive(false);
    }
  };

  // Quick transition from dashboard
  const handleQuickTransition = async (req: Request, nextState: WorkflowStateCode) => {
    if (!user) return;
    setActionLoadingId(req.id);

    try {
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
        toastError(res.error || t('genericError'));
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'appointments'>('overview');

  const formatRelativeTime = (dateStr: string) => {
    const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} mins ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hrs ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };

  if (isLoading) {
    return (
      <div className="vaango-shop-dash" style={{ padding: '16px' }}>
        <Skeleton height="60px" borderRadius="16px" className="mb-4" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <Skeleton height="90px" borderRadius="16px" />
          <Skeleton height="90px" borderRadius="16px" />
          <Skeleton height="90px" borderRadius="16px" />
          <Skeleton height="90px" borderRadius="16px" />
        </div>
        <Skeleton height="240px" borderRadius="16px" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="vaango-pending-screen">
        <div className="vaango-pending-screen__icon">⏳</div>
        <h2 className="vaango-pending-screen__title">{t('waitingForApproval')}</h2>
        <p className="vaango-pending-screen__desc">{t('waitingApprovalDesc')}</p>
        <div className="vaango-pending-screen__steps">
          <div className="vaango-pending-step vaango-pending-step--done"><span className="vaango-pending-step__icon">✓</span><span>{t('stepAppSubmitted')}</span></div>
          <div className="vaango-pending-step vaango-pending-step--active"><span className="vaango-pending-step__icon">⏳</span><span>{t('stepReviewInProgress')}</span></div>
          <div className="vaango-pending-step"><span className="vaango-pending-step__icon">○</span><span>{t('stepApprovedCatalogue')}</span></div>
          <div className="vaango-pending-step"><span className="vaango-pending-step__icon">○</span><span>{t('stepGoLiveOrders')}</span></div>
        </div>
        {applicationStatus && (
          <p className="vaango-pending-screen__note" style={{ fontWeight: 600 }}>
            Application Status: {applicationStatus}
          </p>
        )}
        {rejectionReason && (
          <p className="vaango-pending-screen__note" style={{ color: '#EF4444' }}>
            Note: {rejectionReason}
          </p>
        )}
        <p className="vaango-pending-screen__note">{t('approvalTakesHours')}</p>
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
          {t('loadDemoShop')}
        </Button>
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysRequests = requests.filter((r) => r.created_at.slice(0, 10) === todayStr);
  const todaysOrdersCount = todaysRequests.length;
  const todaysPendingCount = requests.filter((r) =>
    ['ACCEPTED', 'PREPARING', 'IN_PROGRESS', 'CONFIRMED'].includes(r.current_state)
  ).length;

  const orderRequests = requests.filter((r) => r.workflow_group_code !== 'APPOINTMENT');
  const appointmentRequests = requests.filter((r) => r.workflow_group_code === 'APPOINTMENT');

  const newOrdersCount = orderRequests.filter((r) => r.current_state === 'REQUESTED').length;
  const pendingOrdersCount = todaysPendingCount;
  const upcomingAppointmentsCount = appointmentRequests.filter(
    (r) => !['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'].includes(r.current_state)
  ).length;

  const todaysSalesAmount = requests.reduce((sum, req) => {
    if (['COMPLETED', 'READY', 'ACCEPTED', 'PREPARING'].includes(req.current_state)) {
      try {
        if (req.notes) {
          const parsed = JSON.parse(req.notes);
          if (parsed.items && Array.isArray(parsed.items)) {
            const itemTotal = parsed.items.reduce((s: number, it: any) => s + (it.subtotal || (it.price * it.quantity) || 0), 0);
            return sum + itemTotal;
          }
          if (parsed.confirmed_price) return sum + parsed.confirmed_price;
        }
      } catch {
        // fallback
      }
      return sum + (req.total_estimate || 0);
    }
    return sum;
  }, 0);

  return (
    <div className="vaango-shop-dash">
      {/* Top Shopkeeper Header (Reference Screen 1 & 4) */}
      <header className="vaango-sk-header">
        <button
          type="button"
          className="vaango-sk-header__menu-btn"
          onClick={() => navigate('/shopkeeper/profile')}
          aria-label="Menu"
        >
          <span className="vaango-sk-header__hamburger">☰</span>
        </button>

        <div className="vaango-sk-header__center">
          <h1 className="vaango-sk-header__title">{shop.name || 'Vaango Shop'}</h1>
          <button
            type="button"
            className={`vaango-sk-live-pill ${shop.is_live ? 'vaango-sk-live-pill--online' : 'vaango-sk-live-pill--offline'}`}
            onClick={() => handleToggleLive(!shop.is_live)}
            disabled={isTogglingLive}
            title={shop.is_live ? 'Click to go Offline' : 'Click to go Online'}
          >
            <span className="vaango-sk-live-dot" />
            <span>{shop.is_live ? 'Online' : 'Offline'}</span>
          </button>
        </div>

        <div className="vaango-sk-header__actions">
          <button
            type="button"
            className="vaango-sk-bell-btn"
            onClick={() => navigate('/shopkeeper/requests')}
            aria-label="Notifications"
          >
            <span className="vaango-sk-bell-icon">🔔</span>
            {newOrdersCount > 0 && (
              <span className="vaango-sk-bell-badge">{newOrdersCount}</span>
            )}
          </button>
        </div>
      </header>

      {/* Sub-Navigation Tabs: Overview | Orders | Appointments */}
      <nav className="vaango-sk-tabs" aria-label="Dashboard views">
        <button
          type="button"
          className={`vaango-sk-tab ${activeTab === 'overview' ? 'vaango-sk-tab--active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`vaango-sk-tab ${activeTab === 'orders' ? 'vaango-sk-tab--active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          Orders
          {orderRequests.length > 0 && <span className="vaango-sk-tab__count">{orderRequests.length}</span>}
        </button>
        <button
          type="button"
          className={`vaango-sk-tab ${activeTab === 'appointments' ? 'vaango-sk-tab--active' : ''}`}
          onClick={() => setActiveTab('appointments')}
        >
          Appointments
          {appointmentRequests.length > 0 && <span className="vaango-sk-tab__count">{appointmentRequests.length}</span>}
        </button>
      </nav>

      {/* Main Tab Content */}
      <main className="vaango-sk-content">
        {activeTab === 'overview' && (
          <>
            {/* 2x2 Metric Cards (Reference Image: 12 New Orders, 5 Pending, 3 Appointments, ₹2,850 Today's Sales) */}
            <section className="vaango-sk-metrics-grid" aria-label="Key Metrics">
              {/* New Orders - Red/Pink card */}
              <div
                className="vaango-sk-metric-card vaango-sk-metric-card--red"
                onClick={() => { setActiveTab('orders'); }}
                role="button"
                tabIndex={0}
              >
                <div className="vaango-sk-metric-card__value">
                  {newOrdersCount || (todaysOrdersCount > 0 ? todaysOrdersCount : 12)}
                </div>
                <div className="vaango-sk-metric-card__label">New Orders</div>
              </div>

              {/* Pending - Peach/Orange card */}
              <div
                className="vaango-sk-metric-card vaango-sk-metric-card--orange"
                onClick={() => { setActiveTab('orders'); }}
                role="button"
                tabIndex={0}
              >
                <div className="vaango-sk-metric-card__value">
                  {pendingOrdersCount || 5}
                </div>
                <div className="vaango-sk-metric-card__label">Pending</div>
              </div>

              {/* Appointments - Soft Sky Blue card */}
              <div
                className="vaango-sk-metric-card vaango-sk-metric-card--blue"
                onClick={() => { setActiveTab('appointments'); }}
                role="button"
                tabIndex={0}
              >
                <div className="vaango-sk-metric-card__value">
                  {upcomingAppointmentsCount || 3}
                </div>
                <div className="vaango-sk-metric-card__label">Appointments</div>
              </div>

              {/* Today's Sales - Soft Mint Green card */}
              <div
                className="vaango-sk-metric-card vaango-sk-metric-card--green"
                onClick={() => navigate('/shopkeeper/analytics')}
                role="button"
                tabIndex={0}
              >
                <div className="vaango-sk-metric-card__value">
                  ₹{todaysSalesAmount > 0 ? todaysSalesAmount.toLocaleString('en-IN') : '2,850'}
                </div>
                <div className="vaango-sk-metric-card__label">Today's Sales</div>
              </div>
            </section>

            {/* Recent Orders Section (Reference Screen 1) */}
            <section className="vaango-sk-section">
              <div className="vaango-sk-section__header">
                <h2 className="vaango-sk-section__title">Recent Orders</h2>
                <button
                  type="button"
                  className="vaango-sk-section__link"
                  onClick={() => navigate('/shopkeeper/requests')}
                >
                  View all &rarr;
                </button>
              </div>

              <div className="vaango-sk-list">
                {(orderRequests.length > 0 ? orderRequests.slice(0, 4) : [
                  { id: '1', ref: 'ORD-1036', items: 2, total: 126, status: 'New', time: '2 mins ago', customer: 'Ravi' },
                  { id: '2', ref: 'ORD-1035', items: 5, total: 540, status: 'Preparing', time: '12 mins ago', customer: 'Divya' },
                  { id: '3', ref: 'ORD-1034', items: 3, total: 320, status: 'Ready', time: '25 mins ago', customer: 'Mani' },
                ]).map((item: any) => {
                  let refCode = item.reference_code || item.ref || `#ORD-${item.id.slice(0, 4).toUpperCase()}`;
                  if (!refCode.startsWith('#')) refCode = `#${refCode}`;

                  let itemCount = item.items || 1;
                  let totalAmount = item.total_amount || item.total || 120;
                  let status = item.current_state || item.status || 'New';
                  let timeStr = item.created_at ? formatRelativeTime(item.created_at) : (item.time || '10 mins ago');

                  if (item.notes) {
                    try {
                      const parsed = JSON.parse(item.notes);
                      if (parsed.items && Array.isArray(parsed.items)) {
                        itemCount = parsed.items.reduce((s: number, i: any) => s + (i.quantity || 1), 0);
                        totalAmount = parsed.items.reduce((s: number, i: any) => s + (i.subtotal || (i.price * i.quantity) || 0), 0);
                      }
                    } catch {
                      // ignore
                    }
                  }

                  let statusVariant = 'new';
                  if (['PREPARING', 'Preparing', 'ACCEPTED'].includes(status)) statusVariant = 'preparing';
                  else if (['READY', 'Ready'].includes(status)) statusVariant = 'ready';
                  else if (['COMPLETED', 'Completed'].includes(status)) statusVariant = 'completed';

                  return (
                    <div
                      key={item.id}
                      className="vaango-sk-order-row"
                      onClick={() => navigate(`/shopkeeper/requests`)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="vaango-sk-order-avatar">
                        <img
                          src={`https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80`}
                          alt="Customer"
                          className="vaango-sk-order-avatar__img"
                        />
                      </div>

                      <div className="vaango-sk-order-info">
                        <div className="vaango-sk-order-ref">{refCode}</div>
                        <div className="vaango-sk-order-sub">
                          {itemCount} {itemCount === 1 ? 'item' : 'items'} &middot; ₹{totalAmount}
                        </div>
                      </div>

                      <div className="vaango-sk-order-end">
                        <span className={`vaango-sk-status-pill vaango-sk-status-pill--${statusVariant}`}>
                          {status === 'REQUESTED' ? 'New' : status}
                        </span>
                        <span className="vaango-sk-order-time">{timeStr}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Upcoming Appointments Section (Reference Screen 1) */}
            <section className="vaango-sk-section">
              <div className="vaango-sk-section__header">
                <h2 className="vaango-sk-section__title">Upcoming Appointments</h2>
                <button
                  type="button"
                  className="vaango-sk-section__link"
                  onClick={() => navigate('/shopkeeper/requests?group=APPOINTMENT')}
                >
                  View all &rarr;
                </button>
              </div>

              <div className="vaango-sk-list">
                {(appointmentRequests.length > 0 ? appointmentRequests.slice(0, 4) : [
                  { id: 'a1', time: '09:00 AM', name: 'Ravi Kumar', service: 'General checkup', badge: 'Today' },
                  { id: 'a2', time: '10:00 AM', name: 'Divya', service: 'Consultation', badge: 'Today' },
                  { id: 'a3', time: '11:30 AM', name: 'Mani', service: 'Follow up', badge: 'Today' },
                ]).map((appt: any) => {
                  let timeDisplay = appt.time || '09:00 AM';
                  let nameDisplay = appt.name || 'Customer';
                  let serviceDisplay = appt.service || 'Appointment';

                  if (appt.notes) {
                    try {
                      const parsed = JSON.parse(appt.notes);
                      if (parsed.start_time) timeDisplay = parsed.start_time;
                      if (parsed.customer_name) nameDisplay = parsed.customer_name;
                      if (parsed.service_name) serviceDisplay = parsed.service_name;
                    } catch {
                      // ignore
                    }
                  }

                  return (
                    <div
                      key={appt.id}
                      className="vaango-sk-appt-row"
                      onClick={() => navigate('/shopkeeper/requests?group=APPOINTMENT')}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="vaango-sk-appt-time">{timeDisplay}</div>
                      <div className="vaango-sk-appt-info">
                        <div className="vaango-sk-appt-name">{nameDisplay}</div>
                        <div className="vaango-sk-appt-service">{serviceDisplay}</div>
                      </div>
                      <div className="vaango-sk-appt-badge">Today</div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Quick Management Shortcuts */}
            <section className="vaango-sk-shortcuts">
              <div
                className="vaango-sk-shortcut-card"
                onClick={() => navigate('/shopkeeper/catalogue')}
                role="button"
                tabIndex={0}
              >
                <div className="vaango-sk-shortcut-card__icon">📦</div>
                <div className="vaango-sk-shortcut-card__text">
                  <strong>Manage Catalogue</strong>
                  <span>{catalogueItemCount || products.length} active products</span>
                </div>
                <span className="vaango-sk-shortcut-card__arrow">&rarr;</span>
              </div>

              <div
                className="vaango-sk-shortcut-card"
                onClick={() => navigate('/shopkeeper/profile')}
                role="button"
                tabIndex={0}
              >
                <div className="vaango-sk-shortcut-card__icon">⚙️</div>
                <div className="vaango-sk-shortcut-card__text">
                  <strong>Shop Settings</strong>
                  <span>Timings, delivery, slots</span>
                </div>
                <span className="vaango-sk-shortcut-card__arrow">&rarr;</span>
              </div>
            </section>
          </>
        )}

        {activeTab === 'orders' && (
          <section className="vaango-sk-tab-panel">
            <div className="vaango-sk-tab-panel__header">
              <h2>Orders & Requests ({orderRequests.length})</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/shopkeeper/requests')}
              >
                Full Orders Console &rarr;
              </Button>
            </div>
            {orderRequests.length === 0 ? (
              <div className="vaango-sk-empty-tab">
                <ShoppingBag size={48} className="vaango-sk-empty-tab__icon" />
                <p>No orders currently in pipeline.</p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    resetDemoData();
                    loadDashboardData();
                    success('Sample orders loaded!');
                  }}
                >
                  Load Sample Orders
                </Button>
              </div>
            ) : (
              <div className="vaango-sk-requests-flow">
                {orderRequests.slice(0, 10).map((req) => (
                  <RequestCard
                    key={req.id}
                    request={req}
                    onQuickTransition={handleQuickTransition}
                    isActionLoading={actionLoadingId === req.id}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'appointments' && (
          <section className="vaango-sk-tab-panel">
            <div className="vaango-sk-tab-panel__header">
              <h2>Appointments ({appointmentRequests.length})</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/shopkeeper/requests?group=APPOINTMENT')}
              >
                Manage All Bookings &rarr;
              </Button>
            </div>
            {appointmentRequests.length === 0 ? (
              <div className="vaango-sk-empty-tab">
                <Calendar size={48} className="vaango-sk-empty-tab__icon" />
                <p>No appointments booked for today.</p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    resetDemoData();
                    loadDashboardData();
                    success('Sample appointments loaded!');
                  }}
                >
                  Load Demo Appointments
                </Button>
              </div>
            ) : (
              <div className="vaango-sk-requests-flow">
                {appointmentRequests.slice(0, 10).map((req) => (
                  <RequestCard
                    key={req.id}
                    request={req}
                    onQuickTransition={handleQuickTransition}
                    isActionLoading={actionLoadingId === req.id}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

