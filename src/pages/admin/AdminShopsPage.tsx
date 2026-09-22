import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Store,
  Search,
  MapPin,
  Phone,
  ArrowRight,
  ArrowLeft,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { fetchAdminShops, suspendShop, reactivateShop, fetchAdminSubscriptions } from '../../lib/adminApi';
import { Shop, ShopSubscription } from '../../types/database';
import { MOCK_SHOP_TYPES, getShopType } from '../../data/mockData';
import { DEFAULT_LOCATIONS } from '../../context/LocationContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { useLanguage } from '../../context/LanguageContext';
import './AdminShopsPage.css';

export const AdminShopsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const { t } = useLanguage();

  const [shops, setShops] = useState<Shop[]>([]);
  const [subscriptions, setSubscriptions] = useState<ShopSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter state
  const searchQuery = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || 'all';
  const locationFilter = searchParams.get('location') || 'all';
  const groupFilter = searchParams.get('group') || 'all';

  // Suspension Modal State
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [targetShopToSuspend, setTargetShopToSuspend] = useState<Shop | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [isSuspending, setIsSuspending] = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);

  // Reactivation Modal State
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const [targetShopToReactivate, setTargetShopToReactivate] = useState<Shop | null>(null);
  const [isReactivating, setIsReactivating] = useState(false);

  const loadShopsData = async () => {
    setIsLoading(true);
    try {
      const [shopsData, subsData] = await Promise.all([
        fetchAdminShops({
          searchQuery,
          status: statusFilter,
          locationId: locationFilter !== 'all' ? locationFilter : undefined,
          workflowGroup: groupFilter !== 'all' ? (groupFilter as any) : undefined,
        }),
        fetchAdminSubscriptions(),
      ]);
      setShops(shopsData);
      setSubscriptions(subsData);
    } catch (err) {
      console.error('Error fetching shops list:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadShopsData();
  }, [searchQuery, statusFilter, locationFilter, groupFilter]);

  const updateParam = (key: string, val: string) => {
    const params = new URLSearchParams(searchParams);
    if (val === 'all' || !val) params.delete(key);
    else params.set(key, val);
    setSearchParams(params);
  };

  const handlePromptSuspend = (shop: Shop, e: React.MouseEvent) => {
    e.stopPropagation();
    setTargetShopToSuspend(shop);
    setSuspendReason('');
    setSuspendError(null);
    setSuspendModalOpen(true);
  };

  const handleConfirmSuspend = async () => {
    if (!targetShopToSuspend || !user) return;
    if (!suspendReason.trim()) {
      setSuspendError('A clear suspension reason is required for administrative accountability.');
      return;
    }

    setIsSuspending(true);
    try {
      const res = await suspendShop(targetShopToSuspend.id, user.id, suspendReason.trim());
      if (res.success) {
        success(t('shopSuspendedSuccess', { name: targetShopToSuspend.name }));
        setSuspendModalOpen(false);
        loadShopsData();
      } else {
        setSuspendError(res.error || t('failedSuspendShop'));
      }
    } catch (err: unknown) {
      setSuspendError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setIsSuspending(false);
    }
  };

  const handlePromptReactivate = (shop: Shop, e: React.MouseEvent) => {
    e.stopPropagation();
    setTargetShopToReactivate(shop);
    setReactivateModalOpen(true);
  };

  const handleConfirmReactivate = async () => {
    if (!targetShopToReactivate || !user) return;
    setIsReactivating(true);
    try {
      const res = await reactivateShop(targetShopToReactivate.id, user.id);
      setReactivateModalOpen(false);

      if (res.success) {
        success(t('shopReactivatedSuccess', { name: targetShopToReactivate.name }));
        loadShopsData();
      } else {
        toastError(res.error || t('failedReactivateShop'));
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setIsReactivating(false);
    }
  };

  return (
    <div className="container vaango-admin-shops">
      {/* Header */}
      <div className="vaango-admin-shops__header">
        <div>
          <button
            type="button"
            className="vaango-back-btn"
            onClick={() => navigate('/admin/dashboard')}
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={16} />
            <span>{t('adminDashboard')}</span>
          </button>
          <h1 className="vaango-admin-shops__title">Shop Directory & Lifecycle</h1>
          <p className="vaango-admin-shops__subtitle">
            Inspect all onboarded shops across Order, Appointment, and Service verticals. Suspend unready or non-compliant storefronts without destroying past orders.
          </p>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="vaango-admin-shops__filter-card">
        <div className="vaango-admin-shops__search">
          <Input
            placeholder="Search by shop name, phone or tagline..."
            value={searchQuery}
            onChange={(e) => updateParam('q', e.target.value)}
            leftIcon={<Search size={16} />}
          />
        </div>

        <div className="vaango-admin-shops__filters-row">
          <select
            className="vaango-admin-select"
            value={statusFilter}
            onChange={(e) => updateParam('status', e.target.value)}
            aria-label="Filter by lifecycle status"
          >
            <option value="all">Status: All Lifecycles</option>
            <option value="active">Active & Live</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending Approval</option>
          </select>

          <select
            className="vaango-admin-select"
            value={groupFilter}
            onChange={(e) => updateParam('group', e.target.value)}
            aria-label="Filter by workflow vertical"
          >
            <option value="all">Vertical: All Groups</option>
            <option value="ORDER">Group A: Order</option>
            <option value="APPOINTMENT">Group B: Appointment</option>
            <option value="SERVICE">Group C: Service</option>
          </select>

          <select
            className="vaango-admin-select"
            value={locationFilter}
            onChange={(e) => updateParam('location', e.target.value)}
            aria-label="Filter by hometown location"
          >
            <option value="all">Location: All Hometowns</option>
            {DEFAULT_LOCATIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Shops Directory List */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </div>
      ) : shops.length === 0 ? (
        <Card variant="outlined" padding="lg" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {t('noShopsFound')}
        </Card>
      ) : (
        <div className="vaango-admin-shops__list">
          {shops.map((shop) => {
            const shopType = getShopType(shop.shop_type_id);
            const location = DEFAULT_LOCATIONS.find((l) => l.id === shop.location_id);
            const sub = subscriptions.find((s) => s.shop_id === shop.id);

            return (
              <Card
                key={shop.id}
                variant="default"
                padding="md"
                className={`vaango-admin-shop-item ${shop.status === 'suspended' ? 'vaango-admin-shop-item--suspended' : ''}`}
                onClick={() => navigate(`/admin/shops/${shop.id}`)}
              >
                <div className="vaango-admin-shop-item__info">
                  <div className="vaango-admin-shop-item__header">
                    <div>
                      <h3 className="vaango-admin-shop-item__name">{shop.name}</h3>
                      <span className="vaango-admin-shop-item__tagline">
                        {shop.tagline || 'Neighborhood Merchant on Vaango'}
                      </span>
                    </div>

                    <div className="vaango-admin-shop-item__badges">
                      {shop.status === 'suspended' ? (
                        <Badge variant="error" size="sm" withDot>
                          SUSPENDED
                        </Badge>
                      ) : shop.is_live ? (
                        <Badge variant="success" size="sm" withDot>
                          LIVE ON VAANGO
                        </Badge>
                      ) : (
                        <Badge variant="warning" size="sm">
                          Catalogue Incomplete
                        </Badge>
                      )}

                      {sub && (
                        <Badge
                          variant={
                            sub.status === 'ACTIVE'
                              ? 'success'
                              : sub.status === 'OVERDUE'
                              ? 'error'
                              : 'primary'
                          }
                          size="sm"
                        >
                          Sub: {sub.status}
                        </Badge>
                      )}
                      <Badge
                        variant={shop.subscription_tier === 'PRO' ? 'primary' : 'neutral'}
                        size="sm"
                      >
                        {shop.subscription_tier === 'PRO' ? 'PRO TIER' : 'FREE TIER'}
                      </Badge>
                      {typeof shop.cancellation_rate === 'number' && shop.cancellation_rate > 30 && <Badge variant="error" size="sm">{shop.cancellation_rate}% cancellations</Badge>}
                    </div>
                  </div>

                  <div className="vaango-admin-shop-item__meta">
                    <span>
                      <Store size={14} /> {shopType?.name || 'Store'} ({shopType?.workflow_group_code || 'ORDER'})
                    </span>
                    <span>
                      <MapPin size={14} /> {location?.name || 'Hometown Zone'}
                    </span>
                    <span>
                      <Phone size={14} /> {shop.phone}
                    </span>
                    {sub && sub.status === 'TRIAL' && (
                      <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                        <Clock size={14} /> 60-Day Trial Active
                      </span>
                    )}
                  </div>
                </div>

                <div className="vaango-admin-shop-item__actions">
                  {shop.status === 'suspended' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handlePromptReactivate(shop, e)}
                      className="vaango-btn--reactivate"
                    >
                      Reactivate Shop
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handlePromptSuspend(shop, e)}
                      className="vaango-btn--danger-outline"
                    >
                      Suspend Shop
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={14} />}>
                    Inspect
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Suspend Confirmation Modal with Mandatory Reason */}
      <Modal
        isOpen={suspendModalOpen}
        onClose={() => setSuspendModalOpen(false)}
        title={`Suspend ${targetShopToSuspend?.name}?`}
        maxWidth="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Suspending <strong>{targetShopToSuspend?.name}</strong> will immediately remove it from customer search and category discovery.
            <br /><br />
            <strong>Safety Guarantee:</strong> All past customer orders, appointments, services, and inventory records will remain completely preserved for accountability.
          </p>

          {suspendError && (
            <div className="vaango-form-error-banner">
              <AlertCircle size={16} />
              <span>{suspendError}</span>
            </div>
          )}

          <div className="vaango-form-group">
            <label htmlFor="suspend-reason">Mandatory Suspension Reason *</label>
            <textarea
              id="suspend-reason"
              className="vaango-input"
              rows={3}
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Non-fulfillment of counter orders, storefront relocated, or policy violation."
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
        title={`Reactivate ${targetShopToReactivate?.name}?`}
        maxWidth="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Reactivating <strong>{targetShopToReactivate?.name}</strong> will restore its active merchant status.
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
