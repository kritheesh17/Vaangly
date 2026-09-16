import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Clock,
  ArrowLeft,
  Receipt,
  Store,
  Info,
  AlertCircle,
} from 'lucide-react';
import {
  fetchAdminSubscriptions,
  recordSubscriptionPayment,
  fetchSubscriptionPayments,
  calculateTrialWindow,
} from '../../lib/adminApi';
import { getStoredMockShops } from '../../lib/shopkeeperApi';
import { Shop, ShopSubscription, SubscriptionPayment, SubscriptionStatus } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import './AdminSubscriptionsPage.css';

export const AdminSubscriptionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { success } = useToast();

  const [subscriptions, setSubscriptions] = useState<ShopSubscription[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Status Filter
  const statusFilter = (searchParams.get('status') || 'all') as SubscriptionStatus | 'all';

  // Modal State: Record Manual Payment
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<ShopSubscription | null>(null);
  const [amountPaid, setAmountPaid] = useState<number>(300);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [billingCycle, setBillingCycle] = useState<'WEEKLY' | 'MONTHLY'>('MONTHLY');
  const [periodStart, setPeriodStart] = useState<string>(new Date().toISOString().split('T')[0]);
  const [periodEnd, setPeriodEnd] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  // View Payments History Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [activeHistoryShop, setActiveHistoryShop] = useState<Shop | null>(null);
  const [historyPayments, setHistoryPayments] = useState<SubscriptionPayment[]>([]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [subsData, allPayments] = await Promise.all([
        fetchAdminSubscriptions(statusFilter),
        fetchSubscriptionPayments(),
      ]);
      setSubscriptions(subsData);
      setPayments(allPayments);
      setShops(getStoredMockShops());
    } catch (err) {
      console.error('Error loading subscriptions data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleFilterChange = (st: string) => {
    const params = new URLSearchParams(searchParams);
    if (st === 'all') params.delete('status');
    else params.set('status', st);
    setSearchParams(params);
  };

  const handleOpenRecordPayment = (sub: ShopSubscription, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedSub(sub);
    const defaultAmount = sub.billing_cycle === 'WEEKLY' ? sub.daily_rate * 7 : sub.daily_rate * 30;
    setAmountPaid(sub.amount_due > 0 ? sub.amount_due : defaultAmount);
    setBillingCycle(sub.billing_cycle);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPeriodStart(new Date().toISOString().split('T')[0]);
    const durationDays = sub.billing_cycle === 'WEEKLY' ? 7 : 30;
    setPeriodEnd(new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setPaymentRef(`UPI-${Math.floor(100000 + Math.random() * 900000)}`);
    setNotes('Verified in platform operations bank account.');
    setRecordError(null);
    setPaymentModalOpen(true);
  };

  const handleCycleChange = (newCycle: 'WEEKLY' | 'MONTHLY') => {
    setBillingCycle(newCycle);
    if (selectedSub) {
      const days = newCycle === 'WEEKLY' ? 7 : 30;
      setAmountPaid(selectedSub.daily_rate * days);
      const start = new Date(periodStart);
      setPeriodEnd(new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub || !user) return;
    setRecordError(null);

    if (!paymentRef.trim()) {
      setRecordError('UPI transaction reference or receipt note is required.');
      return;
    }
    if (amountPaid <= 0) {
      setRecordError('Payment amount must be greater than zero.');
      return;
    }

    setIsRecording(true);
    const res = await recordSubscriptionPayment(
      {
        subscriptionId: selectedSub.id,
        shopId: selectedSub.shop_id,
        amountPaid,
        paymentDate,
        billingCycle,
        periodStart,
        periodEnd,
        paymentReference: paymentRef.trim(),
        notes,
      },
      user.id
    );
    setIsRecording(false);

    if (res.success) {
      success(`Payment of ₹${amountPaid} recorded. Subscription renewed to ACTIVE.`);
      setPaymentModalOpen(false);
      loadData();
    } else {
      setRecordError(res.error || 'Failed to record payment.');
    }
  };

  const handleViewHistory = (shop: Shop, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveHistoryShop(shop);
    const filtered = payments.filter((p) => p.shop_id === shop.id);
    setHistoryPayments(filtered);
    setHistoryModalOpen(true);
  };

  return (
    <div className="container vaango-admin-subs">
      {/* Header */}
      <div className="vaango-admin-subs__header">
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
          <h1 className="vaango-admin-subs__title">Shopkeeper Subscriptions & Manual UPI</h1>
          <p className="vaango-admin-subs__subtitle">
            Oversee 60-day go-live free trials, daily rates (strictly capped at ₹20/day), and record verified UPI payments manually.
          </p>
        </div>
      </div>

      {/* Pricing Policy Card */}
      <Card variant="outlined" padding="md" className="vaango-policy-card">
        <Info size={20} className="vaango-policy-card__icon" />
        <div className="vaango-policy-card__text">
          <strong>Vaango Subscription Pricing Policy (Phase 5)</strong>
          <p>
            • <strong>60-Day Free Trial:</strong> Starts on the shop's actual <em>Go-Live date</em> (Day 0), not approval date.
            <br />
            • <strong>Flat Daily Rate:</strong> Enforced cap $\le$ ₹20/day. Weekly (₹10/day $\times$ 7 = ₹70) or Monthly (₹10/day $\times$ 30 = ₹300).
            <br />
            • <strong>Zero Platform Payment Cuts:</strong> Vaango does not automatically debit merchant accounts. The platform owner manually records verified UPI receipts.
            <br />
            • <strong>Grace Period:</strong> Undecided by business spec; no arbitrary automatic suspensions are triggered.
          </p>
        </div>
      </Card>

      {/* Filter Tabs */}
      <div className="vaango-admin-subs__filter-bar">
        <div className="vaango-admin-tabs" role="tablist" aria-label="Filter subscriptions by status">
          <button
            type="button"
            className={`vaango-admin-tab ${statusFilter === 'all' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => handleFilterChange('all')}
          >
            All ({subscriptions.length})
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${statusFilter === 'TRIAL' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => handleFilterChange('TRIAL')}
          >
            In Free Trial
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${statusFilter === 'ACTIVE' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => handleFilterChange('ACTIVE')}
          >
            Active / Paid
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${statusFilter === 'OVERDUE' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => handleFilterChange('OVERDUE')}
          >
            Overdue
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${statusFilter === 'SUSPENDED' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => handleFilterChange('SUSPENDED')}
          >
            Suspended
          </button>
        </div>
      </div>

      {/* Subscriptions Ledger Table */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton height={60} />
          <Skeleton height={60} />
          <Skeleton height={60} />
        </div>
      ) : subscriptions.length === 0 ? (
        <Card variant="outlined" padding="lg" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No shop subscriptions match this filter.
        </Card>
      ) : (
        <Card variant="default" padding="none" className="vaango-admin-subs__table-card">
          <div className="vaango-admin-subs__table-responsive">
            <table className="vaango-admin-table" aria-label="Shopkeeper subscriptions table">
              <thead>
                <tr>
                  <th>Shopfront</th>
                  <th>Subscription Status</th>
                  <th>Trial Remaining</th>
                  <th>Daily Rate</th>
                  <th>Billing Cycle</th>
                  <th>Amount Due</th>
                  <th>Last Payment</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => {
                  const shop = shops.find((s) => s.id === sub.shop_id);
                  const trialInfo = calculateTrialWindow(sub.go_live_date);

                  return (
                    <tr key={sub.id}>
                      <td>
                        <div className="vaango-sub-shop-cell">
                          <Store size={16} className="vaango-sub-shop-icon" />
                          <div>
                            <strong>{shop?.name || sub.shop_id}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                              {shop?.is_live ? 'Store Live' : 'Store Not Live Yet'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge
                          variant={
                            sub.status === 'ACTIVE'
                              ? 'success'
                              : sub.status === 'OVERDUE'
                              ? 'error'
                              : sub.status === 'SUSPENDED'
                              ? 'neutral'
                              : 'primary'
                          }
                          size="sm"
                          withDot
                        >
                          {sub.status}
                        </Badge>
                      </td>
                      <td>
                        {sub.status === 'TRIAL' ? (
                          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                            <Clock size={12} style={{ marginRight: 4 }} />
                            {trialInfo.daysRemaining} days left
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                            Trial concluded
                          </span>
                        )}
                      </td>
                      <td>
                        <strong>₹{sub.daily_rate}/day</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          Cap: ₹20/day
                        </div>
                      </td>
                      <td>
                        <Badge variant="neutral" size="sm">
                          {sub.billing_cycle}
                        </Badge>
                      </td>
                      <td>
                        {sub.amount_due > 0 ? (
                          <strong style={{ color: 'var(--color-error)' }}>₹{sub.amount_due}</strong>
                        ) : (
                          <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>₹0 (Cleared)</span>
                        )}
                      </td>
                      <td>
                        {sub.last_payment_date ? (
                          <span style={{ fontSize: '0.85rem' }}>
                            {new Date(sub.last_payment_date).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>None</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="vaango-admin-actions-cell">
                          {shop && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleViewHistory(shop, e)}
                              title="Payment Receipt History"
                            >
                              <Receipt size={14} />
                            </Button>
                          )}
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={(e) => handleOpenRecordPayment(sub, e)}
                          >
                            Record UPI
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Record Manual Payment Modal */}
      <Modal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="Record Manual Subscription UPI Payment"
        maxWidth="md"
      >
        <form onSubmit={handleSubmitPayment} className="vaango-loc-form">
          {recordError && (
            <div className="vaango-form-error-banner">
              <AlertCircle size={16} />
              <span>{recordError}</span>
            </div>
          )}

          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Record an offline / UPI payment received from the merchant into the platform bank account. This advances the shop to <strong>ACTIVE</strong> status and records an audit receipt.
          </p>

          <div className="vaango-form-row">
            <div className="vaango-form-group" style={{ flex: 1 }}>
              <label htmlFor="pay-cycle">Billing Cycle *</label>
              <select
                id="pay-cycle"
                className="vaango-admin-select"
                value={billingCycle}
                onChange={(e) => handleCycleChange(e.target.value as 'WEEKLY' | 'MONTHLY')}
              >
                <option value="WEEKLY">WEEKLY (7 Days)</option>
                <option value="MONTHLY">MONTHLY (30 Days)</option>
              </select>
            </div>

            <div className="vaango-form-group" style={{ flex: 1 }}>
              <label htmlFor="pay-amount">Amount Received (₹) *</label>
              <Input
                id="pay-amount"
                type="number"
                min={1}
                value={amountPaid}
                onChange={(e) => setAmountPaid(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="vaango-form-row">
            <div className="vaango-form-group" style={{ flex: 1 }}>
              <label htmlFor="pay-start">Period Start *</label>
              <Input
                id="pay-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </div>

            <div className="vaango-form-group" style={{ flex: 1 }}>
              <label htmlFor="pay-end">Period End *</label>
              <Input
                id="pay-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="vaango-form-group">
            <label htmlFor="pay-ref">UPI Reference Note / Transaction ID *</label>
            <Input
              id="pay-ref"
              placeholder="e.g. UPI-94821039821 or Cash receipt #104"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              required
            />
          </div>

          <div className="vaango-form-group">
            <label htmlFor="pay-notes">Internal Operations Notes (Optional)</label>
            <Input
              id="pay-notes"
              placeholder="e.g. Verified in operations bank account."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="vaango-modal-actions">
            <Button type="button" variant="outline" onClick={() => setPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isRecording}>
              Save Payment & Mark Active
            </Button>
          </div>
        </form>
      </Modal>

      {/* Payment History Modal */}
      <Modal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title={`Payment History: ${activeHistoryShop?.name || 'Shop'}`}
        maxWidth="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {historyPayments.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 20 }}>
              No previous payment receipts recorded for this shop.
            </p>
          ) : (
            historyPayments.map((p) => (
              <div key={p.id} className="vaango-receipt-row">
                <div>
                  <strong>₹{p.amount_paid}</strong> ({p.billing_cycle})
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Ref: <code>{p.payment_reference}</code>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Period: {p.period_start} to {p.period_end}
                  </div>
                </div>
                <Badge variant="success" size="sm">
                  PAID
                </Badge>
              </div>
            ))
          )}

          <div className="vaango-modal-actions">
            <Button variant="outline" onClick={() => setHistoryModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
