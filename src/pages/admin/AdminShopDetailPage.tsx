import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Store,
  MapPin,
  Phone,
  ArrowLeft,
  CreditCard,
  CheckCircle2,
  XCircle,
  Package,
  Navigation,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Eye,
  Search,
  RotateCcw,
  Image as ImageIcon,
  User,
  ShieldCheck,
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
  Receipt,
  Lock,
} from 'lucide-react';
import {
  fetchAdminShopDetail,
  suspendShop,
  reactivateShop,
  warnShopkeeperProduct,
  banShopProduct,
  unbanShopProduct,
  recordSubscriptionPayment,
  calculateTrialWindow,
  type AdminShopDetailResponse,
} from '../../lib/adminApi';
import { updateShopSubscriptionTier } from '../../lib/shopkeeperApi';
import { Shop, ShopSubscription, ShopProduct, ShopService, SubscriptionPayment } from '../../types/database';
import { AdminShopStatistics, AdminShopOrderSummary } from '../../types/admin';
import { MOCK_SHOP_TYPES } from '../../data/mockData';
import { DEFAULT_LOCATIONS } from '../../context/LocationContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { StorefrontMapPreview } from '../../components/gis/StorefrontMapPreview';
import './AdminShopDetailPage.css';

export const AdminShopDetailPage: React.FC = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [shop, setShop] = useState<Shop | null>(null);
  const [subscription, setSubscription] = useState<ShopSubscription | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [services, setServices] = useState<ShopService[]>([]);
  const [statistics, setStatistics] = useState<AdminShopStatistics | null>(null);
  const [recentOrders, setRecentOrders] = useState<AdminShopOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Statistics Period Filter
  const [statPeriod, setStatPeriod] = useState<'all' | '30d' | '7d'>('all');

  // Suspension Modal State
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [isSuspending, setIsSuspending] = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);

  // Reactivation Modal State
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);

  // Product Search & Filter
  const [productSearch, setProductSearch] = useState('');
  const [productFilter, setProductFilter] = useState<'all' | 'in_stock' | 'out_of_stock' | 'banned'>('all');

  // Product Warning Modal
  const [warnModalOpen, setWarnModalOpen] = useState(false);
  const [warnProduct, setWarnProduct] = useState<ShopProduct | null>(null);
  const [warnReason, setWarnReason] = useState('');
  const [isWarning, setIsWarning] = useState(false);

  // Product Ban Modal
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banProduct, setBanProduct] = useState<ShopProduct | null>(null);
  const [banReason, setBanReason] = useState('');
  const [isBanning, setIsBanning] = useState(false);

  // Product Unban Modal
  const [unbanModalOpen, setUnbanModalOpen] = useState(false);
  const [unbanProduct, setUnbanProduct] = useState<ShopProduct | null>(null);
  const [isUnbanning, setIsUnbanning] = useState(false);

  // Product Full Detail Modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [inspectProduct, setInspectProduct] = useState<ShopProduct | null>(null);

  // Record UPI Payment Modal (Phase 5 Administrative Billing)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [amountPaid, setAmountPaid] = useState<number>(300);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [billingCycle, setBillingCycle] = useState<'WEEKLY' | 'MONTHLY'>('MONTHLY');
  const [periodStart, setPeriodStart] = useState<string>(new Date().toISOString().split('T')[0]);
  const [periodEnd, setPeriodEnd] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [recordPaymentError, setRecordPaymentError] = useState<string | null>(null);

  // Tier Update
  const [isUpdatingTier, setIsUpdatingTier] = useState(false);

  // Error & Not Found state
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const loadShopData = async (period: 'all' | '30d' | '7d' = statPeriod) => {
    if (!shopId) return;
    setIsLoading(true);
    setLoadError(null);
    setIsNotFound(false);
    try {
      const res: AdminShopDetailResponse = await fetchAdminShopDetail(shopId, period);
      if (res.error) {
        setLoadError(res.error);
        setIsNotFound(false);
      } else if (res.isNotFound || !res.data) {
        setIsNotFound(true);
        setLoadError(null);
      } else {
        setShop(res.data.shop);
        setSubscription(res.data.subscription);
        setPayments(res.data.payments);
        setProducts(res.data.products);
        setServices(res.data.services);
        setStatistics(res.data.statistics);
        setRecentOrders(res.data.recentOrders);
        setLoadError(null);
        setIsNotFound(false);
      }
    } catch (err: unknown) {
      console.error('Error loading shop detail:', err);
      const msg = err instanceof Error ? err.message : 'Error loading shop detail.';
      setLoadError(msg);
      setIsNotFound(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadShopData(statPeriod);
  }, [shopId, statPeriod]);

  const handlePeriodChange = (newPeriod: 'all' | '30d' | '7d') => {
    setStatPeriod(newPeriod);
  };

  const handleConfirmSuspend = async () => {
    if (!shop || !user) return;
    if (!suspendReason.trim()) {
      setSuspendError('A clear suspension reason is required.');
      return;
    }

    setIsSuspending(true);
    try {
      const res = await suspendShop(shop.id, user.id, suspendReason.trim());

      if (res.success) {
        success(`${shop.name} has been suspended.`);
        setSuspendModalOpen(false);
        loadShopData();
      } else {
        setSuspendError(res.error || 'Failed to suspend shop.');
      }
    } catch (err: unknown) {
      setSuspendError(err instanceof Error ? err.message : 'Error suspending shop.');
    } finally {
      setIsSuspending(false);
    }
  };

  const handleConfirmReactivate = async () => {
    if (!shop || !user) return;
    setIsReactivating(true);
    try {
      const res = await reactivateShop(shop.id, user.id);
      setReactivateModalOpen(false);

      if (res.success) {
        success(`${shop.name} has been reactivated.`);
        loadShopData();
      } else {
        toastError(res.error || 'Failed to reactivate shop.');
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Error reactivating shop.');
    } finally {
      setIsReactivating(false);
    }
  };

  // Moderation Action Handlers
  const handleOpenWarn = (prod: ShopProduct) => {
    setWarnProduct(prod);
    setWarnReason('');
    setWarnModalOpen(true);
  };

  const handleConfirmWarn = async () => {
    if (!shop || !user || !warnProduct) return;
    if (!warnReason.trim()) {
      toastError('A warning reason is required.');
      return;
    }
    setIsWarning(true);
    try {
      const res = await warnShopkeeperProduct(
        user.id,
        shop.id,
        warnProduct.id,
        warnProduct.name,
        warnReason.trim()
      );
      if (res.success) {
        success(`Warning sent to shopkeeper for "${warnProduct.name}".`);
        setWarnModalOpen(false);
        setWarnProduct(null);
      } else {
        toastError(res.error || 'Failed to send warning.');
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Error sending warning.');
    } finally {
      setIsWarning(false);
    }
  };

  const handleOpenBan = (prod: ShopProduct) => {
    setBanProduct(prod);
    setBanReason('');
    setBanModalOpen(true);
  };

  const handleConfirmBan = async () => {
    if (!shop || !user || !banProduct) return;
    if (!banReason.trim()) {
      toastError('A ban/prohibition reason is required.');
      return;
    }
    setIsBanning(true);
    try {
      const res = await banShopProduct(
        user.id,
        shop.id,
        banProduct.id,
        banProduct.name,
        banReason.trim()
      );
      if (res.success) {
        success(`Product "${banProduct.name}" has been banned and hidden from customers.`);
        setBanModalOpen(false);
        setBanProduct(null);
        await loadShopData();
      } else {
        toastError(res.error || 'Failed to ban product.');
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Error banning product.');
    } finally {
      setIsBanning(false);
    }
  };

  const handleOpenUnban = (prod: ShopProduct) => {
    setUnbanProduct(prod);
    setUnbanModalOpen(true);
  };

  const handleConfirmUnban = async () => {
    if (!shop || !user || !unbanProduct) return;
    setIsUnbanning(true);
    try {
      const res = await unbanShopProduct(
        user.id,
        shop.id,
        unbanProduct.id,
        unbanProduct.name
      );
      if (res.success) {
        success(`Ban lifted for "${unbanProduct.name}".`);
        setUnbanModalOpen(false);
        setUnbanProduct(null);
        await loadShopData();
      } else {
        toastError(res.error || 'Failed to unban product.');
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Error unbanning product.');
    } finally {
      setIsUnbanning(false);
    }
  };

  const handleOpenDetail = (prod: ShopProduct) => {
    setInspectProduct(prod);
    setDetailModalOpen(true);
  };

  const handleToggleTier = async () => {
    if (!shop) return;
    const nextTier = shop.subscription_tier === 'PRO' ? 'FREE' : 'PRO';
    setIsUpdatingTier(true);
    try {
      const res = await updateShopSubscriptionTier(shop.id, nextTier);
      if (res.success) {
        success(`Shop tier updated to ${nextTier}`);
        setShop((prev) => (prev ? { ...prev, subscription_tier: nextTier } : null));
      } else {
        toastError(res.error || 'Failed to update subscription tier');
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Error updating subscription tier.');
    } finally {
      setIsUpdatingTier(false);
    }
  };

  // Record Manual Payment Handler
  const handleOpenRecordPayment = () => {
    if (!subscription || !shop) return;
    const defaultAmount = subscription.billing_cycle === 'WEEKLY' ? subscription.daily_rate * 7 : subscription.daily_rate * 30;
    setAmountPaid(subscription.amount_due > 0 ? subscription.amount_due : defaultAmount);
    setBillingCycle(subscription.billing_cycle);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPeriodStart(new Date().toISOString().split('T')[0]);
    const durationDays = subscription.billing_cycle === 'WEEKLY' ? 7 : 30;
    setPeriodEnd(new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setPaymentRef(`UPI-${Math.floor(100000 + Math.random() * 900000)}`);
    setNotes('Verified in platform operations bank account.');
    setRecordPaymentError(null);
    setPaymentModalOpen(true);
  };

  const handleCycleChange = (newCycle: 'WEEKLY' | 'MONTHLY') => {
    setBillingCycle(newCycle);
    if (subscription) {
      const days = newCycle === 'WEEKLY' ? 7 : 30;
      setAmountPaid(subscription.daily_rate * days);
      const start = new Date(periodStart);
      setPeriodEnd(new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscription || !shop || !user) return;
    setRecordPaymentError(null);
    setIsRecordingPayment(true);

    try {
      const res = await recordSubscriptionPayment(
        {
          subscriptionId: subscription.id,
          shopId: shop.id,
          amountPaid,
          billingCycle,
          periodStart,
          periodEnd,
          paymentReference: paymentRef,
          notes,
          paymentDate,
        },
        user.id
      );

      if (res.success) {
        success(`Recorded ₹${amountPaid} UPI payment for ${shop.name}`);
        setPaymentModalOpen(false);
        loadShopData();
      } else {
        setRecordPaymentError(res.error || 'Failed to record payment.');
      }
    } catch (err: unknown) {
      setRecordPaymentError(err instanceof Error ? err.message : 'Error recording payment.');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container vaango-admin-shop-detail">
        <Skeleton height={32} width={220} style={{ marginBottom: 16 }} />
        <Skeleton height={140} style={{ marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
          <Skeleton height={180} />
          <Skeleton height={180} />
          <Skeleton height={180} />
        </div>
        <Skeleton height={280} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container vaango-admin-shop-detail">
        <Card variant="outlined" padding="lg" style={{ textAlign: 'center', maxWidth: 600, margin: '40px auto' }}>
          <AlertTriangle size={48} style={{ color: 'var(--color-warning)', margin: '0 auto 16px' }} />
          <h2>Unable to Load Shop Details</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
            {loadError}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Button variant="outline" onClick={() => navigate('/admin/shops')} leftIcon={<ArrowLeft size={16} />}>
              Back to Shops
            </Button>
            <Button variant="primary" onClick={() => loadShopData(statPeriod)} leftIcon={<RotateCcw size={16} />}>
              Retry Loading
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (isNotFound || !shop) {
    return (
      <div className="container vaango-admin-shop-detail">
        <Card variant="outlined" padding="lg" style={{ textAlign: 'center', maxWidth: 600, margin: '40px auto' }}>
          <Store size={48} style={{ color: 'var(--color-text-muted)', margin: '0 auto 16px' }} />
          <h2>Shop Not Found</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
            The requested shop ID does not match any registered storefront.
          </p>
          <Button variant="outline" onClick={() => navigate('/admin/shops')} leftIcon={<ArrowLeft size={16} />}>
            Back to Shops
          </Button>
        </Card>
      </div>
    );
  }

  const shopType = shop.shop_type || MOCK_SHOP_TYPES.find((t) => t.id === shop.shop_type_id);
  const location = shop.location || DEFAULT_LOCATIONS.find((l) => l.id === shop.location_id);
  const owner = shop.owner;
  const trialInfo = subscription ? calculateTrialWindow(subscription.go_live_date) : null;

  return (
    <div className="container vaango-admin-shop-detail">
      {/* Back button & Breadcrumb Navigation */}
      <div className="vaango-shop-detail__nav-row">
        <button
          type="button"
          className="vaango-back-btn"
          onClick={() => navigate('/admin/shops')}
          aria-label="Back to shops directory"
        >
          <ArrowLeft size={16} />
          <span>Shops Directory</span>
        </button>
        <span className="vaango-breadcrumb-sep">/</span>
        <button
          type="button"
          className="vaango-back-btn"
          onClick={() => navigate('/admin/subscriptions')}
          aria-label="Back to subscriptions"
        >
          <span>Subscriptions & UPI</span>
        </button>
        <span className="vaango-breadcrumb-sep">/</span>
        <span className="vaango-breadcrumb-current">{shop.name}</span>
      </div>

      {/* Header Banner */}
      <div className="vaango-shop-detail__header">
        <div className="vaango-shop-detail__header-left">
          <div className="vaango-shop-detail__avatar-wrap">
            {shop.photo_url ? (
              <img src={shop.photo_url} alt={shop.name} className="vaango-shop-detail__avatar" />
            ) : (
              <div className="vaango-shop-detail__avatar-placeholder">
                <Store size={36} />
              </div>
            )}
          </div>
          <div>
            <div className="vaango-shop-detail__badge-row">
              <span className="vaango-shop-detail__kicker">Shop Operational Inspection</span>
              {shop.status === 'suspended' ? (
                <Badge variant="error" size="md" withDot>
                  SUSPENDED
                </Badge>
              ) : shop.is_live ? (
                <Badge variant="success" size="md" withDot>
                  LIVE ON VAANGLY
                </Badge>
              ) : (
                <Badge variant="warning" size="md">
                  Catalogue Incomplete (Inactive)
                </Badge>
              )}
              {shop.status === 'verified' && (
                <Badge variant="primary" size="md">
                  Verified Storefront
                </Badge>
              )}
            </div>
            <h1 className="vaango-shop-detail__title">{shop.name}</h1>
            <p className="vaango-shop-detail__subtitle">
              {shop.tagline || shop.description || 'Neighborhood storefront registered on Vaangly platform.'}
            </p>
          </div>
        </div>

        <div className="vaango-shop-detail__actions">
          {shop.status === 'suspended' ? (
            <Button
              variant="primary"
              onClick={() => setReactivateModalOpen(true)}
              leftIcon={<CheckCircle2 size={16} />}
            >
              Reactivate Shop
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setSuspendReason('');
                setSuspendError(null);
                setSuspendModalOpen(true);
              }}
              className="vaango-btn--danger-outline"
              leftIcon={<XCircle size={16} />}
            >
              Suspend Storefront
            </Button>
          )}
        </div>
      </div>

      {/* SECTION A & SECTION B: 2-COLUMN PROFILE ROW */}
      <div className="vaango-shop-detail__top-row">
        {/* SECTION A. Shop Overview */}
        <Card variant="default" padding="lg" className="vaango-shop-card">
          <div className="vaango-section-header">
            <div className="vaango-section-icon-badge">
              <Store size={18} />
            </div>
            <div>
              <h2 className="vaango-shop-sec-heading">A. Shop Overview</h2>
              <span className="vaango-sec-sub">Storefront metadata, contact, address & business types</span>
            </div>
          </div>

          <dl className="vaango-shop-dl">
            <dt className="vaango-field-label">Shop Name</dt>
            <dd className="vaango-field-value">
              <strong>{shop.name}</strong>
            </dd>

            <dt className="vaango-field-label">Business Category</dt>
            <dd className="vaango-field-value">
              <span>
                {shopType?.name || 'Retail Store'} ({shopType?.code || 'general'})
              </span>
            </dd>

            <dt className="vaango-field-label">Shop Database ID</dt>
            <dd className="vaango-field-value">
              <code className="vaango-code-id">{shop.id}</code>
            </dd>

            <dt className="vaango-field-label">Registration Date</dt>
            <dd className="vaango-field-value">
              <Calendar size={14} className="vaango-field-icon" />
              <span>
                {shop.created_at
                  ? new Date(shop.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'N/A'}
              </span>
            </dd>

            <dt className="vaango-field-label">Contact Phone</dt>
            <dd className="vaango-field-value">
              <Phone size={14} className="vaango-field-icon" />
              <a href={`tel:${shop.phone}`} className="vaango-tel-link">
                {shop.phone}
              </a>
            </dd>

            <dt className="vaango-field-label">Direct Merchant UPI VPA</dt>
            <dd className="vaango-field-value">
              <code className="vaango-code-id">{shop.upi_id || 'Not configured'}</code>
            </dd>

            <dt className="vaango-field-label">Storefront Address</dt>
            <dd className="vaango-field-value">
              <MapPin size={14} className="vaango-field-icon" />
              <span>
                {shop.address_line}
                {location && `, ${location.name} (${location.pincode})`}
              </span>
            </dd>

            <dt className="vaango-field-label">Enabled Business Types</dt>
            <dd className="vaango-field-value">
              <div className="vaango-types-pill-row">
                <span className="vaango-type-pill vaango-type-pill--enabled">
                  ✓ Orders & Pickup
                </span>
                {shopType?.workflow_group_code === 'APPOINTMENT' ? (
                  <span className="vaango-type-pill vaango-type-pill--enabled">
                    ✓ Appointments
                  </span>
                ) : (
                  <span className="vaango-type-pill vaango-type-pill--disabled">
                    ✕ Appointments
                  </span>
                )}
                {shop.delivery_available ? (
                  <span className="vaango-type-pill vaango-type-pill--enabled">
                    ✓ Home Delivery (₹{shop.delivery_fee})
                  </span>
                ) : (
                  <span className="vaango-type-pill vaango-type-pill--disabled">
                    Self Pickup Only
                  </span>
                )}
              </div>
            </dd>
          </dl>
        </Card>

        {/* SECTION B. Shopkeeper Details */}
        <Card variant="default" padding="lg" className="vaango-shop-card">
          <div className="vaango-section-header">
            <div className="vaango-section-icon-badge vaango-section-icon-badge--user">
              <User size={18} />
            </div>
            <div>
              <h2 className="vaango-shop-sec-heading">B. Shopkeeper Details</h2>
              <span className="vaango-sec-sub">Owner profile, identity verification & credentials status</span>
            </div>
          </div>

          <dl className="vaango-shop-dl">
            <dt className="vaango-field-label">Shopkeeper Full Name</dt>
            <dd className="vaango-field-value">
              <strong>{owner?.full_name || 'Store Owner'}</strong>
            </dd>

            <dt className="vaango-field-label">Account Verification</dt>
            <dd className="vaango-field-value">
              {owner?.is_verified ? (
                <span className="vaango-verified-badge">
                  <ShieldCheck size={14} className="vaango-field-icon" style={{ color: '#059669' }} />
                  <span>Verified Merchant</span>
                </span>
              ) : (
                <span className="vaango-unverified-badge">Unverified Merchant</span>
              )}
            </dd>

            <dt className="vaango-field-label">Email Address</dt>
            <dd className="vaango-field-value">
              {owner?.email ? (
                <a href={`mailto:${owner.email}`} className="vaango-tel-link">
                  {owner.email}
                </a>
              ) : (
                <span style={{ color: 'var(--color-text-muted)' }}>Not provided</span>
              )}
            </dd>

            <dt className="vaango-field-label">Phone Number</dt>
            <dd className="vaango-field-value">
              <Phone size={14} className="vaango-field-icon" />
              <a href={`tel:${owner?.phone || shop.phone}`} className="vaango-tel-link">
                {owner?.phone || shop.phone}
              </a>
            </dd>

            <dt className="vaango-field-label">Account Created</dt>
            <dd className="vaango-field-value">
              <Calendar size={14} className="vaango-field-icon" />
              <span>
                {owner?.created_at
                  ? new Date(owner.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'N/A'}
              </span>
            </dd>

            <dt className="vaango-field-label">Role</dt>
            <dd className="vaango-field-value">
              <Badge variant="neutral" size="sm">
                {owner?.role || 'shopkeeper'}
              </Badge>
            </dd>

            <dt className="vaango-field-label">Shopkeeper Profile ID</dt>
            <dd className="vaango-field-value">
              <code className="vaango-code-id">{owner?.id || shop.owner_id}</code>
            </dd>
          </dl>

          {/* Privacy & Secrets Protection Alert */}
          <div className="vaango-secrets-notice">
            <Lock size={15} className="vaango-secrets-icon" />
            <p>
              <strong>Security Protocol:</strong> User passwords, encryption hashes, session tokens, and API secret keys are securely guarded and never exposed to dashboard views.
            </p>
          </div>
        </Card>
      </div>

      {/* SECTION D. Statistics & Activity */}
      <Card variant="default" padding="lg" className="vaango-stats-card">
        <div className="vaango-stats-header">
          <div className="vaango-section-header" style={{ marginBottom: 0 }}>
            <div className="vaango-section-icon-badge vaango-section-icon-badge--stats">
              <TrendingUp size={18} />
            </div>
            <div>
              <h2 className="vaango-shop-sec-heading" style={{ margin: 0 }}>
                D. Statistics & Activity
              </h2>
              <span className="vaango-sec-sub">
                Real-time verified revenue, order volumes, and fulfillment history
              </span>
            </div>
          </div>

          {/* Period Selection Tabs */}
          <div className="vaango-period-tabs" role="tablist" aria-label="Calculation period selector">
            <button
              type="button"
              className={`vaango-period-tab ${statPeriod === 'all' ? 'vaango-period-tab--active' : ''}`}
              onClick={() => handlePeriodChange('all')}
            >
              All Time
            </button>
            <button
              type="button"
              className={`vaango-period-tab ${statPeriod === '30d' ? 'vaango-period-tab--active' : ''}`}
              onClick={() => handlePeriodChange('30d')}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              className={`vaango-period-tab ${statPeriod === '7d' ? 'vaango-period-tab--active' : ''}`}
              onClick={() => handlePeriodChange('7d')}
            >
              Last 7 Days
            </button>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="vaango-kpi-grid">
          <div className="vaango-kpi-card vaango-kpi-card--revenue">
            <div className="vaango-kpi-icon-wrap">
              <DollarSign size={20} />
            </div>
            <div className="vaango-kpi-content">
              <span className="vaango-kpi-label">Verified Revenue</span>
              <strong className="vaango-kpi-val">
                ₹{statistics ? statistics.totalRevenue.toLocaleString('en-IN') : '0'}
              </strong>
              <span className="vaango-kpi-hint">
                * Strictly excludes cancelled & rejected transactions
              </span>
            </div>
          </div>

          <div className="vaango-kpi-card">
            <div className="vaango-kpi-icon-wrap">
              <Package size={20} />
            </div>
            <div className="vaango-kpi-content">
              <span className="vaango-kpi-label">Total Orders ({statPeriod})</span>
              <strong className="vaango-kpi-val">{statistics?.totalOrders ?? 0}</strong>
              <span className="vaango-kpi-hint">
                {statistics?.completedOrders ?? 0} completed
              </span>
            </div>
          </div>

          <div className="vaango-kpi-card">
            <div className="vaango-kpi-icon-wrap">
              <Clock size={20} />
            </div>
            <div className="vaango-kpi-content">
              <span className="vaango-kpi-label">Pending Orders</span>
              <strong className="vaango-kpi-val" style={{ color: 'var(--color-primary)' }}>
                {statistics?.pendingOrders ?? 0}
              </strong>
              <span className="vaango-kpi-hint">Awaiting counter pickup / fulfillment</span>
            </div>
          </div>

          <div className="vaango-kpi-card">
            <div className="vaango-kpi-icon-wrap">
              <XCircle size={20} />
            </div>
            <div className="vaango-kpi-content">
              <span className="vaango-kpi-label">Cancelled / Rejected</span>
              <strong className="vaango-kpi-val" style={{ color: 'var(--color-error, #ef4444)' }}>
                {statistics?.cancelledOrders ?? 0}
              </strong>
              <span className="vaango-kpi-hint">Excluded from verified revenue</span>
            </div>
          </div>

          <div className="vaango-kpi-card">
            <div className="vaango-kpi-icon-wrap">
              <Store size={20} />
            </div>
            <div className="vaango-kpi-content">
              <span className="vaango-kpi-label">Active Listed Products</span>
              <strong className="vaango-kpi-val" style={{ color: 'var(--color-success, #10b981)' }}>
                {statistics?.activeProducts ?? 0} / {statistics?.totalProducts ?? 0}
              </strong>
              <span className="vaango-kpi-hint">
                {statistics?.outOfStockProducts ?? 0} out of stock
              </span>
            </div>
          </div>
        </div>

        {/* Appointment Statistics (For Clinic / Healthcare / Salon Services) */}
        {(statistics?.totalAppointments ?? 0) > 0 && (
          <div className="vaango-appt-stats-wrap">
            <h3 className="vaango-sub-heading">Appointment & Slot Bookings ({statPeriod})</h3>
            <div className="vaango-kpi-grid">
              <div className="vaango-kpi-card">
                <span className="vaango-kpi-label">Total Bookings</span>
                <strong className="vaango-kpi-val">{statistics?.totalAppointments ?? 0}</strong>
              </div>
              <div className="vaango-kpi-card">
                <span className="vaango-kpi-label">Completed Bookings</span>
                <strong className="vaango-kpi-val" style={{ color: 'var(--color-success)' }}>
                  {statistics?.completedAppointments ?? 0}
                </strong>
              </div>
              <div className="vaango-kpi-card">
                <span className="vaango-kpi-label">Pending Appointments</span>
                <strong className="vaango-kpi-val" style={{ color: 'var(--color-primary)' }}>
                  {statistics?.pendingAppointments ?? 0}
                </strong>
              </div>
              <div className="vaango-kpi-card">
                <span className="vaango-kpi-label">Cancelled / No-Show</span>
                <strong className="vaango-kpi-val" style={{ color: 'var(--color-error)' }}>
                  {statistics?.cancelledAppointments ?? 0}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Recent Orders / Activity Table */}
        <div style={{ marginTop: 24 }}>
          <h3 className="vaango-sub-heading">Recent Shop Orders & Activity</h3>
          {recentOrders.length === 0 ? (
            <p className="vaango-empty-hint">
              No recent orders recorded for this shop during the selected {statPeriod} period.
            </p>
          ) : (
            <div className="vaango-table-responsive">
              <table className="vaango-activity-table" aria-label="Recent shop orders table">
                <thead>
                  <tr>
                    <th>Reference Code</th>
                    <th>Date & Time</th>
                    <th>Fulfillment Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((ord) => (
                    <tr key={ord.id}>
                      <td>
                        <strong>{ord.reference_code}</strong>
                        {ord.customer_phone && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            Customer: {ord.customer_phone.substring(0, 3)}****{ord.customer_phone.slice(-3)}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.85rem' }}>
                          {new Date(ord.created_at).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td>
                        <Badge variant="neutral" size="sm">
                          {ord.fulfillment_type || ord.request_kind || 'PICKUP'}
                        </Badge>
                      </td>
                      <td>
                        <strong>₹{(ord.total_amount ?? 0).toLocaleString('en-IN')}</strong>
                      </td>
                      <td>
                        <Badge
                          variant={
                            ord.current_state === 'COMPLETED'
                              ? 'success'
                              : ord.current_state === 'CANCELLED' || ord.current_state === 'REJECTED'
                              ? 'error'
                              : 'primary'
                          }
                          size="sm"
                          withDot
                        >
                          {ord.current_state}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* SECTION C. Products & Catalogue */}
      <Card variant="default" padding="lg">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div className="vaango-section-header" style={{ marginBottom: 0 }}>
            <div className="vaango-section-icon-badge vaango-section-icon-badge--cat">
              <Package size={18} />
            </div>
            <div>
              <h2 className="vaango-shop-sec-heading" style={{ margin: 0 }}>
                C. Products & Catalogue
              </h2>
              <span className="vaango-sec-sub">
                Catalogue listing, accurate multi-variant stock availability & moderation
              </span>
            </div>
          </div>
          {shopType?.workflow_group_code === 'ORDER' && (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {products.length} total items listed
            </span>
          )}
        </div>

        {shopType?.workflow_group_code === 'ORDER' ? (
          <>
            {/* Filter Bar */}
            <div className="vaango-admin-mod-filter-bar">
              <div className="vaango-admin-mod-search">
                <Search size={16} className="vaango-admin-mod-search-icon" />
                <input
                  type="search"
                  className="vaango-admin-mod-search-input"
                  placeholder="Search catalogue items by name, ID or description..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>

              <div className="vaango-admin-mod-tabs" role="tablist">
                <button
                  type="button"
                  className={`vaango-admin-mod-tab ${productFilter === 'all' ? 'vaango-admin-mod-tab--active' : ''}`}
                  onClick={() => setProductFilter('all')}
                >
                  All ({products.length})
                </button>
                <button
                  type="button"
                  className={`vaango-admin-mod-tab ${productFilter === 'in_stock' ? 'vaango-admin-mod-tab--active' : ''}`}
                  onClick={() => setProductFilter('in_stock')}
                >
                  In Stock ({products.filter((p) => p.is_available && !p.is_banned).length})
                </button>
                <button
                  type="button"
                  className={`vaango-admin-mod-tab ${productFilter === 'out_of_stock' ? 'vaango-admin-mod-tab--active' : ''}`}
                  onClick={() => setProductFilter('out_of_stock')}
                >
                  Out of Stock ({products.filter((p) => !p.is_available && !p.is_banned).length})
                </button>
                <button
                  type="button"
                  className={`vaango-admin-mod-tab vaango-admin-mod-tab--banned ${productFilter === 'banned' ? 'vaango-admin-mod-tab--active' : ''}`}
                  onClick={() => setProductFilter('banned')}
                >
                  Banned ({products.filter((p) => p.is_banned).length})
                </button>
              </div>
            </div>

            {/* Product Items List */}
            {(() => {
              const filtered = products.filter((p) => {
                if (productFilter === 'in_stock' && (!p.is_available || p.is_banned)) return false;
                if (productFilter === 'out_of_stock' && (p.is_available || p.is_banned)) return false;
                if (productFilter === 'banned' && !p.is_banned) return false;
                if (productSearch.trim()) {
                  const q = productSearch.toLowerCase();
                  const matchName = p.name.toLowerCase().includes(q);
                  const matchDesc = (p.description || '').toLowerCase().includes(q);
                  const matchId = p.id.toLowerCase().includes(q);
                  if (!matchName && !matchDesc && !matchId) return false;
                }
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '24px 0', fontSize: '0.9rem' }}>
                    No catalogue products match the selected criteria.
                  </p>
                );
              }

              return (
                <div className="vaango-admin-prod-list">
                  {filtered.map((p) => {
                    const imageSrc = p.image_url || (p.image_urls && p.image_urls[0]) || null;
                    return (
                      <div
                        key={p.id}
                        className={`vaango-admin-prod-item ${p.is_banned ? 'vaango-admin-prod-item--banned' : ''}`}
                      >
                        <div className="vaango-admin-prod-top">
                          <div
                            className="vaango-admin-prod-thumb-wrap"
                            onClick={() => handleOpenDetail(p)}
                            title="Click to inspect product"
                          >
                            {imageSrc ? (
                              <img src={imageSrc} alt={p.name} className="vaango-admin-prod-thumb" loading="lazy" />
                            ) : (
                              <div className="vaango-admin-prod-thumb-placeholder">
                                <ImageIcon size={24} />
                              </div>
                            )}
                          </div>

                          <div className="vaango-admin-prod-info">
                            <div className="vaango-admin-prod-title-row">
                              <h3 className="vaango-admin-prod-name">{p.name}</h3>
                              <span className="vaango-admin-prod-id" title="Product Database ID">
                                {p.id}
                              </span>

                              {/* Accurate variant stock badge */}
                              {(() => {
                                if (p.is_banned) {
                                  return (
                                    <Badge variant="error" size="sm" withDot>
                                      BANNED / PROHIBITED
                                    </Badge>
                                  );
                                }
                                if (p.has_variants && p.variants && p.variants.length > 0) {
                                  const totalV = p.variants.length;
                                  const inStockV = p.variants.filter(
                                    (v) =>
                                      v.is_available !== false &&
                                      v.in_stock !== false &&
                                      (v.stock_quantity === null ||
                                        v.stock_quantity === undefined ||
                                        v.stock_quantity > 0)
                                  ).length;

                                  if (inStockV === 0) {
                                    return (
                                      <Badge variant="neutral" size="sm">
                                        OUT OF STOCK
                                      </Badge>
                                    );
                                  } else if (inStockV < totalV) {
                                    return (
                                      <Badge variant="warning" size="sm" withDot>
                                        PARTIALLY AVAILABLE ({inStockV}/{totalV} In Stock)
                                      </Badge>
                                    );
                                  } else {
                                    return (
                                      <Badge variant="success" size="sm" withDot>
                                        ALL VARIANTS IN STOCK
                                      </Badge>
                                    );
                                  }
                                }
                                return p.is_available ? (
                                  <Badge variant="success" size="sm" withDot>
                                    IN STOCK
                                  </Badge>
                                ) : (
                                  <Badge variant="neutral" size="sm">
                                    OUT OF STOCK
                                  </Badge>
                                );
                              })()}
                            </div>

                            <div className="vaango-admin-prod-price">
                              ₹{p.price}{' '}
                              <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--color-text-muted)' }}>
                                / {p.unit}
                              </span>
                            </div>

                            {p.description && <p className="vaango-admin-prod-desc">{p.description}</p>}

                            {/* Individual Variant Stock Breakdown */}
                            {p.has_variants && p.variants && p.variants.length > 0 && (
                              <div className="vaango-variant-breakdown-box">
                                <span className="vaango-variant-breakdown-label">
                                  Configured Variant Stock Availability ({p.variants.length} options):
                                </span>
                                <div className="vaango-variant-pills-row">
                                  {p.variants.map((v) => {
                                    const isAvailable =
                                      v.is_available !== false &&
                                      v.in_stock !== false &&
                                      (v.stock_quantity === null ||
                                        v.stock_quantity === undefined ||
                                        v.stock_quantity > 0);
                                    return (
                                      <div
                                        key={v.id || v.label}
                                        className={`vaango-variant-chip ${
                                          isAvailable
                                            ? 'vaango-variant-chip--available'
                                            : 'vaango-variant-chip--unavailable'
                                        }`}
                                      >
                                        <span className="vaango-chip-label">{v.label || 'Default'}</span>
                                        <span className="vaango-chip-price">₹{v.price}</span>
                                        <span className="vaango-chip-stock">
                                          {isAvailable
                                            ? v.stock_quantity != null
                                              ? `${v.stock_quantity} left`
                                              : 'In Stock'
                                            : 'Out of Stock'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {p.is_banned && (
                              <div className="vaango-admin-mod-banner" style={{ marginTop: 8 }}>
                                <div>
                                  <strong>Prohibition Reason:</strong>{' '}
                                  {p.moderation_reason || 'Prohibited item excluded by administration.'}
                                </div>
                                {p.moderated_at && (
                                  <time>Moderated on {new Date(p.moderated_at).toLocaleString('en-IN')}</time>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="vaango-admin-prod-actions">
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Eye size={14} />}
                            onClick={() => handleOpenDetail(p)}
                          >
                            Review Details
                          </Button>

                          {!p.is_banned ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<AlertTriangle size={14} color="#d97706" />}
                                onClick={() => handleOpenWarn(p)}
                              >
                                Warn Shopkeeper
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                leftIcon={<ShieldAlert size={14} />}
                                onClick={() => handleOpenBan(p)}
                              >
                                Hide / Ban Product
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              leftIcon={<RotateCcw size={14} />}
                              onClick={() => handleOpenUnban(p)}
                            >
                              Lift Ban / Restore
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        ) : (
          <div className="vaango-services-list">
            <h3 className="vaango-sub-heading">Configured Services ({services.length})</h3>
            <div className="vaango-readiness-stats" style={{ marginBottom: 16 }}>
              <div className="vaango-readiness-stat">
                <span className="vaango-readiness-val">{services.length}</span>
                <span className="vaango-readiness-label">Services Configured</span>
              </div>
              <div className="vaango-readiness-stat">
                <span className="vaango-readiness-val" style={{ color: 'var(--color-success)' }}>
                  {services.filter((s) => s.is_available).length}
                </span>
                <span className="vaango-readiness-label">Active For Booking</span>
              </div>
            </div>
            <div className="vaango-services-grid">
              {services.map((srv) => (
                <div key={srv.id} className="vaango-service-card">
                  <div>
                    <strong>{srv.name}</strong>
                    {srv.description && (
                      <p style={{ margin: '4px 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        {srv.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                      ₹{srv.price_type === 'fixed'
                        ? (srv.base_price ?? srv.min_price ?? 0)
                        : `${srv.min_price ?? 0} - ${srv.max_price ?? 0}`}
                    </span>
                    <Badge variant={srv.is_available ? 'success' : 'neutral'} size="sm">
                      {srv.is_available ? 'AVAILABLE' : 'OFFLINE'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* SECTION E. Subscription & Billing */}
      <Card variant="default" padding="lg" className="vaango-sub-billing-section">
        <div className="vaango-section-header">
          <div className="vaango-section-icon-badge vaango-section-icon-badge--sub">
            <CreditCard size={18} />
          </div>
          <div>
            <h2 className="vaango-shop-sec-heading" style={{ margin: 0 }}>
              E. Subscription & Billing
            </h2>
            <span className="vaango-sec-sub">
              Daily rate tariff, 60-day trial window, payment history & manual UPI recording
            </span>
          </div>
        </div>

        {subscription ? (
          <div>
            {/* Subscription Key Metrics Cards */}
            <div className="vaango-sub-metrics-grid">
              <div className="vaango-sub-metric-card">
                <span className="vaango-sub-metric-label">Subscription Status</span>
                <Badge
                  variant={
                    subscription.status === 'ACTIVE'
                      ? 'success'
                      : subscription.status === 'OVERDUE'
                      ? 'error'
                      : subscription.status === 'SUSPENDED'
                      ? 'neutral'
                      : 'primary'
                  }
                  size="md"
                  withDot
                >
                  {subscription.status}
                </Badge>
                <span className="vaango-sub-metric-hint">Platform Daily Rate Model</span>
              </div>

              <div className="vaango-sub-metric-card">
                <span className="vaango-sub-metric-label">Daily Tariff Rate</span>
                <strong className="vaango-sub-metric-val">₹{subscription.daily_rate}/day</strong>
                <span className="vaango-sub-metric-hint">Capped strictly at ₹20/day</span>
              </div>

              <div className="vaango-sub-metric-card">
                <span className="vaango-sub-metric-label">Billing Cycle</span>
                <strong className="vaango-sub-metric-val">{subscription.billing_cycle}</strong>
                <span className="vaango-sub-metric-hint">
                  {subscription.billing_cycle === 'WEEKLY' ? '7-day collection' : '30-day collection'}
                </span>
              </div>

              <div className="vaango-sub-metric-card">
                <span className="vaango-sub-metric-label">Trial Window</span>
                {trialInfo ? (
                  <>
                    <strong className="vaango-sub-metric-val" style={{ color: 'var(--color-primary)' }}>
                      {trialInfo.daysRemaining} days left
                    </strong>
                    <span className="vaango-sub-metric-hint">
                      Ends{' '}
                      {new Date(trialInfo.trialEndDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </>
                ) : (
                  <span className="vaango-sub-metric-val">Trial concluded</span>
                )}
              </div>

              <div className="vaango-sub-metric-card">
                <span className="vaango-sub-metric-label">Current Amount Due</span>
                <strong
                  className="vaango-sub-metric-val"
                  style={{ color: subscription.amount_due > 0 ? 'var(--color-error)' : 'var(--color-success)' }}
                >
                  ₹{subscription.amount_due}
                </strong>
                <span className="vaango-sub-metric-hint">
                  {subscription.amount_due === 0 ? 'Account settled' : 'Payment pending'}
                </span>
              </div>
            </div>

            {/* Action Bar: Record UPI & Analytics Entitlement */}
            <div className="vaango-sub-actions-bar">
              <div className="vaango-entitlement-box">
                <div>
                  <strong>Analytics Entitlement: </strong>
                  <Badge variant={shop.subscription_tier === 'PRO' ? 'primary' : 'neutral'} size="sm">
                    {shop.subscription_tier === 'PRO' ? 'PRO PLAN' : 'FREE PLAN'}
                  </Badge>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Controls whether shopkeeper can view business intelligence charts and export CSV reports.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={isUpdatingTier}
                  onClick={handleToggleTier}
                >
                  {shop.subscription_tier === 'PRO' ? 'Downgrade to FREE' : 'Grant PRO Analytics'}
                </Button>
              </div>

              <div className="vaango-record-upi-box">
                <Button
                  variant="primary"
                  leftIcon={<Receipt size={16} />}
                  onClick={handleOpenRecordPayment}
                >
                  Record Manual UPI Payment
                </Button>
              </div>
            </div>

            {/* Payment Receipts History Table */}
            <div style={{ marginTop: 24 }}>
              <h3 className="vaango-sub-heading">Recorded UPI Payment History ({payments.length})</h3>
              {payments.length === 0 ? (
                <p className="vaango-empty-hint">
                  No subscription payment receipts recorded for this shop yet. Use "Record Manual UPI Payment" above to log a verified transaction.
                </p>
              ) : (
                <div className="vaango-table-responsive">
                  <table className="vaango-activity-table" aria-label="Subscription payments history">
                    <thead>
                      <tr>
                        <th>Reference / UTR</th>
                        <th>Amount Paid</th>
                        <th>Payment Date</th>
                        <th>Billing Cycle</th>
                        <th>Coverage Period</th>
                        <th>Admin Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.payment_reference}</strong>
                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                              ID: {p.id}
                            </div>
                          </td>
                          <td>
                            <strong style={{ color: 'var(--color-success)' }}>
                              ₹{p.amount_paid.toLocaleString('en-IN')}
                            </strong>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.85rem' }}>
                              {new Date(p.payment_date).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </td>
                          <td>
                            <Badge variant="neutral" size="sm">
                              {p.billing_cycle}
                            </Badge>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.82rem' }}>
                              {new Date(p.period_start).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                              {' — '}
                              {new Date(p.period_end).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                              {p.notes || 'No administrative notes'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="vaango-empty-hint">
            No active subscription record found for this shop in the database.
          </div>
        )}
      </Card>

      {/* GPS Location Card */}
      {shop.gps_lat && shop.gps_lng && (
        <Card variant="default" padding="lg">
          <div className="vaango-section-header">
            <div className="vaango-section-icon-badge">
              <Navigation size={18} />
            </div>
            <div>
              <h2 className="vaango-shop-sec-heading" style={{ margin: 0 }}>
                Storefront GIS Coordinates
              </h2>
              <span className="vaango-sec-sub">
                {shop.gps_lat}, {shop.gps_lng}
              </span>
            </div>
          </div>
          <div className="vaango-gps-box">
            <StorefrontMapPreview
              lat={Number(shop.gps_lat)}
              lng={Number(shop.gps_lng)}
              title={shop.name}
              height={200}
            />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${shop.gps_lat},${shop.gps_lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="vaango-gps-link"
            >
              <ExternalLink size={14} /> Open in Google Maps
            </a>
          </div>
        </Card>
      )}

      {/* MODALS */}

      {/* Record Manual Payment Modal */}
      <Modal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title={`Record Manual UPI Payment: ${shop.name}`}
        maxWidth="md"
      >
        <form onSubmit={handleSubmitPayment} className="vaango-payment-form">
          {recordPaymentError && (
            <div className="vaango-form-error-banner">
              <AlertCircle size={16} />
              <span>{recordPaymentError}</span>
            </div>
          )}

          <div className="vaango-form-grid">
            <div className="vaango-form-group">
              <label htmlFor="pay-amount-input">Amount Received (₹) *</label>
              <input
                id="pay-amount-input"
                type="number"
                className="vaango-input"
                value={amountPaid}
                onChange={(e) => setAmountPaid(Number(e.target.value))}
                min={1}
                required
              />
            </div>

            <div className="vaango-form-group">
              <label htmlFor="pay-date-input">Payment Date *</label>
              <input
                id="pay-date-input"
                type="date"
                className="vaango-input"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>

            <div className="vaango-form-group">
              <label htmlFor="pay-cycle-select">Covered Billing Cycle *</label>
              <select
                id="pay-cycle-select"
                className="vaango-input"
                value={billingCycle}
                onChange={(e) => handleCycleChange(e.target.value as 'WEEKLY' | 'MONTHLY')}
              >
                <option value="MONTHLY">MONTHLY (30 Days)</option>
                <option value="WEEKLY">WEEKLY (7 Days)</option>
              </select>
            </div>

            <div className="vaango-form-group">
              <label htmlFor="pay-ref-input">UPI Transaction UTR / Receipt Ref *</label>
              <input
                id="pay-ref-input"
                type="text"
                className="vaango-input"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g. UPI-9283741829 or Bank UTR"
                required
              />
            </div>

            <div className="vaango-form-group">
              <label htmlFor="pay-start-input">Coverage Period Start *</label>
              <input
                id="pay-start-input"
                type="date"
                className="vaango-input"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </div>

            <div className="vaango-form-group">
              <label htmlFor="pay-end-input">Coverage Period End *</label>
              <input
                id="pay-end-input"
                type="date"
                className="vaango-input"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="vaango-form-group" style={{ marginTop: 12 }}>
            <label htmlFor="pay-notes-input">Administrative Verification Notes</label>
            <textarea
              id="pay-notes-input"
              className="vaango-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Verified in platform operations bank statement."
            />
          </div>

          <div className="vaango-modal-actions" style={{ marginTop: 16 }}>
            <Button variant="outline" type="button" onClick={() => setPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isRecordingPayment}>
              Confirm & Advance Subscription
            </Button>
          </div>
        </form>
      </Modal>

      {/* Suspend Confirmation Modal */}
      <Modal
        isOpen={suspendModalOpen}
        onClose={() => setSuspendModalOpen(false)}
        title={`Suspend ${shop.name}?`}
        maxWidth="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Suspending <strong>{shop.name}</strong> will remove it from customer search and category listings immediately.
            <br /><br />
            <strong>Safety Guarantee:</strong> All past orders, appointments, services, and inventory records will remain preserved for complete accountability.
          </p>

          {suspendError && (
            <div className="vaango-form-error-banner">
              <AlertCircle size={16} />
              <span>{suspendError}</span>
            </div>
          )}

          <div className="vaango-form-group">
            <label htmlFor="suspend-reason-input">Mandatory Suspension Reason *</label>
            <textarea
              id="suspend-reason-input"
              className="vaango-input"
              rows={3}
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Non-fulfillment of counter orders, storefront relocated, or merchant request."
              required
            />
          </div>

          <div className="vaango-modal-actions">
            <Button variant="outline" onClick={() => setSuspendModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmSuspend} isLoading={isSuspending}>
              Confirm Suspension
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reactivate Modal */}
      <Modal
        isOpen={reactivateModalOpen}
        onClose={() => setReactivateModalOpen(false)}
        title={`Reactivate ${shop.name}?`}
        maxWidth="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Reactivating <strong>{shop.name}</strong> will restore its active merchant status.
          </p>

          <div className="vaango-modal-actions">
            <Button variant="outline" onClick={() => setReactivateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmReactivate} isLoading={isReactivating}>
              Confirm Reactivation
            </Button>
          </div>
        </div>
      </Modal>

      {/* Warn Shopkeeper Modal */}
      <Modal
        isOpen={warnModalOpen}
        onClose={() => setWarnModalOpen(false)}
        title={`Warn Shopkeeper: ${warnProduct?.name || ''}`}
        maxWidth="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 'var(--radius-md)', padding: '12px', fontSize: '0.85rem', color: '#b45309' }}>
            <strong>Operational Policy Notice:</strong> This warning will be logged to the immutable audit ledger and dispatched to the shopkeeper's active operational notification feed.
          </div>

          <div className="vaango-form-group">
            <label htmlFor="warn-reason-input">Reason for Warning *</label>
            <textarea
              id="warn-reason-input"
              className="vaango-input"
              rows={4}
              value={warnReason}
              onChange={(e) => setWarnReason(e.target.value)}
              placeholder="e.g. Misleading product description, unlisted allergen information, or pricing irregularity."
              required
            />
          </div>

          <div className="vaango-modal-actions">
            <Button variant="outline" onClick={() => setWarnModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmWarn} isLoading={isWarning}>
              Send Warning Notice
            </Button>
          </div>
        </div>
      </Modal>

      {/* Hide / Ban Product Modal */}
      <Modal
        isOpen={banModalOpen}
        onClose={() => setBanModalOpen(false)}
        title={`Hide / Ban Product: ${banProduct?.name || ''}?`}
        maxWidth="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 'var(--radius-md)', padding: '12px', fontSize: '0.85rem', color: '#b91c1c', lineHeight: 1.5 }}>
            <strong>Safety & Compliance Enforcement:</strong> Banning this product immediately hides it from customer search, shop details, and quick-add across the platform. The shopkeeper will be blocked from making this product available until administrative review.
          </div>

          <div className="vaango-form-group">
            <label htmlFor="ban-reason-input">Mandatory Prohibition Reason *</label>
            <textarea
              id="ban-reason-input"
              className="vaango-input"
              rows={4}
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="e.g. Product contains banned substances, counterfeit merchandise, or violates regulatory policy."
              required
            />
          </div>

          <div className="vaango-modal-actions">
            <Button variant="outline" onClick={() => setBanModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmBan} isLoading={isBanning}>
              Confirm Ban & Hide Product
            </Button>
          </div>
        </div>
      </Modal>

      {/* Lift Ban / Restore Modal */}
      <Modal
        isOpen={unbanModalOpen}
        onClose={() => setUnbanModalOpen(false)}
        title={`Restore Product: ${unbanProduct?.name || ''}?`}
        maxWidth="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Lifting the ban on <strong>{unbanProduct?.name}</strong> will remove administrative restrictions and allow the merchant to manage its stock availability again.
          </p>

          <div className="vaango-modal-actions">
            <Button variant="outline" onClick={() => setUnbanModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmUnban} isLoading={isUnbanning}>
              Restore Product
            </Button>
          </div>
        </div>
      </Modal>

      {/* Full Product Detail Inspection Modal */}
      {inspectProduct && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => {
            setDetailModalOpen(false);
            setInspectProduct(null);
          }}
          title={`Product Inspection: ${inspectProduct.name}`}
          maxWidth="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Image Gallery */}
            {((inspectProduct.image_urls && inspectProduct.image_urls.length > 0) || inspectProduct.image_url) && (
              <div className="vaango-admin-detail-images">
                {inspectProduct.image_urls && inspectProduct.image_urls.length > 0 ? (
                  inspectProduct.image_urls.map((url, i) => (
                    <img key={i} src={url} alt={`${inspectProduct.name} ${i + 1}`} className="vaango-admin-detail-img" />
                  ))
                ) : (
                  <img src={inspectProduct.image_url!} alt={inspectProduct.name} className="vaango-admin-detail-img" />
                )}
              </div>
            )}

            <div className="vaango-admin-detail-meta">
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>BASE PRICE</span>
                <strong>₹{inspectProduct.price} / {inspectProduct.unit}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>DATABASE ID</span>
                <code style={{ fontSize: '0.78rem' }}>{inspectProduct.id}</code>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>STOCK STATUS</span>
                <strong>{inspectProduct.is_available ? 'In Stock' : 'Out of Stock'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.75rem' }}>MODERATION STATUS</span>
                <strong style={{ color: inspectProduct.is_banned ? 'var(--color-error)' : 'var(--color-success)' }}>
                  {inspectProduct.is_banned ? 'BANNED / PROHIBITED' : 'APPROVED'}
                </strong>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem' }}>Product Description</h4>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.88rem', lineHeight: 1.5 }}>
                {inspectProduct.description || 'No description provided by merchant.'}
              </p>
            </div>

            {inspectProduct.has_variants && inspectProduct.variants && inspectProduct.variants.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Configured Variants & Individual Stock</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inspectProduct.variants.map((v) => {
                    const isVInStock =
                      v.is_available !== false &&
                      v.in_stock !== false &&
                      (v.stock_quantity === null || v.stock_quantity === undefined || v.stock_quantity > 0);
                    return (
                      <div
                        key={v.id || v.label}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          background: 'var(--color-surface-hover)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.85rem',
                        }}
                      >
                        <span>
                          <strong>{v.label || 'Default'}</strong> — ₹{v.price}
                        </span>
                        <Badge variant={isVInStock ? 'success' : 'neutral'} size="sm">
                          {isVInStock
                            ? v.stock_quantity != null
                              ? `${v.stock_quantity} in stock`
                              : 'In Stock'
                            : 'Out of Stock'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {inspectProduct.is_banned && (
              <div className="vaango-admin-mod-banner">
                <div><strong>Moderation Reason:</strong> {inspectProduct.moderation_reason || 'Prohibited item.'}</div>
                {inspectProduct.moderated_at && (
                  <time>Moderated at {new Date(inspectProduct.moderated_at).toLocaleString('en-IN')}</time>
                )}
              </div>
            )}

            <div className="vaango-modal-actions" style={{ marginTop: 8 }}>
              <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
              {!inspectProduct.is_banned ? (
                <>
                  <Button
                    variant="outline"
                    leftIcon={<AlertTriangle size={14} color="#d97706" />}
                    onClick={() => {
                      setDetailModalOpen(false);
                      handleOpenWarn(inspectProduct);
                    }}
                  >
                    Warn Shopkeeper
                  </Button>
                  <Button
                    variant="danger"
                    leftIcon={<ShieldAlert size={14} />}
                    onClick={() => {
                      setDetailModalOpen(false);
                      handleOpenBan(inspectProduct);
                    }}
                  >
                    Hide / Ban Product
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  leftIcon={<RotateCcw size={14} />}
                  onClick={() => {
                    setDetailModalOpen(false);
                    handleOpenUnban(inspectProduct);
                  }}
                >
                  Lift Ban / Restore
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
