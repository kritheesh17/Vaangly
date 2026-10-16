import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  Calendar,
  AlertCircle,
  RefreshCw,
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
import { getISTDateString } from '../../lib/analyticsApi';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isTogglingLive, setIsTogglingLive] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(null);

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
      setLoadError('Failed to load dashboard data. Please check your network connection and retry.');
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

  const todayIST = getISTDateString(new Date());

  // Segregate Order pipeline vs Appointment bookings
  const orderRequests = requests.filter((r) => r.workflow_group_code !== 'APPOINTMENT');
  const appointmentRequests = requests.filter((r) => r.workflow_group_code === 'APPOINTMENT');

  // 1. New Orders: Real incoming orders strictly in REQUESTED state
  const newOrdersCount = orderRequests.filter((r) => r.current_state === 'REQUESTED').length;

  // 2. Pending: Real orders currently in prep/fulfillment pipeline (ACCEPTED, PREPARING, IN_PROGRESS, READY, CONFIRMED)
  // Non-overlapping with New Orders (REQUESTED) to avoid double counting
  const pendingOrdersCount = orderRequests.filter((r) =>
    ['ACCEPTED', 'PREPARING', 'IN_PROGRESS', 'READY', 'CONFIRMED'].includes(r.current_state)
  ).length;

  // 3. Appointments: Active/upcoming appointments not yet completed, cancelled, or rejected
  const upcomingAppointmentsCount = appointmentRequests.filter(
    (r) => !['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW', 'EXPIRED'].includes(r.current_state)
  ).length;

  // 4. Today's Sales: Strictly completed transactions on today's local business day in Asia/Kolkata
  const completedTodaysRequests = requests.filter((r) => {
    return r.current_state === 'COMPLETED' && getISTDateString(r.created_at) === todayIST;
  });
  const todaysSalesAmount = completedTodaysRequests.reduce((sum, req) => {
    return sum + (Number(req.total_amount ?? req.total_estimate) || 0);
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
        {loadError && (
          <div className="vaango-sk-error-banner" role="alert">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={18} />
              <span>{loadError}</span>
            </div>
            <Button variant="outline" size="sm" onClick={loadDashboardData} leftIcon={<RefreshCw size={14} />}>
              Retry
            </Button>
          </div>
        )}

        {activeTab === 'overview' && (
          <>
            {/* 2x2 Metric Cards (Strictly authentic database metrics) */}
            <section className="vaango-sk-metrics-grid" aria-label="Key Metrics">
              {/* New Orders - Red/Pink card */}
              <div
                className="vaango-sk-metric-card vaango-sk-metric-card--red"
                onClick={() => { setActiveTab('orders'); }}
                role="button"
                tabIndex={0}
              >
                <div className="vaango-sk-metric-card__value">
                  {newOrdersCount}
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
                  {pendingOrdersCount}
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
                  {upcomingAppointmentsCount}
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
                  ₹{todaysSalesAmount.toLocaleString('en-IN')}
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
                {orderRequests.length === 0 ? (
                  <div className="vaango-sk-empty-inline">
                    <ShoppingBag size={28} className="vaango-sk-empty-inline__icon" />
                    <p className="vaango-sk-empty-inline__text">No recent orders recorded.</p>
                    <span className="vaango-sk-empty-inline__subtext">
                      New customer orders will appear here automatically.
                    </span>
                  </div>
                ) : (
                  orderRequests.slice(0, 4).map((item: Request) => {
                    let refCode = item.reference_code || `#ORD-${item.id.slice(0, 4).toUpperCase()}`;
                    if (!refCode.startsWith('#')) refCode = `#${refCode}`;

                    let itemCount = 1;
                    let totalAmount = Number(item.total_amount ?? item.total_estimate ?? 0);
                    let status = item.current_state;
                    let timeStr = item.created_at ? formatRelativeTime(item.created_at) : 'Just now';
                    let customerDisplayName = 'Customer';

                    if (item.notes) {
                      try {
                        const parsed = JSON.parse(item.notes);
                        if (parsed.items && Array.isArray(parsed.items)) {
                          itemCount = parsed.items.reduce((s: number, i: any) => s + (i.quantity || 1), 0);
                          const itemsSum = parsed.items.reduce((s: number, i: any) => s + (i.subtotal || (i.price * i.quantity) || 0), 0);
                          if (!totalAmount) totalAmount = itemsSum;
                        }
                        if (parsed.customer_name) customerDisplayName = parsed.customer_name;
                      } catch {
                        // ignore
                      }
                    }
                    if (item.customer_phone && customerDisplayName === 'Customer') {
                      customerDisplayName = `Cust (${item.customer_phone.slice(-4)})`;
                    }

                    const initialLetter = customerDisplayName.charAt(0).toUpperCase();

                    let statusVariant = 'new';
                    if (['PREPARING', 'ACCEPTED', 'IN_PROGRESS', 'CONFIRMED'].includes(status)) statusVariant = 'preparing';
                    else if (['READY'].includes(status)) statusVariant = 'ready';
                    else if (['COMPLETED'].includes(status)) statusVariant = 'completed';

                    return (
                      <div
                        key={item.id}
                        className="vaango-sk-order-row"
                        onClick={() => navigate(`/shopkeeper/requests`)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="vaango-sk-order-avatar">
                          <span className="vaango-sk-order-avatar__initial">{initialLetter}</span>
                        </div>

                        <div className="vaango-sk-order-info">
                          <div className="vaango-sk-order-ref">{refCode}</div>
                          <div className="vaango-sk-order-sub">
                            {itemCount} {itemCount === 1 ? 'item' : 'items'} &middot; ₹{totalAmount.toLocaleString('en-IN')}
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
                  })
                )}
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
                {appointmentRequests.length === 0 ? (
                  <div className="vaango-sk-empty-inline">
                    <Calendar size={28} className="vaango-sk-empty-inline__icon" />
                    <div>
                      <p className="vaango-sk-empty-inline__title">No upcoming appointments</p>
                      <p className="vaango-sk-empty-inline__desc">Bookings and consultations will appear here once scheduled.</p>
                    </div>
                  </div>
                ) : (
                  appointmentRequests.slice(0, 4).map((appt: any) => {
                    let timeDisplay = '—';
                    let nameDisplay = appt.customer_name || 'Customer';
                    let serviceDisplay = appt.service_name || 'Appointment';

                    if (appt.scheduled_for) {
                      try {
                        timeDisplay = new Date(appt.scheduled_for).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                      } catch {
                        // ignore
                      }
                    } else if (appt.created_at) {
                      try {
                        timeDisplay = new Date(appt.created_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                      } catch {
                        // ignore
                      }
                    }

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

                    const apptDateStr = appt.scheduled_for
                      ? getISTDateString(appt.scheduled_for)
                      : (appt.created_at ? getISTDateString(appt.created_at) : '');
                    const dateBadge = apptDateStr === todayIST ? 'Today' : (apptDateStr || 'Upcoming');

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
                        <div className="vaango-sk-appt-badge">{dateBadge}</div>
                      </div>
                    );
                  })
                )}
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
                  variant="outline"
                  size="sm"
                  onClick={loadDashboardData}
                >
                  <RefreshCw size={14} className="mr-1" />
                  Refresh Orders
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
                  variant="outline"
                  size="sm"
                  onClick={loadDashboardData}
                >
                  <RefreshCw size={14} className="mr-1" />
                  Refresh Bookings
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

