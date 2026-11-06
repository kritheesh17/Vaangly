import React, { useState, useEffect, useMemo } from 'react';
import { ShopProduct, ProductVariant } from '../../types/database';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  PackageX,
  Star,
  MapPin,
  Truck,
  ShoppingCart,
  Store,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useCart } from '../../context/CartContext';
import './ProductDetailModal.css';
import {
  findVariantForSelections,
  optionIsReachable,
  variantAttributeGroups,
  variantIsAvailable,
  variantLabel,
  formatCleanVariantLabel,
  isVisualAttribute,
  isMeasurementAttribute,
} from '../../lib/productVariants';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ShopProduct | null;
  shop?: any;
  onAddToCart: (product: ShopProduct, variant?: ProductVariant | null, quantity?: number) => void;
  currentCartQty?: number;
  initialVariant?: ProductVariant | null;
  initialAttributes?: Record<string, string>;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  isOpen,
  onClose,
  product,
  shop: propShop,
  onAddToCart,
  currentCartQty: _currentCartQty = 0,
  initialVariant,
  initialAttributes,
}) => {
  const { t } = useLanguage();
  const { activeShop } = useCart();
  const { success, warning, error: toastError } = useToast();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const currentShop = propShop || activeShop;

  // Reset state when product changes or modal opens
  useEffect(() => {
    if (product && isOpen) {
      setActiveImageIndex(0);
      setImageErrors({});
      setQuantity(1);
      if (product.has_variants && product.variants?.length) {
        const defaultVar =
          initialVariant ||
          (initialAttributes && Object.keys(initialAttributes).length > 0
            ? findVariantForSelections(product.variants, initialAttributes)
            : null) ||
          product.variants.find(variantIsAvailable) ||
          product.variants[0];
        setSelectedVariant(defaultVar || null);
        setSelectedAttributes(initialAttributes || defaultVar?.attributes || {});
      } else {
        setSelectedVariant(null);
        setSelectedAttributes({});
      }
    }
  }, [product?.id, isOpen]);

  const variantGroups = useMemo(
    () => variantAttributeGroups(product?.variants || []),
    [product?.variants]
  );
  const hasAttributeVariants = Object.keys(variantGroups).length > 0;
  const hasVariants = Boolean(product?.has_variants && product?.variants && product.variants.length > 0);
  const resolvedVariant = hasVariants
    ? (hasAttributeVariants
        ? findVariantForSelections(product?.variants || [], selectedAttributes)
        : selectedVariant)
    : null;

  // Base general photos of the product (deduplicated)
  const baseProductImages = useMemo(() => {
    if (!product) return [];
    const list: string[] = [];
    if (product.image_urls && product.image_urls.length > 0) {
      product.image_urls.forEach((url) => {
        if (url && !list.includes(url) && !url.startsWith('blob:')) {
          list.push(url);
        }
      });
    }
    if (product.image_url && !list.includes(product.image_url) && !product.image_url.startsWith('blob:')) {
      list.push(product.image_url);
    }
    return list;
  }, [product?.image_urls, product?.image_url]);

  // Gallery for currently selected variant:
  // Shows variant's specific photo first (if present), followed by base product photos.
  // Other unrelated variants' photos are excluded.
  const activeGalleryImages = useMemo(() => {
    if (!product) return [];
    const list: string[] = [];
    const variantImg = resolvedVariant?.image_url;
    if (variantImg && !variantImg.startsWith('blob:')) {
      list.push(variantImg);
    }
    baseProductImages.forEach((url) => {
      if (!list.includes(url)) {
        list.push(url);
      }
    });
    // Fallback if no images found yet (e.g. legacy variants without base images)
    if (list.length === 0 && product.variants?.length) {
      product.variants.forEach((v) => {
        if (v.image_url && !list.includes(v.image_url) && !v.image_url.startsWith('blob:')) {
          list.push(v.image_url);
        }
      });
    }
    return list;
  }, [resolvedVariant?.image_url, baseProductImages, product?.variants]);

  // Reset gallery to index 0 whenever the selected variant changes
  useEffect(() => {
    setActiveImageIndex(0);
  }, [resolvedVariant?.id, resolvedVariant?.image_url]);

  const effectivePrice = resolvedVariant ? resolvedVariant.price : (product?.price ?? 0);
  const effectiveUnit = resolvedVariant ? formatCleanVariantLabel(resolvedVariant) : (product?.unit ?? 'item');
  const selectedStock = resolvedVariant?.stock_quantity ?? product?.stock_quantity;
  const isOutOfStock =
    !product?.is_available ||
    (hasVariants && resolvedVariant !== null && !variantIsAvailable(resolvedVariant)) ||
    (Boolean(product?.track_inventory) && product?.stock_quantity != null && product.stock_quantity <= 0);

  const isSelectionIncomplete = hasVariants && !resolvedVariant;
  const originalPrice = Math.round(effectivePrice * 1.25);

  // Clamp quantity if stock constraint applies
  useEffect(() => {
    if (selectedStock != null && selectedStock > 0 && quantity > selectedStock) {
      setQuantity(selectedStock);
    }
  }, [selectedStock, quantity]);

  const handlePrevImage = () => {
    if (activeGalleryImages.length <= 1) return;
    setActiveImageIndex((prev) => (prev === 0 ? activeGalleryImages.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    if (activeGalleryImages.length <= 1) return;
    setActiveImageIndex((prev) => (prev === activeGalleryImages.length - 1 ? 0 : prev + 1));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        handlePrevImage();
      } else {
        handleNextImage();
      }
    }
    setTouchStartX(null);
  };

  const handleImageError = (url: string) => {
    setImageErrors((prev) => ({ ...prev, [url]: true }));
  };

  const safeImageIndex = activeGalleryImages.length > 0
    ? Math.min(Math.max(0, activeImageIndex), activeGalleryImages.length - 1)
    : 0;

  const currentDisplayUrl = activeGalleryImages[safeImageIndex] || null;
  const isCurrentImgError = Boolean(currentDisplayUrl && imageErrors[currentDisplayUrl]);
  const fallbackDisplayUrl = activeGalleryImages.find((u) => !imageErrors[u]) || product?.image_url || null;

  const getOptionThumbnail = (attrName: string, optVal: string): string | null => {
    if (!product?.variants) return null;
    const match = product.variants.find(
      (v) => v.attributes && v.attributes[attrName] === optVal && v.image_url
    );
    return match?.image_url || null;
  };

  const getOptionPrice = (attrName: string, optVal: string): number | null => {
    if (!product?.variants) return null;
    const matchingVariant = product.variants.find((v) => {
      const attrs = v.attributes || {};
      if (attrs[attrName] !== optVal) return false;
      return Object.entries(selectedAttributes).every(
        ([k, val]) => k === attrName || attrs[k] === val
      );
    });
    if (matchingVariant) return matchingVariant.price;
    const anyVariant = product.variants.find((v) => v.attributes && v.attributes[attrName] === optVal);
    return anyVariant ? anyVariant.price : null;
  };

  const handleAttributeSelect = (attrName: string, optVal: string) => {
    const nextSelections = { ...selectedAttributes, [attrName]: optVal };
    setSelectedAttributes(nextSelections);
  };

  const handleAdd = () => {
    if (!product) return;
    if (isSelectionIncomplete) {
      warning('Please choose an available product option.');
      return;
    }
    if (isOutOfStock) {
      toastError('This item or option is currently out of stock.');
      return;
    }

    const productToAdd = resolvedVariant
      ? { ...product, price: resolvedVariant.price, unit: formatCleanVariantLabel(resolvedVariant) }
      : product;

    try {
      onAddToCart(productToAdd, resolvedVariant, quantity);
      success(`${productToAdd.name} added to cart`);
      onClose();
    } catch (err: any) {
      toastError('Unable to add this product. Please try again.');
    }
  };

  if (!product) return null;

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
          {activeGalleryImages.length > 0 ? (
            <div
              className="vaango-prod-modal__main-image-wrap"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {currentDisplayUrl && !isCurrentImgError ? (
                <img
                  key={currentDisplayUrl}
                  src={currentDisplayUrl}
                  alt={`${product.name} - View ${safeImageIndex + 1}`}
                  className="vaango-prod-modal__main-image"
                  onError={() => handleImageError(currentDisplayUrl)}
                />
              ) : fallbackDisplayUrl && !imageErrors[fallbackDisplayUrl] ? (
                <img
                  key={fallbackDisplayUrl}
                  src={fallbackDisplayUrl}
                  alt={`${product.name} - Alternate view`}
                  className="vaango-prod-modal__main-image"
                />
              ) : (
                <div className="vaango-prod-modal__placeholder">
                  <span>{product.name.charAt(0).toUpperCase()}</span>
                </div>
              )}

              {/* Prev / Next controls: ALWAYS RENDERED inside main-image-wrap when multiple images exist */}
              {activeGalleryImages.length > 1 && (
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
          {activeGalleryImages.length > 1 && (
            <div className="vaango-prod-modal__dots">
              {activeGalleryImages.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`vaango-prod-modal__dot ${safeImageIndex === idx ? 'vaango-prod-modal__dot--active' : ''}`}
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
            <h2 className="vaango-prod-modal__title">
              {product.name} {effectiveUnit ? `(${effectiveUnit})` : ''}
            </h2>
          </div>

          {/* Price & Rating Row */}
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

          {/* Available Options (Flipkart-Inspired Variant Selector) */}
          {hasVariants && (
            <div className="vaango-prod-modal__section">
              <div className="vaango-prod-modal__section-header">
                <h4 className="vaango-prod-modal__section-title">Select Options</h4>
                {resolvedVariant && (
                  <span className="vaango-prod-modal__selected-pill">
                    {formatCleanVariantLabel(resolvedVariant)}
                  </span>
                )}
              </div>

              <div className="vaango-prod-modal__options-grid" role="group" aria-label="Product options">
                {hasAttributeVariants ? (
                  Object.entries(variantGroups).map(([attributeName, options]) => {
                    const isVisual = isVisualAttribute(attributeName);
                    const isMeasurement = isMeasurementAttribute(attributeName);
                    const isLongList = options.length > 6;

                    return (
                      <div key={attributeName} className="vaango-prod-modal__attribute-group">
                        <div className="vaango-prod-modal__attr-header">
                          <span className="vaango-prod-modal__attr-label">{attributeName}:</span>
                          <span className="vaango-prod-modal__attr-current">
                            {selectedAttributes[attributeName] || 'Choose'}
                          </span>
                        </div>

                        {isLongList ? (
                          <div className="vaango-prod-modal__select-wrap">
                            <select
                              className="vaango-prod-modal__select"
                              value={selectedAttributes[attributeName] || ''}
                              onChange={(e) => handleAttributeSelect(attributeName, e.target.value)}
                              aria-label={`Select ${attributeName}`}
                            >
                              <option value="" disabled>Select {attributeName}</option>
                              {options.map((option) => {
                                const reachable = optionIsReachable(product.variants || [], selectedAttributes, attributeName, option);
                                return (
                                  <option key={option} value={option} disabled={!reachable}>
                                    {option} {!reachable ? '(Out of stock)' : ''}
                                  </option>
                                );
                              })}
                            </select>
                            <ChevronDown size={16} className="vaango-prod-modal__select-icon" />
                          </div>
                        ) : isVisual ? (
                          <div className="vaango-prod-modal__swatch-row">
                            {options.map((option) => {
                              const reachable = optionIsReachable(product.variants || [], selectedAttributes, attributeName, option);
                              const isSelected = selectedAttributes[attributeName] === option;
                              const thumbnail = getOptionThumbnail(attributeName, option);

                              return (
                                <button
                                  key={option}
                                  type="button"
                                  disabled={!reachable}
                                  className={`vaango-prod-modal__swatch-btn ${isSelected ? 'vaango-prod-modal__swatch-btn--active' : ''} ${!reachable ? 'vaango-prod-modal__chip--disabled' : ''}`}
                                  onClick={() => handleAttributeSelect(attributeName, option)}
                                  title={`${attributeName}: ${option}`}
                                >
                                  {thumbnail ? (
                                    <span className="vaango-prod-modal__swatch-img-box">
                                      <img src={thumbnail} alt={option} />
                                    </span>
                                  ) : (
                                    <span className="vaango-prod-modal__swatch-color-fallback">
                                      {option.slice(0, 2).toUpperCase()}
                                    </span>
                                  )}
                                  <span className="vaango-prod-modal__swatch-name">{option}</span>
                                  {isSelected && <Check size={12} className="vaango-prod-modal__swatch-check" />}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="vaango-prod-modal__pill-row">
                            {options.map((option) => {
                              const reachable = optionIsReachable(product.variants || [], selectedAttributes, attributeName, option);
                              const isSelected = selectedAttributes[attributeName] === option;
                              const optPrice = getOptionPrice(attributeName, option);

                              return (
                                <button
                                  key={option}
                                  type="button"
                                  disabled={!reachable}
                                  className={`vaango-prod-modal__pill-btn ${isSelected ? 'vaango-prod-modal__pill-btn--active' : ''} ${!reachable ? 'vaango-prod-modal__chip--disabled' : ''}`}
                                  onClick={() => handleAttributeSelect(attributeName, option)}
                                >
                                  <span className="vaango-prod-modal__pill-val">{option}</span>
                                  {isMeasurement && optPrice != null && (
                                    <span className="vaango-prod-modal__pill-price">₹{optPrice}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  /* Legacy or Single List of Variants */
                  <div className="vaango-prod-modal__pill-row">
                    {(product.variants || []).map((v) => {
                      const isSelected = selectedVariant?.id === v.id;
                      const isVarAvail = variantIsAvailable(v);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={!isVarAvail}
                          className={`vaango-prod-modal__pill-btn ${isSelected ? 'vaango-prod-modal__pill-btn--active' : ''} ${!isVarAvail ? 'vaango-prod-modal__chip--disabled' : ''}`}
                          onClick={() => {
                            setSelectedVariant(v);
                            setActiveImageIndex(0);
                          }}
                        >
                          <span className="vaango-prod-modal__pill-val">{variantLabel(v)}</span>
                          <span className="vaango-prod-modal__pill-price">₹{v.price}</span>
                          {!isVarAvail && <span className="vaango-prod-modal__pill-out">Out</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Shop Mini Card */}
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

          {/* Selection Summary Pill */}
          {hasVariants && (
            <div className={`vaango-prod-modal__selection-summary ${isOutOfStock ? 'vaango-prod-modal__selection-summary--out' : ''}`}>
              <div className="vaango-prod-modal__summary-col">
                <span className="vaango-prod-modal__summary-tag">Selected</span>
                <span className="vaango-prod-modal__summary-text">
                  {resolvedVariant ? formatCleanVariantLabel(resolvedVariant) : 'No option chosen'}
                </span>
              </div>
              <div className="vaango-prod-modal__summary-right">
                {resolvedVariant && (
                  <span className="vaango-prod-modal__summary-price">₹{effectivePrice}</span>
                )}
                <span className={`vaango-prod-modal__summary-stock ${isOutOfStock ? 'is-out' : 'is-in'}`}>
                  {isOutOfStock ? 'Out of Stock' : (selectedStock != null ? `${selectedStock} in stock` : 'In Stock')}
                </span>
              </div>
            </div>
          )}

          {/* Quantity Controls & Add to Cart */}
          <div className="vaango-prod-modal__cta-row">
            {!isOutOfStock && !isSelectionIncomplete ? (
              <>
                <div className="vaango-qty-control" role="group" aria-label="Quantity">
                  <button
                    type="button"
                    className="vaango-qty-btn"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Decrease quantity"
                    disabled={quantity <= 1}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="vaango-qty-display">{quantity}</span>
                  <button
                    type="button"
                    className="vaango-qty-btn"
                    onClick={() => setQuantity((q) => selectedStock == null ? q + 1 : Math.min(selectedStock, q + 1))}
                    aria-label="Increase quantity"
                    disabled={selectedStock != null && quantity >= selectedStock}
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
                  {t('add') || 'Add to Cart'}
                </Button>
              </>
            ) : isSelectionIncomplete ? (
              <Button variant="secondary" size="lg" fullWidth disabled>
                Select an Option
              </Button>
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
