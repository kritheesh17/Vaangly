import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileCode,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react';
import { fetchAdminAuditLogsPage, AdminAuditLogsPageResult } from '../../lib/adminApi';
import { AdminAuditLog } from '../../types/database';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { PaginationControls } from '../../components/common/PaginationControls';
import { CopyableText } from '../../components/common/CopyableText';
import { useDebounce } from '../../hooks/useDebounce';
import './AdminAuditPage.css';

export const AdminAuditPage: React.FC = () => {
  const navigate = useNavigate();

  // Filter & Search State
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [targetIdQuery, setTargetIdQuery] = useState('');
  const debouncedTargetId = useDebounce(targetIdQuery, 250);
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Data & UI State
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [copiedJsonId, setCopiedJsonId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const result: AdminAuditLogsPageResult = await fetchAdminAuditLogsPage({
        category: activeCategory !== 'all' ? activeCategory : undefined,
        actionType: actionTypeFilter !== 'all' ? actionTypeFilter : undefined,
        searchQuery: debouncedSearch,
        entityId: debouncedTargetId,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      });

      let fetchedLogs = result.logs;
      if (sortOrder === 'asc') {
        fetchedLogs = [...fetchedLogs].reverse();
      }

      setLogs(fetchedLogs);
      setTotalCount(result.totalCount);
    } catch (err) {
      console.error('Error loading audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeCategory, actionTypeFilter, debouncedSearch, debouncedTargetId, pageSize, currentPage, sortOrder]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, actionTypeFilter, debouncedSearch, debouncedTargetId]);

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyJson = async (log: AdminAuditLog) => {
    try {
      const json = JSON.stringify(log, null, 2);
      await navigator.clipboard.writeText(json);
      setCopiedJsonId(log.id);
      setTimeout(() => setCopiedJsonId(null), 2000);
    } catch (err) {
      console.warn('Failed to copy JSON:', err);
    }
  };

  const isFiltered = Boolean(
    activeCategory !== 'all' ||
    actionTypeFilter !== 'all' ||
    searchQuery.trim() ||
    targetIdQuery.trim()
  );

  const handleResetFilters = () => {
    setActiveCategory('all');
    setActionTypeFilter('all');
    setSearchQuery('');
    setTargetIdQuery('');
    setSortOrder('desc');
  };

  const getActionBadge = (action: string): 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'neutral' => {
    if (action.includes('warning') || action.includes('flag')) {
      return 'warning';
    }
    if (
      action.includes('approved') ||
      action.includes('reactivated') ||
      action.includes('recorded') ||
      action.includes('unbanned')
    ) {
      return 'success';
    }
    if (
      action.includes('rejected') ||
      action.includes('suspended') ||
      action.includes('deactivated') ||
      action.includes('banned') ||
      action.includes('hidden')
    ) {
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

      {/* Filter Tabs by Category */}
      <div className="vaango-admin-audit__filter-bar">
        <div className="vaango-admin-tabs" role="tablist" aria-label="Filter audit logs by category">
          <button
            type="button"
            className={`vaango-admin-tab ${activeCategory === 'all' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All Events
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeCategory === 'applications' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => setActiveCategory('applications')}
          >
            Applications
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeCategory === 'shops' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => setActiveCategory('shops')}
          >
            Shops & Lifecycles
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeCategory === 'products' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => setActiveCategory('products')}
          >
            Product Moderation
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeCategory === 'locations' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => setActiveCategory('locations')}
          >
            Locations
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeCategory === 'payments' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => setActiveCategory('payments')}
          >
            Subscription Payments
          </button>
        </div>
      </div>

      {/* Information Retrieval Bar */}
      <SearchFilterBar
        id="admin-audit-search"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search action, actor, or details notes..."
        totalCount={totalCount}
        filteredCount={logs.length}
        isFiltered={isFiltered}
        onResetFilters={handleResetFilters}
      >
        <input
          type="text"
          className="vaango-admin-audit__id-input"
          placeholder="Lookup Target ID / UUID..."
          value={targetIdQuery}
          onChange={(e) => setTargetIdQuery(e.target.value)}
          aria-label="Filter by exact or partial Target UUID"
        />

        <select
          className="vaango-admin-select"
          value={actionTypeFilter}
          onChange={(e) => setActionTypeFilter(e.target.value)}
          aria-label="Filter by action type"
        >
          <option value="all">Action: All Types</option>
          <option value="application_approved">Application Approved</option>
          <option value="application_rejected">Application Rejected</option>
          <option value="shop_suspended">Shop Suspended</option>
          <option value="shop_reactivated">Shop Reactivated</option>
          <option value="location_created">Location Created</option>
          <option value="location_updated">Location Updated</option>
          <option value="location_deactivated">Location Deactivated</option>
          <option value="payment_recorded">Payment Recorded</option>
          <option value="product_hidden">Product Moderated</option>
        </select>

        <select
          className="vaango-admin-select"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as any)}
          aria-label="Sort events order"
        >
          <option value="desc">Timestamp: Newest First</option>
          <option value="asc">Timestamp: Oldest First</option>
        </select>
      </SearchFilterBar>

      {/* Audit Stream Table */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton height={60} />
          <Skeleton height={60} />
          <Skeleton height={60} />
        </div>
      ) : logs.length === 0 ? (
        <Card variant="outlined" padding="lg" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {isFiltered ? (
            <div>
              <p style={{ margin: '0 0 12px 0' }}>No audit events found matching your search or filters.</p>
              <Button variant="outline" size="sm" onClick={handleResetFilters} leftIcon={<RotateCcw size={14} />}>
                Reset Search Filters
              </Button>
            </div>
          ) : (
            <p style={{ margin: 0 }}>No audit events recorded for this category.</p>
          )}
        </Card>
      ) : (
        <>
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
                    <th>Audit Summary</th>
                    <th style={{ textAlign: 'right' }}>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const isExpanded = expandedLogIds.has(log.id);
                    return (
                      <React.Fragment key={log.id}>
                        <tr className={isExpanded ? 'vaango-admin-tr--expanded' : ''}>
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
                            <CopyableText text={log.entity_id} truncate label="Copy Target ID" />
                          </td>
                          <td>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                              {log.admin_name || 'Operations Admin'}
                            </span>
                          </td>
                          <td>
                            {log.details && Object.keys(log.details).length > 0 ? (
                              <div className="vaango-audit-meta-wrap">
                                {Object.entries(log.details)
                                  .slice(0, 3)
                                  .map(([k, v]) => (
                                    <span key={k} className="vaango-audit-meta-pill">
                                      <strong>{k}:</strong> {String(v)}
                                    </span>
                                  ))}
                                {Object.keys(log.details).length > 3 && (
                                  <span className="vaango-audit-meta-pill text-muted">
                                    +{Object.keys(log.details).length - 3} more
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>—</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleExpand(log.id)}
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? 'Collapse event metadata' : 'Expand event metadata'}
                            >
                              {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </Button>
                          </td>
                        </tr>

                        {/* Expandable Metadata Detail Row */}
                        {isExpanded && (
                          <tr className="vaango-admin-audit__expand-row">
                            <td colSpan={7}>
                              <div className="vaango-admin-audit__details-panel">
                                <div className="vaango-admin-audit__details-header">
                                  <span className="vaango-admin-audit__details-title">
                                    <FileCode size={14} /> Full Audit Event Payload · ID: {log.id}
                                  </span>
                                  <button
                                    type="button"
                                    className="vaango-admin-audit__copy-btn"
                                    onClick={() => handleCopyJson(log)}
                                    aria-label="Copy JSON event payload to clipboard"
                                  >
                                    {copiedJsonId === log.id ? (
                                      <>
                                        <Check size={13} className="text-success" />
                                        <span>Copied JSON</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy size={13} />
                                        <span>Copy JSON</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="vaango-admin-audit__json-pre">
                                  {JSON.stringify(log, null, 2)}
                                </pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <PaginationControls
            currentPage={currentPage}
            totalItems={totalCount}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </>
      )}
    </div>
  );
};
