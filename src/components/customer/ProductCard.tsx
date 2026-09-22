import React, { useState } from 'react';
import { ShopProduct, ProductVariant } from '../../types/database';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Plus, Minus, PackageX, Eye } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ProductDetailModal } from './ProductDetailModal';
import { findVariantForSelections, optionIsReachable, variantAttributeGroups, variantIsAvailable, variantLabel } from '../../lib/productVariants';
import './ProductCard.css';

export interface ProductCardProps {
  product: ShopProduct;
  quantityInCart: number;
  getVariantQuantity?: (variantId?: string | null) => number;
  onAdd: (product?: ShopProduct, variant?: ProductVariant | null) => void;
  onIncrease: (variant?: ProductVariant | null) => void;
  onDecrease: (variant?: ProductVariant | null) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  quantityInCart,
  getVariantQuantity,
  onAdd,
  onIncrease,
  onDecrease,
}) => {
  const { t } = useLanguage();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const availableVariants = product.variants || [];
  const defaultVariant = availableVariants.find(variantIsAvailable) || availableVariants[0] || null;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(defaultVariant?.id || null);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>(defaultVariant?.attributes || {});
  const variantGroups = variantAttributeGroups(availableVariants);
  const selectedVariant = availableVariants.some((variant) => variant.attributes && Object.keys(variant.attributes).length > 0)
    ? findVariantForSelections(availableVariants, selectedAttributes)
    : availableVariants.find((variant) => variant.id === selectedVariantId) || null;

  const selectedProduct = selectedVariant
    ? { ...product, price: selectedVariant.price, unit: variantLabel(selectedVariant) }
    : product;
  const currentQuantity = getVariantQuantity ? getVariantQuantity(selectedVariant?.id || null) : quantityInCart;

  const validImages: string[] = [];
  if (product.image_urls && product.image_urls.length > 0) {
    product.image_urls.forEach((u) => {
      if (u && !u.startsWith('blob:') && !validImages.includes(u)) validImages.push(u);
    });
  }
  if (product.image_url && !product.image_url.startsWith('blob:') && !validImages.includes(product.image_url)) {
    validImages.push(product.image_url);
  }

  const currentDisplayImage = validImages[activeImageIndex] || validImages[0] || null;

  return (
    <>
      <div className={`vaango-prod-card ${!product.is_available ? 'vaango-prod-card--out-of-stock' : ''}`}>
        {/* Product Image Thumbnail */}
        <div
          className="vaango-prod-card__media vaango-prod-card__clickable-header"
          onClick={() => setIsDetailModalOpen(true)}
          role="button"
          tabIndex={0}
          aria-label={`View details for ${product.name}`}
          onKeyDown={(e) => { if (e.key === 'Enter') setIsDetailModalOpen(true); }}
        >
          {currentDisplayImage && !imageError ? (
            <div className="vaango-product-img-wrap">
              <img
                src={currentDisplayImage}
                alt={product.name}
                className="vaango-prod-card__img"
                loading="lazy"
                onError={() => setImageError(true)}
              />
              {validImages.length > 1 && (
                <div className="vaango-product-img-dots">
                  {validImages.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`vaango-img-dot ${activeImageIndex === index ? 'vaango-img-dot--active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex(index);
                      }}
                      aria-label={`Photo ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="vaango-prod-card__placeholder">
              <span>{product.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          {!product.is_available && (
            <div className="vaango-prod-card__stock-overlay">
              <Badge variant="error" size="sm">
                {t('outOfStock')}
              </Badge>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="vaango-prod-card__details">
          <div
            className="vaango-prod-card__header vaango-prod-card__clickable-header"
            onClick={() => setIsDetailModalOpen(true)}
          >
            <h4 className="vaango-prod-card__name">{product.name}</h4>
            {product.offer_label && <Badge variant="accent" size="sm">{product.offer_label}</Badge>}
            {product.description && (
              <p className="vaango-prod-card__desc">{product.description}</p>
            )}
          </div>

          {/* Variants selector chips */}
          {product.has_variants && availableVariants.length > 0 && (
            <div className="vaango-product-variants" role="group" aria-label={product.name}>
              {Object.entries(variantGroups).map(([attributeName, options]) => (
                <div key={attributeName}>
                  <strong>{attributeName}</strong>
                  {options.map((option) => {
                    const reachable = optionIsReachable(availableVariants, selectedAttributes, attributeName, option);
                    return <button key={option} type="button" disabled={!reachable} className={selectedAttributes[attributeName] === option ? 'active' : ''} onClick={() => setSelectedAttributes((current) => ({ ...current, [attributeName]: option }))}>{option}</button>;
                  })}
                </div>
              ))}
              {!Object.keys(variantGroups).length && availableVariants.map((variant) => <button key={variant.id} type="button" disabled={!variantIsAvailable(variant)} className={selectedVariant?.id === variant.id ? 'active' : ''} onClick={() => setSelectedVariantId(variant.id)}>{variantLabel(variant)} · ₹{variant.price}</button>)}
            </div>
          )}

          <div className="vaango-prod-card__price-row">
            <div className="vaango-prod-card__price-wrap">
              <span className="vaango-prod-card__price">₹{selectedProduct.price}</span>
              <span className="vaango-prod-card__unit">/ {selectedProduct.unit}</span>
            </div>

            {/* Action: Add Button OR Quantity Controls */}
            <div className="vaango-prod-card__action">
              {!product.is_available || (product.has_variants && (!selectedVariant || !variantIsAvailable(selectedVariant))) ? (
                <Button variant="secondary" size="md" disabled leftIcon={<PackageX size={16} />}>
                  {t('outOfStock')}
                </Button>
              ) : currentQuantity === 0 ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => onAdd(selectedProduct, selectedVariant)}
                  leftIcon={<Plus size={16} />}
                  className="vaango-prod-card__add-btn"
                >
                  {t('add')} ₹{selectedProduct.price}
                </Button>
              ) : (
                <div className="vaango-qty-control" role="group" aria-label={product.name}>
                  <button
                    type="button"
                    className="vaango-qty-btn"
                    onClick={() => onDecrease(selectedVariant)}
                    aria-label={t('decreaseQty')}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="vaango-qty-display" aria-live="polite">
                    {currentQuantity}
                  </span>
                  <button
                    type="button"
                    className="vaango-qty-btn"
                    onClick={() => onIncrease(selectedVariant)}
                    aria-label={t('increaseQty')}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="vaango-prod-card__details-btn"
            onClick={() => setIsDetailModalOpen(true)}
          >
            <Eye size={12} style={{ display: 'inline', marginRight: 4 }} />
            View details & all images
          </button>
        </div>
      </div>

      {/* Product Detail Modal with Multi-Image Gallery */}
      <ProductDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        product={product}
        currentCartQty={quantityInCart}
        onAddToCart={(prod, variant, qty) => {
          for (let i = 0; i < (qty || 1); i++) {
            onAdd(prod, variant);
          }
        }}
      />
    </>
  );
};
