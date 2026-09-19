import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Trash2,
  Plus,
  Minus,
  Store,
  FileText,
  AlertCircle,
  ShoppingBag,
} from 'lucide-react';
import { getEffectiveQuantity, useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import { MOCK_SHOP_TYPES } from '../data/mockData';
import { useLanguage } from '../context/LanguageContext';
import './CartPage.css';

export const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { user, signInWithGoogle, isSupabaseLive } = useAuth();
  const { error: toastError } = useToast();

  const {
    items,
    activeShop,
    itemCount,
    totalAmount,
    orderNotes,
    setOrderNotes,
    fulfillmentType,
    setFulfillmentType,
    updateQuantity,
    removeItem,
    clearCart,
    submitRequest,
    isSubmitting,
  } = useCart();

  const shopType = MOCK_SHOP_TYPES.find((type) => type.id === activeShop?.shop_type_id);
  const offersDineIn = ['restaurant', 'hotel', 'bakery'].includes(shopType?.code || '');

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi'>('cash');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (items.length === 0 || !activeShop) {
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

  const handleProceed = async () => {
    setSubmissionError(null);

    // Authentication Check
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    if (offersDineIn && !fulfillmentType) {
      const msg = language === 'ta' ? 'தயவுசெய்து பார்சல் அல்லது அங்கேயே சாப்பிட என்பதைத் தேர்ந்தெடுக்கவும்.' : 'Please choose Parcel or Eat there before submitting.';
      setSubmissionError(msg);
      return;
    }

    try {
      const result = await submitRequest(paymentMethod);
      if (result.success && result.request) {
        navigate(`/request-confirmation/${result.request.id}`);
      } else {
        const errorMsg = result.error || t('genericError');
        setSubmissionError(errorMsg);
        toastError(errorMsg);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : t('genericError');
      setSubmissionError(errorMsg);
      toastError(errorMsg);
    }
  };

  const handleGoogleSignInFromCart = async () => {
    setAuthError(null);
    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        setAuthError(result.error || (language === 'ta' ? 'Google உள்நுழைவு தோல்வியடைந்தது.' : 'Google sign-in failed. Please try again.'));
        setIsGoogleLoading(false);
      } else {
        setIsGoogleLoading(false);
        setAuthModalOpen(false);
        if (!isSupabaseLive) {
          navigate('/complete-profile', { state: { from: { pathname: '/cart' } } });
        }
      }
    } catch (err) {
      setIsGoogleLoading(false);
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed');
    }
  };

  return (
    <div className="container vaango-cart-page">
      {/* Header */}
      <div className="vaango-cart-page__header">
        <button
          type="button"
          className="vaango-back-link"
          onClick={() => navigate(`/shop/${activeShop.id}`)}
          aria-label={`${t('backBtn')} ${activeShop.name}`}
        >
          <ArrowLeft size={18} />
          <span>{t('backBtn')} {activeShop.name}</span>
        </button>

        <div className="vaango-cart-page__title-row">
          <h1 className="vaango-cart-page__title">{t('reviewRequest')}</h1>
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

      {submissionError && (
        <div className="vaango-cart-error-alert" role="alert">
          <AlertCircle size={18} />
          <span>{submissionError}</span>
        </div>
      )}

      <div className="vaango-cart-layout">
        {/* Main Items Section */}
        <div className="vaango-cart-items-section">
          {/* Shop Context Header */}
          <Card variant="default" padding="md" className="vaango-cart-shop-banner">
            <div className="vaango-cart-shop-banner__icon">
              <Store size={22} />
            </div>
            <div>
              <div className="vaango-cart-shop-banner__label">
                {language === 'ta' ? 'ஆர்டர் பெறும் கடை:' : 'Ordering from:'}
              </div>
              <h2 className="vaango-cart-shop-banner__name">{activeShop.name}</h2>
              <span className="vaango-cart-shop-banner__address">{activeShop.address_line}</span>
            </div>
          </Card>

          {/* Line Items List */}
          <div className="vaango-cart-items-list" role="list" aria-label="Items in cart">
            {items.map((item) => {
              const { product, quantity } = item;
              const effectiveQuantity = getEffectiveQuantity(item);
              return (
                <Card key={product.id} variant="default" padding="md" className="vaango-cart-item">
                  <div className="vaango-cart-item__main">
                    <div className="vaango-cart-item__info">
                      <h3 className="vaango-cart-item__name">{product.name}</h3>
                      <span className="vaango-cart-item__rate">
                        ₹{product.price} / {product.unit}
                      </span>
                      {product.offer_type === 'bogo' && (
                        <div className="vaango-bogo-badge">
                          {language === 'ta'
                            ? `1 வாங்கினால் 1 இலவசம் - மொத்தம் ${effectiveQuantity} கிடைக்கும்`
                            : `Buy ${quantity} Get ${quantity} Free - you receive ${effectiveQuantity} total`}
                        </div>
                      )}
                      <div className="vaango-cart-item-qty">
                        {language === 'ta' ? `அளவு: ${quantity}` : `Qty: ${quantity}`}
                        {product.offer_type === 'bogo' && (
                          <span className="vaango-bogo-qty">
                            {language === 'ta' ? `(${effectiveQuantity} வழங்கப்படும்)` : `(You'll receive ${effectiveQuantity})`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="vaango-cart-item__subtotal">
                      ₹{product.price * quantity}
                    </div>
                  </div>

                  <div className="vaango-cart-item__actions">
                    {/* Quantity Control */}
                    <div className="vaango-qty-control vaango-qty-control--sm" role="group">
                      <button
                        type="button"
                        className="vaango-qty-btn"
                        onClick={() => updateQuantity(product.id, quantity - 1)}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="vaango-qty-display">{quantity}</span>
                      <button
                        type="button"
                        className="vaango-qty-btn"
                        onClick={() => updateQuantity(product.id, quantity + 1)}
                        aria-label="Increase quantity"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <button
                      type="button"
                      className="vaango-cart-item__remove"
                      onClick={() => removeItem(product.id)}
                      aria-label={`Remove ${product.name} from cart`}
                    >
                      <Trash2 size={16} />
                      <span>{t('deleteItem')}</span>
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Customer Special Notes */}
          {offersDineIn && (
            <Card variant="default" padding="md" className="vaango-cart-notes-card">
              <strong>{t('chooseFulfillment')}</strong>
              <div className="vaango-fulfillment-toggle" role="radiogroup" aria-label="Fulfillment type">
                {(['parcel', 'dine_in'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={fulfillmentType === option}
                    className={fulfillmentType === option ? 'active' : ''}
                    onClick={() => setFulfillmentType(option)}
                  >
                    {option === 'parcel' ? t('parcelOption') : t('dineInOption')}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card variant="default" padding="md" className="vaango-cart-notes-card">
            <div className="vaango-cart-notes-header">
              <FileText size={18} />
              <label htmlFor="cart-notes" className="vaango-cart-notes-title">
                {language === 'ta' ? 'கடைக்காரருக்கான சிறப்பு குறிப்புகள்' : 'Special Instructions for Merchant'}
              </label>
            </div>
            <Textarea
              id="cart-notes"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder={t('orderNotesPlaceholder')}
              rows={2}
            />
          </Card>
        </div>

        {/* Order Summary & Submit Panel */}
        <div className="vaango-cart-summary-section">
          <Card variant="elevated" padding="lg" className="vaango-cart-summary-card">
            <h2 className="vaango-cart-summary__title">
              {language === 'ta' ? 'கோரிக்கை விவரம்' : 'Request Summary'}
            </h2>

            <div className="vaango-cart-summary__breakdown">
              <div className="vaango-summary-row">
                <span>{language === 'ta' ? 'மொத்த பொருட்கள்' : 'Total Items'}</span>
                <span>{itemCount} {t('items')}</span>
              </div>

              <div className="vaango-summary-row">
                <span>{t('itemTotal')}</span>
                <span>₹{totalAmount}</span>
              </div>

              <div className="vaango-summary-row vaango-summary-row--accent">
                <span>{t('chooseFulfillment')}</span>
                <span>
                  {fulfillmentType === 'dine_in'
                    ? t('dineInOption')
                    : fulfillmentType === 'parcel'
                    ? t('parcelOption')
                    : offersDineIn
                    ? (language === 'ta' ? 'ஒன்றைத் தேர்வு செய்க' : 'Choose one')
                    : t('counterPickup')}
                </span>
              </div>

              <div className="vaango-summary-divider" />

              <div className="vaango-summary-row vaango-summary-row--total">
                <span>{t('totalAmount')}</span>
                <span className="vaango-summary-total-price">₹{totalAmount}</span>
              </div>
            </div>

            <div className="vaango-cart-payment-selector">
              <p className="vaango-cart-payment-label">
                {t('paymentMethodTitle')}: {t('submitNote')}
              </p>
              <div className="vaango-cart-payment-options">
                <button
                  type="button"
                  className={`vaango-payment-option ${paymentMethod === 'cash' ? 'vaango-payment-option--active' : ''}`}
                  onClick={() => setPaymentMethod('cash')}
                >
                  {t('payCash')}
                </button>
                <button
                  type="button"
                  className={`vaango-payment-option ${paymentMethod === 'upi' ? 'vaango-payment-option--active' : ''}`}
                  onClick={() => setPaymentMethod('upi')}
                >
                  {t('payUpiDirect')}
                </button>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              onClick={handleProceed}
              className="vaango-cart-submit-btn"
            >
              {isSubmitting ? t('submittingRequest') : t('submitRequest')}
            </Button>
          </Card>
        </div>
      </div>

      {/* Sign-in Modal if unauthenticated */}
      <Modal
        isOpen={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthError(null);
        }}
        title={language === 'ta' ? 'ஆர்டர் செய்ய உள்நுழையவும்' : 'Sign in to Order'}
        description={language === 'ta' ? 'கடைக்காரருக்கு ஆர்டர் அனுப்ப உங்கள் கணக்கில் உள்நுழையுங்கள்.' : 'Authenticate to submit your order directly to the merchant.'}
        maxWidth="sm"
        footer={
          <Button
            variant="outline"
            size="md"
            onClick={() => setAuthModalOpen(false)}
          >
            {t('cancelBtn')}
          </Button>
        }
      >
        <div style={{ textAlign: 'center', padding: 'var(--space-2) 0' }}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6, marginBottom: 'var(--space-5)' }}>
            {language === 'ta'
              ? `${activeShop.name} கடையில் ஆர்டர் செய்ய Google மூலம் உள்நுழையுங்கள்.`
              : `Sign in with Google to place your order with ${activeShop.name}.`}
          </p>

          {authError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-error)', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-4)', justifyContent: 'center' }}>
              <AlertCircle size={14} />
              <span>{authError}</span>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="lg"
            fullWidth
            isLoading={isGoogleLoading}
            onClick={handleGoogleSignInFromCart}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              fontWeight: 600,
              fontSize: '1rem',
              padding: '12px 20px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              marginBottom: 'var(--space-3)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{t('googleSignInBtn')}</span>
          </Button>
        </div>
      </Modal>
    </div>
  );
};
