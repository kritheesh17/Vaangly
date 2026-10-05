import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  TrendingUp,
  Download,
  Calendar,
  IndianRupee,
  ShoppingBag,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Layers,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Shop, Request } from '../../types/database';
import {
  BusinessAnalyticsData,
  AnalyticsFilter,
  DateRangePreset,
} from '../../types/analytics';
import { getShopkeeperShop, getShopRequests } from '../../lib/shopkeeperApi';
import {
  calculateShopAnalytics,
  getDateRangeFromPreset,
  exportAnalyticsReportCsv,
} from '../../lib/analyticsApi';
import { getShopBusinessFeatures } from '../../lib/shopBusinessTypes';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import './ShopkeeperAnalyticsPage.css';

export const ShopkeeperAnalyticsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [shop, setShop] = useState<Shop | null>(null);
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [analytics, setAnalytics] = useState<BusinessAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Chart View Tab Toggle: Revenue Trends vs Daily Order Count
  const [chartView, setChartView] = useState<'revenue' | 'orders'>('revenue');

  // Date Filter State
  const [preset, setPreset] = useState<DateRangePreset>('30d');
  const initialDates = getDateRangeFromPreset('30d');
  const [startDate, setStartDate] = useState(initialDates.startDate);
  const [endDate, setEndDate] = useState(initialDates.endDate);

  const loadData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const userShop = await getShopkeeperShop(user.id);
      setShop(userShop);

      if (userShop) {
        const reqs = await getShopRequests(userShop.id);
        setAllRequests(reqs);

        const filter: AnalyticsFilter = { preset, startDate, endDate };
        const data = await calculateShopAnalytics(userShop, filter);
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Error loading analytics:', err);
      toastError('Failed to calculate analytics data.');
    } finally {
      setIsLoading(false);
    }
  }, [user, preset, startDate, endDate, toastError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Preset Changes
  const handlePresetChange = (newPreset: DateRangePreset) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      const dates = getDateRangeFromPreset(newPreset);
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
    }
  };

  // Handle Custom Dates Apply
  const handleApplyCustomDates = () => {
    if (new Date(startDate) > new Date(endDate)) {
      toastError('Start date must be on or before end date.');
      return;
    }
    loadData();
  };

  // Handle CSV Export
  const handleExportCsv = () => {
    if (!shop || !analytics) return;
    setIsExporting(true);
    try {
      const filter: AnalyticsFilter = { preset, startDate, endDate };
      exportAnalyticsReportCsv(shop, allRequests, filter);
      success('Sales analysis CSV report downloaded successfully.');
    } catch (err) {
      console.error('Error exporting CSV:', err);
      toastError('Failed to generate CSV export.');
    } finally {
      setIsExporting(false);
    }
  };

  // Business capabilities detection
  const businessFeatures = useMemo(() => getShopBusinessFeatures(shop), [shop]);

  if (isLoading && !analytics) {
    return (
      <div className="container vaango-analytics-page">
        <Skeleton height="40px" width="240px" />
        <div className="vaango-analytics-kpi-grid">
          <Skeleton height="110px" borderRadius="12px" />
          <Skeleton height="110px" borderRadius="12px" />
          <Skeleton height="110px" borderRadius="12px" />
          <Skeleton height="110px" borderRadius="12px" />
          <Skeleton height="110px" borderRadius="12px" />
        </div>
        <Skeleton height="280px" borderRadius="16px" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="container" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <h2>No Active Shop Found</h2>
        <p className="text-secondary mt-2">
          Please register your shop or wait for admin approval to view your sales analysis.
        </p>
        <Button variant="primary" className="mt-4" onClick={() => navigate('/shopkeeper/dashboard')}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  // SVG Chart Calculation Helpers for Revenue & Orders
  const renderTrendsChart = () => {
    if (!analytics || analytics.revenue_trends.length === 0) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No transaction history recorded for this period.
        </div>
      );
    }

    const points = analytics.revenue_trends;
    const svgWidth = 640;
    const svgHeight = 200;
    const padding = 24;

    if (chartView === 'orders') {
      const maxOrders = Math.max(...points.map((p) => p.order_count), 5);
      const barWidth = Math.max(4, Math.min(24, (svgWidth - padding * 2) / points.length - 4));

      return (
        <div className="vaango-svg-chart-wrap">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="vaango-svg-chart" preserveAspectRatio="none">
            {/* Grid lines */}
            <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="var(--color-border)" strokeWidth="1" />
            <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 3" />
            <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 3" />

            {/* Daily Bars */}
            {points.map((p, idx) => {
              const x = padding + (idx / Math.max(points.length - 1, 1)) * (svgWidth - padding * 2) - barWidth / 2;
              const barHeight = (p.order_count / maxOrders) * (svgHeight - padding * 2);
              const y = svgHeight - padding - barHeight;

              return (
                <g key={p.date}>
                  <rect
                    x={Math.max(padding, x)}
                    y={y}
                    width={barWidth}
                    height={Math.max(barHeight, 2)}
                    rx={3}
                    fill={p.order_count > 0 ? 'var(--color-primary)' : 'var(--color-border)'}
                    opacity={p.order_count > 0 ? 0.9 : 0.4}
                  >
                    <title>{`${p.label}: ${p.order_count} order(s)`}</title>
                  </rect>
                </g>
              );
            })}
          </svg>

          {/* X Axis Labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
            <span>{points[0]?.label}</span>
            {points.length > 2 && <span>{points[Math.floor(points.length / 2)]?.label}</span>}
            <span>{points[points.length - 1]?.label}</span>
          </div>
        </div>
      );
    }

    // Revenue Trends Area / Line Chart
    const maxVal = Math.max(...points.map((p) => Math.max(p.gross_order_value, p.completed_sales)), 100);

    const getX = (idx: number) => padding + (idx / Math.max(points.length - 1, 1)) * (svgWidth - padding * 2);
    const getY = (val: number) => svgHeight - padding - (val / maxVal) * (svgHeight - padding * 2);

    const completedPath = points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx)} ${getY(p.completed_sales)}`)
      .join(' ');

    const grossPath = points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx)} ${getY(p.gross_order_value)}`)
      .join(' ');

    const completedArea = `${completedPath} L ${getX(points.length - 1)} ${svgHeight - padding} L ${getX(0)} ${svgHeight - padding} Z`;

    return (
      <div className="vaango-svg-chart-wrap">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="vaango-svg-chart" preserveAspectRatio="none">
          {/* Subtle Grid Lines */}
          <line x1={padding} y1={getY(0)} x2={svgWidth - padding} y2={getY(0)} stroke="var(--color-border)" strokeWidth="1" />
          <line x1={padding} y1={getY(maxVal / 2)} x2={svgWidth - padding} y2={getY(maxVal / 2)} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 3" />
          <line x1={padding} y1={getY(maxVal)} x2={svgWidth - padding} y2={getY(maxVal)} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 3" />

          {/* Completed Sales Gradient Area */}
          <defs>
            <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path d={completedArea} fill="url(#completedGrad)" />

          {/* Gross Order Line (Dashed) */}
          <path d={grossPath} fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeDasharray="4 4" />

          {/* Completed Sales Line (Solid) */}
          <path d={completedPath} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" />

          {/* Data Points */}
          {points.map((p, idx) => (
            <circle
              key={p.date}
              cx={getX(idx)}
              cy={getY(p.completed_sales)}
              r={points.length > 31 ? 2 : 4}
              fill="var(--color-surface)"
              stroke="var(--color-primary)"
              strokeWidth="2"
            >
              <title>{`${p.label}: Completed ₹${p.completed_sales.toLocaleString('en-IN')}, Gross ₹${p.gross_order_value.toLocaleString('en-IN')}`}</title>
            </circle>
          ))}
        </svg>

        {/* X Axis Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
          <span>{points[0]?.label}</span>
          {points.length > 2 && <span>{points[Math.floor(points.length / 2)]?.label}</span>}
          <span>{points[points.length - 1]?.label}</span>
        </div>
      </div>
    );
  };

  // SVG Chart Calculation Helpers for Peak Hours
  const renderPeakHoursChart = () => {
    if (!analytics) return null;
    const hours = analytics.peak_hours;
    const maxHourCount = Math.max(...hours.map((h) => h.order_count), 1);
    const svgWidth = 640;
    const svgHeight = 140;
    const padding = 16;
    const barWidth = (svgWidth - padding * 2) / 24 - 4;

    return (
      <div className="vaango-svg-chart-wrap">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="vaango-svg-chart" preserveAspectRatio="none">
          {hours.map((h, idx) => {
            const barH = (h.order_count / maxHourCount) * (svgHeight - padding * 2);
            const x = padding + idx * (barWidth + 4);
            const y = svgHeight - padding - barH;

            return (
              <g key={h.hour}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barH, 2)}
                  rx={2}
                  fill={h.order_count > 0 ? 'var(--color-primary)' : 'var(--color-border)'}
                  opacity={h.order_count > 0 ? 0.85 : 0.4}
                >
                  <title>{`${h.formatted_hour}: ${h.order_count} order(s), ₹${h.revenue.toLocaleString('en-IN')} revenue`}</title>
                </rect>
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
          <span>12 AM</span>
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
          <span>11 PM</span>
        </div>
      </div>
    );
  };

  const hasDualRevenueStreams =
    businessFeatures.hasProducts && (businessFeatures.hasServices || businessFeatures.hasAppointments);

  const totalSalesVal = analytics?.overview.total_sales || 0;
  const productSalesVal = analytics?.overview.product_sales || 0;
  const serviceSalesVal = analytics?.overview.service_appointment_sales || 0;
  const productSharePct = totalSalesVal > 0 ? Math.round((productSalesVal / totalSalesVal) * 100) : 0;
  const serviceSharePct = totalSalesVal > 0 ? 100 - productSharePct : 0;
  const fulfillmentRate =
    analytics?.overview.fulfillment_rate_pct ??
    (analytics?.overview.total_orders && analytics.overview.total_orders > 0
      ? Math.round((analytics.overview.completed_orders / analytics.overview.total_orders) * 100)
      : 0);

  return (
    <div className="container vaango-analytics-page">
      {/* Header */}
      <div className="vaango-analytics-header">
        <div className="vaango-analytics-header__top">
          <div className="vaango-analytics-header__title-group">
            <span className="vaango-analytics-header__kicker">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/shopkeeper/dashboard')}
                leftIcon={<ArrowLeft size={14} />}
                className="vaango-back-kicker"
              >
                Dashboard
              </Button>
              / Business Intelligence
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 className="vaango-analytics-header__title">Sales Analysis</h1>
              <Badge variant="primary" size="md">
                {shop.name}
              </Badge>
            </div>
            <p className="text-secondary" style={{ fontSize: '0.85rem', margin: '2px 0 0 0' }}>
              Realtime revenue, order fulfillment status, and business performance metrics.
            </p>
          </div>

          <div className="vaango-analytics-header__actions">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              isLoading={isExporting}
              leftIcon={<Download size={14} />}
            >
              Export CSV Report
            </Button>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="vaango-analytics-filters">
          <div className="vaango-date-presets">
            <button
              type="button"
              className={`vaango-preset-btn ${preset === 'today' ? 'vaango-preset-btn--active' : ''}`}
              onClick={() => handlePresetChange('today')}
            >
              Today
            </button>
            <button
              type="button"
              className={`vaango-preset-btn ${preset === '7d' ? 'vaango-preset-btn--active' : ''}`}
              onClick={() => handlePresetChange('7d')}
            >
              Last 7 days
            </button>
            <button
              type="button"
              className={`vaango-preset-btn ${preset === '30d' ? 'vaango-preset-btn--active' : ''}`}
              onClick={() => handlePresetChange('30d')}
            >
              Last 30 days
            </button>
            <button
              type="button"
              className={`vaango-preset-btn ${preset === 'this_month' ? 'vaango-preset-btn--active' : ''}`}
              onClick={() => handlePresetChange('this_month')}
            >
              This month
            </button>
            <button
              type="button"
              className={`vaango-preset-btn ${preset === 'custom' ? 'vaango-preset-btn--active' : ''}`}
              onClick={() => handlePresetChange('custom')}
            >
              Custom
            </button>
          </div>

          {preset === 'custom' && (
            <div className="vaango-custom-date-inputs">
              <label>
                From:{' '}
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate}
                />
              </label>
              <label>
                To:{' '}
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                />
              </label>
              <Button variant="secondary" size="sm" onClick={handleApplyCustomDates}>
                Apply
              </Button>
            </div>
          )}

          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Showing: <strong>{new Date(`${startDate}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</strong> – <strong>{new Date(`${endDate}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
          </div>
        </div>
      </div>

      {analytics && (
        <>
          {/* Executive Overview Section (Phase 1) */}
          <section className="vaango-exec-overview" aria-label="Executive Overview">
            <div className="vaango-exec-header">
              <div className="vaango-exec-header__title-group">
                <span className="vaango-exec-header__kicker">EXECUTIVE OVERVIEW</span>
                <h2 className="vaango-exec-header__title">Business Health Snapshot</h2>
              </div>
              <span className="vaango-exec-header__note">
                Realtime settled figures for the selected period
              </span>
            </div>

            <div className="vaango-exec-grid">
              {/* KPI 1 — Net Settled Sales */}
              <div className="vaango-exec-card">
                <div className="vaango-exec-card__top">
                  <span className="vaango-exec-card__label">Net Settled Sales</span>
                  <div className="vaango-exec-card__icon">
                    <IndianRupee size={16} />
                  </div>
                </div>
                <div className="vaango-exec-card__body">
                  <div className="vaango-exec-card__val">
                    ₹{totalSalesVal.toLocaleString('en-IN')}
                  </div>
                  <span className="vaango-exec-card__sublabel">
                    Settled from completed orders
                  </span>
                </div>
                <div className="vaango-exec-card__footer">
                  {analytics.overview.previous_period_sales > 0 && analytics.overview.sales_growth_pct !== null ? (
                    <span
                      className={`vaango-exec-pill ${
                        analytics.overview.sales_growth_pct >= 0
                          ? 'vaango-exec-pill--up'
                          : 'vaango-exec-pill--down'
                      }`}
                    >
                      {analytics.overview.sales_growth_pct >= 0 ? '↑ +' : '↓ '}
                      {analytics.overview.sales_growth_pct}% vs previous period
                    </span>
                  ) : (
                    <span className="vaango-exec-pill vaango-exec-pill--neutral">
                      {totalSalesVal > 0 ? 'New this period' : 'No previous data'}
                    </span>
                  )}
                </div>
              </div>

              {/* KPI 2 — Order Volume & Fulfillment */}
              <div className="vaango-exec-card">
                <div className="vaango-exec-card__top">
                  <span className="vaango-exec-card__label">Order Volume & Fulfillment</span>
                  <div className="vaango-exec-card__icon vaango-exec-card__icon--blue">
                    <CheckCircle2 size={16} />
                  </div>
                </div>
                <div className="vaango-exec-card__body">
                  <div className="vaango-exec-card__val">
                    {analytics.overview.total_orders} requests
                  </div>
                  <div className="vaango-exec-detail-row" style={{ marginTop: '2px' }}>
                    <span>{analytics.overview.completed_orders} completed</span>
                    <strong style={{ color: 'var(--color-primary)' }}>{fulfillmentRate}% fulfillment</strong>
                  </div>
                </div>
                <div className="vaango-exec-card__footer">
                  <div className="vaango-exec-progress" title={`${fulfillmentRate}% fulfilled`}>
                    <div
                      className="vaango-exec-progress__fill"
                      style={{ width: `${Math.min(fulfillmentRate, 100)}%` }}
                    />
                  </div>
                  <div className="vaango-exec-detail-row">
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Workload:</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                      {analytics.overview.total_orders > 0
                        ? `${analytics.overview.completed_orders} of ${analytics.overview.total_orders} fulfilled`
                        : '0 of 0 fulfilled'}
                    </span>
                  </div>
                </div>
              </div>

              {/* KPI 3 — Average Order Value */}
              <div className="vaango-exec-card">
                <div className="vaango-exec-card__top">
                  <span className="vaango-exec-card__label">Average Order Value</span>
                  <div className="vaango-exec-card__icon">
                    <TrendingUp size={16} />
                  </div>
                </div>
                <div className="vaango-exec-card__body">
                  <div className="vaango-exec-card__val">
                    {analytics.overview.completed_orders > 0
                      ? `₹${analytics.overview.average_order_value.toLocaleString('en-IN')}`
                      : '—'}
                  </div>
                  <span className="vaango-exec-card__sublabel">
                    Per completed order
                  </span>
                </div>
                <div className="vaango-exec-card__footer">
                  <div className="vaango-exec-detail-row">
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Fulfilled basis:</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                      {analytics.overview.completed_orders > 0
                        ? `Across ${analytics.overview.completed_orders} completed`
                        : 'No completed orders'}
                    </span>
                  </div>
                </div>
              </div>

              {/* KPI 4 — Revenue by Stream */}
              <div className="vaango-exec-card">
                <div className="vaango-exec-card__top">
                  <span className="vaango-exec-card__label">Revenue Mix</span>
                  <div className="vaango-exec-card__icon vaango-exec-card__icon--purple">
                    <Layers size={16} />
                  </div>
                </div>
                <div className="vaango-exec-card__body">
                  {totalSalesVal === 0 ? (
                    <>
                      <div className="vaango-exec-card__val">₹0</div>
                      <span className="vaango-exec-card__sublabel">No settled revenue in period</span>
                    </>
                  ) : !businessFeatures.hasProducts && (businessFeatures.hasServices || businessFeatures.hasAppointments) ? (
                    <>
                      <div className="vaango-exec-card__val" style={{ color: '#0284c7' }}>
                        ₹{serviceSalesVal.toLocaleString('en-IN')}
                      </div>
                      <span className="vaango-exec-card__sublabel">100% Services & Bookings</span>
                    </>
                  ) : businessFeatures.hasProducts && !businessFeatures.hasServices && !businessFeatures.hasAppointments ? (
                    <>
                      <div className="vaango-exec-card__val" style={{ color: 'var(--brand-primary)' }}>
                        ₹{productSalesVal.toLocaleString('en-IN')}
                      </div>
                      <span className="vaango-exec-card__sublabel">100% Product Orders</span>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--brand-primary)' }}>
                        📦 Products: ₹{productSalesVal.toLocaleString('en-IN')} ({productSharePct}%)
                      </div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0284c7' }}>
                        ✂️ Services: ₹{serviceSalesVal.toLocaleString('en-IN')} ({serviceSharePct}%)
                      </div>
                    </div>
                  )}
                </div>
                <div className="vaango-exec-card__footer">
                  {totalSalesVal > 0 && hasDualRevenueStreams ? (
                    <div className="vaango-exec-split-bar" title={`Products: ${productSharePct}%, Services: ${serviceSharePct}%`}>
                      <div style={{ width: `${productSharePct}%`, background: 'var(--brand-primary)', height: '100%' }} />
                      <div style={{ width: `${serviceSharePct}%`, background: '#0284c7', height: '100%' }} />
                    </div>
                  ) : totalSalesVal > 0 ? (
                    <div className="vaango-exec-progress">
                      <div
                        className={`vaango-exec-progress__fill ${
                          !businessFeatures.hasProducts ? 'vaango-exec-progress__fill--blue' : ''
                        }`}
                        style={{ width: '100%' }}
                      />
                    </div>
                  ) : null}
                  <div className="vaango-exec-detail-row">
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Share of sales:</span>
                    <strong style={{ fontSize: '0.72rem' }}>
                      {totalSalesVal > 0 ? '100% of settled sales' : '—'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* KPI 5 — Customer Loyalty */}
              <div className="vaango-exec-card">
                <div className="vaango-exec-card__top">
                  <span className="vaango-exec-card__label">Customer Loyalty</span>
                  <div className="vaango-exec-card__icon">
                    <Users size={16} />
                  </div>
                </div>
                <div className="vaango-exec-card__body">
                  <div className="vaango-exec-card__val">
                    {analytics.customer_metrics.returning_percentage}%
                  </div>
                  <span className="vaango-exec-card__sublabel">
                    Returning Customers
                  </span>
                </div>
                <div className="vaango-exec-card__footer">
                  <div className="vaango-exec-progress" title={`${analytics.customer_metrics.returning_percentage}% returning`}>
                    <div
                      className="vaango-exec-progress__fill"
                      style={{ width: `${analytics.customer_metrics.returning_percentage}%` }}
                    />
                  </div>
                  <div className="vaango-exec-detail-row">
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Repeat orders:</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                      {analytics.customer_metrics.repeat_order_count} in window
                    </span>
                  </div>
                  <div className="vaango-exec-detail-row" style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                    <span>{analytics.customer_metrics.returning_customers} returning</span>
                    <span>{analytics.customer_metrics.new_customers} new</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section: Revenue Trends & Peak Hours */}
          <div className="vaango-analytics-grid-2col" style={{ marginTop: 'var(--spacing-md)' }}>
            {/* Visual Trends Chart */}
            <div className="vaango-chart-card">
              <div className="vaango-chart-card__header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 className="vaango-chart-card__title">
                    <TrendingUp size={18} /> Daily Trends
                  </h3>
                  <div className="vaango-chart-toggle-group">
                    <button
                      type="button"
                      className={`vaango-chart-toggle-btn ${chartView === 'revenue' ? 'vaango-chart-toggle-btn--active' : ''}`}
                      onClick={() => setChartView('revenue')}
                    >
                      Revenue (₹)
                    </button>
                    <button
                      type="button"
                      className={`vaango-chart-toggle-btn ${chartView === 'orders' ? 'vaango-chart-toggle-btn--active' : ''}`}
                      onClick={() => setChartView('orders')}
                    >
                      Daily Orders
                    </button>
                  </div>
                </div>

                {chartView === 'revenue' ? (
                  <div className="vaango-chart-card__legend">
                    <span><span className="vaango-legend-dot" style={{ backgroundColor: 'var(--color-primary)' }} /> Completed</span>
                    <span><span className="vaango-legend-dot" style={{ backgroundColor: 'var(--color-text-muted)' }} /> Gross</span>
                  </div>
                ) : (
                  <div className="vaango-chart-card__legend">
                    <span><span className="vaango-legend-dot" style={{ backgroundColor: 'var(--color-primary)' }} /> Order Volume</span>
                  </div>
                )}
              </div>
              {renderTrendsChart()}
            </div>

            {/* Peak Ordering Hours Histogram */}
            <div className="vaango-chart-card">
              <div className="vaango-chart-card__header">
                <h3 className="vaango-chart-card__title">
                  <Clock size={18} /> Peak Ordering Hours (24h)
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Time-of-day order frequency
                </span>
              </div>
              {renderPeakHoursChart()}
            </div>
          </div>

          {/* Section: Best-Selling Products & Distribution */}
          {businessFeatures.hasProducts && (
            <div className="vaango-analytics-grid-2col" style={{ marginTop: 'var(--spacing-md)' }}>
              {/* Top Products Table */}
              <div className="vaango-chart-card">
                <div className="vaango-chart-card__header">
                  <h3 className="vaango-chart-card__title">
                    <ShoppingBag size={18} /> Top-Selling Products & Distribution
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Ranked by revenue
                  </span>
                </div>

                {analytics.top_products.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    No product transactions completed in this date range.
                  </div>
                ) : (
                  <>
                    {/* Mobile stacked card view (< 768px) */}
                    <div className="vaango-analytics-mobile-cards">
                      {analytics.top_products.slice(0, 8).map((p) => (
                        <div key={p.product_id} className="vaango-analytics-mobile-card">
                          <div className="vaango-analytics-mobile-card__header">
                            <div className="vaango-analytics-mobile-card__title">{p.product_name}</div>
                            <Badge variant="primary" size="sm">{p.percentage_of_total}% share</Badge>
                          </div>
                          <div className="vaango-analytics-mobile-card__grid">
                            <div className="vaango-analytics-mobile-card__cell">
                              <span className="vaango-analytics-mobile-card__label">Units Sold</span>
                              <span className="vaango-analytics-mobile-card__value">{p.quantity_sold}</span>
                            </div>
                            <div className="vaango-analytics-mobile-card__cell">
                              <span className="vaango-analytics-mobile-card__label">Revenue</span>
                              <span className="vaango-analytics-mobile-card__value">₹{p.sales_generated.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                          <div className="vaango-progress-bar">
                            <div className="vaango-progress-bar__fill" style={{ width: `${Math.min(p.percentage_of_total, 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop tabular view (>= 768px) */}
                    <div className="vaango-analytics-table-wrap">
                      <table className="vaango-analytics-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Units Sold</th>
                            <th>Revenue</th>
                            <th>Sales Distribution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.top_products.slice(0, 8).map((p) => (
                            <tr key={p.product_id}>
                              <td><strong>{p.product_name}</strong></td>
                              <td>{p.quantity_sold}</td>
                              <td>₹{p.sales_generated.toLocaleString('en-IN')}</td>
                              <td>
                                <div className="vaango-progress-bar-wrap">
                                  <div className="vaango-progress-bar">
                                    <div className="vaango-progress-bar__fill" style={{ width: `${Math.min(p.percentage_of_total, 100)}%` }} />
                                  </div>
                                  <span>{p.percentage_of_total}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {/* Variant Performance Table */}
              <div className="vaango-chart-card">
                <div className="vaango-chart-card__header">
                  <h3 className="vaango-chart-card__title">
                    <Layers size={18} /> Product Variant Performance
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Variant breakdown (Size, Weight, Color)
                  </span>
                </div>

                {analytics.variant_performance.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    No variant-specific transactions recorded in this window.
                  </div>
                ) : (
                  <div className="vaango-analytics-table-wrap">
                    <table className="vaango-analytics-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Variant</th>
                          <th>Units Sold</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.variant_performance.slice(0, 8).map((v) => (
                          <tr key={`${v.product_id}-${v.variant_id}`}>
                            <td>{v.product_name}</td>
                            <td><Badge variant="neutral" size="sm">{v.variant_label}</Badge></td>
                            <td>{v.quantity_sold}</td>
                            <td>₹{v.sales_generated.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section: Appointment & Service Analysis (Rendered ONLY if business supports them) */}
          {(businessFeatures.hasAppointments || businessFeatures.hasServices) && (
            <div className="vaango-analytics-grid-2col" style={{ marginTop: 'var(--spacing-md)' }}>
              <div className="vaango-chart-card">
                <div className="vaango-chart-card__header">
                  <h3 className="vaango-chart-card__title">
                    {businessFeatures.hasAppointments ? <Calendar size={18} /> : <Wrench size={18} />}{' '}
                    Appointment & Service Performance
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Capacity & Booking Metrics
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center', margin: '8px 0 16px' }}>
                  <div style={{ padding: '10px', background: 'var(--color-surface-hover)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'block' }}>Total Bookings</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>{analytics.appointments.total_appointments}</strong>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--color-surface-hover)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'block' }}>Completed</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--color-success)' }}>{analytics.appointments.completed}</strong>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--color-surface-hover)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'block' }}>Completion Rate</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>{analytics.appointments.utilization_rate}%</strong>
                  </div>
                </div>

                {analytics.appointments.most_booked_services.length > 0 ? (
                  <div>
                    <h4 style={{ fontSize: '0.85rem', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                      Top Booked Services
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {analytics.appointments.most_booked_services.slice(0, 5).map((srv) => (
                        <div
                          key={srv.name}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            background: 'var(--color-surface-hover)',
                            borderRadius: '6px',
                            fontSize: '0.82rem',
                            alignItems: 'center',
                          }}
                        >
                          <span>{srv.name}</span>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontWeight: 700, display: 'block' }}>
                              {srv.count} booking(s) • ₹{srv.revenue.toLocaleString('en-IN')} settled
                            </span>
                            {srv.booked_value !== undefined && srv.booked_value !== srv.revenue && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                ₹{srv.booked_value.toLocaleString('en-IN')} booked value
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                    No service bookings recorded in this date range.
                  </p>
                )}
              </div>

              {/* Peak Slots & Cancellation Breakdown */}
              <div className="vaango-chart-card">
                <div className="vaango-chart-card__header">
                  <h3 className="vaango-chart-card__title">
                    <Clock size={18} /> Peak Booking Slots & Cancellations
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Slot distribution
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {analytics.appointments.peak_slots.length > 0 ? (
                    <div>
                      <h4 style={{ fontSize: '0.85rem', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                        Most Popular Slot Times
                      </h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {analytics.appointments.peak_slots.slice(0, 6).map((slot) => (
                          <Badge key={slot.time} variant="neutral" size="md">
                            {slot.time}: {slot.count} booking(s)
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <h4 style={{ fontSize: '0.85rem', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                      Cancellation Summary
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.8rem' }}>
                      <div style={{ padding: '8px 10px', background: 'var(--color-surface-hover)', borderRadius: '6px' }}>
                        Customer Cancelled: <strong>{analytics.cancellations.customer_cancelled}</strong>
                      </div>
                      <div style={{ padding: '8px 10px', background: 'var(--color-surface-hover)', borderRadius: '6px' }}>
                        Shop Rejected: <strong>{analytics.cancellations.shop_rejected}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section: Payment Methods & Settlements */}
          <div className="vaango-chart-card" style={{ marginTop: 'var(--spacing-md)' }}>
            <div className="vaango-chart-card__header">
              <h3 className="vaango-chart-card__title">
                <IndianRupee size={18} /> Payment Methods & Settlements
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Settled revenue and pipeline breakdown by tender type
              </span>
            </div>

            {analytics.payment_methods.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                No completed payments recorded in this date range.
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="vaango-analytics-table-wrap">
                  <table className="vaango-analytics-table">
                    <thead>
                      <tr>
                        <th>Payment Method</th>
                        <th>Settled Orders</th>
                        <th>Settled Revenue</th>
                        <th>Verification & Pipeline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.payment_methods.map((pm) => (
                        <tr key={pm.method}>
                          <td><strong>{pm.method}</strong></td>
                          <td>{pm.count} completed</td>
                          <td><strong>₹{pm.total_amount.toLocaleString('en-IN')}</strong></td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <Badge variant={pm.verified_count > 0 ? 'success' : 'neutral'} size="sm">
                                {pm.verified_count} verified
                              </Badge>
                              {pm.unverified_count > 0 && (
                                <Badge variant="warning" size="sm">
                                  {pm.unverified_count} pending
                                </Badge>
                              )}
                              {(pm.cancelled_count || 0) > 0 && (
                                <Badge variant="neutral" size="sm">
                                  {pm.cancelled_count} cancelled
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="vaango-analytics-mobile-cards">
                  {analytics.payment_methods.map((pm) => (
                    <div key={pm.method} className="vaango-analytics-mobile-card">
                      <div className="vaango-analytics-mobile-card__header">
                        <div className="vaango-analytics-mobile-card__title">{pm.method}</div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <Badge variant={pm.verified_count > 0 ? 'success' : 'neutral'} size="sm">
                            {pm.verified_count} verified
                          </Badge>
                          {pm.unverified_count > 0 && (
                            <Badge variant="warning" size="sm">
                              {pm.unverified_count} pending
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="vaango-analytics-mobile-card__grid">
                        <div className="vaango-analytics-mobile-card__cell">
                          <span className="vaango-analytics-mobile-card__label">Settled Orders</span>
                          <span className="vaango-analytics-mobile-card__value">{pm.count}</span>
                        </div>
                        <div className="vaango-analytics-mobile-card__cell">
                          <span className="vaango-analytics-mobile-card__label">Settled Revenue</span>
                          <span className="vaango-analytics-mobile-card__value">₹{pm.total_amount.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Section: Customer Retention & Slow Moving Stock */}
          <div className="vaango-analytics-grid-2col" style={{ marginTop: 'var(--spacing-md)' }}>
            {/* Customer Retention Analysis */}
            <div className="vaango-chart-card">
              <div className="vaango-chart-card__header">
                <h3 className="vaango-chart-card__title">
                  <Users size={18} /> Customer Retention Analysis
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  New vs Returning
                </span>
              </div>

              <div className="vaango-retention-box">
                <div className="vaango-retention-bar">
                  <div
                    className="vaango-retention-bar__new"
                    style={{ width: `${100 - analytics.customer_metrics.returning_percentage}%` }}
                    title={`New Customers: ${analytics.customer_metrics.new_customers}`}
                  />
                  <div
                    className="vaango-retention-bar__returning"
                    style={{ width: `${analytics.customer_metrics.returning_percentage}%` }}
                    title={`Returning Customers: ${analytics.customer_metrics.returning_customers}`}
                  />
                </div>

                <div className="vaango-retention-legend">
                  <div className="vaango-retention-item">
                    <strong>{analytics.customer_metrics.new_customers}</strong>
                    <span>New First-Time Shoppers</span>
                  </div>
                  <div className="vaango-retention-item">
                    <strong style={{ color: 'var(--color-success)' }}>
                      {analytics.customer_metrics.returning_customers}
                    </strong>
                    <span>Returning Loyal Customers ({analytics.customer_metrics.returning_percentage}%)</span>
                  </div>
                  <div className="vaango-retention-item">
                    <strong>{analytics.customer_metrics.repeat_order_count}</strong>
                    <span>Repeat Orders in Window</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Slow Moving Products Watchlist */}
            {businessFeatures.hasProducts && (
              <div className="vaango-chart-card">
                <div className="vaango-chart-card__header">
                  <h3 className="vaango-chart-card__title">
                    <AlertCircle size={18} /> Slow-Moving Stock Watchlist
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Inventory items with low velocity
                  </span>
                </div>

                {analytics.slow_moving_products.filter((p) => p.status === 'slow').length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    🎉 Healthy inventory velocity! No listed products currently classified as slow-moving.
                  </div>
                ) : (
                  <div className="vaango-analytics-mobile-cards">
                    {analytics.slow_moving_products
                      .filter((p) => p.status === 'slow')
                      .slice(0, 5)
                      .map((p) => (
                        <div key={p.product_id} className="vaango-analytics-mobile-card">
                          <div className="vaango-analytics-mobile-card__header">
                            <div className="vaango-analytics-mobile-card__title">{p.product_name}</div>
                            <Badge variant="warning" size="sm">Low Velocity</Badge>
                          </div>
                          <div className="vaango-analytics-mobile-card__grid">
                            <div className="vaango-analytics-mobile-card__cell">
                              <span className="vaango-analytics-mobile-card__label">Price</span>
                              <span className="vaango-analytics-mobile-card__value">₹{p.price}</span>
                            </div>
                            <div className="vaango-analytics-mobile-card__cell">
                              <span className="vaango-analytics-mobile-card__label">Units Sold</span>
                              <span className="vaango-analytics-mobile-card__value">{p.units_sold}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
