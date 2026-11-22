import React, { useState, useEffect, useCallback } from 'react';
import {
  IndianRupee,
  Calendar,
  Download,
  Filter,
  Search,
  CheckCircle,
  Eye,
  Building2,
  FileText,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatINR } from '../../lib/currency';
import {
  fetchAdminFinancialKPIs,
  fetchAdminMerchantDirectory,
  fetchMerchantSettlements,
  verifyMerchantSettlement,
  fetchMerchantLedger,
  fetchMerchantFinancialSummary,
  exportToCSV,
} from '../../lib/financeApi';
import {
  AdminFinancialKPIs,
  MerchantDirectoryItem,
  MerchantSettlement,
  PlatformFeeLedgerEntry,
  MerchantFinancialSummary,
} from '../../types/finance';
import './AdminFinancialPage.css';

type DateFilterOption = 'all' | 'today' | 'yesterday' | '7days' | 'this_week' | 'this_month' | 'prev_month';

export const AdminFinancialPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<'overview' | 'directory' | 'settlements'>('overview');
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all');
  const [isLoadingKPIs, setIsLoadingKPIs] = useState(true);
  const [kpis, setKpis] = useState<AdminFinancialKPIs | null>(null);

  // Merchant Directory state
  const [directoryItems, setDirectoryItems] = useState<MerchantDirectoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState<'all' | 'outstanding' | 'settled' | 'restricted'>('all');
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  // Settlement Queue state
  const [settlements, setSettlements] = useState<MerchantSettlement[]>([]);
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'submitted' | 'verified' | 'rejected'>('all');
  const [isLoadingSettlements, setIsLoadingSettlements] = useState(false);

  // Action modals
  const [selectedSettlement, setSelectedSettlement] = useState<MerchantSettlement | null>(null);
  const [verifiedAmountInput, setVerifiedAmountInput] = useState('');
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Drill-down merchant profile modal
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantDirectoryItem | null>(null);
  const [merchantSummary, setMerchantSummary] = useState<MerchantFinancialSummary | null>(null);
  const [merchantLedger, setMerchantLedger] = useState<PlatformFeeLedgerEntry[]>([]);
  const [isLoadingDrillDown, setIsLoadingDrillDown] = useState(false);

  const getDateRange = (filter: DateFilterOption): { start?: string; end?: string } => {
    const now = new Date();
    if (filter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      return { start };
    }
    if (filter === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
      const end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59).toISOString();
      return { start, end };
    }
    if (filter === '7days') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      return { start };
    }
    if (filter === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(now.setDate(diff)).toISOString();
      return { start };
    }
    if (filter === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      return { start };
    }
    if (filter === 'prev_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
      return { start, end };
    }
    return {};
  };

  const loadKPIs = useCallback(async () => {
    setIsLoadingKPIs(true);
    const range = getDateRange(dateFilter);
    const data = await fetchAdminFinancialKPIs(range.start, range.end);
    setKpis(data);
    setIsLoadingKPIs(false);
  }, [dateFilter]);

  const loadDirectory = useCallback(async () => {
    setIsLoadingDirectory(true);
    const data = await fetchAdminMerchantDirectory();
    setDirectoryItems(data);
    setIsLoadingDirectory(false);
  }, []);

  const loadSettlements = useCallback(async () => {
    setIsLoadingSettlements(true);
    const data = await fetchMerchantSettlements({ status: settlementFilter });
    setSettlements(data);
    setIsLoadingSettlements(false);
  }, [settlementFilter]);

  useEffect(() => {
    loadKPIs();
  }, [loadKPIs]);

  useEffect(() => {
    if (activeTab === 'directory') {
      loadDirectory();
    } else if (activeTab === 'settlements') {
      loadSettlements();
    }
  }, [activeTab, loadDirectory, loadSettlements]);

  // Drill-down open
  const handleOpenMerchantProfile = async (item: MerchantDirectoryItem) => {
    setSelectedMerchant(item);
    setIsLoadingDrillDown(true);
    const [summary, ledger] = await Promise.all([
      fetchMerchantFinancialSummary(item.shop_id),
      fetchMerchantLedger(item.shop_id, 50),
    ]);
    setMerchantSummary(summary);
    setMerchantLedger(ledger);
    setIsLoadingDrillDown(false);
  };

  // Settlement Verification
  const handleVerifySettlement = async (settlementId: string) => {
    if (!user) return;
    const amountRupees = parseFloat(verifiedAmountInput);
    if (isNaN(amountRupees) || amountRupees <= 0) {
      toastError('Please enter a valid positive verified amount in Rupees.');
      return;
    }
    setIsVerifying(true);
    const res = await verifyMerchantSettlement({
      settlementId,
      action: 'verify',
      verifiedAmountPaise: Math.round(amountRupees * 100),
      adminId: user.id,
    });
    if (res.success) {
      success('Settlement verified and allocated to merchant liabilities successfully.');
      setSelectedSettlement(null);
      setVerifiedAmountInput('');
      await loadSettlements();
      await loadKPIs();
    } else {
      toastError(res.error || 'Failed to verify settlement.');
    }
    setIsVerifying(false);
  };

  // Settlement Rejection
  const handleRejectSettlement = async (settlementId: string) => {
    if (!user) return;
    if (!rejectionReasonInput.trim()) {
      toastError('Please provide a reason for rejecting the settlement.');
      return;
    }
    setIsVerifying(true);
    const res = await verifyMerchantSettlement({
      settlementId,
      action: 'reject',
      rejectionReason: rejectionReasonInput.trim(),
      adminId: user.id,
    });
    if (res.success) {
      success('Settlement marked as rejected.');
      setSelectedSettlement(null);
      setRejectionReasonInput('');
      await loadSettlements();
      await loadKPIs();
    } else {
      toastError(res.error || 'Failed to reject settlement.');
    }
    setIsVerifying(false);
  };

  // CSV Export for Directory
  const handleExportDirectoryCSV = () => {
    const headers = [
      'Shop Name',
      'Owner Name',
      'Owner Phone',
      'Financial Status',
      'Completed Orders',
      'Total GMV (INR)',
      'Fees Assessed (INR)',
      'Verified Settled (INR)',
      'Outstanding Balance (INR)',
      'Days Overdue',
    ];
    const rows = directoryItems.map((m) => [
      m.shop_name,
      m.owner_name || '',
      m.owner_phone || '',
      m.financial_status,
      m.completed_orders,
      m.gmv_rupees,
      m.fees_assessed_rupees,
      m.verified_settled_rupees,
      m.outstanding_balance_rupees,
      m.days_overdue,
    ]);
    exportToCSV(`vaangly_merchant_financial_directory_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  // Filtered Directory Items
  const filteredDirectory = directoryItems.filter((m) => {
    const matchesSearch =
      m.shop_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.owner_name && m.owner_name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;
    if (directoryFilter === 'outstanding') return m.outstanding_balance_rupees > 0;
    if (directoryFilter === 'settled') return m.outstanding_balance_rupees === 0;
    if (directoryFilter === 'restricted') return m.financial_status === 'RESTRICTED' || m.financial_status === 'SUSPENDED';
    return true;
  });

  return (
    <div className="vaango-admin-finance">
      {/* Header */}
      <div className="vaango-admin-finance__header">
        <div>
          <h1 className="vaango-admin-finance__title">Financial Management & Ledger</h1>
          <p className="vaango-admin-finance__subtitle">
            Customer-paid platform fees, merchant liabilities, verified settlement remittances, and risk controls.
          </p>
        </div>

        <div className="vaango-admin-finance__controls">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-muted" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilterOption)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-surface text-foreground"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="prev_month">Previous Month</option>
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadKPIs();
              if (activeTab === 'directory') loadDirectory();
              if (activeTab === 'settlements') loadSettlements();
            }}
            leftIcon={<RefreshCw size={14} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="vaango-admin-finance__tabs">
        <button
          className={`vaango-admin-finance__tab ${activeTab === 'overview' ? 'vaango-admin-finance__tab--active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <IndianRupee size={16} />
          <span>Financial Overview</span>
        </button>
        <button
          className={`vaango-admin-finance__tab ${activeTab === 'directory' ? 'vaango-admin-finance__tab--active' : ''}`}
          onClick={() => setActiveTab('directory')}
        >
          <Building2 size={16} />
          <span>Merchant Directory</span>
        </button>
        <button
          className={`vaango-admin-finance__tab ${activeTab === 'settlements' ? 'vaango-admin-finance__tab--active' : ''}`}
          onClick={() => setActiveTab('settlements')}
        >
          <FileText size={16} />
          <span>Settlement Queue</span>
          {kpis && kpis.pending_settlement_requests_count > 0 && (
            <Badge variant="warning" size="sm">
              {kpis.pending_settlement_requests_count}
            </Badge>
          )}
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {isLoadingKPIs ? (
            <div className="vaango-admin-finance__kpi-grid">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} height="120px" borderRadius="12px" />
              ))}
            </div>
          ) : (
            <>
              {/* Primary Financial Flow KPIs */}
              <div className="vaango-admin-finance__kpi-grid">
                <Card variant="default" className="vaango-admin-finance-card">
                  <span className="vaango-admin-finance-card__label">Total Order Value (GMV)</span>
                  <span className="vaango-admin-finance-card__value">
                    {formatINR((kpis?.total_gmv_paise || 0) / 100)}
                  </span>
                  <span className="vaango-admin-finance-card__sub">
                    {kpis?.total_completed_orders || 0} completed customer orders
                  </span>
                </Card>

                <Card variant="default" className="vaango-admin-finance-card">
                  <span className="vaango-admin-finance-card__label">Net Platform Fees Assessed</span>
                  <span className="vaango-admin-finance-card__value text-primary">
                    {formatINR((kpis?.net_platform_fees_owed_paise || 0) / 100)}
                  </span>
                  <span className="vaango-admin-finance-card__sub">
                    Customer-paid fees collected by merchants
                  </span>
                </Card>

                <Card variant="default" className="vaango-admin-finance-card">
                  <span className="vaango-admin-finance-card__label">Verified Fees Collected</span>
                  <span className="vaango-admin-finance-card__value text-success">
                    {formatINR((kpis?.verified_fees_collected_paise || 0) / 100)}
                  </span>
                  <span className="vaango-admin-finance-card__sub">
                    Remitted by merchants and verified in Vaangly account
                  </span>
                </Card>

                <Card variant="default" className="vaango-admin-finance-card">
                  <span className="vaango-admin-finance-card__label">Total Outstanding Balance</span>
                  <span className="vaango-admin-finance-card__value text-warning">
                    {formatINR((kpis?.total_outstanding_paise || 0) / 100)}
                  </span>
                  <span className="vaango-admin-finance-card__sub">
                    Current merchant remittance liability
                  </span>
                </Card>
              </div>

              {/* Merchant Standing Breakdown */}
              <div className="vaango-admin-finance__kpi-grid">
                <Card variant="outlined" padding="md">
                  <div className="text-xs uppercase font-bold text-muted mb-1">Total Registered Merchants</div>
                  <div className="text-2xl font-extrabold">{kpis?.total_registered_merchants || 0}</div>
                  <div className="text-xs text-muted mt-1">
                    {kpis?.merchants_with_completed_orders || 0} merchants with orders
                  </div>
                </Card>

                <Card variant="outlined" padding="md">
                  <div className="text-xs uppercase font-bold text-muted mb-1">Merchants with Outstanding Fees</div>
                  <div className="text-2xl font-extrabold text-warning">
                    {kpis?.merchants_with_outstanding_fees || 0}
                  </div>
                  <div className="text-xs text-muted mt-1">Awaiting settlement remittance</div>
                </Card>

                <Card variant="outlined" padding="md">
                  <div className="text-xs uppercase font-bold text-muted mb-1">Fully Settled Merchants</div>
                  <div className="text-2xl font-extrabold text-success">
                    {kpis?.fully_settled_merchants || 0}
                  </div>
                  <div className="text-xs text-muted mt-1">Zero outstanding balance</div>
                </Card>

                <Card variant="outlined" padding="md">
                  <div className="text-xs uppercase font-bold text-muted mb-1">Pending Settlement Remittances</div>
                  <div className="text-2xl font-extrabold text-primary">
                    {kpis?.pending_settlement_requests_count || 0}
                  </div>
                  <div className="text-xs text-muted mt-1">Requiring bank verification</div>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: MERCHANT DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          <div className="vaango-admin-finance__search-bar">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search by shop or owner name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-surface text-foreground"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={directoryFilter}
                onChange={(e) => setDirectoryFilter(e.target.value as any)}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-border bg-surface text-foreground"
              >
                <option value="all">All Merchants</option>
                <option value="outstanding">With Outstanding Balance</option>
                <option value="settled">Fully Settled</option>
                <option value="restricted">Restricted / Warning</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportDirectoryCSV}
                leftIcon={<Download size={14} />}
              >
                Export CSV
              </Button>
            </div>
          </div>

          <div className="vaango-admin-finance__table-wrap">
            <table className="vaango-admin-finance__table">
              <thead>
                <tr>
                  <th>Shop & Owner</th>
                  <th>Completed Orders</th>
                  <th>Order GMV</th>
                  <th>Fees Assessed</th>
                  <th>Verified Settled</th>
                  <th>Outstanding Balance</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingDirectory ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted">
                      Loading merchant financial records...
                    </td>
                  </tr>
                ) : filteredDirectory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted">
                      No merchants match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredDirectory.map((m) => (
                    <tr key={m.shop_id}>
                      <td>
                        <div className="font-bold text-foreground">{m.shop_name}</div>
                        <div className="text-xs text-muted">{m.owner_name || m.owner_phone || 'Owner'}</div>
                      </td>
                      <td className="font-semibold">{m.completed_orders}</td>
                      <td>{formatINR(m.gmv_rupees)}</td>
                      <td className="text-primary font-medium">{formatINR(m.fees_assessed_rupees)}</td>
                      <td className="text-success font-medium">{formatINR(m.verified_settled_rupees)}</td>
                      <td>
                        <span className={`font-bold ${m.outstanding_balance_rupees > 0 ? 'text-warning' : 'text-success'}`}>
                          {formatINR(m.outstanding_balance_rupees)}
                        </span>
                        {m.days_overdue > 7 && (
                          <span className="block text-[10px] text-error font-semibold mt-0.5">
                            {m.days_overdue} days overdue
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge
                          variant={
                            m.financial_status === 'ACTIVE'
                              ? 'success'
                              : m.financial_status === 'WARNING'
                              ? 'warning'
                              : 'error'
                          }
                          size="sm"
                        >
                          {m.financial_status}
                        </Badge>
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenMerchantProfile(m)}
                          leftIcon={<Eye size={14} />}
                        >
                          View Ledger
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SETTLEMENT QUEUE */}
      {activeTab === 'settlements' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-muted" />
              <select
                value={settlementFilter}
                onChange={(e) => setSettlementFilter(e.target.value as any)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-surface text-foreground"
              >
                <option value="all">All Settlements</option>
                <option value="submitted">Pending Verification</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="vaango-admin-finance__table-wrap">
            <table className="vaango-admin-finance__table">
              <thead>
                <tr>
                  <th>Submission Date</th>
                  <th>Shop</th>
                  <th>Remitted Amount</th>
                  <th>Method & UTR</th>
                  <th>Proof Document</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingSettlements ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted">
                      Loading settlements...
                    </td>
                  </tr>
                ) : settlements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted">
                      No settlements found.
                    </td>
                  </tr>
                ) : (
                  settlements.map((st) => (
                    <tr key={st.id}>
                      <td className="text-xs text-muted">
                        {new Date(st.submitted_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="font-semibold text-foreground">
                        {st.shops?.name || 'Merchant'}
                      </td>
                      <td className="font-bold text-base text-primary">
                        {formatINR(st.amount_paise / 100)}
                      </td>
                      <td>
                        <span className="block text-xs uppercase font-bold text-secondary">
                          {st.payment_method}
                        </span>
                        <span className="font-mono text-xs text-foreground">
                          {st.transaction_reference}
                        </span>
                      </td>
                      <td>
                        {st.proof_document_url ? (
                          <a
                            href={st.proof_document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary flex items-center gap-1 hover:underline"
                          >
                            <ExternalLink size={12} />
                            <span>View Proof</span>
                          </a>
                        ) : (
                          <span className="text-xs text-muted">No doc attached</span>
                        )}
                      </td>
                      <td>
                        <Badge
                          variant={
                            st.verification_status === 'verified'
                              ? 'success'
                              : st.verification_status === 'submitted'
                              ? 'warning'
                              : 'error'
                          }
                          size="sm"
                        >
                          {st.verification_status.toUpperCase()}
                        </Badge>
                      </td>
                      <td>
                        {st.verification_status === 'submitted' ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setSelectedSettlement(st);
                              setVerifiedAmountInput((st.amount_paise / 100).toString());
                              setRejectionReasonInput('');
                            }}
                          >
                            Review & Verify
                          </Button>
                        ) : (
                          <span className="text-xs text-muted">Completed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: SETTLEMENT REVIEW & VERIFY */}
      {selectedSettlement && (
        <Modal
          isOpen={Boolean(selectedSettlement)}
          onClose={() => setSelectedSettlement(null)}
          title={`Review Settlement Remittance — ${selectedSettlement.shops?.name || 'Merchant'}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-secondary">Reported Amount:</span>
                <strong className="text-primary">{formatINR(selectedSettlement.amount_paise / 100)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Payment Method:</span>
                <span className="font-medium uppercase">{selectedSettlement.payment_method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Transaction Ref (UTR):</span>
                <span className="font-mono font-semibold">{selectedSettlement.transaction_reference}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 rounded-xl text-xs">
              <strong>Mandatory Verification Rule:</strong> Confirm that this exact amount has visibly arrived in Vaangly’s bank account before clicking Approve. Never verify based on screenshot alone.
            </div>

            <div>
              <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-1">
                Verified Amount Received (INR)
              </label>
              <Input
                type="number"
                step="0.01"
                value={verifiedAmountInput}
                onChange={(e) => setVerifiedAmountInput(e.target.value)}
                placeholder="Enter verified incoming amount"
                disabled={isVerifying}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-secondary uppercase tracking-wider mb-1">
                Rejection Reason (only if rejecting)
              </label>
              <Input
                type="text"
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                placeholder="e.g. UTR not found on bank statement"
                disabled={isVerifying}
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => handleRejectSettlement(selectedSettlement.id)}
                disabled={isVerifying || !rejectionReasonInput.trim()}
                className="text-error border-error/30 hover:bg-error/10"
              >
                Reject Remittance
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setSelectedSettlement(null)}
                  disabled={isVerifying}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  isLoading={isVerifying}
                  onClick={() => handleVerifySettlement(selectedSettlement.id)}
                  leftIcon={<CheckCircle size={16} />}
                >
                  Verify & Allocate
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 2: INDIVIDUAL MERCHANT DRILL-DOWN PROFILE */}
      {selectedMerchant && (
        <Modal
          isOpen={Boolean(selectedMerchant)}
          onClose={() => setSelectedMerchant(null)}
          title={`Financial Ledger Profile — ${selectedMerchant.shop_name}`}
          maxWidth="lg"
        >
          <div className="space-y-5">
            {/* Merchant Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-surface-subtle border border-border rounded-xl">
                <span className="text-[10px] font-bold uppercase text-muted block">Completed Orders</span>
                <span className="text-xl font-bold">{merchantSummary?.total_completed_orders ?? selectedMerchant.completed_orders}</span>
              </div>
              <div className="p-3 bg-surface-subtle border border-border rounded-xl">
                <span className="text-[10px] font-bold uppercase text-muted block">Gross Order GMV</span>
                <span className="text-xl font-bold">{formatINR((merchantSummary?.gmv_paise ?? 0) / 100 || selectedMerchant.gmv_rupees)}</span>
              </div>
              <div className="p-3 bg-surface-subtle border border-border rounded-xl">
                <span className="text-[10px] font-bold uppercase text-muted block">Fees Assessed</span>
                <span className="text-xl font-bold text-primary">{formatINR((merchantSummary?.net_fees_owed_paise ?? 0) / 100 || selectedMerchant.fees_assessed_rupees)}</span>
              </div>
              <div className="p-3 bg-surface-subtle border border-border rounded-xl">
                <span className="text-[10px] font-bold uppercase text-muted block">Outstanding Balance</span>
                <span className="text-xl font-bold text-warning">{formatINR((merchantSummary?.outstanding_balance_paise ?? 0) / 100 || selectedMerchant.outstanding_balance_rupees)}</span>
              </div>
            </div>

            {/* Append-Only Ledger Table */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-secondary mb-2">
                Append-Only Platform Fee Ledger Entries
              </h3>
              <div className="vaango-admin-finance__table-wrap max-h-[300px]">
                <table className="vaango-admin-finance__table text-xs">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Entry Type</th>
                      <th>Amount</th>
                      <th>Order Reference</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingDrillDown ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-muted">
                          Loading ledger entries...
                        </td>
                      </tr>
                    ) : merchantLedger.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-muted">
                          No ledger entries found for this merchant.
                        </td>
                      </tr>
                    ) : (
                      merchantLedger.map((entry) => (
                        <tr key={entry.id}>
                          <td>{new Date(entry.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                          <td>
                            <Badge
                              variant={entry.entry_type === 'fee_assessed' ? 'primary' : entry.entry_type === 'fee_reversed' ? 'error' : 'neutral'}
                              size="sm"
                            >
                              {entry.entry_type}
                            </Badge>
                          </td>
                          <td className="font-bold">
                            {entry.amount_paise > 0 ? `+₹${entry.amount_paise / 100}` : `-₹${Math.abs(entry.amount_paise) / 100}`}
                          </td>
                          <td className="font-mono">{entry.requests?.reference_code || 'N/A'}</td>
                          <td className="text-muted">{entry.notes || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedMerchant(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
