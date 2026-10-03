import React, { useState } from 'react';
import { ShopProduct, ProductVariant } from '../../types/database';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ChevronLeft, ChevronRight, Plus, Minus, PackageX, Star, MapPin, Truck, ShoppingCart, Store } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useCart } from '../../context/CartContext';
import './ProductDetailModal.css';
import { findVariantForSelections, optionIsReachable, variantAttributeGroups, variantIsAvailable, variantLabel } from '../../lib/productVariants';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ShopProduct | null;
  shop?: any;
  onAddToCart: (product: ShopProduct, variant?: ProductVariant | null, quantity?: number) => void;
  currentCartQty?: number;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  isOpen,
  onClose,
  product,
  shop: propShop,
  onAddToCart,
  currentCartQty: _currentCartQty = 0,
}) => {
  const { t } = useLanguage();
  const { activeShop } = useCart();
  const { success, warning, error: toastError } = useToast();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [imageError, setImageError] = useState<Record<number, boolean>>({});

  const currentShop = propShop || activeShop;

  // Reset state when product changes
  React.useEffect(() => {
    if (product) {
      setActiveImageIndex(0);
      setImageError({});
      setQuantity(1);
      if (product.has_variants && product.variants?.length) {
        const defaultVar = product.variants.find(variantIsAvailable) || product.variants[0];
        setSelectedVariant(defaultVar || null);
        setSelectedAttributes(defaultVar?.attributes || {});
      } else {
        setSelectedVariant(null);
        setSelectedAttributes({});
      }
    }
  }, [product, isOpen]);

  if (!product) return null;

  // Gather all unique valid images
  const allImages: string[] = [];
  if (product.image_urls && product.image_urls.length > 0) {
    product.image_urls.forEach((url) => {
      if (url && !allImages.includes(url) && !url.startsWith('blob:')) {
        allImages.push(url);
      }
    });
  }
  if (product.image_url && !allImages.includes(product.image_url) && !product.image_url.startsWith('blob:')) {
    allImages.push(product.image_url);
  }

  const variantGroups = variantAttributeGroups(product.variants || []);
  const hasAttributeVariants = Object.keys(variantGroups).length > 0;
  const hasVariants = Boolean(product.has_variants && product.variants && product.variants.length > 0);
  const resolvedVariant = hasVariants
    ? (hasAttributeVariants
        ? findVariantForSelections(product.variants || [], selectedAttributes)
        : selectedVariant)
    : null;
  const effectivePrice = resolvedVariant ? resolvedVariant.price : product.price;
  const effectiveUnit = resolvedVariant ? variantLabel(resolvedVariant) : product.unit;
  const selectedStock = resolvedVariant?.stock_quantity ?? product.stock_quantity;
  const isOutOfStock = !product.is_available || (hasVariants && resolvedVariant !== null && !variantIsAvailable(resolvedVariant));
  const originalPrice = Math.round(effectivePrice * 1.25);

  const handlePrevImage = () => {
    setActiveImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setActiveImageIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  const handleAdd = () => {
    if (hasVariants && !resolvedVariant) {
      warning('Please select an option.');
      return;
    }
    if (!product.is_available || (resolvedVariant && !variantIsAvailable(resolvedVariant))) {
      toastError('Product is currently out of stock');
      return;
    }

    const productToAdd = resolvedVariant
      ? { ...product, price: resolvedVariant.price, unit: variantLabel(resolvedVariant) }
      : product;

    try {
      onAddToCart(productToAdd, resolvedVariant, quantity);
      success(`${productToAdd.name} added to cart`);
      onClose();
    } catch (err: any) {
      toastError('Unable to add this product. Please try again.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      maxWidth="md"
    >
      <div className="vaango-prod-modal">
        {/* Top: Gallery / Carousel with Dots */}
        <div className="vaango-prod-modal__gallery">
          {allImages.length > 0 && !imageError[activeImageIndex] ? (
            <div className="vaango-prod-modal__main-image-wrap">
              <img
                src={allImages[activeImageIndex]}
                alt={`${product.name} - View ${activeImageIndex + 1}`}
                className="vaango-prod-modal__main-image"
                onError={() => setImageError((prev) => ({ ...prev, [activeImageIndex]: true }))}
              />
              {allImages.length > 1 && (
                <>
                  <button
                    type="button"
                    className="vaango-prod-modal__nav-btn vaango-prod-modal__nav-btn--prev"
                    onClick={handlePrevImage}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    className="vaango-prod-modal__nav-btn vaango-prod-modal__nav-btn--next"
                    onClick={handleNextImage}
                    aria-label="Next photo"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="vaango-prod-modal__placeholder">
              <span>{product.name.charAt(0).toUpperCase()}</span>
            </div>
          )}

          {/* Dots Indicator */}
          {allImages.length > 1 && (
            <div className="vaango-prod-modal__dots">
              {allImages.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`vaango-prod-modal__dot ${activeImageIndex === idx ? 'vaango-prod-modal__dot--active' : ''}`}
                  onClick={() => setActiveImageIndex(idx)}
                  aria-label={`Photo ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Product Details Header */}
        <div className="vaango-prod-modal__info">
          <div className="vaango-prod-modal__header">
            <h2 className="vaango-prod-modal__title">{product.name} {effectiveUnit ? `(${effectiveUnit})` : ''}</h2>
          </div>

          {/* Price & Rating Row (Reference Image 4) */}
          <div className="vaango-prod-modal__price-row">
            <div className="vaango-prod-modal__price-group">
              <span className="vaango-prod-modal__price">₹{effectivePrice}</span>
              <span className="vaango-prod-modal__original-price">₹{originalPrice}</span>
              <span className="vaango-prod-modal__discount-tag">20% OFF</span>
            </div>
            <div className="vaango-prod-modal__rating-pill">
              <Star size={13} fill="#EAB308" color="#EAB308" />
              <span className="vaango-prod-modal__rating-val">4.6</span>
              <span className="vaango-prod-modal__rating-cnt">(42)</span>
            </div>
          </div>

          {/* Short Description */}
          {product.description && (
            <p className="vaango-prod-modal__desc">{product.description}</p>
          )}

          {/* Available Options (Reference Image 4) */}
          {product.has_variants && product.variants && product.variants.length > 0 && (
            <div className="vaango-prod-modal__section">
              <h4 className="vaango-prod-modal__section-title">Available Options</h4>
              <div className="vaango-prod-modal__options-grid" role="group" aria-label="Product options">
                {hasAttributeVariants ? (
                  Object.entries(variantGroups).map(([attributeName, options]) => (
                    <div key={attributeName} className="vaango-prod-modal__attribute-group">
                      <span className="vaango-prod-modal__attr-label">{attributeName}:</span>
                      <div className="vaango-prod-modal__attr-chips">
                        {options.map((option) => {
                          const reachable = optionIsReachable(product.variants || [], selectedAttributes, attributeName, option);
                          return (
                            <button
                              key={option}
                              type="button"
                              disabled={!reachable}
                              className={`vaango-prod-modal__option-chip ${selectedAttributes[attributeName] === option ? 'vaango-prod-modal__option-chip--active' : ''}`}
                              onClick={() => setSelectedAttributes((current) => ({ ...current, [attributeName]: option }))}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  product.variants.map((v) => {
                    const isSelected = selectedVariant?.id === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={!variantIsAvailable(v)}
                        className={`vaango-prod-modal__option-chip ${isSelected ? 'vaango-prod-modal__option-chip--active' : ''}`}
                        onClick={() => setSelectedVariant(v)}
                      >
                        <span className="vaango-prod-modal__option-name">{variantLabel(v)}</span>
                        <span className="vaango-prod-modal__option-price">₹{v.price}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Shop Mini Card (Reference Image 4) */}
          {currentShop && (
            <div className="vaango-prod-modal__shop-card">
              <div className="vaango-prod-modal__shop-avatar">
                {currentShop.photo_url ? (
                  <img src={currentShop.photo_url} alt={currentShop.name} />
                ) : (
                  <span>{currentShop.name.charAt(0)}</span>
                )}
              </div>
              <div className="vaango-prod-modal__shop-info">
                <h5 className="vaango-prod-modal__shop-name">{currentShop.name}</h5>
                <div className="vaango-prod-modal__shop-meta">
                  <div className="vaango-prod-modal__shop-rating">
                    <Star size={12} fill="#EAB308" color="#EAB308" />
                    <span>{currentShop.rating || 4.5}</span>
                    <span className="text-secondary">({currentShop.review_count || 120})</span>
                  </div>
                  <span>·</span>
                  <div className="vaango-prod-modal__shop-dist">
                    <MapPin size={12} />
                    <span>{currentShop.distance_km != null ? `${currentShop.distance_km} km` : '0.8 km'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Delivery / Pickup Info Pill */}
          <div className="vaango-prod-modal__delivery-pill">
            {currentShop?.delivery_available ? (
              <>
                <Truck size={14} className="text-secondary" />
                <span>
                  Delivery in 30–45 mins ·{' '}
                  {currentShop.free_delivery_above != null && Number(currentShop.free_delivery_above) > 0
                    ? `Free delivery above ₹${currentShop.free_delivery_above}`
                    : Number(currentShop.delivery_fee) === 0
                    ? 'Free delivery'
                    : `₹${currentShop.delivery_fee} delivery fee`}
                </span>
              </>
            ) : (
              <>
                <Store size={14} className="text-secondary" />
                <span>Counter Pickup Only</span>
              </>
            )}
          </div>

          {/* Quantity Controls & Add to Cart (Reference Image 4) */}
          <div className="vaango-prod-modal__cta-row">
            {!isOutOfStock ? (
              <>
                <div className="vaango-qty-control" role="group" aria-label="Quantity">
                  <button
                    type="button"
                    className="vaango-qty-btn"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Decrease quantity"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="vaango-qty-display">{quantity}</span>
                  <button
                    type="button"
                    className="vaango-qty-btn"
                    onClick={() => setQuantity((q) => selectedStock == null ? q + 1 : Math.min(selectedStock, q + 1))}
                    aria-label="Increase quantity"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  className="vaango-prod-modal__add-btn"
                  onClick={handleAdd}
                  leftIcon={<ShoppingCart size={18} />}
                >
                  {hasVariants && !resolvedVariant
                    ? 'Please Select Option'
                    : `${t('add') || 'Add to Cart'}`}
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="lg" fullWidth disabled leftIcon={<PackageX size={18} />}>
                {t('outOfStock')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
