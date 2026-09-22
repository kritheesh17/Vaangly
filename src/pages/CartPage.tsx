import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Trash2,
  Plus,
  Minus,
  Store,
  AlertCircle,
  ShoppingBag,
  Building2,
} from 'lucide-react';
import { getEffectiveQuantity, useCart, ShopCartGroup } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import { MOCK_SHOP_TYPES, isValidUuid } from '../data/mockData';
import { useLanguage } from '../context/LanguageContext';
import './CartPage.css';

export const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user, signInWithGoogle, isSupabaseLive } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const {
    items,
    shopGroups,
    itemCount,
    updateQuantity,
    removeItem,
    clearCart,
    clearShopItems,
    submitShopRequest,
    isSubmitting,
  } = useCart();

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [submittingShopId, setSubmittingShopId] = useState<string | null>(null);
  const [shopErrors, setShopErrors] = useState<Record<string, string>>({});
  const [shopNotes, setShopNotes] = useState<Record<string, string>>({});
  const [shopFulfillments, setShopFulfillments] = useState<Record<string, 'parcel' | 'dine_in' | null>>({});
  const [shopPaymentMethods, setShopPaymentMethods] = useState<Record<string, 'cash' | 'upi'>>({});
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (items.length === 0 || shopGroups.length === 0) {
    return (
      <div className="container vaango-cart-page__empty">
        <EmptyState
          icon={<ShoppingBag size={52} />}
          title={t('cartEmptyTitle')}
          description={t('cartEmptySubtitle')}
          actionLabel={t('allBusinesses')}
          onAction={() => navigate('/shops?group=ORDER')}
        />
      </div>
    );
  }

  const handleCheckoutShop = async (group: ShopCartGroup) => {
    const shopId = group.shop.id;
    setShopErrors((prev) => ({ ...prev, [shopId]: '' }));

    if (!isValidUuid(shopId)) {
      setShopErrors((prev) => ({ ...prev, [shopId]: t('staleCartWarningDesc') }));
      return;
    }

    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    const shopType = MOCK_SHOP_TYPES.find((type) => type.id === group.shop.shop_type_id);
    const offersDineIn = ['restaurant', 'hotel', 'bakery'].includes(shopType?.code || '');
    const chosenFulfillment = shopFulfillments[shopId] || null;

    if (offersDineIn && !chosenFulfillment) {
      setShopErrors((prev) => ({ ...prev, [shopId]: t('chooseParcelOrDineIn') }));
      return;
    }

    const chosenPayment = shopPaymentMethods[shopId] || 'cash';
    const chosenNote = shopNotes[shopId] || '';

    setSubmittingShopId(shopId);
    try {
      const result = await submitShopRequest(shopId, chosenPayment, chosenFulfillment, chosenNote);
      if (result.success && result.request) {
        toastSuccess(`Order placed with ${group.shop.name}!`);
        navigate(`/request-confirmation/${result.request.id}`);
      } else {
        const errorMsg = result.error || t('genericError');
        setShopErrors((prev) => ({ ...prev, [shopId]: errorMsg }));
        toastError(errorMsg);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : t('genericError');
      setShopErrors((prev) => ({ ...prev, [shopId]: errorMsg }));
      toastError(errorMsg);
    } finally {
      setSubmittingShopId(null);
    }
  };

  const handleGoogleSignInFromCart = async () => {
    setAuthError(null);
    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        setAuthError(result.error || t('googleSignInFailed'));
      } else {
        setAuthModalOpen(false);
        if (!isSupabaseLive) {
          navigate('/complete-profile', { state: { from: { pathname: '/cart' } } });
        }
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : t('googleSignInFailed'));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="container vaango-cart-page">
      {/* Header */}
      <div className="vaango-cart-page__header">
        <button
          type="button"
          className="vaango-back-link"
          onClick={() => navigate('/shops?group=ORDER')}
          aria-label={t('browseAvailableShops')}
        >
          <ArrowLeft size={18} />
          <span>{t('browseAvailableShops')}</span>
        </button>

        <div className="vaango-cart-page__title-row">
          <div>
            <h1 className="vaango-cart-page__title">{t('reviewRequest')}</h1>
            <span className="vaango-cart-page__count-badge">
              {itemCount} {itemCount === 1 ? 'item' : 'items'} across {shopGroups.length} {shopGroups.length === 1 ? 'store' : 'stores'}
            </span>
          </div>
          <button
            type="button"
            className="vaango-cart-page__clear-btn"
            onClick={clearCart}
            aria-label={t('clearCart')}
          >
            {t('clearCart')}
          </button>
        </div>
      </div>

      {/* Multi-Shop Notice when items from multiple stores exist */}
      {shopGroups.length > 1 && (
        <div className="vaango-multi-shop-banner">
          <Building2 size={20} className="vaango-multi-shop-banner__icon" />
          <div className="vaango-multi-shop-banner__text">
            <strong>Multiple Store Orders</strong>
            <p>
              Your cart contains products from {shopGroups.length} different local shops. Each store will process and fulfill its order independently. You can place your orders one by one.
            </p>
          </div>
        </div>
      )}

      {/* Render Each Shopfront Group as an Independent Order Card */}
      <div className="vaango-cart-groups-list">
        {shopGroups.map((group) => {
          const { shop, items: shopItems, subtotal } = group;
          const shopId = shop.id;
          const isInvalidShopId = !isValidUuid(shopId);
          const shopType = MOCK_SHOP_TYPES.find((type) => type.id === shop.shop_type_id);
          const offersDineIn = ['restaurant', 'hotel', 'bakery'].includes(shopType?.code || '');
          const currentFulfillment = shopFulfillments[shopId] || null;
          const currentPayment = shopPaymentMethods[shopId] || 'cash';
          const currentNote = shopNotes[shopId] || '';
          const currentError = shopErrors[shopId];
          const isThisSubmitting = submittingShopId === shopId;

          return (
            <Card key={shopId} variant="default" padding="lg" className="vaango-cart-shop-group-card">
              {/* Storefront Header */}
              <div className="vaango-cart-shop-group-header">
                <div className="vaango-cart-shop-group-meta">
                  <div className="vaango-cart-shop-banner__icon">
                    <Store size={22} />
                  </div>
                  <div>
                    <div className="vaango-cart-shop-banner__label">{t('orderingFromLabel')}</div>
                    <h2 className="vaango-cart-shop-banner__name">{shop.name}</h2>
                    <span className="vaango-cart-shop-banner__address">{shop.address_line}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="vaango-cart-shop-clear-btn"
                  onClick={() => clearShopItems(shopId)}
                  title={`Remove all items from ${shop.name}`}
                >
                  <Trash2 size={16} />
                  <span>Remove Store Items</span>
                </button>
              </div>

              {isInvalidShopId && (
                <div className="vaango-cart-error-alert" role="alert">
                  <AlertCircle size={20} />
                  <span>{t('staleCartWarningDesc')}</span>
                </div>
              )}

              {currentError && (
                <div className="vaango-cart-error-alert" role="alert">
                  <AlertCircle size={18} />
                  <span>{currentError}</span>
                </div>
              )}

              {/* Items for this Shop */}
              <div className="vaango-cart-items-list" role="list">
                {shopItems.map((item) => {
                  const { product, quantity, selectedVariant } = item;
                  const effectiveQuantity = getEffectiveQuantity(item);
                  const unitPrice = selectedVariant?.price ?? product.price;

                  return (
                    <div key={`${product.id}-${selectedVariant?.id || 'base'}`} className="vaango-cart-item-row">
                      <div className="vaango-cart-item__main">
                        <div className="vaango-cart-item__info">
                          <h3 className="vaango-cart-item__name">{product.name}</h3>
                          {selectedVariant && (
                            <span className="vaango-cart-variant-pill">
                              Option: {selectedVariant.label} (₹{selectedVariant.price})
                            </span>
                          )}
                          <span className="vaango-cart-item__rate">
                            ₹{unitPrice} / {selectedVariant?.label || product.unit}
                          </span>
                          {product.offer_type === 'bogo' && (
                            <div className="vaango-bogo-badge">
                              {t('bogoNoticeWithCount', { quantity, effectiveQuantity })}
                            </div>
                          )}
                        </div>

                        <div className="vaango-cart-item__subtotal">
                          ₹{unitPrice * quantity}
                        </div>
                      </div>

                      <div className="vaango-cart-item__actions">
                        {/* Quantity Controls */}
                        <div className="vaango-qty-control vaango-qty-control--sm" role="group">
                          <button
                            type="button"
                            className="vaango-qty-btn"
                            onClick={() => updateQuantity(product.id, quantity - 1, selectedVariant?.id)}
                            aria-label={t('decreaseQty')}
                          >
                            <Minus size={14} />
                          </button>
                          <span className="vaango-qty-display">{quantity}</span>
                          <button
                            type="button"
                            className="vaango-qty-btn"
                            onClick={() => updateQuantity(product.id, quantity + 1, selectedVariant?.id)}
                            aria-label={t('increaseQty')}
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        <button
                          type="button"
                          className="vaango-cart-item__remove"
                          onClick={() => removeItem(product.id, selectedVariant?.id)}
                          aria-label={`${t('deleteItem')} ${product.name}`}
                        >
                          <Trash2 size={16} />
                          <span>{t('deleteItem')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Shop Specific Options (Dine in / Parcel & Notes) */}
              <div className="vaango-cart-shop-options-grid">
                {offersDineIn && (
                  <div className="vaango-cart-fulfillment-box">
                    <span className="vaango-cart-opt-label">{t('chooseFulfillment')}</span>
                    <div className="vaango-fulfillment-toggle" role="radiogroup">
                      {(['parcel', 'dine_in'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          role="radio"
                          aria-checked={currentFulfillment === opt}
                          className={currentFulfillment === opt ? 'active' : ''}
                          onClick={() =>
                            setShopFulfillments((prev) => ({ ...prev, [shopId]: opt }))
                          }
                        >
                          {opt === 'parcel' ? t('parcelOption') : t('dineInOption')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="vaango-cart-payment-box">
                  <span className="vaango-cart-opt-label">Payment Method</span>
                  <div className="vaango-fulfillment-toggle" role="radiogroup">
                    <button
                      type="button"
                      className={currentPayment === 'cash' ? 'active' : ''}
                      onClick={() =>
                        setShopPaymentMethods((prev) => ({ ...prev, [shopId]: 'cash' }))
                      }
                    >
                      Cash on Delivery
                    </button>
                    <button
                      type="button"
                      className={currentPayment === 'upi' ? 'active' : ''}
                      onClick={() =>
                        setShopPaymentMethods((prev) => ({ ...prev, [shopId]: 'upi' }))
                      }
                    >
                      UPI / Online
                    </button>
                  </div>
                </div>
              </div>

              {/* Special Instructions Note for Shop */}
              <div className="vaango-cart-notes-section">
                <label htmlFor={`notes-${shopId}`} className="vaango-cart-opt-label">Special instructions / Notes</label>
                <Textarea
                  id={`notes-${shopId}`}
                  placeholder={t('orderNotesPlaceholder')}
                  value={currentNote}
                  onChange={(e) =>
                    setShopNotes((prev) => ({ ...prev, [shopId]: e.target.value }))
                  }
                  rows={2}
                />
              </div>

              {/* Storefront Footer & Checkout Button */}
              <div className="vaango-cart-shop-footer">
                <div className="vaango-cart-shop-subtotal">
                  <span>Store Total ({shopItems.length} items):</span>
                  <strong>₹{subtotal}</strong>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  isLoading={isThisSubmitting}
                  disabled={isSubmitting || isInvalidShopId}
                  onClick={() => handleCheckoutShop(group)}
                >
                  Place Order with {shop.name} · ₹{subtotal}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Auth Modal if guest checks out */}
      <Modal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        title={t('signInToOrder')}
        maxWidth="sm"
      >
        <div className="vaango-auth-modal-content">
          <p className="vaango-auth-modal-desc">
            Sign in with Google or your phone to complete your order and track live updates from the store.
          </p>
          {authError && (
            <div className="vaango-cart-error-alert" role="alert">
              <AlertCircle size={16} />
              <span>{authError}</span>
            </div>
          )}
          <div className="vaango-auth-modal-actions">
            <Button
              variant="primary"
              fullWidth
              isLoading={isGoogleLoading}
              onClick={handleGoogleSignInFromCart}
            >
              Continue with Google
            </Button>
            <Button
              variant="outline"
              fullWidth
              onClick={() => {
                setAuthModalOpen(false);
                navigate('/login', { state: { from: { pathname: '/cart' } } });
              }}
            >
              Sign In with Mobile OTP
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
