import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { fetchAdminAuditLogsList } from '../../lib/adminApi';
import { AdminAuditLog } from '../../types/database';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import './AdminAuditPage.css';

export const AdminAuditPage: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminAuditLogsList(100);
      setLogs(data);
    } catch (err) {
      console.error('Error loading audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'applications') return log.entity_type === 'shop_application';
    if (activeFilter === 'shops') return log.entity_type === 'shop';
    if (activeFilter === 'locations') return log.entity_type === 'location';
    if (activeFilter === 'payments') return log.entity_type === 'payment' || log.entity_type === 'subscription';
    return true;
  });

  const getActionBadge = (action: string) => {
    if (action.includes('approved') || action.includes('reactivated') || action.includes('recorded')) {
      return 'success';
    }
    if (action.includes('rejected') || action.includes('suspended') || action.includes('deactivated')) {
      return 'error';
    }
    return 'primary';
  };

  return (
    <div className="container vaango-admin-audit">
      {/* Header */}
      <div className="vaango-admin-audit__header">
        <div>
          <button
            type="button"
            className="vaango-back-btn"
            onClick={() => navigate('/admin/dashboard')}
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={16} />
            <span>Dashboard</span>
          </button>
          <h1 className="vaango-admin-audit__title">Platform Activity & Audit Ledger</h1>
          <p className="vaango-admin-audit__subtitle">
            Immutable operational audit trail logging all storefront approvals, suspensions, location changes, and manual subscription payment receipts.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="vaango-admin-audit__filter-bar">
        <div className="vaango-admin-tabs" role="tablist" aria-label="Filter audit logs by category">
          <button
            type="button"
            className={`vaango-admin-tab ${activeFilter === 'all' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All Events ({logs.length})
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeFilter === 'applications' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => setActiveFilter('applications')}
          >
            Applications
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeFilter === 'shops' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => setActiveFilter('shops')}
          >
            Shops & Lifecycles
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeFilter === 'locations' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => setActiveFilter('locations')}
          >
            Locations
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeFilter === 'payments' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => setActiveFilter('payments')}
          >
            Subscription Payments
          </button>
        </div>
      </div>

      {/* Audit Stream Table */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton height={60} />
          <Skeleton height={60} />
          <Skeleton height={60} />
        </div>
      ) : filteredLogs.length === 0 ? (
        <Card variant="outlined" padding="lg" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No audit events recorded for this category.
        </Card>
      ) : (
        <Card variant="default" padding="none" className="vaango-admin-audit__table-card">
          <div className="vaango-admin-audit__table-responsive">
            <table className="vaango-admin-table" aria-label="Administrative audit trail">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Entity Type</th>
                  <th>Target ID</th>
                  <th>Actor</th>
                  <th>Audit Metadata & Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className="vaango-audit-timestamp">
                        <Clock size={13} />{' '}
                        {new Date(log.created_at).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </td>
                    <td>
                      <Badge variant={getActionBadge(log.action_type)} size="sm">
                        {log.action_type.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      <code>{log.entity_type}</code>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.8rem' }}>{log.entity_id}</code>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        {log.admin_name || 'Operations Admin'}
                      </span>
                    </td>
                    <td>
                      {log.details && Object.keys(log.details).length > 0 ? (
                        <div className="vaango-audit-meta-wrap">
                          {Object.entries(log.details).map(([k, v]) => (
                            <span key={k} className="vaango-audit-meta-pill">
                              <strong>{k}:</strong> {String(v)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
