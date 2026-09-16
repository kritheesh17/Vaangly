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
  BarChart3,
} from 'lucide-react';
import {
  fetchAdminShops,
  fetchShopSubscription,
  suspendShop,
  reactivateShop,
} from '../../lib/adminApi';
import { getShopProductsList, updateShopSubscriptionTier } from '../../lib/shopkeeperApi';
import { fetchShopServices } from '../../lib/appointmentServiceApi';
import { Shop, ShopSubscription, ShopProduct, ShopService } from '../../types/database';
import { MOCK_SHOP_TYPES } from '../../data/mockData';
import { DEFAULT_LOCATIONS } from '../../context/LocationContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import './AdminShopDetailPage.css';

export const AdminShopDetailPage: React.FC = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [shop, setShop] = useState<Shop | null>(null);
  const [subscription, setSubscription] = useState<ShopSubscription | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [services, setServices] = useState<ShopService[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Suspension Modal State
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [isSuspending, setIsSuspending] = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);

  // Reactivation Modal State
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);

  const loadShopData = async () => {
    if (!shopId) return;
    setIsLoading(true);
    try {
      const allShops = await fetchAdminShops();
      const currentShop = allShops.find((s) => s.id === shopId) || null;
      setShop(currentShop);

      if (currentShop) {
        const sub = await fetchShopSubscription(currentShop.id);
        setSubscription(sub);

        const shopType = MOCK_SHOP_TYPES.find((t) => t.id === currentShop.shop_type_id);
        if (shopType?.workflow_group_code === 'ORDER') {
          const pList = await getShopProductsList(currentShop.id);
          setProducts(pList);
        } else {
          const sList = await fetchShopServices(currentShop.id);
          setServices(sList);
        }
      }
    } catch (err) {
      console.error('Error loading shop detail:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadShopData();
  }, [shopId]);

  const handleConfirmSuspend = async () => {
    if (!shop || !user) return;
    if (!suspendReason.trim()) {
      setSuspendError('A clear suspension reason is required.');
      return;
    }

    setIsSuspending(true);
    const res = await suspendShop(shop.id, user.id, suspendReason.trim());
    setIsSuspending(false);

    if (res.success) {
      success(`${shop.name} has been suspended.`);
      setSuspendModalOpen(false);
      loadShopData();
    } else {
      setSuspendError(res.error || 'Failed to suspend shop.');
    }
  };

  const handleConfirmReactivate = async () => {
    if (!shop || !user) return;
    setIsReactivating(true);
    const res = await reactivateShop(shop.id, user.id);
    setIsReactivating(false);
    setReactivateModalOpen(false);

    if (res.success) {
      success(`${shop.name} has been reactivated.`);
      loadShopData();
    } else {
      toastError(res.error || 'Failed to reactivate shop.');
    }
  };

  const [isUpdatingTier, setIsUpdatingTier] = useState(false);
  const handleToggleTier = async () => {
    if (!shop) return;
    const nextTier = shop.subscription_tier === 'PRO' ? 'FREE' : 'PRO';
    setIsUpdatingTier(true);
    const res = await updateShopSubscriptionTier(shop.id, nextTier);
    setIsUpdatingTier(false);
    if (res.success) {
      success(`Shop tier updated to ${nextTier}`);
      setShop((prev) => prev ? { ...prev, subscription_tier: nextTier } : null);
    } else {
      toastError(res.error || 'Failed to update subscription tier');
    }
  };

  if (isLoading) {
    return (
      <div className="container vaango-admin-shop-detail">
        <Skeleton height={32} width={200} style={{ marginBottom: 16 }} />
        <Skeleton height={140} style={{ marginBottom: 20 }} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="container vaango-admin-shop-detail">
        <Card variant="outlined" padding="lg" style={{ textAlign: 'center' }}>
          <h2>Shop Not Found</h2>
          <Button variant="outline" onClick={() => navigate('/admin/shops')}>
            Back to Shops
          </Button>
        </Card>
      </div>
    );
  }

  const shopType = MOCK_SHOP_TYPES.find((t) => t.id === shop.shop_type_id);
  const location = DEFAULT_LOCATIONS.find((l) => l.id === shop.location_id);

  return (
    <div className="container vaango-admin-shop-detail">
      {/* Back button */}
      <button
        type="button"
        className="vaango-back-btn"
        onClick={() => navigate('/admin/shops')}
        aria-label="Back to shops directory"
      >
        <ArrowLeft size={16} />
        <span>Shops Directory</span>
      </button>

      {/* Header Banner */}
      <div className="vaango-shop-detail__header">
        <div>
          <div className="vaango-shop-detail__badge-row">
            <span className="vaango-shop-detail__kicker">Shop Operational Inspection</span>
            {shop.status === 'suspended' ? (
              <Badge variant="error" size="md" withDot>
                SUSPENDED
              </Badge>
            ) : shop.is_live ? (
              <Badge variant="success" size="md" withDot>
                LIVE ON VAANGO
              </Badge>
            ) : (
              <Badge variant="warning" size="md">
                Catalogue Incomplete
              </Badge>
            )}
          </div>
          <h1 className="vaango-shop-detail__title">{shop.name}</h1>
          <p className="vaango-shop-detail__subtitle">
            {shop.tagline || 'Neighborhood storefront on Vaango'}
          </p>
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

      {/* Inspection Grid */}
      <div className="vaango-shop-detail__grid">
        {/* Left Column: Profile & Readiness */}
        <div className="vaango-shop-detail__col-main">
          <Card variant="default" padding="lg">
            <h2 className="vaango-shop-sec-heading">
              <Store size={18} /> Storefront Configuration
            </h2>
            <div className="vaango-shop-info-grid">
              <div>
                <span className="vaango-field-label">Shop Type / Vertical</span>
                <span className="vaango-field-value">
                  {shopType?.name || 'Store'} ({shopType?.workflow_group_code || 'ORDER'})
                </span>
              </div>
              <div>
                <span className="vaango-field-label">Operating Hometown</span>
                <span className="vaango-field-value">
                  <MapPin size={14} style={{ marginRight: 4 }} />
                  {location?.name || 'Hometown'} ({location?.pincode})
                </span>
              </div>
              <div>
                <span className="vaango-field-label">Contact Phone</span>
                <span className="vaango-field-value">
                  <Phone size={14} style={{ marginRight: 4 }} />
                  {shop.phone}
                </span>
              </div>
              <div>
                <span className="vaango-field-label">Storefront Address</span>
                <span className="vaango-field-value">{shop.address_line}</span>
              </div>
              <div>
                <span className="vaango-field-label">Direct UPI VPA</span>
                <span className="vaango-field-value">
                  <code>{shop.upi_id || 'Not configured'}</code>
                </span>
              </div>
              <div>
                <span className="vaango-field-label">Delivery Support</span>
                <span className="vaango-field-value">
                  {shop.delivery_available ? `Yes (₹${shop.delivery_fee})` : 'Self Pickup Only'}
                </span>
              </div>
            </div>
          </Card>

          {/* Catalogue / Service Readiness */}
          <Card variant="default" padding="lg">
            <h2 className="vaango-shop-sec-heading">
              <Package size={18} /> Catalogue Readiness (Go-Live Guard)
            </h2>
            <p style={{ margin: '0 0 14px 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              A shop cannot go live to customers with an empty catalogue. Current listed inventory:
            </p>

            {shopType?.workflow_group_code === 'ORDER' ? (
              <div className="vaango-readiness-stats">
                <div className="vaango-readiness-stat">
                  <span className="vaango-readiness-val">{products.length}</span>
                  <span className="vaango-readiness-label">Products Listed</span>
                </div>
                <div className="vaango-readiness-stat">
                  <span className="vaango-readiness-val">
                    {products.filter((p) => p.is_available).length}
                  </span>
                  <span className="vaango-readiness-label">In Stock</span>
                </div>
              </div>
            ) : (
              <div className="vaango-readiness-stats">
                <div className="vaango-readiness-stat">
                  <span className="vaango-readiness-val">{services.length}</span>
                  <span className="vaango-readiness-label">Services Configured</span>
                </div>
                <div className="vaango-readiness-stat">
                  <span className="vaango-readiness-val">
                    {services.filter((s) => s.is_available).length}
                  </span>
                  <span className="vaango-readiness-label">Active For Booking</span>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Subscription Status & GPS */}
        <div className="vaango-shop-detail__col-side">
          <Card variant="default" padding="lg" className="vaango-sub-summary-card">
            <div className="vaango-sub-card-header">
              <CreditCard size={20} className="vaango-sub-icon" />
              <div>
                <h2 className="vaango-shop-sec-heading" style={{ margin: 0 }}>
                  Subscription Status
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Platform Daily Rate Model
                </span>
              </div>
            </div>

            {subscription ? (
              <div className="vaango-sub-card-body">
                <div className="vaango-sub-row">
                  <span>Status:</span>
                  <Badge
                    variant={
                      subscription.status === 'ACTIVE'
                        ? 'success'
                        : subscription.status === 'OVERDUE'
                        ? 'error'
                        : 'primary'
                    }
                    size="sm"
                  >
                    {subscription.status}
                  </Badge>
                </div>
                <div className="vaango-sub-row">
                  <span>Daily Rate:</span>
                  <strong>₹{subscription.daily_rate}/day (Cap ₹20)</strong>
                </div>
                <div className="vaango-sub-row">
                  <span>Billing Cycle:</span>
                  <strong>{subscription.billing_cycle}</strong>
                </div>
                <div className="vaango-sub-row">
                  <span>Trial End Date:</span>
                  <strong>
                    {new Date(subscription.trial_end_date).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </strong>
                </div>
                {subscription.amount_due > 0 && (
                  <div className="vaango-sub-row vaango-sub-due">
                    <span>Amount Due:</span>
                    <strong style={{ color: 'var(--color-error)' }}>₹{subscription.amount_due}</strong>
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={() => navigate('/admin/subscriptions')}
                  >
                    Manage Subscriptions & UPI
                  </Button>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '12px 0 0 0' }}>
                No active subscription record found.
              </p>
            )}
          </Card>

          {/* Monetization & Analytics Tier */}
          <Card variant="default" padding="lg">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 className="vaango-shop-sec-heading" style={{ margin: 0 }}>
                <BarChart3 size={18} /> Analytics Entitlement
              </h2>
              <Badge variant={shop.subscription_tier === 'PRO' ? 'primary' : 'neutral'} size="sm">
                {shop.subscription_tier === 'PRO' ? 'PRO PLAN' : 'FREE PLAN'}
              </Badge>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 14 }}>
              Controls whether this shopkeeper has access to full business intelligence, interactive revenue charts, and CSV report export.
            </p>
            <Button
              variant={shop.subscription_tier === 'PRO' ? 'outline' : 'primary'}
              size="sm"
              fullWidth
              isLoading={isUpdatingTier}
              onClick={handleToggleTier}
            >
              {shop.subscription_tier === 'PRO' ? 'Downgrade to FREE Tier' : 'Grant PRO Analytics Entitlement'}
            </Button>
          </Card>

          {/* Device GPS */}
          <Card variant="default" padding="lg">
            <h2 className="vaango-shop-sec-heading">
              <Navigation size={18} /> Storefront GPS
            </h2>
            {shop.gps_lat && shop.gps_lng ? (
              <div className="vaango-gps-box">
                <p style={{ margin: 0, fontSize: '0.85rem' }}>
                  {shop.gps_lat}, {shop.gps_lng}
                </p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${shop.gps_lat},${shop.gps_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vaango-gps-link"
                >
                  <ExternalLink size={14} /> Open in Google Maps
                </a>
              </div>
            ) : (
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                GPS coordinates not available
              </span>
            )}
          </Card>
        </div>
      </div>

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
    </div>
  );
};
