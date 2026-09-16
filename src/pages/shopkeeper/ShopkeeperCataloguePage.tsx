import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  ArrowLeft,
  Edit2,
  Trash2,
  Package,
  AlertTriangle,
  Calendar,
  Wrench,
  User,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Shop, ShopProduct, ShopService, PriceType } from '../../types/database';
import { WorkflowGroupCode } from '../../types/workflow';
import { MOCK_SHOP_TYPES } from '../../data/mockData';
import {
  getShopkeeperShop,
  getShopProductsList,
  createShopProduct,
  updateShopProduct,
  toggleProductStock,
  deleteShopProduct,
  toggleShopLive,
} from '../../lib/shopkeeperApi';
import {
  fetchShopServices,
  saveShopService,
  deleteShopService,
} from '../../lib/appointmentServiceApi';
import { ProductFormModal } from '../../components/shopkeeper/ProductFormModal';
import { ServiceFormModal } from '../../components/shopkeeper/ServiceFormModal';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import './ShopkeeperCataloguePage.css';

export const ShopkeeperCataloguePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError, info } = useToast();

  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [services, setServices] = useState<ShopService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');

  // Product Modal State (Group A)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShopProduct | null>(null);

  // Service Modal State (Group B & C)
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ShopService | null>(null);

  // Delete Confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const shopType = MOCK_SHOP_TYPES.find((t) => t.id === shop?.shop_type_id);
  const workflowGroup: WorkflowGroupCode = (shopType?.workflow_group_code || 'ORDER') as WorkflowGroupCode;

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const userShop = await getShopkeeperShop(user.id);
      setShop(userShop);

      if (userShop) {
        const type = MOCK_SHOP_TYPES.find((t) => t.id === userShop.shop_type_id);
        const group = type?.workflow_group_code || 'ORDER';

        if (group === 'ORDER') {
          const prodList = await getShopProductsList(userShop.id);
          setProducts(prodList);
        } else {
          const srvList = await fetchShopServices(userShop.id);
          setServices(srvList);
        }
      }
    } catch (err) {
      console.error('Error fetching catalogue:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Product Stock Toggle (Group A)
  const handleStockToggle = async (productId: string, currentStock: boolean) => {
    if (!shop) return;
    const nextStock = !currentStock;

    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, is_available: nextStock } : p))
    );

    const res = await toggleProductStock(shop.id, productId, nextStock);
    if (res.success) {
      if (nextStock) {
        success('Item marked In Stock.');
      } else {
        info('Item marked Out of Stock.');
      }
    } else {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, is_available: currentStock } : p))
      );
      toastError(res.error || 'Failed to update stock.');
    }
  };

  // Service Availability Toggle (Group B & C)
  const handleServiceToggle = async (service: ShopService) => {
    if (!shop) return;
    const nextAvailable = !service.is_available;

    setServices((prev) =>
      prev.map((s) => (s.id === service.id ? { ...s, is_available: nextAvailable } : s))
    );

    const res = await saveShopService(shop.id, {
      ...service,
      is_available: nextAvailable,
    });

    if (res.success) {
      if (nextAvailable) {
        success('Service marked Available.');
      } else {
        info('Service marked Unavailable for new bookings.');
      }
    } else {
      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, is_available: service.is_available } : s))
      );
      toastError(res.error || 'Failed to update service availability.');
    }
  };

  // Add / Edit Product Submit (Group A)
  const handleProductModalSubmit = async (productData: {
    name: string;
    description: string;
    price: number;
    unit: string;
    is_available: boolean;
    image_url: string | null;
    image_urls: string[];
  }) => {
    if (!shop) return { success: false, error: 'No shop associated with account.' };

    if (editingProduct) {
      const res = await updateShopProduct(shop.id, editingProduct.id, productData);
      if (res.success && res.product) {
        setProducts((prev) =>
          prev.map((p) => (p.id === editingProduct.id ? res.product! : p))
        );
        success(`Updated "${productData.name}"`);
        return { success: true };
      }
      return { success: false, error: res.error };
    } else {
      const res = await createShopProduct(shop.id, productData);
      if (res.success && res.product) {
        setProducts((prev) => [res.product!, ...prev]);
        success(`Added "${productData.name}" to catalogue!`);
        return { success: true };
      }
      return { success: false, error: res.error };
    }
  };

  // Add / Edit Service Submit (Group B & C)
  const handleServiceModalSubmit = async (serviceData: {
    id?: string;
    name: string;
    description: string | null;
    price_type: PriceType;
    base_price: number | null;
    min_price: number | null;
    max_price: number | null;
    duration_minutes: number | null;
    provider_name: string | null;
    specialization: string | null;
    service_category: string | null;
    is_available: boolean;
  }) => {
    if (!shop) return { success: false, error: 'No shop associated with account.' };

    const res = await saveShopService(shop.id, serviceData);
    if (res.success && res.service) {
      setServices((prev) => {
        const idx = prev.findIndex((s) => s.id === res.service!.id);
        if (idx !== -1) {
          const copy = [...prev];
          copy[idx] = res.service!;
          return copy;
        }
        return [res.service!, ...prev];
      });
      success(`Service "${serviceData.name}" saved!`);
      return { success: true };
    }
    return { success: false, error: res.error };
  };

  // Delete Product / Service
  const handleDeleteItem = async (itemId: string) => {
    if (!shop) return;

    if (workflowGroup === 'ORDER') {
      const res = await deleteShopProduct(shop.id, itemId);
      if (res.success) {
        setProducts((prev) => prev.filter((p) => p.id !== itemId));
        success('Product removed from catalogue.');
      } else {
        toastError(res.error || 'Failed to delete product.');
      }
    } else {
      const res = await deleteShopService(shop.id, itemId);
      if (res.success) {
        setServices((prev) => prev.filter((s) => s.id !== itemId));
        success('Service removed.');
      } else {
        toastError(res.error || 'Failed to delete service.');
      }
    }
    setDeleteConfirmId(null);
  };

  // Go Live Shortcut
  const handleGoLive = async () => {
    if (!shop) return;
    const res = await toggleShopLive(shop.id, true);
    if (res.success && res.shop) {
      setShop(res.shop);
      success('🎉 Your shop is now LIVE! Customers can now discover and book.');
    } else {
      toastError(res.error || 'Failed to go live.');
    }
  };

  // Filter products
  const filteredProducts = products.filter((p) => {
    if (stockFilter === 'in_stock' && !p.is_available) return false;
    if (stockFilter === 'out_of_stock' && p.is_available) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = (p.description || '').toLowerCase().includes(q);
      return matchName || matchDesc;
    }
    return true;
  });

  // Filter services
  const filteredServices = services.filter((s) => {
    if (stockFilter === 'in_stock' && !s.is_available) return false;
    if (stockFilter === 'out_of_stock' && s.is_available) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = s.name.toLowerCase().includes(q);
      const matchDesc = (s.description || '').toLowerCase().includes(q);
      const matchProvider = (s.provider_name || '').toLowerCase().includes(q);
      return matchName || matchDesc || matchProvider;
    }
    return true;
  });

  const totalItemCount = workflowGroup === 'ORDER' ? products.length : services.length;
  const inStockCount =
    workflowGroup === 'ORDER'
      ? products.filter((p) => p.is_available).length
      : services.filter((s) => s.is_available).length;
  const outOfStockCount =
    workflowGroup === 'ORDER'
      ? products.filter((p) => !p.is_available).length
      : services.filter((s) => !s.is_available).length;

  if (!isLoading && !shop) {
    return (
      <div className="vaango-empty-state">
        <div className="vaango-empty-state__icon">🏪</div>
        <h2>Your shop isn't ready yet</h2>
        <p className="text-secondary">You can manage your catalogue once your shop application is approved by the admin.</p>
        <Button variant="primary" size="md" className="mt-4" onClick={() => navigate('/shopkeeper/dashboard')}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="container vaango-catalogue">
      {/* Header */}
      <div className="vaango-catalogue__header">
        <button
          type="button"
          className="vaango-back-btn"
          onClick={() => navigate('/shopkeeper/dashboard')}
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={18} />
          <span>Dashboard</span>
        </button>

        <div className="vaango-catalogue__title-row">
          <div>
            <h1 className="vaango-catalogue__title">
              {workflowGroup === 'APPOINTMENT'
                ? 'Appointment Services & Doctor Schedule'
                : workflowGroup === 'SERVICE'
                ? 'Service & Repair Catalogue'
                : 'Catalogue Management'}
            </h1>
            <p className="vaango-catalogue__subtitle">
              {workflowGroup === 'APPOINTMENT'
                ? 'Manage appointment services, doctors, durations, and session fees.'
                : workflowGroup === 'SERVICE'
                ? 'Manage repair services, tailoring types, and fixed or estimated price ranges.'
                : 'Manage your products, set prices, and update stock availability in realtime.'}
            </p>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={() => {
              if (workflowGroup === 'ORDER') {
                setEditingProduct(null);
                setModalOpen(true);
              } else {
                setEditingService(null);
                setServiceModalOpen(true);
              }
            }}
            leftIcon={<Plus size={18} />}
          >
            {workflowGroup === 'APPOINTMENT'
              ? 'Add Appointment Service'
              : workflowGroup === 'SERVICE'
              ? 'Add New Service'
              : 'Add New Product'}
          </Button>
        </div>
      </div>

      {/* Readiness / Go Live Alert if catalogue incomplete or offline */}
      {shop && !shop.is_live && (
        <div className="vaango-catalogue__golive-alert">
          <AlertTriangle size={20} className="vaango-alert-icon" />
          <div className="vaango-catalogue__golive-text">
            <strong>Approved — Catalogue Incomplete</strong>
            <span>
              {totalItemCount === 0
                ? 'Your catalogue is empty. Add your first service or product to unlock Go Live visibility.'
                : 'You have services/products in your catalogue! You can now make your shop visible to customers.'}
            </span>
          </div>
          {totalItemCount > 0 && (
            <Button variant="primary" size="sm" onClick={handleGoLive}>
              Make Shop Live
            </Button>
          )}
        </div>
      )}

      {/* Search and Stock Filters */}
      <div className="vaango-catalogue__toolbar">
        <div className="vaango-catalogue__search">
          <Input
            type="search"
            placeholder={
              workflowGroup === 'APPOINTMENT'
                ? 'Search appointment services or doctors...'
                : workflowGroup === 'SERVICE'
                ? 'Search services, repairs or alterations...'
                : 'Search items in your catalogue...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={18} />}
          />
        </div>

        <div className="vaango-catalogue__filters">
          <button
            type="button"
            className={`vaango-stock-filter ${stockFilter === 'all' ? 'vaango-stock-filter--active' : ''}`}
            onClick={() => setStockFilter('all')}
          >
            All ({totalItemCount})
          </button>
          <button
            type="button"
            className={`vaango-stock-filter ${stockFilter === 'in_stock' ? 'vaango-stock-filter--active' : ''}`}
            onClick={() => setStockFilter('in_stock')}
          >
            Available ({inStockCount})
          </button>
          <button
            type="button"
            className={`vaango-stock-filter ${stockFilter === 'out_of_stock' ? 'vaango-stock-filter--active' : ''}`}
            onClick={() => setStockFilter('out_of_stock')}
          >
            Unavailable ({outOfStockCount})
          </button>
        </div>
      </div>

      {/* Content Stream: Services vs Products */}
      <div className="vaango-catalogue__content">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton height="90px" borderRadius="12px" />
            <Skeleton height="90px" borderRadius="12px" />
            <Skeleton height="90px" borderRadius="12px" />
          </div>
        ) : workflowGroup !== 'ORDER' ? (
          /* GROUP B & C: SERVICES LIST */
          filteredServices.length === 0 ? (
            <EmptyState
              icon={workflowGroup === 'APPOINTMENT' ? <Calendar size={48} /> : <Wrench size={48} />}
              title={services.length === 0 ? 'No services listed yet' : 'No matching services'}
              description={
                services.length === 0
                  ? 'Add your services, doctor sessions, or repair tasks so customers can book them.'
                  : 'Try adjusting your search query or filter.'
              }
              actionLabel={services.length === 0 ? 'Add First Service' : undefined}
              onAction={
                services.length === 0
                  ? () => {
                      setEditingService(null);
                      setServiceModalOpen(true);
                    }
                  : undefined
              }
            />
          ) : (
            <div className="vaango-catalogue__grid">
              {filteredServices.map((srv) => (
                <Card
                  key={srv.id}
                  variant="default"
                  padding="md"
                  className={`vaango-prod-card ${!srv.is_available ? 'vaango-prod-card--out' : ''}`}
                >
                  <div className="vaango-prod-card__inner">
                    <div className="vaango-prod-card__details">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          {srv.service_category || 'Service'}
                        </span>
                        <Badge variant={srv.is_available ? 'success' : 'neutral'} size="sm">
                          {srv.is_available ? 'Available' : 'Unavailable'}
                        </Badge>
                      </div>

                      <h3 className="vaango-prod-card__name">{srv.name}</h3>

                      {srv.provider_name && (
                        <div className="text-xs text-muted flex items-center gap-1 mb-1">
                          <User size={13} />
                          <span>
                            {srv.provider_name} {srv.specialization && `(${srv.specialization})`}
                          </span>
                        </div>
                      )}

                      {srv.duration_minutes && (
                        <div className="text-xs text-muted flex items-center gap-1 mb-1">
                          <Clock size={13} />
                          <span>Duration: {srv.duration_minutes} mins</span>
                        </div>
                      )}

                      {srv.description && (
                        <p className="vaango-prod-card__desc">{srv.description}</p>
                      )}

                      <div className="vaango-prod-card__price-row mt-2">
                        {srv.price_type === 'range' ? (
                          <span className="vaango-prod-card__price text-accent">
                            Est: ₹{srv.min_price} – ₹{srv.max_price}
                          </span>
                        ) : (
                          <span className="vaango-prod-card__price">
                            ₹{srv.base_price || 0}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="vaango-prod-card__actions">
                      <button
                        type="button"
                        className={`vaango-stock-toggle-btn ${
                          srv.is_available
                            ? 'vaango-stock-toggle-btn--in'
                            : 'vaango-stock-toggle-btn--out'
                        }`}
                        onClick={() => handleServiceToggle(srv)}
                      >
                        {srv.is_available ? 'Active' : 'Disabled'}
                      </button>

                      <div className="vaango-prod-card__btn-group">
                        <button
                          type="button"
                          className="vaango-icon-btn"
                          onClick={() => {
                            setEditingService(srv);
                            setServiceModalOpen(true);
                          }}
                          aria-label={`Edit ${srv.name}`}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          className="vaango-icon-btn vaango-icon-btn--danger"
                          onClick={() => setDeleteConfirmId(srv.id)}
                          aria-label={`Delete ${srv.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : (
          /* GROUP A: PRODUCT LIST */
          filteredProducts.length === 0 ? (
            <EmptyState
              icon={<Package size={48} />}
              title={products.length === 0 ? 'Your catalogue is empty' : 'No matching products'}
              description={
                products.length === 0
                  ? 'Add your everyday products so neighborhood customers can view and pre-order them.'
                  : 'Try adjusting your search query or filter.'
              }
              actionLabel={products.length === 0 ? 'Add Your First Product' : undefined}
              onAction={
                products.length === 0
                  ? () => {
                      setEditingProduct(null);
                      setModalOpen(true);
                    }
                  : undefined
              }
            />
          ) : (
            <div className="vaango-catalogue__grid">
              {filteredProducts.map((prod) => (
                <Card
                  key={prod.id}
                  variant="default"
                  padding="md"
                  className={`vaango-prod-card ${!prod.is_available ? 'vaango-prod-card--out' : ''}`}
                >
                  <div className="vaango-prod-card__inner">
                    <div className="vaango-prod-card__details">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={prod.is_available ? 'success' : 'neutral'} size="sm">
                          {prod.is_available ? 'In Stock' : 'Out of Stock'}
                        </Badge>
                      </div>

                      <h3 className="vaango-prod-card__name">{prod.name}</h3>
                      {prod.description && (
                        <p className="vaango-prod-card__desc">{prod.description}</p>
                      )}

                      <div className="vaango-prod-card__price-row">
                        <span className="vaango-prod-card__price">
                          ₹{prod.price} <span className="text-xs font-normal">/ {prod.unit}</span>
                        </span>
                      </div>
                    </div>

                    <div className="vaango-prod-card__actions">
                      <button
                        type="button"
                        className={`vaango-stock-toggle-btn ${
                          prod.is_available
                            ? 'vaango-stock-toggle-btn--in'
                            : 'vaango-stock-toggle-btn--out'
                        }`}
                        onClick={() => handleStockToggle(prod.id, prod.is_available)}
                      >
                        {prod.is_available ? 'In Stock' : 'Out of Stock'}
                      </button>

                      <div className="vaango-prod-card__btn-group">
                        <button
                          type="button"
                          className="vaango-icon-btn"
                          onClick={() => {
                            setEditingProduct(prod);
                            setModalOpen(true);
                          }}
                          aria-label={`Edit ${prod.name}`}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          className="vaango-icon-btn vaango-icon-btn--danger"
                          onClick={() => setDeleteConfirmId(prod.id)}
                          aria-label={`Delete ${prod.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {/* Modal: Add/Edit Product (Group A) */}
      <ProductFormModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingProduct(null);
        }}
        initialProduct={editingProduct}
        onSubmit={handleProductModalSubmit}
        shopId={shop?.id || ''}
      />

      {/* Modal: Add/Edit Service (Group B & C) */}
      <ServiceFormModal
        isOpen={serviceModalOpen}
        onClose={() => {
          setServiceModalOpen(false);
          setEditingService(null);
        }}
        serviceToEdit={editingService}
        workflowGroup={workflowGroup}
        onSave={handleServiceModalSubmit}
      />

      {/* Delete Confirmation Alert Modal */}
      {deleteConfirmId && (
        <div className="vaango-modal-overlay" role="dialog" aria-modal="true">
          <div className="vaango-delete-modal">
            <h3 className="vaango-modal-title">Confirm Removal</h3>
            <p className="vaango-modal-desc">
              Are you sure you want to remove this item? It will no longer be visible in your catalogue.
            </p>
            <div className="vaango-modal-actions mt-4">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDeleteItem(deleteConfirmId)}
              >
                Delete Item
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
