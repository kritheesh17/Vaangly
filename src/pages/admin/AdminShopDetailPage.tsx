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
  AlertTriangle,
  ShieldAlert,
  Eye,
  Search,
  RotateCcw,
  Image as ImageIcon,
} from 'lucide-react';
import {
  fetchAdminShops,
  fetchShopSubscription,
  suspendShop,
  reactivateShop,
  fetchAdminShopProducts,
  warnShopkeeperProduct,
  banShopProduct,
  unbanShopProduct,
} from '../../lib/adminApi';
import { updateShopSubscriptionTier } from '../../lib/shopkeeperApi';
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
          const pList = await fetchAdminShopProducts(currentShop.id);
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

  const [isUpdatingTier, setIsUpdatingTier] = useState(false);
  const handleToggleTier = async () => {
    if (!shop) return;
    const nextTier = shop.subscription_tier === 'PRO' ? 'FREE' : 'PRO';
    setIsUpdatingTier(true);
    try {
      const res = await updateShopSubscriptionTier(shop.id, nextTier);
      if (res.success) {
        success(`Shop tier updated to ${nextTier}`);
        setShop((prev) => prev ? { ...prev, subscription_tier: nextTier } : null);
      } else {
        toastError(res.error || 'Failed to update subscription tier');
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Error updating subscription tier.');
    } finally {
      setIsUpdatingTier(false);
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

          {/* Catalogue / Service Readiness & Product Moderation Panel */}
          <Card variant="default" padding="lg">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <h2 className="vaango-shop-sec-heading" style={{ margin: 0 }}>
                <Package size={18} /> Storefront Catalogue & Moderation
              </h2>
              {shopType?.workflow_group_code === 'ORDER' && (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {products.length} total items listed
                </span>
              )}
            </div>

            <p style={{ margin: '0 0 14px 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Inspect listed items, review descriptions, ensure policy compliance, and moderate prohibited or banned items.
            </p>

            {shopType?.workflow_group_code === 'ORDER' ? (
              <>
                <div className="vaango-readiness-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', marginBottom: 16 }}>
                  <div className="vaango-readiness-stat">
                    <span className="vaango-readiness-val">{products.length}</span>
                    <span className="vaango-readiness-label">Total Items</span>
                  </div>
                  <div className="vaango-readiness-stat">
                    <span className="vaango-readiness-val" style={{ color: 'var(--color-success, #10b981)' }}>
                      {products.filter((p) => p.is_available && !p.is_banned).length}
                    </span>
                    <span className="vaango-readiness-label">In Stock</span>
                  </div>
                  <div className="vaango-readiness-stat">
                    <span className="vaango-readiness-val" style={{ color: 'var(--color-text-muted)' }}>
                      {products.filter((p) => !p.is_available && !p.is_banned).length}
                    </span>
                    <span className="vaango-readiness-label">Out of Stock</span>
                  </div>
                  <div className="vaango-readiness-stat">
                    <span className="vaango-readiness-val" style={{ color: 'var(--color-error, #ef4444)' }}>
                      {products.filter((p) => p.is_banned).length}
                    </span>
                    <span className="vaango-readiness-label">Banned</span>
                  </div>
                </div>

                {/* Filter Bar */}
                <div className="vaango-admin-mod-filter-bar">
                  <div className="vaango-admin-mod-search">
                    <Search size={16} className="vaango-admin-mod-search-icon" />
                    <input
                      type="search"
                      className="vaango-admin-mod-search-input"
                      placeholder="Search items by name or ID..."
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

                {/* Product Moderation Items List */}
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
                                  <span className="vaango-admin-prod-id" title="Product Database ID">{p.id}</span>
                                  {p.is_banned ? (
                                    <Badge variant="error" size="sm" withDot>
                                      BANNED / PROHIBITED
                                    </Badge>
                                  ) : p.is_available ? (
                                    <Badge variant="success" size="sm" withDot>
                                      LIVE
                                    </Badge>
                                  ) : (
                                    <Badge variant="neutral" size="sm">
                                      OUT OF STOCK
                                    </Badge>
                                  )}
                                </div>

                                <div className="vaango-admin-prod-price">
                                  ₹{p.price} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--color-text-muted)' }}>/ {p.unit}</span>
                                </div>

                                {p.description && <p className="vaango-admin-prod-desc">{p.description}</p>}

                                {p.has_variants && p.variants && p.variants.length > 0 && (
                                  <div style={{ marginTop: 4 }}>
                                    <span className="vaango-admin-prod-variants-tag">
                                      {p.variants.length} Variants ({p.variants.map((v) => `${v.label}: ₹${v.price}`).join(', ')})
                                    </span>
                                  </div>
                                )}

                                {p.is_banned && (
                                  <div className="vaango-admin-mod-banner" style={{ marginTop: 8 }}>
                                    <div><strong>Prohibition Reason:</strong> {p.moderation_reason || 'Prohibited item excluded by administration.'}</div>
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
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Configured Variants & Options</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inspectProduct.variants.map((v) => (
                    <div
                      key={v.id}
                      style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--color-surface-hover)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}
                    >
                      <span>{v.label}</span>
                      <strong>₹{v.price} ({v.in_stock ? 'In Stock' : 'Out of Stock'})</strong>
                    </div>
                  ))}
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
