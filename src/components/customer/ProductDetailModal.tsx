import React, { useState } from 'react';
import { ShopProduct, ProductVariant } from '../../types/database';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ChevronLeft, ChevronRight, Plus, Minus, PackageX } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import './ProductDetailModal.css';
import { findVariantForSelections, optionIsReachable, variantAttributeGroups, variantIsAvailable, variantLabel } from '../../lib/productVariants';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ShopProduct | null;
  onAddToCart: (product: ShopProduct, variant?: ProductVariant | null, quantity?: number) => void;
  currentCartQty?: number;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  isOpen,
  onClose,
  product,
  onAddToCart,
  currentCartQty: _currentCartQty = 0,
}) => {
  const { t } = useLanguage();
  const { success, warning, error: toastError } = useToast();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [imageError, setImageError] = useState<Record<number, boolean>>({});

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

  const handlePrevImage = () => {
    setActiveImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setActiveImageIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  const handleAdd = () => {
    if (hasVariants && !resolvedVariant) {
      warning('Please select a variant.');
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
      title={product.name}
      maxWidth="md"
    >
      <div className="vaango-prod-modal">
        {/* Top: Gallery / Carousel */}
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

          {/* Thumbnail Strip */}
          {allImages.length > 1 && (
            <div className="vaango-prod-modal__thumbnails">
              {allImages.map((imgUrl, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`vaango-prod-modal__thumb ${activeImageIndex === idx ? 'vaango-prod-modal__thumb--active' : ''}`}
                  onClick={() => setActiveImageIndex(idx)}
                  aria-label={`View photo ${idx + 1}`}
                >
                  <img src={imgUrl} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Details */}
        <div className="vaango-prod-modal__info">
          <div className="vaango-prod-modal__header">
            <h2 className="vaango-prod-modal__title">{product.name}</h2>
            <div className="vaango-prod-modal__badges">
              {product.is_available ? (
                <Badge variant="success" size="sm" withDot>In Stock</Badge>
              ) : (
                <Badge variant="error" size="sm">Out of Stock</Badge>
              )}
              {product.offer_label && (
                <Badge variant="accent" size="sm">{product.offer_label}</Badge>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="vaango-prod-modal__price-row">
            <span className="vaango-prod-modal__price">₹{effectivePrice}</span>
            <span className="vaango-prod-modal__unit">/ {effectiveUnit}</span>
          </div>

          {/* Description */}
          {product.description && (
            <div className="vaango-prod-modal__section">
              <h4 className="vaango-prod-modal__section-title">Product Description</h4>
              <p className="vaango-prod-modal__desc">{product.description}</p>
            </div>
          )}

          {/* Variants / Sizes */}
          {product.has_variants && product.variants && product.variants.length > 0 && (
            <div className="vaango-prod-modal__section">
              <h4 className="vaango-prod-modal__section-title">Select options:</h4>
              <div className="vaango-prod-modal__variants-list" role="group" aria-label="Product options">
                {hasAttributeVariants ? Object.entries(variantGroups).map(([attributeName, options]) => (
                  <div key={attributeName}>
                    <strong>{attributeName}</strong>
                    {options.map((option) => {
                      const reachable = optionIsReachable(product.variants || [], selectedAttributes, attributeName, option);
                      return <button key={option} type="button" disabled={!reachable} className={`vaango-variant-chip ${selectedAttributes[attributeName] === option ? 'vaango-variant-chip--active' : ''}`} onClick={() => setSelectedAttributes((current) => ({ ...current, [attributeName]: option }))}>{option}</button>;
                    })}
                  </div>
                )) : product.variants.map((v) => <button key={v.id} type="button" disabled={!variantIsAvailable(v)} className={`vaango-variant-chip ${selectedVariant?.id === v.id ? 'vaango-variant-chip--active' : ''}`} onClick={() => setSelectedVariant(v)}>{variantLabel(v)} · ₹{v.price}</button>)}
              </div>
            </div>
          )}

          {/* Quantity Controls & Add to Cart */}
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
                  fullWidth
                  onClick={handleAdd}
                  leftIcon={<Plus size={18} />}
                >
                  {hasVariants && !resolvedVariant
                    ? 'Please Select Variant'
                    : `${t('add')} · ₹${effectivePrice * quantity}`}
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
