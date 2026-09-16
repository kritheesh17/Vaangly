import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  TrendingUp,
  Download,
  Calendar,
  DollarSign,
  ShoppingBag,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Lock,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Shop, Request } from '../../types/database';
import {
  BusinessAnalyticsData,
  AnalyticsFilter,
  DateRangePreset,
} from '../../types/analytics';
import {
  getShopkeeperShop,
  getShopRequests,
  updateShopSubscriptionTier,
} from '../../lib/shopkeeperApi';
import {
  calculateShopAnalytics,
  getDateRangeFromPreset,
  exportAnalyticsReportCsv,
} from '../../lib/analyticsApi';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import './ShopkeeperAnalyticsPage.css';

export const ShopkeeperAnalyticsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError, info } = useToast();

  const [shop, setShop] = useState<Shop | null>(null);
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [analytics, setAnalytics] = useState<BusinessAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

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
      success('Analytics report CSV downloaded successfully.');
    } catch (err) {
      console.error('Error exporting CSV:', err);
      toastError('Failed to generate CSV export.');
    } finally {
      setIsExporting(false);
    }
  };

  // Quick Switch Tier for Evaluation/Testing
  const handleToggleTier = async () => {
    if (!shop) return;
    const nextTier = shop.subscription_tier === 'PRO' ? 'FREE' : 'PRO';
    const res = await updateShopSubscriptionTier(shop.id, nextTier);
    if (res.success && res.shop) {
      setShop(res.shop);
      success(`Switched to ${nextTier} Tier`);
      loadData();
    }
  };

  if (isLoading && !analytics) {
    return (
      <div className="container vaango-analytics-page">
        <Skeleton height="40px" width="220px" />
        <div className="vaango-analytics-kpi-grid">
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
        <p>Please register and get your shop approved to view business analytics.</p>
        <Button variant="primary" onClick={() => navigate('/shopkeeper/dashboard')}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const isPro = shop.subscription_tier === 'PRO';

  // SVG Chart Calculation Helpers for Revenue Trends
  const renderRevenueTrendsChart = () => {
    if (!analytics || analytics.revenue_trends.length === 0) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No trend data recorded for this period.
        </div>
      );
    }

    const points = analytics.revenue_trends;
    const maxVal = Math.max(...points.map((p) => Math.max(p.gross_order_value, p.completed_sales)), 100);
    const svgWidth = 640;
    const svgHeight = 180;
    const padding = 20;

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
              r={points.length > 31 ? 1.5 : 3.5}
              fill="var(--color-surface)"
              stroke="var(--color-primary)"
              strokeWidth="2"
            >
              <title>{`${p.label}: Completed ₹${p.completed_sales.toLocaleString('en-IN')}, Gross ₹${p.gross_order_value.toLocaleString('en-IN')}`}</title>
            </circle>
          ))}
        </svg>

        {/* X Axis Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
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
          <line x1={padding} y1={svgHeight - 20} x2={svgWidth - padding} y2={svgHeight - 20} stroke="var(--color-border)" strokeWidth="1" />
          {hours.map((h, idx) => {
            const barHeight = (h.order_count / maxHourCount) * (svgHeight - 40);
            const x = padding + idx * ((svgWidth - padding * 2) / 24) + 2;
            const y = svgHeight - 20 - barHeight;
            const isBusy = h.order_count === maxHourCount && maxHourCount > 0;

            return (
              <g key={h.hour}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 2)}
                  rx="2"
                  fill={isBusy ? 'var(--color-primary)' : h.order_count > 0 ? 'rgba(10, 123, 131, 0.45)' : 'var(--color-border)'}
                >
                  <title>{`${h.formatted_hour}: ${h.order_count} orders (₹${h.revenue.toLocaleString('en-IN')})`}</title>
                </rect>
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 12px', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
          <span>12 AM</span>
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
          <span>11 PM</span>
        </div>
      </div>
    );
  };

  return (
    <div className="container vaango-analytics-page">
      {/* Top Header */}
      <div className="vaango-analytics-header">
        <div className="vaango-analytics-header__top">
          <div className="vaango-analytics-header__title-group">
            <span className="vaango-analytics-header__kicker">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/shopkeeper/dashboard')}
                leftIcon={<ArrowLeft size={14} />}
                style={{ padding: '0 4px', height: 'auto', minHeight: 'unset' }}
              >
                Dashboard
              </Button>
              / Business Intelligence
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 className="vaango-analytics-header__title">Business Analytics</h1>
              <Badge variant={isPro ? 'primary' : 'neutral'} size="md">
                {isPro ? 'PRO TIER' : 'FREE PREVIEW'}
              </Badge>
            </div>
          </div>

          <div className="vaango-analytics-header__actions">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleTier}
              title="Switch between Free and Pro to test feature entitlement"
            >
              {isPro ? 'Switch to Free Tier' : 'Switch to Pro Tier'}
            </Button>
            {isPro && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleExportCsv}
                isLoading={isExporting}
                leftIcon={<Download size={14} />}
              >
                Export CSV Report
              </Button>
            )}
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="vaango-analytics-filters">
          <div className="vaango-date-presets">
            <button
              type="button"
              className={`vaango-preset-btn ${preset === '7d' ? 'vaango-preset-btn--active' : ''}`}
              onClick={() => handlePresetChange('7d')}
            >
              7 Days
            </button>
            <button
              type="button"
              className={`vaango-preset-btn ${preset === '30d' ? 'vaango-preset-btn--active' : ''}`}
              onClick={() => handlePresetChange('30d')}
            >
              30 Days
            </button>
            <button
              type="button"
              className={`vaango-preset-btn ${preset === '3m' ? 'vaango-preset-btn--active' : ''}`}
              onClick={() => handlePresetChange('3m')}
            >
              3 Months
            </button>
            <button
              type="button"
              className={`vaango-preset-btn ${preset === '6m' ? 'vaango-preset-btn--active' : ''}`}
              onClick={() => handlePresetChange('6m')}
            >
              6 Months
            </button>
            <button
              type="button"
              className={`vaango-preset-btn ${preset === '1y' ? 'vaango-preset-btn--active' : ''}`}
              onClick={() => handlePresetChange('1y')}
            >
              1 Year
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

      {/* ========================================================= */}
      {/* FREE TIER LOCKED PREVIEW STATE                            */}
      {/* ========================================================= */}
      {!isPro && (
        <div className="vaango-analytics-locked-hero">
          <div className="vaango-analytics-locked-hero__icon">
            <Lock size={32} />
          </div>
          <h2 className="vaango-analytics-locked-hero__title">
            Unlock Detailed Business Intelligence with Vaangly Pro
          </h2>
          <p className="vaango-analytics-locked-hero__desc">
            Upgrade your store to Vaangly Pro to understand revenue trends, customer retention, best-selling product variants, rush hours, and export CSV audit reports.
          </p>

          <div className="vaango-pro-feature-grid">
            <div className="vaango-pro-feature-item">
              <TrendingUp size={20} className="vaango-pro-feature-item__icon" />
              <div>
                <strong>Revenue & Gross Sales Trends</strong>
                <p>Track completed sales vs gross order value with daily, weekly, and monthly growth comparisons.</p>
              </div>
            </div>
            <div className="vaango-pro-feature-item">
              <ShoppingBag size={20} className="vaango-pro-feature-item__icon" />
              <div>
                <strong>Best-Sellers & Slow-Moving Stock</strong>
                <p>Discover top-performing products and variant combinations with automatic low-velocity stock alerts.</p>
              </div>
            </div>
            <div className="vaango-pro-feature-item">
              <Users size={20} className="vaango-pro-feature-item__icon" />
              <div>
                <strong>Customer Retention & Repeat Orders</strong>
                <p>Analyze new vs returning customer split and identify repeat customer order frequency.</p>
              </div>
            </div>
            <div className="vaango-pro-feature-item">
              <Clock size={20} className="vaango-pro-feature-item__icon" />
              <div>
                <strong>Peak Ordering Hours (24h Histogram)</strong>
                <p>Pinpoint your busiest hours of the day to optimize staffing, inventory prep, and kitchen readiness.</p>
              </div>
            </div>
            <div className="vaango-pro-feature-item">
              <Calendar size={20} className="vaango-pro-feature-item__icon" />
              <div>
                <strong>Appointment Capacity & Utilization</strong>
                <p>Measure slot capacity fill-rate and identify your most booked service specialists.</p>
              </div>
            </div>
            <div className="vaango-pro-feature-item">
              <Download size={20} className="vaango-pro-feature-item__icon" />
              <div>
                <strong>One-Click CSV Tax & Audit Exports</strong>
                <p>Export clean, accountant-ready order archives without leaking private customer data.</p>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button
              variant="primary"
              size="lg"
              onClick={handleToggleTier}
              leftIcon={<Sparkles size={18} />}
            >
              Enable Pro Analytics Demo (1-Click)
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => info('Subscription billing setup will be integrated in the next milestone. Use "Enable Pro Analytics Demo" above to evaluate now!')}
            >
              Billing & Pricing Info
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PRO TIER FULL INTERACTIVE ANALYTICS SUITE                 */}
      {/* ========================================================= */}
      {analytics && (
        <div className={!isPro ? 'vaango-locked-preview-blur' : ''}>
          {/* KPI Summary Cards */}
          <div className="vaango-analytics-kpi-grid">
            <div className="vaango-kpi-card">
              <div className="vaango-kpi-card__top">
                <span>Completed Sales</span>
                <div className="vaango-kpi-card__icon"><DollarSign size={16} /></div>
              </div>
              <div className="vaango-kpi-card__val">
                ₹{analytics.overview.total_sales.toLocaleString('en-IN')}
              </div>
              <div>
                {analytics.overview.sales_growth_pct !== null ? (
                  <span className={`vaango-kpi-card__growth ${analytics.overview.sales_growth_pct >= 0 ? 'vaango-kpi-card__growth--up' : 'vaango-kpi-card__growth--down'}`}>
                    {analytics.overview.sales_growth_pct >= 0 ? '↑ +' : '↓ '}{analytics.overview.sales_growth_pct}% vs prior period
                  </span>
                ) : (
                  <span className="vaango-kpi-card__growth vaango-kpi-card__growth--neutral">No prior baseline</span>
                )}
              </div>
            </div>

            <div className="vaango-kpi-card">
              <div className="vaango-kpi-card__top">
                <span>Gross Order Value</span>
                <div className="vaango-kpi-card__icon"><TrendingUp size={16} /></div>
              </div>
              <div className="vaango-kpi-card__val">
                ₹{analytics.overview.gross_order_value.toLocaleString('en-IN')}
              </div>
              <span className="vaango-kpi-card__growth vaango-kpi-card__growth--neutral">
                All submitted orders
              </span>
            </div>

            <div className="vaango-kpi-card">
              <div className="vaango-kpi-card__top">
                <span>Completed Orders</span>
                <div className="vaango-kpi-card__icon"><CheckCircle2 size={16} /></div>
              </div>
              <div className="vaango-kpi-card__val">
                {analytics.overview.completed_orders}
              </div>
              <div>
                {analytics.overview.orders_growth_pct !== null ? (
                  <span className={`vaango-kpi-card__growth ${analytics.overview.orders_growth_pct >= 0 ? 'vaango-kpi-card__growth--up' : 'vaango-kpi-card__growth--down'}`}>
                    {analytics.overview.orders_growth_pct >= 0 ? '↑ +' : '↓ '}{analytics.overview.orders_growth_pct}% volume
                  </span>
                ) : (
                  <span className="vaango-kpi-card__growth vaango-kpi-card__growth--neutral">First recorded window</span>
                )}
              </div>
            </div>

            <div className="vaango-kpi-card">
              <div className="vaango-kpi-card__top">
                <span>Average Order Value</span>
                <div className="vaango-kpi-card__icon"><ShoppingBag size={16} /></div>
              </div>
              <div className="vaango-kpi-card__val">
                ₹{analytics.overview.average_order_value.toLocaleString('en-IN')}
              </div>
              <span className="vaango-kpi-card__growth vaango-kpi-card__growth--neutral">
                Sales / completed order
              </span>
            </div>

            <div className="vaango-kpi-card">
              <div className="vaango-kpi-card__top">
                <span>Unique Customers</span>
                <div className="vaango-kpi-card__icon"><Users size={16} /></div>
              </div>
              <div className="vaango-kpi-card__val">
                {analytics.customer_metrics.total_completed_customers}
              </div>
              <span className="vaango-kpi-card__growth vaango-kpi-card__growth--up">
                {analytics.customer_metrics.returning_percentage}% returning
              </span>
            </div>
          </div>

          {/* Section: Revenue Trends & Peak Hours */}
          <div className="vaango-analytics-grid-2col" style={{ marginTop: 'var(--spacing-lg)' }}>
            {/* Revenue Trend Area Chart */}
            <div className="vaango-chart-card">
              <div className="vaango-chart-card__header">
                <h3 className="vaango-chart-card__title">
                  <TrendingUp size={18} /> Revenue Over Time
                </h3>
                <div className="vaango-chart-card__legend">
                  <span><span className="vaango-legend-dot" style={{ backgroundColor: 'var(--color-primary)' }} /> Completed Sales</span>
                  <span><span className="vaango-legend-dot" style={{ backgroundColor: 'var(--color-text-muted)' }} /> Gross Orders</span>
                </div>
              </div>
              {renderRevenueTrendsChart()}
            </div>

            {/* Peak Ordering Hours Histogram */}
            <div className="vaango-chart-card">
              <div className="vaango-chart-card__header">
                <h3 className="vaango-chart-card__title">
                  <Clock size={18} /> Peak Ordering Hours (24h Local Time)
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Time-of-day order volume
                </span>
              </div>
              {renderPeakHoursChart()}
            </div>
          </div>

          {/* Section: Best-Selling Products & Variant Performance */}
          <div className="vaango-analytics-grid-2col" style={{ marginTop: 'var(--spacing-lg)' }}>
            {/* Top Products Table */}
            <div className="vaango-chart-card">
              <div className="vaango-chart-card__header">
                <h3 className="vaango-chart-card__title">
                  <ShoppingBag size={18} /> Best-Selling Products & Services
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Ranked by sales
                </span>
              </div>

              {analytics.top_products.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  No product sales completed in this date range.
                </div>
              ) : (
                <div className="vaango-analytics-table-wrap">
                  <table className="vaango-analytics-table">
                    <thead>
                      <tr>
                        <th>Product / Service</th>
                        <th>Qty Sold</th>
                        <th>Revenue</th>
                        <th>Share</th>
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
              )}
            </div>

            {/* Variant Performance Table */}
            <div className="vaango-chart-card">
              <div className="vaango-chart-card__header">
                <h3 className="vaango-chart-card__title">
                  <Layers size={18} /> Product Variant Breakdown
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Attributes (RAM, Storage, Size, Weight)
                </span>
              </div>

              {analytics.variant_performance.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  No variant-specific products were sold in this range.
                </div>
              ) : (
                <div className="vaango-analytics-table-wrap">
                  <table className="vaango-analytics-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Variant</th>
                        <th>Qty</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.variant_performance.slice(0, 8).map((v) => (
                        <tr key={`${v.product_id}-${v.variant_id}`}>
                          <td>{v.product_name}</td>
                          <td><Badge variant="primary" size="sm">{v.variant_label}</Badge></td>
                          <td>{v.quantity_sold}</td>
                          <td><strong>₹{v.sales_generated.toLocaleString('en-IN')}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Section: Customer Retention & Slow Moving Stock */}
          <div className="vaango-analytics-grid-2col" style={{ marginTop: 'var(--spacing-lg)' }}>
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
            <div className="vaango-chart-card">
              <div className="vaango-chart-card__header">
                <h3 className="vaango-chart-card__title">
                  <AlertCircle size={18} /> Slow-Moving Products Watchlist
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Listed items with low velocity
                </span>
              </div>

              {analytics.slow_moving_products.filter((p) => p.status === 'slow').length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  🎉 Great inventory velocity! No active products currently classified as slow-moving.
                </div>
              ) : (
                <div className="vaango-analytics-table-wrap">
                  <table className="vaango-analytics-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Price</th>
                        <th>Days Listed</th>
                        <th>Units Sold</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.slow_moving_products
                        .filter((p) => p.status === 'slow')
                        .slice(0, 6)
                        .map((p) => (
                          <tr key={p.product_id}>
                            <td><strong>{p.product_name}</strong></td>
                            <td>₹{p.price}</td>
                            <td>{p.days_listed} days</td>
                            <td>{p.units_sold} sold</td>
                            <td><Badge variant="warning" size="sm">Low Velocity</Badge></td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Section: Appointment Statistics (if applicable) & Cancellations & Payment Methods */}
          <div className="vaango-analytics-grid-2col" style={{ marginTop: 'var(--spacing-lg)' }}>
            {/* Appointment Analytics (or friendly notice) */}
            <div className="vaango-chart-card">
              <div className="vaango-chart-card__header">
                <h3 className="vaango-chart-card__title">
                  <Calendar size={18} /> Appointment & Service Utilization
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Capacity & Slot Efficiency
                </span>
              </div>

              {!analytics.appointments.has_appointment_vertical ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  ℹ This business does not currently use appointment services.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                    <div style={{ padding: '10px', background: 'var(--color-surface-hover)', borderRadius: '8px' }}>
                      <strong style={{ fontSize: '1.2rem', display: 'block' }}>{analytics.appointments.total_appointments}</strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Total Bookings</span>
                    </div>
                    <div style={{ padding: '10px', background: 'var(--color-surface-hover)', borderRadius: '8px' }}>
                      <strong style={{ fontSize: '1.2rem', display: 'block', color: 'var(--color-success)' }}>
                        {analytics.appointments.completed}
                      </strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Completed</span>
                    </div>
                    <div style={{ padding: '10px', background: 'var(--color-surface-hover)', borderRadius: '8px' }}>
                      <strong style={{ fontSize: '1.2rem', display: 'block', color: 'var(--color-primary)' }}>
                        {analytics.appointments.utilization_rate}%
                      </strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Fill Rate</span>
                    </div>
                  </div>

                  {analytics.appointments.most_booked_services.length > 0 && (
                    <div className="vaango-analytics-table-wrap">
                      <table className="vaango-analytics-table">
                        <thead>
                          <tr>
                            <th>Top Booked Service</th>
                            <th>Appointments</th>
                            <th>Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.appointments.most_booked_services.slice(0, 4).map((s) => (
                            <tr key={s.name}>
                              <td><strong>{s.name}</strong></td>
                              <td>{s.count} booked</td>
                              <td>₹{s.revenue.toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cancellations & Payment Methods Split Card */}
            <div className="vaango-chart-card">
              <div className="vaango-chart-card__header">
                <h3 className="vaango-chart-card__title">
                  <XCircle size={18} /> Cancellation & Payment Integrity
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Audit & Loss Prevention
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Cancellation breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ padding: '10px 14px', background: 'var(--color-surface-hover)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Customer Cancellations</div>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--color-error)' }}>{analytics.cancellations.customer_cancelled}</strong>
                  </div>
                  <div style={{ padding: '10px 14px', background: 'var(--color-surface-hover)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Merchant Rejections</div>
                    <strong style={{ fontSize: '1.1rem', color: '#d97706' }}>{analytics.cancellations.shop_rejected}</strong>
                  </div>
                </div>

                {/* Payment Methods Table */}
                <div className="vaango-analytics-table-wrap">
                  <table className="vaango-analytics-table">
                    <thead>
                      <tr>
                        <th>Payment Method</th>
                        <th>Transactions</th>
                        <th>Total Value</th>
                        <th>Verification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.payment_methods.map((pm) => (
                        <tr key={pm.method}>
                          <td><strong>{pm.method}</strong></td>
                          <td>{pm.count} orders</td>
                          <td>₹{pm.total_amount.toLocaleString('en-IN')}</td>
                          <td>
                            <Badge variant={pm.verified_count > 0 ? 'success' : 'neutral'} size="sm">
                              {pm.verified_count} verified ({pm.unverified_count} pending)
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
