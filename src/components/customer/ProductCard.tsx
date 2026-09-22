import React, { useState } from 'react';
import { ShopProduct, ProductVariant } from '../../types/database';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Plus, Minus, PackageX, Eye } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ProductDetailModal } from './ProductDetailModal';
import './ProductCard.css';

export interface ProductCardProps {
  product: ShopProduct;
  quantityInCart: number;
  onAdd: (product?: ShopProduct, variant?: ProductVariant | null) => void;
  onIncrease: () => void;
  onDecrease: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  quantityInCart,
  onAdd,
  onIncrease,
  onDecrease,
}) => {
  const { t } = useLanguage();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Auto-select first in-stock variant by default
  const defaultVariantId = product.has_variants && product.variants?.length
    ? (product.variants.find((v) => v.in_stock)?.id || product.variants[0]?.id || null)
    : null;

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(defaultVariantId);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});

  const selectedVariant = product.has_variants
    ? product.variants?.find((variant) => variant.id === (selectedVariantId || defaultVariantId)) || null
    : null;

  const selectedProduct = selectedVariant
    ? { ...product, price: selectedVariant.price, unit: selectedVariant.label }
    : product;

  const attributesReady = !product.attribute_groups?.length || product.attribute_groups.every((group) => selectedAttributes[group.name]);
  const attributeUnit = product.attribute_groups?.length ? Object.values(selectedAttributes).join(' / ') : product.unit;

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
          {product.has_variants && product.variants && product.variants.length > 0 && (
            <div className="vaango-product-variants" role="group" aria-label={product.name}>
              {product.variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  disabled={!variant.in_stock}
                  className={(selectedVariant?.id || selectedVariantId) === variant.id ? 'active' : ''}
                  onClick={() => setSelectedVariantId(variant.id)}
                >
                  {variant.label} · ₹{variant.price}
                </button>
              ))}
            </div>
          )}

          <div className="vaango-prod-card__price-row">
            <div className="vaango-prod-card__price-wrap">
              <span className="vaango-prod-card__price">₹{selectedProduct.price}</span>
              <span className="vaango-prod-card__unit">/ {selectedProduct.unit}</span>
            </div>

            {/* Action: Add Button OR Quantity Controls */}
            <div className="vaango-prod-card__action">
              {product.attribute_groups?.length && !product.has_variants ? (
                <div className="vaango-product-variants">
                  {product.attribute_groups.map((group) => (
                    <select
                      key={group.name}
                      aria-label={group.name}
                      value={selectedAttributes[group.name] || ''}
                      onChange={(e) => setSelectedAttributes((current) => ({ ...current, [group.name]: e.target.value }))}
                    >
                      <option value="">{t('chooseOption')} {group.name}</option>
                      {group.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ))}
                  <Button
                    variant="primary"
                    size="md"
                    disabled={!attributesReady || !product.is_available}
                    onClick={() => onAdd({ ...product, unit: attributeUnit }, null)}
                    leftIcon={<Plus size={16} />}
                  >
                    {t('addToCart')}
                  </Button>
                </div>
              ) : !product.is_available ? (
                <Button variant="secondary" size="md" disabled leftIcon={<PackageX size={16} />}>
                  {t('outOfStock')}
                </Button>
              ) : quantityInCart === 0 ? (
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
                    onClick={onDecrease}
                    aria-label={t('decreaseQty')}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="vaango-qty-display" aria-live="polite">
                    {quantityInCart}
                  </span>
                  <button
                    type="button"
                    className="vaango-qty-btn"
                    onClick={onIncrease}
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
