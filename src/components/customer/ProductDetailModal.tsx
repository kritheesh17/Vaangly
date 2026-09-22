import React, { useState } from 'react';
import { ShopProduct, ProductVariant } from '../../types/database';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ChevronLeft, ChevronRight, Plus, Minus, PackageX, Check } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import './ProductDetailModal.css';

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
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [imageError, setImageError] = useState<Record<number, boolean>>({});

  // Reset state when product changes
  React.useEffect(() => {
    if (product) {
      setActiveImageIndex(0);
      setImageError({});
      setQuantity(1);
      if (product.has_variants && product.variants?.length) {
        const defaultVar = product.variants.find((v) => v.in_stock) || product.variants[0];
        setSelectedVariant(defaultVar || null);
      } else {
        setSelectedVariant(null);
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

  const effectivePrice = selectedVariant ? selectedVariant.price : product.price;
  const effectiveUnit = selectedVariant ? selectedVariant.label : product.unit;

  const handlePrevImage = () => {
    setActiveImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setActiveImageIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  const handleAdd = () => {
    onAddToCart(product, selectedVariant, quantity);
    onClose();
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
              <h4 className="vaango-prod-modal__section-title">Select Size / Option:</h4>
              <div className="vaango-prod-modal__variants-list" role="group" aria-label="Product options">
                {product.variants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={!v.in_stock}
                      className={`vaango-variant-chip ${isSelected ? 'vaango-variant-chip--active' : ''} ${!v.in_stock ? 'vaango-variant-chip--out-of-stock' : ''}`}
                      onClick={() => setSelectedVariant(v)}
                    >
                      <span className="vaango-variant-chip__label">{v.label}</span>
                      <span className="vaango-variant-chip__price">₹{v.price}</span>
                      {isSelected && <Check size={14} className="vaango-variant-chip__check" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity Controls & Add to Cart */}
          <div className="vaango-prod-modal__cta-row">
            {product.is_available && (!selectedVariant || selectedVariant.in_stock) ? (
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
                    onClick={() => setQuantity((q) => q + 1)}
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
                  {t('add')} · ₹{effectivePrice * quantity}
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
