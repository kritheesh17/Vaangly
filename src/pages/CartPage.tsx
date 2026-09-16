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
  const { user, loginWithEmail } = useAuth();
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

  const handleQuickSignIn = async () => {
    await loginWithEmail('ananya.customer@example.com');
    setAuthModalOpen(false);
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
        onClose={() => setAuthModalOpen(false)}
        title="Sign In to Complete Request"
        description="Vaango uses your phone or email so the shopkeeper can notify you when your pre-order is packed and ready."
        maxWidth="sm"
        footer={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setAuthModalOpen(false);
                navigate('/login', { state: { from: { pathname: '/cart' } } });
              }}
            >
              Standard Sign In
            </Button>
            <Button variant="primary" size="md" onClick={handleQuickSignIn}>
              Continue as Verified Customer
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}>
          Your cart items will be preserved safely. Click &ldquo;Continue as Verified Customer&rdquo; for instant evaluation or use Standard Sign In.
        </p>
      </Modal>
    </div>
  );
};
