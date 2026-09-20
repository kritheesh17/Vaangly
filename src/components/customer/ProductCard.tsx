import React from 'react';
import { ShopProduct } from '../../types/database';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Plus, Minus, PackageX } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import './ProductCard.css';

export interface ProductCardProps {
  product: ShopProduct;
  quantityInCart: number;
  onAdd: (product?: ShopProduct) => void;
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
  const [activeImageIndex, setActiveImageIndex] = React.useState(0);
  const [selectedVariantId, setSelectedVariantId] = React.useState<string | null>(null);
  const [selectedAttributes, setSelectedAttributes] = React.useState<Record<string, string>>({});
  const selectedVariant = product.has_variants ? product.variants?.find((variant) => variant.id === selectedVariantId) : null;
  const selectedProduct = selectedVariant ? { ...product, price: selectedVariant.price, unit: selectedVariant.label } : product;
  const attributesReady = !product.attribute_groups?.length || product.attribute_groups.every((group) => selectedAttributes[group.name]);
  const attributeUnit = product.attribute_groups?.length ? Object.values(selectedAttributes).join(' / ') : product.unit;
  return (
    <div className={`vaango-prod-card ${!product.is_available ? 'vaango-prod-card--out-of-stock' : ''}`}>
      {/* Product Image Thumbnail */}
      <div className="vaango-prod-card__media">
        {(product.image_urls?.length || product.image_url) ? (
          <div className="vaango-product-img-wrap">
            <img src={(product.image_urls?.length ? product.image_urls : [product.image_url]).filter(Boolean)[activeImageIndex] || product.image_url || ''} alt={product.name} className="vaango-prod-card__img" loading="lazy" />
            {(product.image_urls?.length || 0) > 1 && <div className="vaango-product-img-dots">{product.image_urls!.map((_, index) => <button key={index} type="button" className={`vaango-img-dot ${activeImageIndex === index ? 'vaango-img-dot--active' : ''}`} onClick={() => setActiveImageIndex(index)} aria-label={`Photo ${index + 1}`} />)}</div>}
          </div>
        ) : (
          <div className="vaango-prod-card__placeholder">
            <span>{product.name.charAt(0)}</span>
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
        <div className="vaango-prod-card__header">
          <h4 className="vaango-prod-card__name">{product.name}</h4>
          {product.offer_label && <Badge variant="accent" size="sm">{product.offer_label}</Badge>}
          {product.description && (
            <p className="vaango-prod-card__desc">{product.description}</p>
          )}
        </div>

        <div className="vaango-prod-card__price-row">
          <div className="vaango-prod-card__price-wrap">
            <span className="vaango-prod-card__price">₹{selectedProduct.price}</span>
            <span className="vaango-prod-card__unit">/ {selectedProduct.unit}</span>
          </div>

          {/* Action: Add Button OR Quantity Controls */}
          <div className="vaango-prod-card__action">
            {product.has_variants ? (
              <div className="vaango-product-variants" role="group" aria-label={product.name}>
                {product.variants?.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={!variant.in_stock}
                    className={selectedVariantId === variant.id ? 'active' : ''}
                    onClick={() => setSelectedVariantId(variant.id)}
                  >
                    ₹{variant.price} {variant.label}
                  </button>
                ))}
                <Button
                  variant="primary"
                  size="md"
                  disabled={!selectedVariant || !product.is_available}
                  onClick={() => onAdd(selectedProduct)}
                  leftIcon={<Plus size={16} />}
                >
                  {t('add')} ₹{selectedProduct.price}
                </Button>
              </div>
            ) : product.attribute_groups?.length ? (
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
                  onClick={() => onAdd({ ...product, unit: attributeUnit })}
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
                onClick={() => onAdd()}
                leftIcon={<Plus size={16} />}
                className="vaango-prod-card__add-btn"
              >
                {t('add')}
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
        {product.offer_type === 'bogo' && quantityInCart > 0 && (
          <p className="vaango-prod-card__offer-note">{t('bogoNotice')}</p>
        )}
      </div>
    </div>
  );
};
