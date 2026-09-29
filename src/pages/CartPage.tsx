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
  Clock,
} from 'lucide-react';
import { getEffectiveQuantity, useCart, ShopCartGroup } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import { getShopType, isValidUuid } from '../data/mockData';
import { useLanguage } from '../context/LanguageContext';
import { removePendingPaymentProof, uploadPendingPaymentProof, validatePaymentProofFile } from '../lib/paymentProof';
import { isValidUpiQrUrl } from '../lib/upi';
import { isValidIndianMobile } from '../lib/phoneUtils';
import {
  getAvailablePickupDates,
  getAvailablePickupSlots,
  validateOrderPickupAt,
} from '../lib/orderPickupUtils';
import './CartPage.css';

interface UpiPaymentPanelProps {
  shopName: string;
  upiId?: string | null;
  qrUrl?: string | null;
  amount: number;
  userId: string;
  proofPath: string | null;
  onProofPathChange: (path: string | null) => void;
}

const UpiPaymentPanel: React.FC<UpiPaymentPanelProps> = ({ shopName, upiId, qrUrl, amount, userId, proofPath, onProofPathChange }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const validationError = validatePaymentProofFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsUploading(true);
    try {
      await removePendingPaymentProof(proofPath);
      const path = await uploadPendingPaymentProof(file, userId);
      setPreviewUrl(URL.createObjectURL(file));
      setFileName(file.name);
      onProofPathChange(path);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload payment proof.');
    } finally {
      setIsUploading(false);
    }
  };

  const removeProof = async () => {
    await removePendingPaymentProof(proofPath);
    setPreviewUrl(null);
    setFileName(null);
    onProofPathChange(null);
  };

  const hasValidQr = isValidUpiQrUrl(qrUrl);

  return (
    <div className="vaango-cart-upi-panel">
      {hasValidQr ? <>
        <strong>Pay ₹{amount.toFixed(2)} using any UPI app</strong>
        <img src={qrUrl} alt={`UPI QR code for ${shopName}`} className="vaango-upi-qr" />
        {upiId && <p className="vaango-cart-upi-id">UPI ID: <code>{upiId}</code></p>}
        <p className="vaango-cart-payment-help">After completing payment, upload the payment screenshot. Payment remains pending until the shop verifies it.</p>
        {!previewUrl ? (
          <label className="vaango-payment-proof-upload">
            <span>{isUploading ? 'Uploading proof...' : 'Add Payment Proof'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" disabled={isUploading} onChange={(event) => void handleFile(event.target.files?.[0])} />
          </label>
        ) : (
          <div className="vaango-payment-proof-selection">
            <img src={previewUrl} alt="Payment proof preview" className="vaango-payment-proof-preview" />
            <span>{fileName}</span>
            <div className="vaango-payment-proof-actions">
              <label className="vaango-payment-proof-upload"><span>Replace</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={(event) => void handleFile(event.target.files?.[0])} /></label>
              <Button type="button" variant="outline" size="sm" onClick={() => void removeProof()}>Remove</Button>
            </div>
          </div>
        )}
        {error && <p className="vaango-cart-payment-error" role="alert">{error}</p>}
      </> : <p className="vaango-cart-payment-error">UPI payment is currently unavailable because this shop has not configured its UPI QR code.</p>}
    </div>
  );
};

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
  const [shopFulfillments, setShopFulfillments] = useState<Record<string, 'DINE_IN' | 'TAKEAWAY' | null>>({});
  const [shopPaymentMethods, setShopPaymentMethods] = useState<Record<string, 'pay_at_shop' | 'upi'>>({});
  const [paymentProofPaths, setPaymentProofPaths] = useState<Record<string, string | null>>({});
  const [shopPickupModes, setShopPickupModes] = useState<Record<string, 'ASAP' | 'SCHEDULED'>>({});
  const [shopPickupDates, setShopPickupDates] = useState<Record<string, string>>({});
  const [shopPickupTimes, setShopPickupTimes] = useState<Record<string, string>>({});
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

    if (!user.phone || !isValidIndianMobile(user.phone)) {
      toastError('Please add your mobile number to your profile before placing an order.');
      navigate('/complete-profile?redirect=/cart');
      return;
    }

    const shopType = getShopType(group.shop.shop_type_id);
    const offersDineIn =
      ['restaurant', 'hotel', 'bakery'].includes(shopType?.code || '') ||
      (Array.isArray(group.shop.capabilities) && group.shop.capabilities.includes('DINE_IN')) ||
      group.shop.business_type === 'bakery' ||
      group.shop.business_type === 'restaurant';
    const chosenFulfillment = shopFulfillments[shopId] || null;

    if (offersDineIn && !chosenFulfillment) {
      setShopErrors((prev) => ({ ...prev, [shopId]: t('chooseParcelOrDineIn') }));
      return;
    }

    const chosenPayment = shopPaymentMethods[shopId] || 'pay_at_shop';
    const paymentProofPath = paymentProofPaths[shopId] || null;
    if (chosenPayment === 'upi' && !isValidUpiQrUrl(group.shop.upi_qr_url)) {
      setShopErrors((prev) => ({ ...prev, [shopId]: 'UPI payment is currently unavailable because this shop has not configured its UPI QR code.' }));
      return;
    }
    if (chosenPayment === 'upi' && !paymentProofPath) {
      setShopErrors((prev) => ({ ...prev, [shopId]: 'Add payment proof before placing a UPI order.' }));
      return;
    }
    const chosenNote = shopNotes[shopId] || '';

    // Handle pickup choice
    const pickupMode = shopPickupModes[shopId] || 'ASAP';
    let chosenPickupAt: string | null = null;
    if (pickupMode === 'SCHEDULED') {
      const dates = getAvailablePickupDates(group.shop, group.shop.slot_config?.timeZone);
      const chosenDate = shopPickupDates[shopId] || (dates.length > 0 ? dates[0].dateStr : null);
      if (!chosenDate) {
        setShopErrors((prev) => ({ ...prev, [shopId]: 'Please select a pickup date.' }));
        return;
      }
      const slots = getAvailablePickupSlots(group.shop, chosenDate, group.shop.slot_config?.timeZone);
      chosenPickupAt = shopPickupTimes[shopId] || (slots.length > 0 ? slots[0].isoTimestamp : null);
      if (!chosenPickupAt) {
        setShopErrors((prev) => ({
          ...prev,
          [shopId]: 'No pickup slots are available for the selected date. Please choose another date.',
        }));
        return;
      }

      const validation = validateOrderPickupAt(group.shop, chosenPickupAt, group.shop.slot_config?.timeZone);
      if (!validation.valid) {
        setShopErrors((prev) => ({ ...prev, [shopId]: validation.error || 'Invalid pickup time selected.' }));
        return;
      }
    }

    setSubmittingShopId(shopId);
    try {
      const result = await submitShopRequest(
        shopId,
        chosenPayment,
        chosenFulfillment,
        chosenNote,
        paymentProofPath,
        chosenPickupAt
      );
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
          const shopType = getShopType(shop.shop_type_id);
          const offersDineIn =
            ['restaurant', 'hotel', 'bakery'].includes(shopType?.code || '') ||
            (Array.isArray(shop.capabilities) && shop.capabilities.includes('DINE_IN')) ||
            shop.business_type === 'bakery' ||
            shop.business_type === 'restaurant';
          const currentFulfillment = shopFulfillments[shopId] || null;
          const currentPayment = shopPaymentMethods[shopId] || 'pay_at_shop';
          const currentNote = shopNotes[shopId] || '';
          const currentError = shopErrors[shopId];
          const isThisSubmitting = submittingShopId === shopId;

          const currentPickupMode = shopPickupModes[shopId] || 'ASAP';
          const availableDates = getAvailablePickupDates(shop, shop.slot_config?.timeZone);
          const currentPickupDate = shopPickupDates[shopId] || (availableDates.length > 0 ? availableDates[0].dateStr : '');
          const availableSlots = currentPickupDate
            ? getAvailablePickupSlots(shop, currentPickupDate, shop.slot_config?.timeZone)
            : [];
          const currentPickupTime = shopPickupTimes[shopId] || (availableSlots.length > 0 ? availableSlots[0].isoTimestamp : '');
          const isSelectedDateToday = availableDates.length > 0 && currentPickupDate === availableDates[0].dateStr;
          const shopTimezoneLabel = shop.slot_config?.timeZone || 'Shop Time';

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

              {/* Preferences & Checkout Options */}
              <div className="vaango-cart-preferences">
                {offersDineIn && (
                  <div className="vaango-cart-pref-section vaango-cart-fulfillment-box">
                    <span className="vaango-cart-opt-label">{t('chooseFulfillment')}</span>
                    <div className="vaango-fulfillment-toggle" role="radiogroup">
                      {(['DINE_IN', 'TAKEAWAY'] as const).map((opt) => (
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
                          <span>{opt === 'TAKEAWAY' ? '📦 Parcel / Takeaway' : '🍽️ Dine-in'}</span>
                          <small>{opt === 'TAKEAWAY' ? 'I want to take it with me' : "I'm going to eat here"}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* VISUAL SECTION 1: PICKUP TIMING */}
                <div className="vaango-cart-pref-section vaango-cart-pickup-section">
                  <div className="vaango-cart-section-header">
                    <span className="vaango-cart-opt-label">Pickup Timing</span>
                    <span className="vaango-cart-section-sub">Choose when you plan to collect your order</span>
                  </div>
                  <div className="vaango-cart-options-toggle" role="radiogroup" aria-label="Pickup Timing">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={currentPickupMode === 'ASAP'}
                      className={`vaango-cart-option-btn ${currentPickupMode === 'ASAP' ? 'active' : ''}`}
                      onClick={() => setShopPickupModes((prev) => ({ ...prev, [shopId]: 'ASAP' }))}
                    >
                      <span className="vaango-cart-option-title">⚡ ASAP</span>
                      <small className="vaango-cart-option-desc">Collect as soon as ready</small>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={currentPickupMode === 'SCHEDULED'}
                      className={`vaango-cart-option-btn ${currentPickupMode === 'SCHEDULED' ? 'active' : ''}`}
                      onClick={() => {
                        setShopPickupModes((prev) => ({ ...prev, [shopId]: 'SCHEDULED' }));
                        if (!shopPickupDates[shopId] && availableDates.length > 0) {
                          const initialDate = availableDates[0].dateStr;
                          setShopPickupDates((prev) => ({ ...prev, [shopId]: initialDate }));
                          const initialSlots = getAvailablePickupSlots(shop, initialDate, shop.slot_config?.timeZone);
                          if (initialSlots.length > 0) {
                            setShopPickupTimes((prev) => ({ ...prev, [shopId]: initialSlots[0].isoTimestamp }));
                          }
                        }
                      }}
                    >
                      <span className="vaango-cart-option-title">📅 Schedule Pickup</span>
                      <small className="vaango-cart-option-desc">Choose a future collection time</small>
                    </button>
                  </div>

                  {currentPickupMode === 'SCHEDULED' && (
                    <div className="vaango-scheduled-pickup-panel">
                      <div className="vaango-pickup-fields-grid">
                        <div className="vaango-pickup-field">
                          <label className="vaango-cart-opt-label" htmlFor={`pickup-date-${shopId}`}>
                            Pickup Date
                          </label>
                          <select
                            id={`pickup-date-${shopId}`}
                            className="vaango-select"
                            value={currentPickupDate}
                            onChange={(e) => {
                              const newDate = e.target.value;
                              setShopPickupDates((prev) => ({ ...prev, [shopId]: newDate }));
                              const newSlots = getAvailablePickupSlots(shop, newDate, shop.slot_config?.timeZone);
                              if (newSlots.length > 0) {
                                setShopPickupTimes((prev) => ({ ...prev, [shopId]: newSlots[0].isoTimestamp }));
                              } else {
                                setShopPickupTimes((prev) => ({ ...prev, [shopId]: '' }));
                              }
                            }}
                          >
                            {availableDates.map((d) => (
                              <option key={d.dateStr} value={d.dateStr}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="vaango-pickup-field">
                          <label className="vaango-cart-opt-label" htmlFor={`pickup-time-${shopId}`}>
                            Pickup Time ({shopTimezoneLabel})
                          </label>
                          {availableSlots.length > 0 ? (
                            <select
                              id={`pickup-time-${shopId}`}
                              className="vaango-select"
                              value={currentPickupTime || availableSlots[0].isoTimestamp}
                              onChange={(e) => {
                                setShopPickupTimes((prev) => ({ ...prev, [shopId]: e.target.value }));
                              }}
                            >
                              {availableSlots.map((slot) => (
                                <option key={slot.isoTimestamp} value={slot.isoTimestamp}>
                                  {slot.formattedTime}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="vaango-pickup-no-slots">
                              <span className="vaango-pickup-no-slots-msg">
                                ⚠️ No more pickup slots available for {isSelectedDateToday ? 'today' : 'this date'}.
                              </span>
                              {availableDates.length > 1 && (
                                <button
                                  type="button"
                                  className="vaango-pickup-switch-date-btn"
                                  onClick={() => {
                                    const nextDate = availableDates.find((d) => d.dateStr !== currentPickupDate);
                                    if (nextDate) {
                                      setShopPickupDates((prev) => ({ ...prev, [shopId]: nextDate.dateStr }));
                                      const nextSlots = getAvailablePickupSlots(shop, nextDate.dateStr, shop.slot_config?.timeZone);
                                      if (nextSlots.length > 0) {
                                        setShopPickupTimes((prev) => ({ ...prev, [shopId]: nextSlots[0].isoTimestamp }));
                                      }
                                    }
                                  }}
                                >
                                  Choose {availableDates.find((d) => d.dateStr !== currentPickupDate)?.label || 'Next Available Date'} →
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Clear informative note when 1 slot remains */}
                      {availableSlots.length === 1 && isSelectedDateToday && (
                        <div className="vaango-pickup-single-slot-notice">
                          <Clock size={15} className="text-primary shrink-0" />
                          <span>
                            This is today&apos;s remaining available pickup option ({availableSlots[0].formattedTime} {shopTimezoneLabel}). Earlier slots have already passed.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* VISUAL SECTION 2: PAYMENT METHOD */}
                <div className="vaango-cart-pref-section vaango-cart-payment-section">
                  <div className="vaango-cart-section-header">
                    <span className="vaango-cart-opt-label">Payment Method</span>
                    <span className="vaango-cart-section-sub">Choose how you wish to pay</span>
                  </div>
                  <div className="vaango-cart-options-toggle" role="radiogroup" aria-label="Payment Method">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={currentPayment === 'pay_at_shop'}
                      className={`vaango-cart-option-btn ${currentPayment === 'pay_at_shop' ? 'active' : ''}`}
                      onClick={() => {
                        void removePendingPaymentProof(paymentProofPaths[shopId] || null);
                        setPaymentProofPaths((prev) => ({ ...prev, [shopId]: null }));
                        setShopPaymentMethods((prev) => ({ ...prev, [shopId]: 'pay_at_shop' }));
                      }}
                    >
                      <span className="vaango-cart-option-title">🏪 Pay at Shop</span>
                      <small className="vaango-cart-option-desc">Pay cash or UPI at the counter when collecting</small>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={currentPayment === 'upi'}
                      disabled={!isValidUpiQrUrl(shop.upi_qr_url)}
                      className={`vaango-cart-option-btn ${currentPayment === 'upi' ? 'active' : ''}`}
                      onClick={() =>
                        setShopPaymentMethods((prev) => ({ ...prev, [shopId]: 'upi' }))
                      }
                    >
                      <span className="vaango-cart-option-title">📱 UPI / Online</span>
                      <small className="vaango-cart-option-desc">Pay via UPI QR and upload payment screenshot</small>
                    </button>
                  </div>

                  {currentPayment === 'upi' && user && (
                    <UpiPaymentPanel
                      shopName={shop.name}
                      upiId={shop.upi_id}
                      qrUrl={shop.upi_qr_url}
                      amount={subtotal}
                      userId={user.id}
                      proofPath={paymentProofPaths[shopId] || null}
                      onProofPathChange={(path) => setPaymentProofPaths((prev) => ({ ...prev, [shopId]: path }))}
                    />
                  )}
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
