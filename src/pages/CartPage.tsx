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
import './CartPage.css';
import { useLanguage } from '../context/LanguageContext';

export const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
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
          title="Your Cart is Empty"
          description="Browse local neighborhood shops in your area and add items to place a pre-order."
          actionLabel="Explore Local Shops"
          onAction={() => navigate('/shops')}
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
      setSubmissionError('Please choose Parcel or Eat there before submitting.');
      return;
    }

    const result = await submitRequest(paymentMethod);
    if (result.success && result.request) {
      navigate(`/request-confirmation/${result.request.id}`);
    } else {
      setSubmissionError(result.error || 'Failed to submit request.');
      toastError(result.error || 'Failed to submit request.');
    }
  };

  const handleGoogleSignInFromCart = async () => {
    setAuthError(null);
    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        setAuthError(result.error || 'Google sign-in failed. Please try again.');
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
          aria-label="Back to shop"
        >
          <ArrowLeft size={18} />
          <span>Back to {activeShop.name}</span>
        </button>

        <div className="vaango-cart-page__title-row">
          <h1 className="vaango-cart-page__title">{t('reviewRequest')}</h1>
          <button
            type="button"
            className="vaango-cart-page__clear-btn"
            onClick={clearCart}
            aria-label="Clear all items from cart"
          >
            Clear Cart
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
              <div className="vaango-cart-shop-banner__label">Ordering from:</div>
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
                      {product.offer_type === 'bogo' && <div className="vaango-bogo-badge">Buy {quantity} Get {quantity} Free - you receive {effectiveQuantity} total</div>}
                      <div className="vaango-cart-item-qty">Qty: {quantity}{product.offer_type === 'bogo' && <span className="vaango-bogo-qty">(You'll receive {effectiveQuantity})</span>}</div>
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
                      <span>Remove</span>
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Customer Special Notes */}

          {offersDineIn && (
            <Card variant="default" padding="md" className="vaango-cart-notes-card">
              <strong>How will you enjoy it?</strong>
              <div className="vaango-fulfillment-toggle" role="radiogroup" aria-label="Fulfillment type">
                {(['parcel', 'dine_in'] as const).map((option) => (
                  <button key={option} type="button" role="radio" aria-checked={fulfillmentType === option} className={fulfillmentType === option ? 'active' : ''} onClick={() => setFulfillmentType(option)}>
                    {option === 'parcel' ? 'Parcel' : 'Eat there'}
                  </button>
                ))}
              </div>
            </Card>
          )}
          <Card variant="default" padding="md" className="vaango-cart-notes-card">
            <div className="vaango-cart-notes-header">
              <FileText size={18} />
              <label htmlFor="cart-notes" className="vaango-cart-notes-title">
                Special Instructions for Merchant
              </label>
            </div>
            <Textarea
              id="cart-notes"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="e.g. Please pack ripe tomatoes, call upon ready..."
              rows={2}
            />
          </Card>
        </div>

        {/* Order Summary & Submit Panel */}
        <div className="vaango-cart-summary-section">
          <Card variant="elevated" padding="lg" className="vaango-cart-summary-card">
            <h2 className="vaango-cart-summary__title">Request Summary</h2>

            <div className="vaango-cart-summary__breakdown">
              <div className="vaango-summary-row">
                <span>Total Items</span>
                <span>{itemCount} items</span>
              </div>

              <div className="vaango-summary-row">
                <span>{t('subtotal')}</span>
                <span>₹{totalAmount}</span>
              </div>

              <div className="vaango-summary-row vaango-summary-row--accent">
                <span>Fulfillment Type</span>
                <span>{fulfillmentType === 'dine_in' ? 'Eat there' : fulfillmentType === 'parcel' ? 'Parcel' : offersDineIn ? 'Choose one' : 'Counter Pickup / Shop Delivery'}</span>
              </div>

              <div className="vaango-summary-divider" />

              <div className="vaango-summary-row vaango-summary-row--total">
                <span>{t('total')}</span>
                <span className="vaango-summary-total-price">₹{totalAmount}</span>
              </div>
            </div>

            <div className="vaango-cart-payment-selector">
              <p className="vaango-cart-payment-label">How will you pay? You pay the shopkeeper directly.</p>
              <div className="vaango-cart-payment-options">
                <button type="button" className={`vaango-payment-option ${paymentMethod === 'cash' ? 'vaango-payment-option--active' : ''}`} onClick={() => setPaymentMethod('cash')}>Cash on Pickup / Delivery</button>
                <button type="button" className={`vaango-payment-option ${paymentMethod === 'upi' ? 'vaango-payment-option--active' : ''}`} onClick={() => setPaymentMethod('upi')}>Pay via UPI</button>
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
              {isSubmitting ? 'Sending Request...' : t('submitRequest')}
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
        title="Sign in with Google to Order"
        description="Authenticate with Google to submit your order directly to the merchant."
        maxWidth="sm"
        footer={
          <Button
            variant="outline"
            size="md"
            onClick={() => setAuthModalOpen(false)}
          >
            Cancel
          </Button>
        }
      >
        <div style={{ textAlign: 'center', padding: 'var(--space-2) 0' }}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6, marginBottom: 'var(--space-5)' }}>
            Sign in with Google to place your order with <strong>{activeShop.name}</strong>. First-time customers will provide delivery details on the next screen.
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
            <span>Continue with Google</span>
          </Button>

          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', margin: 0 }}>
            Returning customers will proceed directly to complete order submission.
          </p>
        </div>
      </Modal>
    </div>
  );
};
