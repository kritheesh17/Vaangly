import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store,
  ShoppingBag,
  Calendar,
  CreditCard,
  AlertTriangle,
  ArrowRight,
  Clock,
  ShieldCheck,
  RefreshCw,
  MapPin,
  Layers,
  CheckCircle2,
  BarChart3,
  ExternalLink,
} from 'lucide-react';
import {
  fetchOperationalMetrics,
  fetchAdminAuditLogsList,
  fetchAdminShops,
  fetchAdminApplications,
  fetchSubscriptionPayments,
  DEMO_REQUESTS_KEY,
} from '../../lib/adminApi';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getISTDateString, getCalendarDaysList } from '../../lib/analyticsApi';
import {
  Shop,
  Request,
  ShopApplication,
  SubscriptionPayment,
  AdminAuditLog,
} from '../../types/database';
import { OperationalMetrics } from '../../types/admin';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { NotificationBadge } from '../../components/ui/NotificationBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useSectionUnreadCounts } from '../../hooks/useSectionUnreadCounts';
import { useLanguage } from '../../context/LanguageContext';
import './AdminDashboardPage.css';

export type ReportingPeriod = '7d' | '30d' | '90d' | 'all';

interface DailyTrendPoint {
  date: string;
  label: string;
  fullDateLabel: string;
  orderCount: number;
  appointmentCount: number;
  totalVolume: number;
  revenue: number;
}

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { pendingApplications: pendingAppsUnread, pendingCatalogue } = useSectionUnreadCounts();

  // Core Data State
  const [metrics, setMetrics] = useState<OperationalMetrics | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [applications, setApplications] = useState<ShopApplication[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);

  // UI & Filter State
  const [period, setPeriod] = useState<ReportingPeriod>('30d');
  const [chartMetric, setChartMetric] = useState<'volume' | 'revenue'>('volume');
  const [selectedTrendIdx, setSelectedTrendIdx] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

  // -------------------------------------------------------------
  // DATA FETCHING
  // -------------------------------------------------------------
  const loadDashboardData = useCallback(async () => {
    try {
      // 1. Fetch metrics, shops, apps, payments, audit logs in parallel
      const [metricsData, shopsData, appsData, paymentsData, logsData] = await Promise.all([
        fetchOperationalMetrics(),
        fetchAdminShops(),
        fetchAdminApplications(),
        fetchSubscriptionPayments(),
        fetchAdminAuditLogsList(8),
      ]);

      setMetrics(metricsData);
      setShops(shopsData);
      setApplications(appsData);
      setPayments(paymentsData);
      setAuditLogs(logsData);

      // 2. Fetch requests (with fallback to demo storage)
      let reqList: Request[] = [];
      if (isSupabaseConfigured) {
        try {
          const { data: reqData, error: reqErr } = await supabase
            .from('requests')
            .select('*')
            .order('created_at', { ascending: false });
          if (!reqErr && reqData) {
            reqList = reqData;
          }
        } catch (err) {
          console.error('Failed to load requests from Supabase:', err);
        }
      }

      if (reqList.length === 0) {
        try {
          const raw = localStorage.getItem(DEMO_REQUESTS_KEY);
          if (raw) reqList = JSON.parse(raw);
        } catch {
          // ignore parsing error
        }
      }
      setRequests(reqList);

      setLastRefreshedAt(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Kolkata',
        })
      );
    } catch (err) {
      console.error('Error loading admin dashboard data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDashboardData();
  };

  // -------------------------------------------------------------
  // DATE RANGE CALCULATIONS (Asia/Kolkata)
  // -------------------------------------------------------------
  const { startDateStr, endDateStr, periodLabel } = useMemo(() => {
    const now = new Date();
    const end = getISTDateString(now);

    if (period === 'all') {
      return { startDateStr: '', endDateStr: end, periodLabel: 'All-time' };
    }

    const daysCount = period === '7d' ? 6 : period === '30d' ? 29 : 89;
    const startObj = new Date(now.getTime() - daysCount * 24 * 60 * 60 * 1000);
    const start = getISTDateString(startObj);

    const labels: Record<ReportingPeriod, string> = {
      '7d': 'Last 7 days',
      '30d': 'Last 30 days',
      '90d': 'Last 90 days',
      all: 'All-time',
    };

    return { startDateStr: start, endDateStr: end, periodLabel: labels[period] };
  }, [period]);

  // -------------------------------------------------------------
  // PERIOD-FILTERED DATASETS
  // -------------------------------------------------------------
  const periodRequests = useMemo(() => {
    if (period === 'all' || !startDateStr) return requests;
    return requests.filter((r) => {
      const d = getISTDateString(r.created_at);
      return d >= startDateStr && d <= endDateStr;
    });
  }, [requests, period, startDateStr, endDateStr]);

  const periodPayments = useMemo(() => {
    if (period === 'all' || !startDateStr) return payments;
    return payments.filter((p) => {
      const d = getISTDateString(p.payment_date || p.created_at);
      return d >= startDateStr && d <= endDateStr;
    });
  }, [payments, period, startDateStr, endDateStr]);

  // -------------------------------------------------------------
  // KPI CALCULATIONS (100% Real Data)
  // -------------------------------------------------------------
  // 1. Shops (All-time platform inventory)
  const totalShopsCount = shops.length;
  const liveShopsCount = useMemo(
    () => shops.filter((s) => s.status === 'active' && s.is_live).length,
    [shops]
  );
  const approvedShopsCount = useMemo(
    () => shops.filter((s) => s.status === 'active' || s.status === 'verified').length,
    [shops]
  );
  const suspendedShopsCount = useMemo(
    () => shops.filter((s) => s.status === 'suspended').length,
    [shops]
  );

  // 2. Orders (Filtered by selected period)
  const periodOrders = useMemo(
    () => periodRequests.filter((r) => r.workflow_group_code === 'ORDER'),
    [periodRequests]
  );
  const completedOrdersCount = useMemo(
    () => periodOrders.filter((r) => r.current_state === 'COMPLETED').length,
    [periodOrders]
  );
  const activeOrdersCount = useMemo(
    () =>
      periodOrders.filter((r) =>
        ['REQUESTED', 'ACCEPTED', 'CONFIRMED', 'PREPARING', 'IN_PROGRESS', 'READY'].includes(
          r.current_state
        )
      ).length,
    [periodOrders]
  );

  // 3. Appointments (Filtered by selected period)
  const periodAppointments = useMemo(
    () => periodRequests.filter((r) => r.workflow_group_code === 'APPOINTMENT'),
    [periodRequests]
  );
  const completedAppointmentsCount = useMemo(
    () => periodAppointments.filter((r) => r.current_state === 'COMPLETED').length,
    [periodAppointments]
  );
  const confirmedAppointmentsCount = useMemo(
    () =>
      periodAppointments.filter((r) =>
        ['CONFIRMED', 'IN_PROGRESS', 'READY'].includes(r.current_state)
      ).length,
    [periodAppointments]
  );

  // 4. Platform Revenue (Merchant subscription fees strictly settled in period)
  const settledSubscriptionRevenue = useMemo(() => {
    return periodPayments.reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);
  }, [periodPayments]);
  const subscriptionPaymentsCount = periodPayments.length;

  // -------------------------------------------------------------
  // REQUEST PIPELINE STATUS DISTRIBUTION
  // -------------------------------------------------------------
  const totalRequestsCount = periodRequests.length;
  const completedRequestsCount = useMemo(
    () => periodRequests.filter((r) => r.current_state === 'COMPLETED').length,
    [periodRequests]
  );
  const inProgressRequestsCount = useMemo(
    () =>
      periodRequests.filter((r) =>
        ['REQUESTED', 'ACCEPTED', 'CONFIRMED', 'PREPARING', 'IN_PROGRESS', 'READY'].includes(
          r.current_state
        )
      ).length,
    [periodRequests]
  );
  const cancelledRequestsCount = useMemo(
    () =>
      periodRequests.filter((r) =>
        ['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(r.current_state)
      ).length,
    [periodRequests]
  );

  const pctCompleted =
    totalRequestsCount > 0 ? Math.round((completedRequestsCount / totalRequestsCount) * 100) : 0;
  const pctInProgress =
    totalRequestsCount > 0 ? Math.round((inProgressRequestsCount / totalRequestsCount) * 100) : 0;
  const pctCancelled =
    totalRequestsCount > 0 ? Math.round((cancelledRequestsCount / totalRequestsCount) * 100) : 0;

  // -------------------------------------------------------------
  // DAILY TREND POINTS FOR SVG VISUALIZATION
  // -------------------------------------------------------------
  const trendPoints: DailyTrendPoint[] = useMemo(() => {
    if (period === 'all') {
      // Build points based on dates present in periodRequests and periodPayments
      const dateSet = new Set<string>();
      periodRequests.forEach((r) => dateSet.add(getISTDateString(r.created_at)));
      periodPayments.forEach((p) =>
        dateSet.add(getISTDateString(p.payment_date || p.created_at))
      );
      const sortedDates = Array.from(dateSet).sort();
      if (sortedDates.length === 0) return [];

      return sortedDates.map((dateStr) => {
        const [y, m, d] = dateStr.split('-');
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        const oCount = periodOrders.filter(
          (r) => getISTDateString(r.created_at) === dateStr
        ).length;
        const aCount = periodAppointments.filter(
          (r) => getISTDateString(r.created_at) === dateStr
        ).length;
        const rev = periodPayments
          .filter((p) => getISTDateString(p.payment_date || p.created_at) === dateStr)
          .reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);

        return {
          date: dateStr,
          label: dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          fullDateLabel: dateObj.toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          orderCount: oCount,
          appointmentCount: aCount,
          totalVolume: oCount + aCount,
          revenue: rev,
        };
      });
    }

    if (!startDateStr || !endDateStr) return [];
    const calendarDays = getCalendarDaysList(startDateStr, endDateStr);

    return calendarDays.map((dateStr) => {
      const [y, m, d] = dateStr.split('-');
      const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
      const oCount = periodOrders.filter(
        (r) => getISTDateString(r.created_at) === dateStr
      ).length;
      const aCount = periodAppointments.filter(
        (r) => getISTDateString(r.created_at) === dateStr
      ).length;
      const rev = periodPayments
        .filter((p) => getISTDateString(p.payment_date || p.created_at) === dateStr)
        .reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);

      return {
        date: dateStr,
        label: dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        fullDateLabel: dateObj.toLocaleDateString('en-IN', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        orderCount: oCount,
        appointmentCount: aCount,
        totalVolume: oCount + aCount,
        revenue: rev,
      };
    });
  }, [period, startDateStr, endDateStr, periodRequests, periodPayments, periodOrders, periodAppointments]);

  // -------------------------------------------------------------
  // PENDING APPLICATIONS LIST
  // -------------------------------------------------------------
  const pendingApplicationsList = useMemo(() => {
    return applications
      .filter((app) => app.status === 'submitted' || app.status === 'under_review')
      .slice(0, 5);
  }, [applications]);

  // -------------------------------------------------------------
  // RENDER LOADING STATE
  // -------------------------------------------------------------
  if (isLoading && !metrics) {
    return (
      <div className="vaango-admin-dash">
        <div className="vaango-admin-header-skeleton">
          <Skeleton height={32} width={220} style={{ marginBottom: '8px' }} />
          <Skeleton height={18} width={360} />
        </div>
        <div className="vaango-admin-kpi-grid">
          <Skeleton height={120} />
          <Skeleton height={120} />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
        <div className="vaango-admin-analytics-grid">
          <Skeleton height={280} />
          <Skeleton height={280} />
        </div>
        <div className="vaango-admin-ops-grid">
          <Skeleton height={260} />
          <Skeleton height={260} />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER SVG CHART
  // -------------------------------------------------------------
  const renderTrendChart = () => {
    if (trendPoints.length === 0) {
      return (
        <div className="vaango-admin-chart-empty">
          <BarChart3 size={36} className="vaango-admin-chart-empty-icon" />
          <p>No activity recorded for this period.</p>
        </div>
      );
    }

    const svgWidth = 640;
    const svgHeight = 190;
    const paddingX = 28;
    const paddingY = 24;

    const values = trendPoints.map((p) => (chartMetric === 'volume' ? p.totalVolume : p.revenue));
    const maxValue = Math.max(...values, chartMetric === 'volume' ? 4 : 500);

    const stepX = (svgWidth - paddingX * 2) / Math.max(trendPoints.length - 1, 1);
    const colStep = (svgWidth - paddingX * 2) / Math.max(trendPoints.length, 1);
    const barWidth = Math.max(3, Math.min(22, colStep - 4));

    const selectedPoint =
      selectedTrendIdx !== null && selectedTrendIdx >= 0 && selectedTrendIdx < trendPoints.length
        ? trendPoints[selectedTrendIdx]
        : null;

    return (
      <div className="vaango-admin-chart-wrap">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="vaango-admin-svg-chart"
          preserveAspectRatio="none"
          role="img"
          aria-label="Admin trends chart"
        >
          {/* Subtle horizontal grid lines */}
          <line
            x1={paddingX}
            y1={svgHeight - paddingY}
            x2={svgWidth - paddingX}
            y2={svgHeight - paddingY}
            stroke="var(--color-border)"
            strokeWidth="1"
          />
          <line
            x1={paddingX}
            y1={svgHeight / 2}
            x2={svgWidth - paddingX}
            y2={svgHeight / 2}
            stroke="var(--color-border)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.6"
          />
          <line
            x1={paddingX}
            y1={paddingY}
            x2={svgWidth - paddingX}
            y2={paddingY}
            stroke="var(--color-border)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.6"
          />

          {/* Daily bars */}
          {trendPoints.map((p, idx) => {
            const val = chartMetric === 'volume' ? p.totalVolume : p.revenue;
            const x = paddingX + idx * stepX - barWidth / 2;
            const barHeight = (val / maxValue) * (svgHeight - paddingY * 2);
            const y = svgHeight - paddingY - barHeight;
            const isSelected = selectedTrendIdx === idx;

            return (
              <g key={p.date}>
                {/* Invisible hover / touch area */}
                <rect
                  x={Math.max(0, paddingX + idx * colStep - colStep / 2)}
                  y={0}
                  width={colStep}
                  height={svgHeight}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedTrendIdx(isSelected ? null : idx)}
                  onMouseEnter={() => setSelectedTrendIdx(idx)}
                />

                {/* Visible Data Bar */}
                <rect
                  x={Math.max(paddingX, x)}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, val > 0 ? 3 : 1)}
                  rx={3}
                  fill={
                    val > 0
                      ? isSelected
                        ? 'var(--color-primary-hover)'
                        : 'var(--color-primary)'
                      : 'var(--color-border)'
                  }
                  opacity={val > 0 ? (isSelected ? 1 : 0.85) : 0.35}
                  stroke={isSelected ? 'var(--color-text-primary)' : 'none'}
                  strokeWidth={isSelected ? 1.5 : 0}
                  style={{ pointerEvents: 'none', transition: 'fill 0.15s ease' }}
                >
                  <title>
                    {chartMetric === 'volume'
                      ? `${p.label}: ${p.orderCount} order(s), ${p.appointmentCount} appointment(s)`
                      : `${p.label}: ₹${p.revenue.toLocaleString('en-IN')}`}
                  </title>
                </rect>
              </g>
            );
          })}
        </svg>

        {/* X-Axis Date Range Labels */}
        <div className="vaango-admin-chart-xaxis">
          <span>{trendPoints[0]?.label}</span>
          {trendPoints.length > 2 && (
            <span>{trendPoints[Math.floor(trendPoints.length / 2)]?.label}</span>
          )}
          <span>{trendPoints[trendPoints.length - 1]?.label}</span>
        </div>

        {/* Selected Data Tooltip Card */}
        {selectedPoint && (
          <div className="vaango-admin-chart-tooltip">
            <div className="vaango-admin-chart-tooltip__header">
              <span className="vaango-admin-chart-tooltip__date">{selectedPoint.fullDateLabel}</span>
              <button
                type="button"
                className="vaango-admin-chart-tooltip__close"
                onClick={() => setSelectedTrendIdx(null)}
                aria-label="Close tooltip"
              >
                ×
              </button>
            </div>
            <div className="vaango-admin-chart-tooltip__body">
              <div className="vaango-admin-chart-tooltip__stat">
                <span className="vaango-admin-chart-tooltip__stat-label">Retail Orders:</span>
                <strong className="vaango-admin-chart-tooltip__stat-val">{selectedPoint.orderCount}</strong>
              </div>
              <div className="vaango-admin-chart-tooltip__stat">
                <span className="vaango-admin-chart-tooltip__stat-label">Appointments:</span>
                <strong className="vaango-admin-chart-tooltip__stat-val">{selectedPoint.appointmentCount}</strong>
              </div>
              <div className="vaango-admin-chart-tooltip__stat">
                <span className="vaango-admin-chart-tooltip__stat-label">Subscription UPI:</span>
                <strong className="vaango-admin-chart-tooltip__stat-val vaango-admin-chart-tooltip__stat-val--primary">
                  ₹{selectedPoint.revenue.toLocaleString('en-IN')}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="vaango-admin-dash">
      {/* --------------------------------------------------------- */}
      {/* 1. HEADER & REPORTING CONTROLS */}
      {/* --------------------------------------------------------- */}
      <div className="vaango-admin-dash__header">
        <div>
          <h1 className="vaango-admin-dash__title">Platform Operations</h1>
          <p className="vaango-admin-dash__subtitle">
            Merchant onboarding, order fulfillment pipeline & subscription revenue
          </p>
        </div>

        <div className="vaango-admin-header-controls">
          <label htmlFor="admin-period-select" className="sr-only">
            Reporting Period
          </label>
          <select
            id="admin-period-select"
            className="vaango-admin-date-filter"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as ReportingPeriod);
              setSelectedTrendIdx(null);
            }}
            aria-label="Select reporting period"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All-time</option>
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isRefreshing}
            leftIcon={<RefreshCw size={14} className={isRefreshing ? 'vaango-spin' : ''} />}
          >
            {t('refreshData')}
          </Button>

          {lastRefreshedAt && (
            <span className="vaango-admin-last-sync" title="Last synced in Asia/Kolkata">
              Synced {lastRefreshedAt}
            </span>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------- */}
      {/* 2. OPERATIONAL ACTION BANNER (Conditional) */}
      {/* --------------------------------------------------------- */}
      {metrics && (metrics.pendingApplications > 0 || metrics.overdueSubscriptions > 0) && (
        <div className="vaango-admin-alert-banner" role="alert">
          <div className="vaango-admin-alert-banner__content">
            <AlertTriangle size={20} className="vaango-admin-alert-banner__icon" />
            <div>
              <strong>Action Required by Operations Personnel</strong>
              <p>
                {metrics.pendingApplications > 0 &&
                  `${metrics.pendingApplications} merchant application(s) awaiting KYC and storefront verification. `}
                {metrics.overdueSubscriptions > 0 &&
                  `${metrics.overdueSubscriptions} merchant subscription(s) overdue for manual UPI renewal.`}
              </p>
            </div>
          </div>
          <div className="vaango-admin-alert-banner__actions">
            {metrics.pendingApplications > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/admin/applications?status=submitted')}
              >
                <span>Review Applications</span>
                <NotificationBadge count={pendingAppsUnread} size="sm" />
              </Button>
            )}
            {metrics.overdueSubscriptions > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin/subscriptions?status=OVERDUE')}
              >
                View Overdue
              </Button>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* 3. REAL KPI ROW (100% Real Data, Zero Fake Badges) */}
      {/* --------------------------------------------------------- */}
      <div className="vaango-admin-kpi-grid">
        {/* KPI 1: Total Shops */}
        <Card
          variant="default"
          padding="md"
          className="vaango-admin-kpi-card"
          onClick={() => navigate('/admin/shops')}
        >
          <div className="vaango-admin-kpi-header">
            <span className="vaango-admin-kpi-label">Total Shops</span>
            <div className="vaango-admin-kpi-icon vaango-admin-kpi-icon--emerald">
              <Store size={18} />
            </div>
          </div>
          <div className="vaango-admin-kpi-val">{totalShopsCount}</div>
          <div className="vaango-admin-kpi-sub">
            <span className="vaango-admin-stat-group">
              <span className="vaango-admin-kpi-pill vaango-admin-kpi-pill--live">
                {liveShopsCount} live
              </span>
            </span>
            <span className="vaango-admin-kpi-meta">
              {approvedShopsCount} approved • {suspendedShopsCount} suspended
            </span>
          </div>
        </Card>

        {/* KPI 2: Total Orders */}
        <Card
          variant="default"
          padding="md"
          className="vaango-admin-kpi-card"
          onClick={() => navigate('/admin/shops')}
        >
          <div className="vaango-admin-kpi-header">
            <span className="vaango-admin-kpi-label">Retail Orders</span>
            <div className="vaango-admin-kpi-icon vaango-admin-kpi-icon--blue">
              <ShoppingBag size={18} />
            </div>
          </div>
          <div className="vaango-admin-kpi-val">{periodOrders.length}</div>
          <div className="vaango-admin-kpi-sub">
            <span className="vaango-admin-kpi-pill vaango-admin-kpi-pill--neutral">
              {periodLabel}
            </span>
            <span className="vaango-admin-kpi-meta">
              {completedOrdersCount} completed • {activeOrdersCount} in-flight
            </span>
          </div>
        </Card>

        {/* KPI 3: Appointments */}
        <Card
          variant="default"
          padding="md"
          className="vaango-admin-kpi-card"
          onClick={() => navigate('/admin/shops')}
        >
          <div className="vaango-admin-kpi-header">
            <span className="vaango-admin-kpi-label">Appointments</span>
            <div className="vaango-admin-kpi-icon vaango-admin-kpi-icon--amber">
              <Calendar size={18} />
            </div>
          </div>
          <div className="vaango-admin-kpi-val">{periodAppointments.length}</div>
          <div className="vaango-admin-kpi-sub">
            <span className="vaango-admin-kpi-pill vaango-admin-kpi-pill--neutral">
              {periodLabel}
            </span>
            <span className="vaango-admin-kpi-meta">
              {completedAppointmentsCount} completed • {confirmedAppointmentsCount} confirmed
            </span>
          </div>
        </Card>

        {/* KPI 4: Platform Subscription Revenue */}
        <Card
          variant="default"
          padding="md"
          className="vaango-admin-kpi-card"
          onClick={() => navigate('/admin/subscriptions')}
        >
          <div className="vaango-admin-kpi-header">
            <span className="vaango-admin-kpi-label">Platform Revenue</span>
            <div className="vaango-admin-kpi-icon vaango-admin-kpi-icon--purple">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="vaango-admin-kpi-val">
            ₹{settledSubscriptionRevenue.toLocaleString('en-IN')}
          </div>
          <div className="vaango-admin-kpi-sub">
            <span className="vaango-admin-kpi-pill vaango-admin-kpi-pill--neutral">
              {periodLabel}
            </span>
            <span className="vaango-admin-kpi-meta">
              {subscriptionPaymentsCount} subscription receipt(s) • 0% order fee
            </span>
          </div>
        </Card>
      </div>

      {/* --------------------------------------------------------- */}
      {/* 4. BALANCED ANALYTICS SECTION */}
      {/* --------------------------------------------------------- */}
      <div className="vaango-admin-analytics-grid">
        {/* Panel 1: Activity Trends Chart */}
        <Card variant="default" padding="md" className="vaango-admin-chart-card">
          <div className="vaango-admin-chart-card__header">
            <div>
              <h2 className="vaango-admin-panel-title">Activity Trends</h2>
              <p className="vaango-admin-panel-subtitle">
                Daily transaction volume across {periodLabel.toLowerCase()}
              </p>
            </div>
            <div className="vaango-admin-toggle-group">
              <button
                type="button"
                className={`vaango-admin-toggle-btn ${
                  chartMetric === 'volume' ? 'vaango-admin-toggle-btn--active' : ''
                }`}
                onClick={() => {
                  setChartMetric('volume');
                  setSelectedTrendIdx(null);
                }}
              >
                Volume
              </button>
              <button
                type="button"
                className={`vaango-admin-toggle-btn ${
                  chartMetric === 'revenue' ? 'vaango-admin-toggle-btn--active' : ''
                }`}
                onClick={() => {
                  setChartMetric('revenue');
                  setSelectedTrendIdx(null);
                }}
              >
                Revenue (₹)
              </button>
            </div>
          </div>

          <div className="vaango-admin-chart-card__body">{renderTrendChart()}</div>
        </Card>

        {/* Panel 2: Order Pipeline Status Distribution */}
        <Card variant="default" padding="md" className="vaango-admin-pipeline-card">
          <div className="vaango-admin-chart-card__header">
            <div>
              <h2 className="vaango-admin-panel-title">Request Status Breakdown</h2>
              <p className="vaango-admin-panel-subtitle">
                Fulfillment health for {totalRequestsCount} request(s) in {periodLabel.toLowerCase()}
              </p>
            </div>
          </div>

          {totalRequestsCount === 0 ? (
            <div className="vaango-admin-chart-empty">
              <CheckCircle2 size={36} className="vaango-admin-chart-empty-icon" />
              <p>No orders or appointments recorded in this period.</p>
            </div>
          ) : (
            <div className="vaango-admin-pipeline-body">
              {/* Segmented Progress Bar */}
              <div
                className="vaango-admin-segmented-bar"
                role="progressbar"
                aria-valuenow={pctCompleted}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Fulfillment status distribution"
              >
                {pctCompleted > 0 && (
                  <div
                    className="vaango-admin-segment vaango-admin-segment--completed"
                    style={{ width: `${pctCompleted}%` }}
                    title={`Completed: ${pctCompleted}%`}
                  />
                )}
                {pctInProgress > 0 && (
                  <div
                    className="vaango-admin-segment vaango-admin-segment--active"
                    style={{ width: `${pctInProgress}%` }}
                    title={`In Progress: ${pctInProgress}%`}
                  />
                )}
                {pctCancelled > 0 && (
                  <div
                    className="vaango-admin-segment vaango-admin-segment--cancelled"
                    style={{ width: `${pctCancelled}%` }}
                    title={`Cancelled / Rejected: ${pctCancelled}%`}
                  />
                )}
              </div>

              {/* Status Metric Breakdown Rows */}
              <div className="vaango-admin-status-breakdown">
                <div className="vaango-admin-status-row">
                  <div className="vaango-admin-status-col">
                    <span className="vaango-admin-dot vaango-admin-dot--completed" />
                    <span className="vaango-admin-status-name">Completed</span>
                  </div>
                  <div className="vaango-admin-status-numbers">
                    <strong>{completedRequestsCount}</strong>
                    <span className="vaango-admin-status-pct">({pctCompleted}%)</span>
                  </div>
                </div>

                <div className="vaango-admin-status-row">
                  <div className="vaango-admin-status-col">
                    <span className="vaango-admin-dot vaango-admin-dot--active" />
                    <span className="vaango-admin-status-name">In Progress / Ready</span>
                  </div>
                  <div className="vaango-admin-status-numbers">
                    <strong>{inProgressRequestsCount}</strong>
                    <span className="vaango-admin-status-pct">({pctInProgress}%)</span>
                  </div>
                </div>

                <div className="vaango-admin-status-row">
                  <div className="vaango-admin-status-col">
                    <span className="vaango-admin-dot vaango-admin-dot--cancelled" />
                    <span className="vaango-admin-status-name">Cancelled / Rejected</span>
                  </div>
                  <div className="vaango-admin-status-numbers">
                    <strong>{cancelledRequestsCount}</strong>
                    <span className="vaango-admin-status-pct">({pctCancelled}%)</span>
                  </div>
                </div>
              </div>

              {/* Cancellation Detail Footer Note */}
              <div className="vaango-admin-cancellation-summary">
                <span>Platform Cancellation Rate: </span>
                <strong
                  style={{
                    color:
                      pctCancelled > 20
                        ? 'var(--color-error)'
                        : 'var(--color-text-primary)',
                  }}
                >
                  {pctCancelled}%
                </strong>
                <span className="vaango-admin-text-muted">
                  {' '}
                  ({cancelledRequestsCount} of {totalRequestsCount} requests)
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* --------------------------------------------------------- */}
      {/* 5. BALANCED OPERATIONS SECTION */}
      {/* --------------------------------------------------------- */}
      <div className="vaango-admin-ops-grid">
        {/* Panel 1: Pending Merchant Onboarding Applications */}
        <Card variant="default" padding="md" className="vaango-admin-ops-card">
          <div className="vaango-admin-ops-card__header">
            <div>
              <div className="vaango-admin-ops-card__title-row">
                <h2 className="vaango-admin-panel-title">Pending Applications</h2>
                {pendingApplicationsList.length > 0 && (
                  <span className="vaango-admin-badge-count">
                    {pendingApplicationsList.length}
                  </span>
                )}
              </div>
              <p className="vaango-admin-panel-subtitle">
                Merchant storefront registrations requiring KYC & GPS verification
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/applications?status=submitted')}
              rightIcon={<ArrowRight size={14} />}
            >
              View All
            </Button>
          </div>

          <div className="vaango-admin-ops-card__body">
            {pendingApplicationsList.length === 0 ? (
              <div className="vaango-admin-ops-empty">
                <CheckCircle2 size={32} className="vaango-admin-ops-empty-icon" />
                <p>All merchant applications reviewed.</p>
                <span className="vaango-admin-text-muted">No pending KYC submissions</span>
              </div>
            ) : (
              <div className="vaango-admin-app-list">
                {pendingApplicationsList.map((app) => (
                  <div key={app.id} className="vaango-admin-app-row">
                    <div className="vaango-admin-app-info">
                      <div className="vaango-admin-app-name-row">
                        <strong className="vaango-admin-app-name">{app.shop_name}</strong>
                        <span className="vaango-admin-app-status-badge">{app.status}</span>
                      </div>
                      <div className="vaango-admin-app-meta">
                        <span>{app.owner_name}</span>
                        <span className="vaango-admin-dot-sep">•</span>
                        <span>{app.contact_phone}</span>
                        <span className="vaango-admin-dot-sep">•</span>
                        <span>
                          {new Date(app.created_at).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/applications/${app.id}`)}
                    >
                      Review
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Panel 2: Recent Administrative Audit Ledger */}
        <Card variant="default" padding="md" className="vaango-admin-ops-card">
          <div className="vaango-admin-ops-card__header">
            <div>
              <h2 className="vaango-admin-panel-title">Recent Activity</h2>
              <p className="vaango-admin-panel-subtitle">
                Chronological ledger of platform approvals and payment records
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/audit')}
              rightIcon={<ArrowRight size={14} />}
            >
              View All
            </Button>
          </div>

          <div className="vaango-admin-ops-card__body">
            {auditLogs.length === 0 ? (
              <div className="vaango-admin-ops-empty">
                <ShieldCheck size={32} className="vaango-admin-ops-empty-icon" />
                <p>No administrative operations recorded yet.</p>
              </div>
            ) : (
              <div className="vaango-admin-audit-list">
                {auditLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="vaango-admin-audit-item">
                    <div className="vaango-admin-audit-icon-wrap">
                      <ShieldCheck size={16} />
                    </div>
                    <div className="vaango-admin-audit-item__content">
                      <div className="vaango-admin-audit-item__top">
                        <span className="vaango-admin-audit-action-badge">
                          {log.action_type.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <span className="vaango-admin-audit-time">
                          <Clock size={11} />
                          {new Date(log.created_at).toLocaleString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="vaango-admin-audit-item__details">
                        Target: <strong>{log.entity_type}</strong>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <span className="vaango-admin-audit-meta-text">
                            {' — '}
                            {Object.entries(log.details)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' | ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* --------------------------------------------------------- */}
      {/* 6. COMPACT ADMINISTRATIVE MODULE SHORTCUTS */}
      {/* --------------------------------------------------------- */}
      <div className="vaango-admin-shortcuts-section">
        <h3 className="vaango-admin-shortcuts-title">Operations Shortcuts</h3>
        <div className="vaango-admin-shortcuts-grid">
          <div
            className="vaango-admin-shortcut-chip"
            onClick={() => navigate('/admin/catalogue')}
            role="button"
            tabIndex={0}
          >
            <div className="vaango-admin-shortcut-icon">
              <Layers size={16} />
            </div>
            <div className="vaango-admin-shortcut-text">
              <strong className="vaango-admin-stat-card__value--text">Master Catalogue</strong>
              <span>Curate canonical products & suggestions</span>
            </div>
            {pendingCatalogue > 0 && <NotificationBadge count={pendingCatalogue} size="sm" />}
            <ExternalLink size={13} className="vaango-admin-shortcut-arrow" />
          </div>

          <div
            className="vaango-admin-shortcut-chip"
            onClick={() => navigate('/admin/locations')}
            role="button"
            tabIndex={0}
          >
            <div className="vaango-admin-shortcut-icon">
              <MapPin size={16} />
            </div>
            <div className="vaango-admin-shortcut-text">
              <strong>Locations & Hometowns</strong>
              <span>Manage active launch towns & PIN codes</span>
            </div>
            <ExternalLink size={13} className="vaango-admin-shortcut-arrow" />
          </div>

          <div
            className="vaango-admin-shortcut-chip"
            onClick={() => navigate('/admin/subscriptions')}
            role="button"
            tabIndex={0}
          >
            <div className="vaango-admin-shortcut-icon">
              <CreditCard size={16} />
            </div>
            <div className="vaango-admin-shortcut-text">
              <strong>Subscriptions & UPI</strong>
              <span>Track trials & record manual UPI receipts</span>
            </div>
            <ExternalLink size={13} className="vaango-admin-shortcut-arrow" />
          </div>

          <div
            className="vaango-admin-shortcut-chip"
            onClick={() => navigate('/admin/shops')}
            role="button"
            tabIndex={0}
          >
            <div className="vaango-admin-shortcut-icon">
              <Store size={16} />
            </div>
            <div className="vaango-admin-shortcut-text">
              <strong>Shop Directory</strong>
              <span>Monitor readiness, suspend or reactivate</span>
            </div>
            <ExternalLink size={13} className="vaango-admin-shortcut-arrow" />
          </div>
        </div>
      </div>
    </div>
  );
};
