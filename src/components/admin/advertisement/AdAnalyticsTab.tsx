import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  MousePointerClick,
  Eye,
  CheckCircle2,
  SkipForward,
  RefreshCw,
} from 'lucide-react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Badge } from '../../ui/Badge';
import { Skeleton } from '../../ui/Skeleton';
import {
  AdAnalyticsData,
  AdCampaign,
} from '../../../types/advertisement';
import { fetchAdAnalytics } from '../../../lib/advertisementApi';
import { getISTDateString } from '../../../lib/analyticsApi';

interface AdAnalyticsTabProps {
  campaigns: AdCampaign[];
  initialCampaignId?: string;
}

type PeriodPreset = 'today' | '7d' | '30d' | 'custom';

export const AdAnalyticsTab: React.FC<AdAnalyticsTabProps> = ({
  campaigns,
  initialCampaignId,
}) => {
  const [period, setPeriod] = useState<PeriodPreset>('30d');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaignId || '');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [activeMetricTab, setActiveMetricTab] = useState<'impressions' | 'clicks' | 'ctr'>('impressions');

  const [analyticsData, setAnalyticsData] = useState<AdAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedTrendIdx, setSelectedTrendIdx] = useState<number | null>(null);

  // Compute start & end dates based on preset
  const { startDateStr, endDateStr } = useMemo(() => {
    const now = new Date();
    const end = getISTDateString(now);

    if (period === 'today') {
      return { startDateStr: end, endDateStr: end };
    }
    if (period === '7d') {
      const s = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { startDateStr: getISTDateString(s), endDateStr: end };
    }
    if (period === '30d') {
      const s = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      return { startDateStr: getISTDateString(s), endDateStr: end };
    }
    return {
      startDateStr: customStartDate || getISTDateString(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)),
      endDateStr: customEndDate || end,
    };
  }, [period, customStartDate, customEndDate]);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const startIso = startDateStr ? `${startDateStr}T00:00:00+05:30` : undefined;
      const endIso = endDateStr ? `${endDateStr}T23:59:59+05:30` : undefined;
      const data = await fetchAdAnalytics(
        startIso,
        endIso,
        selectedCampaignId || undefined
      );
      setAnalyticsData(data);
    } catch (err) {
      console.error('Failed to load ad analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [startDateStr, endDateStr, selectedCampaignId]);

  const overall = analyticsData?.overall || {
    total_impressions: 0,
    unique_impressions: 0,
    total_clicks: 0,
    total_skips: 0,
    total_completed_views: 0,
    ctr: 0,
    completion_rate: 0,
    skip_rate: 0,
    active_campaigns: 0,
    scheduled_campaigns: 0,
    expired_campaigns: 0,
    paused_campaigns: 0,
    draft_campaigns: 0,
  };

  const trends = analyticsData?.trends || [];
  const campaignBreakdown = analyticsData?.campaigns || [];

  // Render SVG Trend Chart
  const renderTrendsChart = () => {
    if (trends.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--color-text-muted)' }}>
          <BarChart3 size={40} style={{ opacity: 0.4, marginBottom: '8px' }} />
          <p>No analytics activity recorded for the selected period.</p>
        </div>
      );
    }

    const svgWidth = 680;
    const svgHeight = 200;
    const paddingX = 36;
    const paddingY = 28;

    const values = trends.map((t) => {
      if (activeMetricTab === 'impressions') return t.impressions;
      if (activeMetricTab === 'clicks') return t.clicks;
      return t.ctr;
    });

    const maxValue = Math.max(...values, activeMetricTab === 'ctr' ? 5 : 5);
    const colStep = (svgWidth - paddingX * 2) / Math.max(trends.length, 1);
    const barWidth = Math.max(4, Math.min(24, colStep - 6));

    const selectedTrend =
      selectedTrendIdx !== null && selectedTrendIdx >= 0 && selectedTrendIdx < trends.length
        ? trends[selectedTrendIdx]
        : null;

    return (
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: '100%', height: '200px', display: 'block' }}
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
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
            y1={(svgHeight - paddingY) / 2}
            x2={svgWidth - paddingX}
            y2={(svgHeight - paddingY) / 2}
            stroke="var(--color-border)"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.5"
          />

          {/* Bars */}
          {trends.map((t, idx) => {
            const val = activeMetricTab === 'impressions' ? t.impressions : activeMetricTab === 'clicks' ? t.clicks : t.ctr;
            const barHeight = maxValue > 0 ? (val / maxValue) * (svgHeight - paddingY * 1.5) : 0;
            const x = paddingX + idx * colStep + (colStep - barWidth) / 2;
            const y = svgHeight - paddingY - barHeight;
            const isHovered = selectedTrendIdx === idx;

            const barColor =
              activeMetricTab === 'clicks'
                ? '#10b981'
                : activeMetricTab === 'ctr'
                ? '#f59e0b'
                : '#0a7b83';

            return (
              <g
                key={t.date}
                onMouseEnter={() => setSelectedTrendIdx(idx)}
                onMouseLeave={() => setSelectedTrendIdx(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 2)}
                  rx={3}
                  fill={isHovered ? 'var(--color-primary-hover, #086369)' : barColor}
                  opacity={isHovered ? 1 : 0.85}
                />

                {/* Date Label on every few bars */}
                {(trends.length <= 10 || idx % Math.ceil(trends.length / 8) === 0) && (
                  <text
                    x={x + barWidth / 2}
                    y={svgHeight - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--color-text-muted)"
                  >
                    {t.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Card */}
        {selectedTrend && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '20px',
              background: 'var(--color-card-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '0.82rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              display: 'flex',
              gap: '12px',
            }}
          >
            <div>
              <strong>Date:</strong> {selectedTrend.date}
            </div>
            <div>
              <strong>Impressions:</strong> {selectedTrend.impressions}
            </div>
            <div>
              <strong>Clicks:</strong> {selectedTrend.clicks}
            </div>
            <div>
              <strong>CTR:</strong> {selectedTrend.ctr}%
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          background: 'var(--color-card-bg)',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Period Preset Pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['today', '7d', '30d', 'custom'] as PeriodPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: period === p ? 'var(--color-primary)' : 'transparent',
                color: period === p ? '#fff' : 'var(--color-text-primary)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {p === 'today' ? 'Today' : p === '7d' ? 'Last 7 Days' : p === '30d' ? 'Last 30 Days' : 'Custom'}
            </button>
          ))}
        </div>

        {/* Custom Date Pickers */}
        {period === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '0.85rem' }}
            />
            <span style={{ color: 'var(--color-text-muted)' }}>to</span>
            <Input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '0.85rem' }}
            />
          </div>
        )}

        {/* Campaign Filter Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-card-bg)',
              color: 'var(--color-text-primary)',
              fontSize: '0.88rem',
            }}
          >
            <option value="">All Campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.campaign_name} ({c.advertiser_name})
              </option>
            ))}
          </select>

          <Button variant="outline" size="sm" onClick={loadAnalytics} isLoading={isLoading}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <Card style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              TOTAL IMPRESSIONS
            </span>
            <Eye size={18} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px' }}>
            {isLoading ? <Skeleton width={60} height={32} /> : overall.total_impressions.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            {overall.unique_impressions.toLocaleString()} unique views
          </div>
        </Card>

        <Card style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              TOTAL CLICKS
            </span>
            <MousePointerClick size={18} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px', color: '#10b981' }}>
            {isLoading ? <Skeleton width={60} height={32} /> : overall.total_clicks.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            External advertiser visits
          </div>
        </Card>

        <Card style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              CLICK-THROUGH RATE
            </span>
            <TrendingUp size={18} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px', color: '#f59e0b' }}>
            {isLoading ? <Skeleton width={60} height={32} /> : `${overall.ctr}%`}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Clicks ÷ Impressions
          </div>
        </Card>

        <Card style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              COMPLETED VIEWS
            </span>
            <CheckCircle2 size={18} style={{ color: '#06b6d4' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px' }}>
            {isLoading ? <Skeleton width={60} height={32} /> : overall.total_completed_views.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            {overall.completion_rate}% completion rate
          </div>
        </Card>

        <Card style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              SKIPPED ADS
            </span>
            <SkipForward size={18} style={{ color: '#94a3b8' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px' }}>
            {isLoading ? <Skeleton width={60} height={32} /> : overall.total_skips.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            {overall.skip_rate}% skip rate
          </div>
        </Card>
      </div>

      {/* Daily Performance Trend Chart */}
      <Card style={{ padding: '20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Advertisement Daily Trends</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
              Daily delivery performance in Asia/Kolkata timezone
            </p>
          </div>

          {/* Metric Selector Tabs */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--color-bg-secondary, rgba(0,0,0,0.04))', padding: '3px', borderRadius: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveMetricTab('impressions')}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeMetricTab === 'impressions' ? 'var(--color-card-bg)' : 'transparent',
                color: activeMetricTab === 'impressions' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                boxShadow: activeMetricTab === 'impressions' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Impressions
            </button>

            <button
              type="button"
              onClick={() => setActiveMetricTab('clicks')}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeMetricTab === 'clicks' ? 'var(--color-card-bg)' : 'transparent',
                color: activeMetricTab === 'clicks' ? '#10b981' : 'var(--color-text-muted)',
                boxShadow: activeMetricTab === 'clicks' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Clicks
            </button>

            <button
              type="button"
              onClick={() => setActiveMetricTab('ctr')}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeMetricTab === 'ctr' ? 'var(--color-card-bg)' : 'transparent',
                color: activeMetricTab === 'ctr' ? '#f59e0b' : 'var(--color-text-muted)',
                boxShadow: activeMetricTab === 'ctr' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              CTR (%)
            </button>
          </div>
        </div>

        {isLoading ? <Skeleton height={200} /> : renderTrendsChart()}
      </Card>

      {/* Campaign-by-Campaign Breakdown Table */}
      <Card style={{ padding: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', fontWeight: 700 }}>
          Campaign Performance Breakdown
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '10px 12px' }}>Campaign</th>
                <th style={{ padding: '10px 12px' }}>Advertiser</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Format</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Impressions</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Clicks</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>CTR</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Completed Views</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Skips</th>
              </tr>
            </thead>
            <tbody>
              {campaignBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '28px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No campaigns found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                campaignBreakdown.map((c) => (
                  <tr key={c.campaign_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{c.campaign_name}</td>
                    <td style={{ padding: '12px', color: 'var(--color-text-muted)' }}>{c.advertiser_name}</td>
                    <td style={{ padding: '12px' }}>
                      <Badge
                        variant={
                          c.status === 'active'
                            ? 'success'
                            : c.status === 'scheduled'
                            ? 'primary'
                            : c.status === 'paused'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {c.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px', textTransform: 'capitalize' }}>{c.media_type}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                      {c.impressions.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                      {c.clicks.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                      {c.ctr}%
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {c.completed_views.toLocaleString()} ({c.completion_rate}%)
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                      {c.skips.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
