import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Store,
  CreditCard,
  AlertTriangle,
  ArrowRight,
  XCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  MapPin,
  Layers,
} from 'lucide-react';
import { fetchOperationalMetrics, fetchAdminAuditLogsList } from '../../lib/adminApi';
import { OperationalMetrics } from '../../types/admin';
import { AdminAuditLog } from '../../types/database';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useLanguage } from '../../context/LanguageContext';
import './AdminDashboardPage.css';

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [metrics, setMetrics] = useState<OperationalMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [m, logs] = await Promise.all([
        fetchOperationalMetrics(),
        fetchAdminAuditLogsList(6),
      ]);
      setMetrics(m);
      setAuditLogs(logs);
    } catch (err) {
      console.error('Error loading admin dashboard:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDashboardData();
  };

  if (isLoading && !metrics) {
    return (
      <div className="container vaango-admin-dash">
        <div style={{ padding: '40px 0' }}>
          <Skeleton height={32} width={240} style={{ marginBottom: '16px' }} />
          <Skeleton height={120} style={{ marginBottom: '24px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <Skeleton height={100} />
            <Skeleton height={100} />
            <Skeleton height={100} />
            <Skeleton height={100} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container vaango-admin-dash">
      {/* Header */}
      <div className="vaango-admin-dash__header">
        <div>
          <div className="vaango-admin-dash__badge-row">
            <span className="vaango-admin-dash__kicker">{t('commandCenter')}</span>
            <Badge variant="primary" size="sm">Vaango v0.5</Badge>
          </div>
          <h1 className="vaango-admin-dash__title">{t('operationsGovernance')}</h1>
          <p className="vaango-admin-dash__subtitle">
            {t('operationsSubtitle')}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          isLoading={isRefreshing}
          leftIcon={<RefreshCw size={14} />}
        >
          {t('refreshData')}
        </Button>
      </div>

      {/* Urgent Action Banner if Pending Applications or Overdue Subscriptions */}
      {metrics && (metrics.pendingApplications > 0 || metrics.overdueSubscriptions > 0) && (
        <div className="vaango-admin-alert-banner">
          <div className="vaango-admin-alert-banner__content">
            <AlertTriangle size={20} className="vaango-admin-alert-banner__icon" />
            <div>
              <strong>Action Required by Platform Admin</strong>
              <p>
                {metrics.pendingApplications > 0 && `${metrics.pendingApplications} merchant application(s) awaiting verification. `}
                {metrics.overdueSubscriptions > 0 && `${metrics.overdueSubscriptions} merchant subscription(s) overdue for manual UPI renewal.`}
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
                Review Applications
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

      {/* Core Operational Metric Counters */}
      <div className="vaango-admin-metrics-grid">
        <Card
          variant="default"
          padding="md"
          className="vaango-admin-stat-card"
          onClick={() => navigate('/admin/applications')}
        >
          <div className="vaango-admin-stat-card__header">
            <span className="vaango-admin-stat-card__label">Pending Applications</span>
            <FileText size={18} className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--primary" />
          </div>
          <div className="vaango-admin-stat-card__value">{metrics?.pendingApplications || 0}</div>
          <div className="vaango-admin-stat-card__hint">Requires KYC & storefront review</div>
        </Card>

        <Card
          variant="default"
          padding="md"
          className="vaango-admin-stat-card"
          onClick={() => navigate('/admin/shops?status=active')}
        >
          <div className="vaango-admin-stat-card__header">
            <span className="vaango-admin-stat-card__label">Active / Live Shops</span>
            <Store size={18} className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--success" />
          </div>
          <div className="vaango-admin-stat-card__value">
            {metrics?.liveShops || 0} <span className="vaango-admin-stat-card__subval">/ {metrics?.approvedShops || 0} approved</span>
          </div>
          <div className="vaango-admin-stat-card__hint">Visible to customers in hometown</div>
        </Card>

        <Card
          variant="default"
          padding="md"
          className="vaango-admin-stat-card"
          onClick={() => navigate('/admin/subscriptions')}
        >
          <div className="vaango-admin-stat-card__header">
            <span className="vaango-admin-stat-card__label">Subscriptions</span>
            <CreditCard size={18} className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--accent" />
          </div>
          <div className="vaango-admin-stat-card__value">
            {metrics?.trialSubscriptions || 0} <span className="vaango-admin-stat-card__subval">Trial</span> |{' '}
            {metrics?.activeSubscriptions || 0} <span className="vaango-admin-stat-card__subval">Paid</span>
          </div>
          <div className="vaango-admin-stat-card__hint">
            {metrics?.overdueSubscriptions || 0} overdue renewals (₹20/day cap)
          </div>
        </Card>

        <Card
          variant="default"
          padding="md"
          className="vaango-admin-stat-card"
          onClick={() => navigate('/admin/shops?status=suspended')}
        >
          <div className="vaango-admin-stat-card__header">
            <span className="vaango-admin-stat-card__label">Suspended Shops</span>
            <XCircle size={18} className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--danger" />
          </div>
          <div className="vaango-admin-stat-card__value">{metrics?.suspendedShops || 0}</div>
          <div className="vaango-admin-stat-card__hint">Hidden from discovery (data intact)</div>
        </Card>

        <Card
          variant="default"
          padding="md"
          className="vaango-admin-stat-card"
          onClick={() => navigate('/admin/catalogue')}
        >
          <div className="vaango-admin-stat-card__header">
            <span className="vaango-admin-stat-card__label">Master Catalogue</span>
            <Layers size={18} className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--accent" />
          </div>
          <div className="vaango-admin-stat-card__value">Global Catalogue</div>
          <div className="vaango-admin-stat-card__hint">Standard reference products & merchant proposals</div>
        </Card>
      </div>

      {/* Cancellation Behavior & Fulfillment Quality */}
      <div className="vaango-admin-dash__section">
        <div className="vaango-admin-dash__section-header">
          <div>
            <h2 className="vaango-admin-dash__section-title">Cancellation & Fulfillment Quality</h2>
            <p className="vaango-admin-dash__section-subtitle">
              Audit-backed operational metrics tracking cancellation behavior across customers and merchants.
            </p>
          </div>
        </div>

        <div className="vaango-admin-cancellation-grid">
          <Card variant="outlined" padding="md" className="vaango-admin-cancellation-card">
            <span className="vaango-cancellation-card__label">Platform Total Requests</span>
            <div className="vaango-cancellation-card__value">{metrics?.totalRequests || 0}</div>
            <div className="vaango-cancellation-card__note">Orders, Appointments & Services</div>
          </Card>

          <Card variant="outlined" padding="md" className="vaango-admin-cancellation-card">
            <span className="vaango-cancellation-card__label">Platform Cancellation Rate</span>
            <div className="vaango-cancellation-card__value" style={{ color: (metrics?.cancellationRate || 0) > 20 ? 'var(--color-error)' : 'var(--color-primary)' }}>
              {metrics?.cancellationRate || 0}%
            </div>
            <div className="vaango-cancellation-card__note">
              {metrics?.cancelledRequests || 0} cancelled or rejected of {metrics?.totalRequests || 0}
            </div>
          </Card>

          <Card variant="outlined" padding="md" className="vaango-admin-cancellation-card">
            <span className="vaango-cancellation-card__label">Customer Cancellations</span>
            <div className="vaango-cancellation-card__value">{metrics?.customerCancellations || 0}</div>
            <div className="vaango-cancellation-card__note">Initiated by customer before fulfillment</div>
          </Card>

          <Card variant="outlined" padding="md" className="vaango-admin-cancellation-card">
            <span className="vaango-cancellation-card__label">Merchant Rejections / Cancellations</span>
            <div className="vaango-cancellation-card__value">{metrics?.merchantRejectionsOrCancellations || 0}</div>
            <div className="vaango-cancellation-card__note">Rejected by shopkeeper with mandatory reason</div>
          </Card>
        </div>
      </div>

      {/* Quick Access Navigation Modules */}
      <div className="vaango-admin-dash__section">
        <div className="vaango-admin-dash__section-header">
          <div>
            <h2 className="vaango-admin-dash__section-title">Administrative Modules</h2>
            <p className="vaango-admin-dash__section-subtitle">Manage hometowns, storefront approvals, subscription records, and audit logs.</p>
          </div>
        </div>

        <div className="vaango-admin-modules-grid">
          <Card
            variant="default"
            padding="lg"
            className="vaango-admin-module-card"
            onClick={() => navigate('/admin/locations')}
          >
            <div className="vaango-admin-module-card__icon-wrap">
              <MapPin size={24} />
            </div>
            <h3 className="vaango-admin-module-card__title">Locations & Hometowns</h3>
            <p className="vaango-admin-module-card__desc">
              Manage operating towns, PIN codes, and launch town flags. Safely deactivate locations without cascading deletion.
            </p>
            <span className="vaango-admin-module-card__link">
              Manage Locations <ArrowRight size={14} />
            </span>
          </Card>

          <Card
            variant="default"
            padding="lg"
            className="vaango-admin-module-card"
            onClick={() => navigate('/admin/applications')}
          >
            <div className="vaango-admin-module-card__icon-wrap">
              <FileText size={24} />
            </div>
            <h3 className="vaango-admin-module-card__title">Shop Applications</h3>
            <p className="vaango-admin-module-card__desc">
              Inspect merchant onboarding applications, storefront photos, GPS coordinates, and private identity proofs.
            </p>
            <span className="vaango-admin-module-card__link">
              Review Applications ({metrics?.pendingApplications || 0} pending) <ArrowRight size={14} />
            </span>
          </Card>

          <Card
            variant="default"
            padding="lg"
            className="vaango-admin-module-card"
            onClick={() => navigate('/admin/shops')}
          >
            <div className="vaango-admin-module-card__icon-wrap">
              <Store size={24} />
            </div>
            <h3 className="vaango-admin-module-card__title">Shop Directory & Lifecycle</h3>
            <p className="vaango-admin-module-card__desc">
              Inspect catalogue readiness across all 11 verticals. Suspend unready or non-compliant shops and reactivate as needed.
            </p>
            <span className="vaango-admin-module-card__link">
              Browse Shops <ArrowRight size={14} />
            </span>
          </Card>

          <Card
            variant="default"
            padding="lg"
            className="vaango-admin-module-card"
            onClick={() => navigate('/admin/subscriptions')}
          >
            <div className="vaango-admin-module-card__icon-wrap">
              <CreditCard size={24} />
            </div>
            <h3 className="vaango-admin-module-card__title">Subscriptions & Manual UPI</h3>
            <p className="vaango-admin-module-card__desc">
              Track 60-day trials from go-live, flat daily rates (max ₹20/day), weekly/monthly billing, and record manual UPI receipts.
            </p>
            <span className="vaango-admin-module-card__link">
              Manage Subscriptions <ArrowRight size={14} />
            </span>
          </Card>
        </div>
      </div>

      {/* Recent Administrative Audit Events */}
      <div className="vaango-admin-dash__section">
        <div className="vaango-admin-dash__section-header">
          <div>
            <h2 className="vaango-admin-dash__section-title">Recent Administrative Actions</h2>
            <p className="vaango-admin-dash__section-subtitle">Chronological ledger of platform approvals, suspensions, and payment records.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/audit')} rightIcon={<ArrowRight size={14} />}>
            View All Audit Logs
          </Button>
        </div>

        <div className="vaango-admin-audit-list">
          {auditLogs.length === 0 ? (
            <Card variant="outlined" padding="md" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No administrative actions recorded yet.
            </Card>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="vaango-admin-audit-row">
                <div className="vaango-admin-audit-row__icon">
                  <ShieldCheck size={16} />
                </div>
                <div className="vaango-admin-audit-row__content">
                  <div className="vaango-admin-audit-row__header">
                    <span className="vaango-admin-audit-action">{log.action_type.replace(/_/g, ' ').toUpperCase()}</span>
                    <span className="vaango-admin-audit-time">
                      <Clock size={12} /> {new Date(log.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="vaango-admin-audit-detail">
                    Target: <strong>{log.entity_type}</strong> (ID: {log.entity_id})
                    {log.details && Object.keys(log.details).length > 0 && (
                      <span className="vaango-admin-audit-meta">
                        {' — '}
                        {Object.entries(log.details)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' | ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
