import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Clock,
  Phone,
  Truck,
  Search,
  Store,
  Calendar,
  Wrench,
} from 'lucide-react';
import { MOCK_SHOPS, MOCK_SHOP_TYPES } from '../data/mockData';
import { getShopProductsList } from '../lib/shopkeeperApi';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useCart } from '../context/CartContext';
import { ProductCard } from '../components/customer/ProductCard';
import { CartBar } from '../components/customer/CartBar';
import { AppointmentBookingCard } from '../components/customer/AppointmentBookingCard';
import { ServiceRequestCard } from '../components/customer/ServiceRequestCard';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { ShopProduct } from '../types/database';
import './ShopDetailPage.css';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/ui/Modal';
import { Textarea } from '../components/ui/Textarea';

export const ShopDetailPage: React.FC = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const {
    activeShop,
    addItem,
    updateQuantity,
    getItemQuantity,
    clearCart,
  } = useCart();

  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<ShopProduct | null>(null);
  const [cakeModalOpen, setCakeModalOpen] = useState(false);
  const [cakeDescription, setCakeDescription] = useState('');
  const [isSubmittingCake, setIsSubmittingCake] = useState(false);

  // Find shop
  const shop = useMemo(() => {
    return MOCK_SHOPS.find((s) => s.id === shopId) || null;
  }, [shopId]);

  // Find shop type
  const shopType = useMemo(() => {
    if (!shop) return null;
    return MOCK_SHOP_TYPES.find((t) => t.id === shop.shop_type_id) || null;
  }, [shop]);

  const workflowGroup = shopType?.workflow_group_code || 'ORDER';

  const loadProducts = useCallback(async () => {
    if (!shopId || workflowGroup !== 'ORDER') {
      setProducts([]);
      return;
    }
    setProducts(await getShopProductsList(shopId));
  }, [shopId, workflowGroup]);

  useEffect(() => {
    void loadProducts();

    if (!shopId || workflowGroup !== 'ORDER') return;

    if (!isSupabaseConfigured) {
      const handleLocalProductChange = (event: Event) => {
        const changedShopId = (event as CustomEvent<{ shopId?: string }>).detail?.shopId;
        if (!changedShopId || changedShopId === shopId) void loadProducts();
      };
      window.addEventListener('vaango-products-changed', handleLocalProductChange);
      return () => window.removeEventListener('vaango-products-changed', handleLocalProductChange);
    }

    const channel = supabase
      .channel(`shop-products-${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shop_products', filter: `shop_id=eq.${shopId}` },
        () => void loadProducts()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadProducts, shopId, workflowGroup]);

  // Filter products by search
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [products, searchQuery]);

  if (!shop) {
    return (
      <div className="container vaango-shop-detail__error">
        <EmptyState
          icon={<Store size={48} />}
          title="Shop Not Found"
          description="The shop you are looking for does not exist or is currently inactive."
          actionLabel="Browse Available Shops"
          onAction={() => navigate('/shops')}
        />
      </div>
    );
  }

  const handleAddProduct = (product: ShopProduct) => {
    const result = addItem(product, shop);
    if (result.requiresClear) {
      setPendingProduct(product);
      setConflictModalOpen(true);
    }
  };

  const handleConfirmSwitchShop = () => {
    clearCart();
    if (pendingProduct) {
      addItem(pendingProduct, shop);
    }
    setConflictModalOpen(false);
    setPendingProduct(null);
  };

  const handleCustomCakeSubmit = async () => {
    if (!user || !shop || cakeDescription.trim().length < 10) return;
    setIsSubmittingCake(true);
    const referenceCode = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const notes = JSON.stringify({ type: 'custom_cake', description: cakeDescription.trim(), shop_name: shop.name, shop_address: shop.address_line, shop_phone: shop.phone, payment_method: 'cash' });
    const { data, error } = await supabase.from('requests').insert({ reference_code: referenceCode, customer_id: user.id, shop_id: shop.id, workflow_group_code: 'ORDER', current_state: 'REQUESTED', total_estimate: 0, notes }).select().single();
    setIsSubmittingCake(false);
    if (error || !data) {
      toastError(error?.message || 'Unable to submit customised cake request.');
      return;
    }
    setCakeModalOpen(false);
    setCakeDescription('');
    success('Customised cake request submitted to the bakery.');
    navigate(`/request-confirmation/${data.id}`);
  };

  return (
    <div className="vaango-shop-detail">
      {/* Back Navigation Bar */}
      <div className="container vaango-shop-detail__nav-bar">
        <button
          type="button"
          className="vaango-back-link"
          onClick={() => navigate(-1)}
          aria-label="Back to shops"
        >
          <ArrowLeft size={18} />
          <span>Back to Shops</span>
        </button>
      </div>

      {/* Hero Header */}
      <div className="vaango-shop-hero">
        <div className="container vaango-shop-hero__inner">
          <div className="vaango-shop-hero__media">
            {shop.photo_url ? (
              <img
                src={shop.photo_url}
                alt={shop.name}
                className="vaango-shop-hero__img"
              />
            ) : (
              <div className="vaango-shop-hero__placeholder">
                <Store size={48} />
              </div>
            )}
          </div>

          <div className="vaango-shop-hero__content">
            <div className="vaango-shop-hero__badges">
              {shopType && <Badge variant="primary" size="sm">{shopType.name}</Badge>}
              <Badge variant={shop.is_open_today ? 'success' : 'neutral'} size="sm" withDot>
                {shop.is_open_today ? 'Open Today' : 'Closed'}
              </Badge>
              {workflowGroup === 'APPOINTMENT' && (
                <Badge variant="accent" size="sm">
                  <Calendar size={12} style={{ marginRight: 4 }} /> Appointments
                </Badge>
              )}
              {workflowGroup === 'SERVICE' && (
                <Badge variant="accent" size="sm">
                  <Wrench size={12} style={{ marginRight: 4 }} /> Services
                </Badge>
              )}
            </div>

            <h1 className="vaango-shop-hero__name">{shop.name}</h1>
            {shop.tagline && (
              <p className="vaango-shop-hero__tagline">{shop.tagline}</p>
            )}

            <div className="vaango-shop-hero__meta">
              <div className="vaango-shop-meta-item">
                <MapPin size={16} className="vaango-shop-meta-icon" />
                <span>{shop.address_line}</span>
              </div>

              {shop.opening_time && shop.closing_time && (
                <div className="vaango-shop-meta-item">
                  <Clock size={16} className="vaango-shop-meta-icon" />
                  <span>Hours: {shop.opening_time} to {shop.closing_time}</span>
                </div>
              )}

              <div className="vaango-shop-meta-item">
                <Phone size={16} className="vaango-shop-meta-icon" />
                <span>{shop.phone}</span>
              </div>

              <div className="vaango-shop-meta-item vaango-shop-meta-item--highlight">
                <Truck size={16} className="vaango-shop-meta-icon" />
                <span>
                  {workflowGroup === 'APPOINTMENT'
                    ? 'In-person Appointment Slot'
                    : workflowGroup === 'SERVICE'
                    ? 'In-Shop Counter Service'
                    : 'Counter Pickup & Optional Delivery'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area based on Workflow Group */}
      <div className="container vaango-shop-workflow-container">
        {workflowGroup === 'APPOINTMENT' ? (
          /* Group B: Salon & Clinic Appointment Booking */
          <AppointmentBookingCard shop={shop} />
        ) : workflowGroup === 'SERVICE' ? (
          /* Group C: Tailor, Mechanic, Repair, Laundry Service Requests */
          <ServiceRequestCard shop={shop} />
        ) : (
          /* Group A: Order Workflow (Catalogue & Cart) */
          <div className="vaango-shop-catalogue">
            {shopType?.code === 'bakery' && shop.customised_cake_available && (
              <div className="vaango-custom-cake-card">
                <h2>🎂 Customised Cakes Available</h2>
                <p>Share your flavour, weight, design, and occasion. The bakery will confirm the price.</p>
                <button type="button" className="vaango-btn vaango-btn--primary" onClick={() => setCakeModalOpen(true)}>Order a Customised Cake</button>
              </div>
            )}
            <div className="vaango-shop-catalogue__header">
              <div className="vaango-shop-catalogue__title-wrap">
                <h2 className="vaango-shop-catalogue__title">{t('availableCatalogue')}</h2>
                <span className="vaango-shop-catalogue__count">
                  {filteredProducts.length} items listed
                </span>
              </div>

              {/* Product Search */}
              <div className="vaango-shop-catalogue__search">
                <Input
                  id="catalogue-search-input"
                  type="search"
                  placeholder={`Search items in ${shop.name}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftIcon={<Search size={18} />}
                />
              </div>
            </div>

            {/* Product Cards Grid */}
            {filteredProducts.length > 0 ? (
              <div className="vaango-catalogue-grid">
                {filteredProducts.map((product) => {
                  const qty = getItemQuantity(product.id);
                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantityInCart={qty}
                      onAdd={() => handleAddProduct(product)}
                      onIncrease={() => updateQuantity(product.id, qty + 1)}
                      onDecrease={() => updateQuantity(product.id, qty - 1)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="vaango-catalogue-empty">
                <EmptyState
                  title="No products found"
                  description={`No products matched "${searchQuery}". Please try another search term.`}
                  actionLabel="Clear Search"
                  onAction={() => setSearchQuery('')}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Conflict Modal when switching shops (Order Workflow) */}
      <ConfirmDialog
        isOpen={conflictModalOpen}
        onClose={() => {
          setConflictModalOpen(false);
          setPendingProduct(null);
        }}
        onConfirm={handleConfirmSwitchShop}
        title="Start a new request?"
        message={`Your cart currently contains items from "${activeShop?.name}". Each request must be placed with one shop. Would you like to clear your cart and add this item from "${shop.name}"?`}
        confirmLabel="Clear Cart & Switch"
        cancelLabel="Keep Current Items"
        variant="primary"
      />

      {/* Bottom Floating Cart Bar (only for Order Workflow) */}
      {workflowGroup === 'ORDER' && <CartBar />}
      <Modal isOpen={cakeModalOpen} onClose={() => setCakeModalOpen(false)} title="Order a Customised Cake" maxWidth="md">
        <div className="vaango-form-group">
          <label className="vaango-form-label" htmlFor="custom-cake-description">Describe your cake <span className="vaango-required">*</span></label>
          <Textarea id="custom-cake-description" rows={5} value={cakeDescription} onChange={(e) => setCakeDescription(e.target.value)} placeholder="Flavour, weight, design, and occasion" />
          <span className="text-xs text-secondary">Minimum 10 characters.</span>
        </div>
        <Button variant="primary" isLoading={isSubmittingCake} disabled={!user || cakeDescription.trim().length < 10} onClick={() => void handleCustomCakeSubmit()}>Submit Cake Request</Button>
      </Modal>
    </div>
  );
};
