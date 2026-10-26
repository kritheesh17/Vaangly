import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  Ban,
  RotateCcw,
  History,
  User,
  Clock,
  Search,
  FileText,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  fetchAllModeratedCustomers,
  fetchCustomerCancellationHistory,
  adminModerateCustomer,
  fetchCancellationPolicy,
} from '../../lib/orderCancellationApi';
import {
  CustomerModeration,
  CustomerCancellationEvent,
  CancellationPolicySettings,
} from '../../types/database';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { CopyableText } from '../../components/common/CopyableText';
import './AdminCustomerModerationPage.css';

export const AdminCustomerModerationPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [customers, setCustomers] = useState<CustomerModeration[]>([]);
  const [policy, setPolicy] = useState<CancellationPolicySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'flagged' | 'suspended' | 'warned'>('all');

  // Modals & Action States
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerModeration | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<CustomerCancellationEvent[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendDuration, setSuspendDuration] = useState<number>(72); // 3 days default
  const [suspendReason, setSuspendReason] = useState('');

  const [reinstateModalOpen, setReinstateModalOpen] = useState(false);
  const [reinstateReason, setReinstateReason] = useState('');

  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningReason, setWarningReason] = useState('');

  const [clearFlagModalOpen, setClearFlagModalOpen] = useState(false);
  const [clearFlagReason, setClearFlagReason] = useState('');

  const [isActionLoading, setIsActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [allCusts, pol] = await Promise.all([
        fetchAllModeratedCustomers(),
        fetchCancellationPolicy(),
      ]);
      setCustomers(allCusts);
      setPolicy(pol);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to load customer moderation data.');
    } finally {
      setIsLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Statistics
  const stats = useMemo(() => {
    const total = customers.length;
    const flagged = customers.filter((c) => c.flagged_for_review && !c.is_suspended).length;
    const suspended = customers.filter((c) => {
      if (!c.is_suspended) return false;
      if (c.suspension_expires_at && new Date(c.suspension_expires_at).getTime() < Date.now()) {
        return false;
      }
      return true;
    }).length;
    const warned = customers.filter((c) => (c.warning_count || 0) > 0).length;
    return { total, flagged, suspended, warned };
  }, [customers]);

  // Filtered List
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Search match
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const nameMatch = c.profile?.full_name?.toLowerCase().includes(query);
        const emailMatch = c.profile?.email?.toLowerCase().includes(query);
        const phoneMatch = c.profile?.phone?.toLowerCase().includes(query);
        const idMatch = c.customer_id.toLowerCase().includes(query);
        if (!nameMatch && !emailMatch && !phoneMatch && !idMatch) {
          return false;
        }
      }

      // Tab match
      if (activeTab === 'flagged') {
        return c.flagged_for_review;
      }
      if (activeTab === 'suspended') {
        const isExp = c.suspension_expires_at && new Date(c.suspension_expires_at).getTime() < Date.now();
        return c.is_suspended && !isExp;
      }
      if (activeTab === 'warned') {
        return (c.warning_count || 0) > 0;
      }

      return true;
    });
  }, [customers, searchQuery, activeTab]);

  // Open History
  const handleOpenHistory = async (customer: CustomerModeration) => {
    setSelectedCustomer(customer);
    setHistoryModalOpen(true);
    setIsHistoryLoading(true);
    try {
      const events = await fetchCustomerCancellationHistory(customer.customer_id);
      setHistoryEvents(events);
    } catch {
      toastError('Failed to load cancellation history.');
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // Execute Suspend
  const handleConfirmSuspend = async () => {
    if (!selectedCustomer || !user) return;
    if (!suspendReason.trim()) {
      toastError('Please provide a reason for the temporary suspension.');
      return;
    }
    setIsActionLoading(true);
    try {
      const res = await adminModerateCustomer({
        customerId: selectedCustomer.customer_id,
        action: 'suspend',
        reason: suspendReason.trim(),
        durationHours: suspendDuration,
        adminId: user.id,
      });

      if (res.success) {
        success(res.message || 'Customer ordering privileges temporarily suspended.');
        setSuspendModalOpen(false);
        setSuspendReason('');
        await loadData();
      } else {
        toastError(res.error || 'Failed to suspend customer.');
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  // Execute Reinstate
  const handleConfirmReinstate = async () => {
    if (!selectedCustomer || !user) return;
    if (!reinstateReason.trim()) {
      toastError('Please provide an administrative note for reinstatement.');
      return;
    }
    setIsActionLoading(true);
    try {
      const res = await adminModerateCustomer({
        customerId: selectedCustomer.customer_id,
        action: 'reinstate',
        reason: reinstateReason.trim(),
        adminId: user.id,
      });

      if (res.success) {
        success(res.message || 'Customer ordering privileges reinstated.');
        setReinstateModalOpen(false);
        setReinstateReason('');
        await loadData();
      } else {
        toastError(res.error || 'Failed to reinstate customer.');
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  // Execute Issue Warning
  const handleConfirmWarning = async () => {
    if (!selectedCustomer || !user) return;
    if (!warningReason.trim()) {
      toastError('Please provide a reason for the formal warning.');
      return;
    }
    setIsActionLoading(true);
    try {
      const res = await adminModerateCustomer({
        customerId: selectedCustomer.customer_id,
        action: 'issue_warning',
        reason: warningReason.trim(),
        adminId: user.id,
      });

      if (res.success) {
        success(res.message || 'Formal warning issued to customer.');
        setWarningModalOpen(false);
        setWarningReason('');
        await loadData();
      } else {
        toastError(res.error || 'Failed to issue warning.');
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  // Execute Clear Flag
  const handleConfirmClearFlag = async () => {
    if (!selectedCustomer || !user) return;
    setIsActionLoading(true);
    try {
      const res = await adminModerateCustomer({
        customerId: selectedCustomer.customer_id,
        action: 'clear_flag',
        reason: clearFlagReason.trim() || 'Review completed by administrator.',
        adminId: user.id,
      });

      if (res.success) {
        success(res.message || 'Review flag cleared.');
        setClearFlagModalOpen(false);
        setClearFlagReason('');
        await loadData();
      } else {
        toastError(res.error || 'Failed to clear review flag.');
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="vaango-admin-moderation-page">
      {/* Header */}
      <div className="vaango-admin-moderation__header">
        <div className="vaango-admin-moderation__title-wrap">
          <h1>
            <ShieldAlert size={28} className="text-primary" />
            Customer Moderation & Abuse Prevention
          </h1>
          <p>
            Monitor repeated order cancellations, review customer warning patterns, and enforce ordering safeguards.
          </p>
        </div>
      </div>

      {/* Policy Thresholds Summary Bar */}
      <div className="vaango-admin-policy-bar">
        <div className="vaango-admin-policy-bar__header">
          <div className="flex items-center gap-2">
            <Layers size={16} />
            <span>Active Automated Policy Framework ({policy?.window_days || 30}-Day Rolling Window)</span>
          </div>
          <Badge variant="primary" size="sm">Server Enforced</Badge>
        </div>
        <div className="vaango-admin-policy-steps">
          <div className="vaango-admin-policy-step">
            <strong>1st Cancellation</strong>
            <span>Polite reminder notification to consider shop preparation time.</span>
          </div>
          <div className="vaango-admin-policy-step">
            <strong>2nd Cancellation</strong>
            <span>Formal warning recorded and delivered directly to the customer.</span>
          </div>
          <div className="vaango-admin-policy-step">
            <strong>3rd Cancellation</strong>
            <span>Account flagged for admin review and affected merchant alerted.</span>
          </div>
          <div className="vaango-admin-policy-step">
            <strong>Subsequent Abuse</strong>
            <span>Eligible for temporary ordering suspension subject to admin review.</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="vaango-admin-mod-stats">
        <div className="vaango-admin-stat-card">
          <div className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--blue">
            <User size={22} />
          </div>
          <div>
            <div className="vaango-admin-stat-card__val">{stats.total}</div>
            <div className="vaango-admin-stat-card__label">Monitored Accounts</div>
          </div>
        </div>

        <div className="vaango-admin-stat-card">
          <div className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--amber">
            <AlertTriangle size={22} />
          </div>
          <div>
            <div className="vaango-admin-stat-card__val">{stats.flagged}</div>
            <div className="vaango-admin-stat-card__label">Flagged for Review</div>
          </div>
        </div>

        <div className="vaango-admin-stat-card">
          <div className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--red">
            <Ban size={22} />
          </div>
          <div>
            <div className="vaango-admin-stat-card__val">{stats.suspended}</div>
            <div className="vaango-admin-stat-card__label">Temporarily Suspended</div>
          </div>
        </div>

        <div className="vaango-admin-stat-card">
          <div className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--purple">
            <ShieldAlert size={22} />
          </div>
          <div>
            <div className="vaango-admin-stat-card__val">{stats.warned}</div>
            <div className="vaango-admin-stat-card__label">Warnings Issued</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="vaango-admin-filter-bar">
        <div className="vaango-admin-filter-tabs">
          <button
            type="button"
            className={`vaango-admin-tab-btn ${activeTab === 'all' ? 'vaango-admin-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Accounts ({customers.length})
          </button>
          <button
            type="button"
            className={`vaango-admin-tab-btn ${activeTab === 'flagged' ? 'vaango-admin-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('flagged')}
          >
            Flagged for Review ({stats.flagged})
          </button>
          <button
            type="button"
            className={`vaango-admin-tab-btn ${activeTab === 'suspended' ? 'vaango-admin-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('suspended')}
          >
            Suspended ({stats.suspended})
          </button>
          <button
            type="button"
            className={`vaango-admin-tab-btn ${activeTab === 'warned' ? 'vaango-admin-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('warned')}
          >
            Warned ({stats.warned})
          </button>
        </div>

        <div className="relative min-w-[280px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer name, phone, or ID..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Customers Moderation Table */}
      <Card variant="default" padding="none" className="vaango-admin-table-card">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton height="36px" borderRadius="8px" />
            <Skeleton height="48px" borderRadius="8px" />
            <Skeleton height="48px" borderRadius="8px" />
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-muted">
            <CheckCircle size={40} className="mx-auto text-success mb-2 opacity-80" />
            <h3 className="font-bold text-base text-foreground">No Moderated Accounts Found</h3>
            <p className="text-xs text-muted max-w-md mx-auto mt-1">
              {searchQuery
                ? 'No customer accounts matched your search criteria.'
                : 'All customer accounts are in good standing with zero abuse flags.'}
            </p>
          </div>
        ) : (
          <div className="vaango-admin-table-wrap">
            <table className="vaango-admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>30-Day Cancellations</th>
                  <th>Warnings Issued</th>
                  <th>Moderation Status</th>
                  <th>Last Warning</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((cust) => {
                  const isSuspended =
                    cust.is_suspended &&
                    (!cust.suspension_expires_at || new Date(cust.suspension_expires_at).getTime() > Date.now());

                  return (
                    <tr key={cust.customer_id}>
                      <td>
                        <div className="vaango-admin-customer-info">
                          <span className="vaango-admin-customer-name">
                            {cust.profile?.full_name || 'Customer Account'}
                          </span>
                          <span className="vaango-admin-customer-meta">
                            {cust.profile?.phone || cust.profile?.email || 'No phone recorded'}
                            <span>•</span>
                            <CopyableText text={cust.customer_id} displayValue={`${cust.customer_id.slice(0, 8)}...`} />
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="font-bold text-base">
                          {cust.warning_count || 0}
                          <span className="text-xs font-normal text-muted ml-1">in 30d</span>
                        </div>
                      </td>
                      <td>
                        <Badge
                          variant={(cust.warning_count || 0) > 1 ? 'warning' : 'neutral'}
                          size="sm"
                        >
                          {cust.warning_count || 0} Warnings
                        </Badge>
                      </td>
                      <td>
                        {isSuspended ? (
                          <div>
                            <Badge variant="error" size="sm" withDot>
                              Suspended
                            </Badge>
                            {cust.suspension_expires_at && (
                              <div className="text-xs text-muted mt-1">
                                Until: {new Date(cust.suspension_expires_at).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </div>
                            )}
                          </div>
                        ) : cust.flagged_for_review ? (
                          <div>
                            <Badge variant="warning" size="sm" withDot>
                              Flagged for Review
                            </Badge>
                            {cust.flag_reason && (
                              <div className="text-xs text-muted mt-0.5 max-w-[200px] truncate" title={cust.flag_reason}>
                                {cust.flag_reason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Badge variant="success" size="sm" withDot>
                            Good Standing
                          </Badge>
                        )}
                      </td>
                      <td>
                        {cust.last_warning_at ? (
                          <div className="text-xs">
                            <div className="font-semibold text-foreground">
                              {cust.last_warning_level === 'formal_warning' ? 'Formal Warning' : 'Reminder'}
                            </div>
                            <div className="text-muted">
                              {new Date(cust.last_warning_at).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">None</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="vaango-admin-table-actions justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleOpenHistory(cust)}
                            leftIcon={<History size={14} />}
                          >
                            History
                          </Button>

                          {isSuspended ? (
                            <Button
                              variant="accent"
                              size="sm"
                              onClick={() => {
                                setSelectedCustomer(cust);
                                setReinstateModalOpen(true);
                              }}
                              leftIcon={<RotateCcw size={14} />}
                            >
                              Reinstate
                            </Button>
                          ) : (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => {
                                setSelectedCustomer(cust);
                                setSuspendModalOpen(true);
                              }}
                              leftIcon={<Ban size={14} />}
                            >
                              Suspend
                            </Button>
                          )}

                          {cust.flagged_for_review && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedCustomer(cust);
                                setClearFlagModalOpen(true);
                              }}
                              leftIcon={<CheckCircle size={14} />}
                            >
                              Clear Flag
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedCustomer(cust);
                              setWarningModalOpen(true);
                            }}
                            leftIcon={<AlertTriangle size={14} />}
                          >
                            Warn
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* History Modal */}
      <Modal
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false);
          setSelectedCustomer(null);
          setHistoryEvents([]);
        }}
        title={`Cancellation History — ${selectedCustomer?.profile?.full_name || selectedCustomer?.customer_id.slice(0, 8) || 'Customer'}`}
        description="Full chronological audit trail of cancellation events for this account."
        maxWidth="md"
      >
        <div className="space-y-4">
          {isHistoryLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton height="36px" borderRadius="8px" />
              <Skeleton height="36px" borderRadius="8px" />
            </div>
          ) : historyEvents.length === 0 ? (
            <div className="p-8 text-center text-muted">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No historical cancellation events recorded for this customer.</p>
            </div>
          ) : (
            <div className="vaango-admin-history-list">
              {historyEvents.map((evt) => (
                <div key={evt.id} className="vaango-admin-history-item">
                  <div className="vaango-admin-history-item__header">
                    <span className="font-bold text-foreground">
                      Order #{evt.order_reference}
                    </span>
                    <Badge variant={evt.is_qualifying ? 'warning' : 'neutral'} size="sm">
                      {evt.is_qualifying ? 'Qualifying Abuse Event' : 'Excluded from Count'}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    <strong>Reason:</strong> {evt.reason}
                    {evt.explanation && <span className="italic text-muted ml-1">&ldquo;{evt.explanation}&rdquo;</span>}
                  </div>
                  <div className="vaango-admin-history-item__meta">
                    <span>
                      <strong>Previous State:</strong> {evt.previous_state}
                    </span>
                    <span>
                      <strong>Prep Started:</strong> {evt.preparation_started ? 'Yes' : 'No'}
                    </span>
                    <span>
                      <strong>Actor:</strong> {evt.actor_role}
                    </span>
                    <span>
                      <Clock size={12} className="inline mr-1" />
                      {new Date(evt.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Suspend Customer Modal */}
      <Modal
        isOpen={suspendModalOpen}
        onClose={() => {
          setSuspendModalOpen(false);
          setSuspendReason('');
        }}
        title="Temporarily Suspend Ordering Privileges"
        description="Prevent this customer from creating new orders across all shops. Server-side triggers and API guards will enforce this block."
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Suspension Duration *
            </label>
            <select
              value={suspendDuration}
              onChange={(e) => setSuspendDuration(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value={24}>24 Hours (1 Day)</option>
              <option value={72}>72 Hours (3 Days)</option>
              <option value={168}>7 Days (1 Week)</option>
              <option value={336}>14 Days (2 Weeks)</option>
              <option value={720}>30 Days (1 Month)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Suspension Rationale & Admin Note *
            </label>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Repeated cancellations after orders entered preparation state despite multiple warnings."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setSuspendModalOpen(false);
                setSuspendReason('');
              }}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              isLoading={isActionLoading}
              disabled={!suspendReason.trim()}
              onClick={() => void handleConfirmSuspend()}
            >
              Confirm Suspension
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reinstate Customer Modal */}
      <Modal
        isOpen={reinstateModalOpen}
        onClose={() => {
          setReinstateModalOpen(false);
          setReinstateReason('');
        }}
        title="Reinstate Customer Ordering Privileges"
        description="Lift the temporary suspension and restore the customer's ability to place orders."
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Reinstatement Note / Reason *
            </label>
            <textarea
              value={reinstateReason}
              onChange={(e) => setReinstateReason(e.target.value)}
              placeholder="e.g. Customer contacted support and verified genuine misunderstanding regarding shop prep time."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setReinstateModalOpen(false);
                setReinstateReason('');
              }}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              size="md"
              isLoading={isActionLoading}
              disabled={!reinstateReason.trim()}
              onClick={() => void handleConfirmReinstate()}
            >
              Confirm Reinstatement
            </Button>
          </div>
        </div>
      </Modal>

      {/* Issue Formal Warning Modal */}
      <Modal
        isOpen={warningModalOpen}
        onClose={() => {
          setWarningModalOpen(false);
          setWarningReason('');
        }}
        title="Issue Formal Customer Warning"
        description="Record a formal warning and send a persistent warning notification to the customer's account."
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Warning Reason *
            </label>
            <textarea
              value={warningReason}
              onChange={(e) => setWarningReason(e.target.value)}
              placeholder="e.g. Cancelling multiple orders after shopkeeper commenced food preparation."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setWarningModalOpen(false);
                setWarningReason('');
              }}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              isLoading={isActionLoading}
              disabled={!warningReason.trim()}
              onClick={() => void handleConfirmWarning()}
            >
              Issue Warning
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear Review Flag Modal */}
      <Modal
        isOpen={clearFlagModalOpen}
        onClose={() => {
          setClearFlagModalOpen(false);
          setClearFlagReason('');
        }}
        title="Clear Review Flag"
        description="Acknowledge that this customer's account has been reviewed by an administrator."
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Admin Review Resolution Note
            </label>
            <textarea
              value={clearFlagReason}
              onChange={(e) => setClearFlagReason(e.target.value)}
              placeholder="e.g. Verified valid cancellations due to verified merchant pickup delay."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setClearFlagModalOpen(false);
                setClearFlagReason('');
              }}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              isLoading={isActionLoading}
              onClick={() => void handleConfirmClearFlag()}
            >
              Clear Flag
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
