import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Clock,
  Phone,
  Truck,
  Search,
  Store,
  Wrench,
  ExternalLink,
  ShoppingCart,
  CheckCircle,
  Star,
  Share2,
} from 'lucide-react';
import { MOCK_SHOPS, MOCK_SHOP_TYPES } from '../data/mockData';
import { getShopProductsList } from '../lib/shopkeeperApi';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useCart } from '../context/CartContext';
import { ProductCard } from '../components/customer/ProductCard';
import { AppointmentBookingCard } from '../components/customer/AppointmentBookingCard';
import { ServiceRequestCard } from '../components/customer/ServiceRequestCard';
import { Input } from '../components/ui/Input';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { ShopProduct } from '../types/database';
import './ShopDetailPage.css';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { isValidIndianMobile, normalizeIndianPhone } from '../lib/phoneUtils';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/ui/Modal';
import { Textarea } from '../components/ui/Textarea';
import { createNotification, notifyOrderLifecycle } from '../lib/notificationApi';
import { sendBusinessPushNotification } from '../lib/pushNotifications';

const hasValidCoordinates = (lat: unknown, lng: unknown): boolean => {
  if (lat == null || lng == null) return false;
  const nLat = typeof lat === 'number' ? lat : parseFloat(String(lat));
  const nLng = typeof lng === 'number' ? lng : parseFloat(String(lng));
  return (
    !isNaN(nLat) &&
    !isNaN(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180 &&
    !(nLat === 0 && nLng === 0)
  );
};

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
    itemCount,
    totalAmount,
  } = useCart();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<ShopProduct | null>(null);
  const [cakeModalOpen, setCakeModalOpen] = useState(false);
  const [cakeDescription, setCakeDescription] = useState('');
  const [isSubmittingCake, setIsSubmittingCake] = useState(false);
  const [activeTab, setActiveTab] = useState<'products' | 'services' | 'about'>('products');

  // Find shop (supports both mock data and Supabase live UUIDs)
  const [shop, setShop] = useState<any>(() => {
    return MOCK_SHOPS.find((s) => s.id === shopId) || null;
  });

  useEffect(() => {
    let active = true;
    const local = MOCK_SHOPS.find((s) => s.id === shopId) || null;
    if (local) {
      setShop(local);
      return;
    }
    if (isSupabaseConfigured && shopId) {
      supabase.from('shops').select('*').eq('id', shopId).maybeSingle().then(({ data }) => {
        if (active && data) {
          setShop(data);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [shopId]);

  const [dbShopType, setDbShopType] = useState<any>(null);

  useEffect(() => {
    if (!shop?.shop_type_id) return;
    const mock = MOCK_SHOP_TYPES.find((t) => t.id === shop.shop_type_id || t.code === shop.shop_type_id);
    if (mock) {
      setDbShopType(mock);
      return;
    }
    if (isSupabaseConfigured) {
      supabase
        .from('shop_types')
        .select('*')
        .eq('id', shop.shop_type_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setDbShopType(data);
        });
    }
  }, [shop?.shop_type_id]);

  const shopType = dbShopType || MOCK_SHOP_TYPES.find((t) => t.id === shop?.shop_type_id || t.code === shop?.shop_type_id) || null;

  const workflowGroup = shopType?.workflow_group_code || 'ORDER';

  const loadProducts = useCallback(async () => {
    if (!shopId || (workflowGroup !== 'ORDER' && workflowGroup !== 'SALES_SERVICE')) {
      setProducts([]);
      return;
    }
    setProducts(await getShopProductsList(shopId));
  }, [shopId, workflowGroup]);

  useEffect(() => {
    void loadProducts();

    if (!shopId || (workflowGroup !== 'ORDER' && workflowGroup !== 'SALES_SERVICE')) return;

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

  // Category list derived from products
  const productCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const cat = (p as any).category;
      if (cat) set.add(cat);
    });
    return ['all', ...Array.from(set)];
  }, [products]);

  // Filter products by search and category
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q));
      const cat = (p as any).category;
      const matchesCategory =
        selectedCategory === 'all' || cat === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  useEffect(() => {
    if (workflowGroup === 'APPOINTMENT') {
      setActiveTab('services');
    } else {
      setActiveTab('products');
    }
  }, [workflowGroup]);

  if (!shop) {
    return (
      <div className="container vaango-shop-detail__error">
        <EmptyState
          icon={<Store size={48} />}
          title={t('shopNotFoundTitle')}
          description={t('shopNotFoundDesc')}
          actionLabel={t('browseAvailableShops')}
          onAction={() => navigate('/shops')}
        />
      </div>
    );
  }

  const handleAddProduct = (product: ShopProduct, variant?: import('../types/database').ProductVariant | null) => {
    const result = addItem(product, shop, variant);
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

    const customerPhone = user.phone ? (normalizeIndianPhone(user.phone) || user.phone) : null;
    if (!customerPhone || !isValidIndianMobile(customerPhone)) {
      toastError('Please complete your phone number in your profile before submitting a custom order.');
      navigate('/complete-profile?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }

    setIsSubmittingCake(true);
    try {
      const referenceCode = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
      const notes = JSON.stringify({
        type: 'custom_cake',
        description: cakeDescription.trim(),
        shop_name: shop.name,
        shop_address: shop.address_line,
        shop_phone: shop.phone,
        customer_name: user.full_name || 'Customer',
        customer_phone: customerPhone,
        payment_method: 'cash',
      });
      const { data, error } = await supabase
        .from('requests')
        .insert({
          reference_code: referenceCode,
          customer_id: user.id,
          customer_phone: customerPhone,
          shop_id: shop.id,
          workflow_group_code: 'ORDER',
          current_state: 'REQUESTED',
          total_estimate: 0,
          notes,
        })
        .select()
        .single();
      if (error || !data) {
        toastError(error?.message || t('cakeRequestError'));
        return;
      }

      if (shop.owner_id) {
        const notifTitle = 'New custom cake request';
        const notifBody = `New custom cake request #${referenceCode} from ${user.full_name || 'Customer'}. Open Vaangly to view the details.`;
        try {
          await createNotification({
            recipient_id: shop.owner_id,
            shop_id: shop.id,
            type: 'NEW_ORDER',
            title: notifTitle,
            message: notifBody,
            reference_id: data.id,
            reference_code: referenceCode,
          });
        } catch (notifErr) {
          console.warn('[ShopDetail] Failed to create notification:', notifErr);
        }

        try {
          await sendBusinessPushNotification({
            userId: shop.owner_id,
            title: notifTitle,
            body: notifBody,
            url: '/shopkeeper/requests',
          });
        } catch (pushErr) {
          console.warn('[ShopDetail] Failed to send business push:', pushErr);
        }
      }

      try {
        await notifyOrderLifecycle({
          event: 'ORDER_PLACED',
          requestId: data.id,
          referenceCode,
          recipientId: user.id,
          recipientRole: 'customer',
          shopId: shop.id,
          shopName: shop.name,
          customerName: user.full_name || 'Customer',
        });
      } catch (custNotifErr) {
        console.warn('[ShopDetail] Failed to notify customer:', custNotifErr);
      }

      setCakeModalOpen(false);
      setCakeDescription('');
      success(t('cakeRequestSuccess'));
      navigate(`/request-confirmation/${data.id}`);
    } catch (err: any) {
      toastError(err?.message || t('cakeRequestError'));
    } finally {
      setIsSubmittingCake(false);
    }
  };

  const shopRating = shop.rating || 4.5;
  const reviewCount = shop.review_count || 120;
  const distance = shop.distance_km != null ? `${shop.distance_km} km` : '0.8 km';

  return (
    <div className="vaango-shop-detail">
      {/* Cover Image & Floating Navigation Overlay */}
      <div className="vaango-shop-cover">
        {shop.photo_url ? (
          <img
            src={shop.photo_url}
            alt={shop.name}
            className="vaango-shop-cover__img"
          />
        ) : (
          <div className="vaango-shop-cover__placeholder">
            <Store size={56} />
          </div>
        )}
        <div className="vaango-shop-cover__overlay" />

        {/* Floating Top Controls */}
        <div className="vaango-shop-cover__topbar">
          <button
            type="button"
            className="vaango-shop-cover__circle-btn"
            onClick={() => navigate(-1)}
            aria-label={t('backToShops')}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="vaango-shop-cover__topbar-actions">
            <button
              type="button"
              className="vaango-shop-cover__circle-btn"
              onClick={() => {
                const el = document.getElementById('shop-product-search');
                if (el) el.focus();
              }}
              aria-label="Search in shop"
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              className="vaango-shop-cover__circle-btn"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: shop.name, url: window.location.href }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  success('Shop link copied to clipboard');
                }
              }}
              aria-label="Share shop"
            >
              <Share2 size={18} />
            </button>
          </div>
        </div>

        {/* Floating Status Badges at bottom of cover */}
        <div className="vaango-shop-cover__status-strip">
          <div className="vaango-shop-cover__status-pill">
            <span className={`vaango-shop-cover__dot ${shop.is_open_today ? 'vaango-shop-cover__dot--open' : 'vaango-shop-cover__dot--closed'}`} />
            <span>
              {shop.is_open_today
                ? `${t('openToday')} · ${shop.closing_time ? `Closes ${shop.closing_time}` : 'Closes 10:00 PM'}`
                : t('closed')}
            </span>
          </div>
          <div className="vaango-shop-cover__status-pill">
            <MapPin size={13} className="text-secondary" />
            <span>{distance}</span>
          </div>
        </div>
      </div>

      {/* Shop Info Card */}
      <div className="container vaango-shop-info-card-wrap">
        <div className="vaango-shop-info-card">
          <div className="vaango-shop-info-card__header">
            <h1 className="vaango-shop-info-card__name">{shop.name}</h1>
            <div className="vaango-shop-info-card__rating">
              <Star size={16} className="vaango-shop-info-card__star" fill="#EAB308" />
              <span className="vaango-shop-info-card__score">{shopRating}</span>
              <span className="vaango-shop-info-card__reviews">({reviewCount} {t('reviews' as any) || 'reviews'})</span>
            </div>
          </div>

          <p className="vaango-shop-info-card__subtitle">
            {shop.tagline || (shopType ? `${shopType.name} · Daily needs · Local marketplace` : 'Groceries · Daily needs · Home essentials')}
          </p>

          <div className="vaango-shop-info-card__badges">
            <div className="vaango-shop-pill-badge vaango-shop-pill-badge--verified">
              <CheckCircle size={14} />
              <span>Verified Shop</span>
            </div>
            {shop.delivery_available ? (
              <div className="vaango-shop-pill-badge vaango-shop-pill-badge--delivery">
                <Truck size={14} />
                <span>
                  {shop.free_delivery_above != null && Number(shop.free_delivery_above) > 0
                    ? `Free delivery above ₹${shop.free_delivery_above}`
                    : Number(shop.delivery_fee) === 0
                    ? 'Free Delivery'
                    : `Delivery ₹${shop.delivery_fee}`}
                </span>
              </div>
            ) : (
              <div className="vaango-shop-pill-badge vaango-shop-pill-badge--pickup">
                <Store size={14} />
                <span>Pickup Only</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Shop Tabs: Products | Services | About */}
      <div className="container vaango-shop-tabs-wrap">
        <div className="vaango-shop-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'products'}
            className={`vaango-shop-tab ${activeTab === 'products' ? 'vaango-shop-tab--active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            {t('navProducts' as any) || 'Products'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'services'}
            className={`vaango-shop-tab ${activeTab === 'services' ? 'vaango-shop-tab--active' : ''}`}
            onClick={() => setActiveTab('services')}
          >
            {workflowGroup === 'APPOINTMENT' ? (t('navAppointments') || 'Appointments') : (t('navServices') || 'Services')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'about'}
            className={`vaango-shop-tab ${activeTab === 'about' ? 'vaango-shop-tab--active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            {t('about' as any) || 'About'}
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="container vaango-shop-content-area">
        {activeTab === 'products' && (
          <div className="vaango-shop-products-section">
            {/* Category Filter Chips */}
            <div className="vaango-shop-category-pills" role="tablist" aria-label="Product categories">
              <button
                type="button"
                className={`vaango-category-pill ${selectedCategory === 'all' ? 'vaango-category-pill--active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                All
              </button>
              {productCategories.filter((c) => c !== 'all').map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`vaango-category-pill ${selectedCategory === cat ? 'vaango-category-pill--active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
              {productCategories.length <= 1 && (
                <>
                  <button
                    type="button"
                    className={`vaango-category-pill ${selectedCategory === 'fruits_veg' ? 'vaango-category-pill--active' : ''}`}
                    onClick={() => setSelectedCategory(selectedCategory === 'fruits_veg' ? 'all' : 'fruits_veg')}
                  >
                    Fruits &amp; Vegetables
                  </button>
                  <button
                    type="button"
                    className={`vaango-category-pill ${selectedCategory === 'dairy' ? 'vaango-category-pill--active' : ''}`}
                    onClick={() => setSelectedCategory(selectedCategory === 'dairy' ? 'all' : 'dairy')}
                  >
                    Dairy
                  </button>
                  <button
                    type="button"
                    className={`vaango-category-pill ${selectedCategory === 'snacks' ? 'vaango-category-pill--active' : ''}`}
                    onClick={() => setSelectedCategory(selectedCategory === 'snacks' ? 'all' : 'snacks')}
                  >
                    Snacks
                  </button>
                </>
              )}
            </div>

            {/* Custom Cake Banner for Bakeries */}
            {shopType?.code === 'bakery' && shop.customised_cake_available && (
              <div className="vaango-custom-cake-card">
                <h2>{t('customCakesAvailable')}</h2>
                <p>{t('customCakesDesc')}</p>
                <button
                  type="button"
                  className="vaango-btn vaango-btn--primary"
                  onClick={() => setCakeModalOpen(true)}
                >
                  {t('orderCustomCakeBtn')}
                </button>
              </div>
            )}

            {/* Catalogue Search Header */}
            <div className="vaango-shop-search-bar-wrap">
              <Input
                id="shop-product-search"
                type="search"
                placeholder={t('searchInShopPlaceholder', { shopName: shop.name })}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search size={18} />}
              />
            </div>

            {/* 2-Column Product Cards Grid */}
            {filteredProducts.length > 0 ? (
              <div className="vaango-catalogue-grid">
                {filteredProducts.map((product) => {
                  const qty = getItemQuantity(product.id);
                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      shop={shop}
                      quantityInCart={qty}
                      getVariantQuantity={(variantId) => getItemQuantity(product.id, variantId)}
                      onAdd={(p, variant) => handleAddProduct(p || product, variant)}
                      onIncrease={(variant) => updateQuantity(product.id, getItemQuantity(product.id, variant?.id) + 1, variant?.id)}
                      onDecrease={(variant) => updateQuantity(product.id, getItemQuantity(product.id, variant?.id) - 1, variant?.id)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="vaango-catalogue-empty">
                <EmptyState
                  title={t('noProductsFoundTitle')}
                  description={t('noProductsFoundDesc', { query: searchQuery })}
                  actionLabel={t('clearSearch')}
                  onAction={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'services' && (
          <div className="vaango-shop-services-tab">
            {workflowGroup === 'APPOINTMENT' ? (
              <AppointmentBookingCard shop={shop} />
            ) : workflowGroup === 'SERVICE' || workflowGroup === 'SALES_SERVICE' ? (
              <ServiceRequestCard shop={shop} />
            ) : (
              <div className="vaango-shop-no-services-card">
                <Wrench size={40} className="text-secondary mb-3" />
                <h3>No Appointment Booking Required</h3>
                <p>This shop offers direct walk-in and delivery services for its catalog items.</p>
                <Button variant="primary" onClick={() => setActiveTab('products')}>
                  Browse Products
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'about' && (
          <div className="vaango-shop-about-tab">
            <div className="vaango-shop-about-card">
              <h3>Shop Information</h3>
              {shop.tagline && <p className="vaango-shop-about-desc">{shop.tagline}</p>}

              <div className="vaango-shop-about-list">
                {shop.address_line && (
                  <div className="vaango-shop-about-item">
                    <MapPin size={20} className="vaango-shop-about-icon" />
                    <div className="vaango-shop-about-item-text">
                      <strong>Address</strong>
                      <span>{shop.address_line}</span>
                      {hasValidCoordinates(shop.gps_lat, shop.gps_lng) && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.gps_lat},${shop.gps_lng}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="vaango-shop-map-btn"
                          style={{ marginTop: 6, display: 'inline-flex' }}
                        >
                          <ExternalLink size={12} />
                          <span>{t('openInMaps')}</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {shop.opening_time && shop.closing_time && (
                  <div className="vaango-shop-about-item">
                    <Clock size={20} className="vaango-shop-about-icon" />
                    <div className="vaango-shop-about-item-text">
                      <strong>Hours of Operation</strong>
                      <span>{shop.opening_time} - {shop.closing_time}</span>
                    </div>
                  </div>
                )}

                {shop.phone && (
                  <div className="vaango-shop-about-item">
                    <Phone size={20} className="vaango-shop-about-icon" />
                    <div className="vaango-shop-about-item-text">
                      <strong>Contact Phone</strong>
                      <a href={`tel:${shop.phone}`} className="vaango-phone-link">{shop.phone}</a>
                    </div>
                  </div>
                )}

                <div className="vaango-shop-about-item">
                  <Truck size={20} className="vaango-shop-about-icon" />
                  <div className="vaango-shop-about-item-text">
                    <strong>Service Type</strong>
                    <span>
                      {workflowGroup === 'SALES_SERVICE'
                        ? 'Products & Local Services'
                        : workflowGroup === 'APPOINTMENT'
                        ? t('inPersonAppointment')
                        : workflowGroup === 'SERVICE'
                        ? t('inShopService')
                        : t('counterPickupDelivery')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Bar (Image 3) */}
      {itemCount > 0 && (
        <div className="vaango-floating-cart-bar">
          <div className="vaango-floating-cart-bar__inner">
            <div className="vaango-floating-cart-bar__info">
              <div className="vaango-floating-cart-bar__icon-wrap">
                <ShoppingCart size={18} />
              </div>
              <span className="vaango-floating-cart-bar__text">
                {itemCount} {itemCount === 1 ? 'item' : 'items'} &nbsp;|&nbsp; ₹{totalAmount.toFixed(0)}
              </span>
            </div>
            <button
              type="button"
              className="vaango-floating-cart-bar__btn"
              onClick={() => navigate('/cart')}
            >
              <span>{t('viewCart') || 'View Cart'}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Conflict Modal when switching shops (Order Workflow) */}
      <ConfirmDialog
        isOpen={conflictModalOpen}
        onClose={() => {
          setConflictModalOpen(false);
          setPendingProduct(null);
        }}
        onConfirm={handleConfirmSwitchShop}
        title={t('startNewRequestTitle')}
        message={t('startNewRequestMessage', { activeShop: activeShop?.name || '', newShop: shop.name })}
        confirmLabel={t('clearCartAndSwitch')}
        cancelLabel={t('keepCurrentItems')}
        variant="primary"
      />

      <Modal isOpen={cakeModalOpen} onClose={() => setCakeModalOpen(false)} title={t('orderCustomCakeModalTitle')} maxWidth="md">
        <div className="vaango-form-group">
          <label className="vaango-form-label" htmlFor="custom-cake-description">{t('describeCakeLabel')} <span className="vaango-required">*</span></label>
          <Textarea id="custom-cake-description" rows={5} value={cakeDescription} onChange={(e) => setCakeDescription(e.target.value)} placeholder={t('cakeDescPlaceholder')} />
          <span className="text-xs text-secondary">{t('minCharactersNotice')}</span>
        </div>
        <Button variant="primary" isLoading={isSubmittingCake} disabled={!user || cakeDescription.trim().length < 10} onClick={() => void handleCustomCakeSubmit()}>{t('submitCakeRequestBtn')}</Button>
      </Modal>
    </div>
  );
};
