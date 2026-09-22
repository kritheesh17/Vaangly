import React, { useState, useEffect } from 'react';
import { X, Image, AlertCircle, Check } from 'lucide-react';
import { ShopProduct, ProductAttributeGroup, ProductVariant } from '../../types/database';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { compressImage } from '../../lib/imageCompressor';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import './ProductFormModal.css';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (productData: {
    name: string;
    description: string;
    price: number;
    unit: string;
    is_available: boolean;
    image_url: string | null;
    image_urls: string[];
    offer_label: string | null;
    offer_type: ShopProduct['offer_type'];
    offer_value: number | null;
    has_variants?: boolean;
    variants?: ProductVariant[];
    attribute_groups?: ProductAttributeGroup[];
  }) => Promise<{ success: boolean; error?: string }>;
  initialProduct?: ShopProduct | null;
  shopId: string;
}

const COMMON_UNITS = [
  'kg',
  '500g',
  '250g',
  'pack',
  'piece',
  'box',
  'plate',
  'cup',
  'bottle',
  'item',
];

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialProduct,
  shopId,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('kg');
  const [customUnit, setCustomUnit] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageFilePreviews, setImageFilePreviews] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [offerLabel, setOfferLabel] = useState('');
  const [offerType, setOfferType] = useState<ShopProduct['offer_type']>(null);
  const [offerValue, setOfferValue] = useState('');
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [attributeGroups, setAttributeGroups] = useState<ProductAttributeGroup[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProduct) {
      setName(initialProduct.name);
      setDescription(initialProduct.description || '');
      setPrice(initialProduct.price.toString());
      if (COMMON_UNITS.includes(initialProduct.unit)) {
        setUnit(initialProduct.unit);
        setCustomUnit('');
      } else {
        setUnit('other');
        setCustomUnit(initialProduct.unit);
      }
      setIsAvailable(initialProduct.is_available);
      setImageUrl(initialProduct.image_url || '');
      setExistingImageUrls(initialProduct.image_urls?.length ? initialProduct.image_urls : initialProduct.image_url ? [initialProduct.image_url] : []);
      setImageFiles([]);
      setImageFilePreviews([]);
      setOfferLabel(initialProduct.offer_label || '');
      setOfferType(initialProduct.offer_type || null);
      setOfferValue(initialProduct.offer_value?.toString() || '');
      setHasVariants(Boolean(initialProduct.has_variants));
      setVariants(initialProduct.variants || []);
      setAttributeGroups(initialProduct.attribute_groups || []);
    } else {
      setName('');
      setDescription('');
      setPrice('');
      setUnit('kg');
      setCustomUnit('');
      setIsAvailable(true);
      setImageUrl('');
      setExistingImageUrls([]);
      setImageFiles([]);
      setImageFilePreviews([]);
      setOfferLabel('');
      setOfferType(null);
      setOfferValue('');
      setHasVariants(false);
      setVariants([]);
      setAttributeGroups([]);
    }
    setError(null);
  }, [initialProduct, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t('productNameRequired'));
      return;
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError(t('productPriceRequired'));
      return;
    }

    const finalUnit = unit === 'other' ? customUnit.trim() || 'item' : unit;

    setIsSubmitting(true);
    try {
      let activeUid = user?.id;
      let hasLiveAuthSession = false;
      if (isSupabaseConfigured) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user?.id) {
            activeUid = sessionData.session.user.id;
            hasLiveAuthSession = true;
          }
        } catch {
          // Ignore session fetch errors
        }
      }

      // Upload all product images concurrently with fast web optimization (960px, ~70KB each)
      const uploadedUrls: string[] = await Promise.all(
        imageFiles.map(async (rawFile, index) => {
          if (!isSupabaseConfigured || !hasLiveAuthSession) {
            throw new Error('Supabase storage session not active. Please log in again to upload photos.');
          }

          try {
            // Fast auto-compression: 960px @ 0.72 quality produces lightweight ~60-90KB photos in milliseconds
            const fileToUpload = await compressImage(rawFile, {
              maxDimension: 960,
              quality: 0.72,
              maxFileSizeMB: 10,
            });

            const uploadFolder = activeUid || shopId;
            const filePath = `${uploadFolder}/products/${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}.jpg`;
            const uploadPromise = supabase.storage.from('shop-photos').upload(filePath, fileToUpload, {
              upsert: true,
              contentType: 'image/jpeg',
            });

            // 15-second timeout
            const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
              setTimeout(() => resolve({ data: null, error: { message: 'Image upload timed out' } }), 15000)
            );

            const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
            if (uploadResult?.error) {
              console.error('Storage upload error:', uploadResult.error);
              throw new Error(`Failed to upload ${rawFile.name}: ${uploadResult.error.message}`);
            }
            return supabase.storage.from('shop-photos').getPublicUrl(filePath).data.publicUrl;
          } catch (uploadErr) {
            console.error('Image processing error:', uploadErr);
            throw uploadErr instanceof Error ? uploadErr : new Error('Failed to process and upload image.');
          }
        })
      );
      const allImageUrls = [...existingImageUrls, ...uploadedUrls].filter((url) => !url.startsWith('blob:'));
      const result = await onSubmit({
        name: name.trim(),
        description: description.trim(),
        price: parsedPrice,
        unit: finalUnit,
        is_available: isAvailable,
        image_url: allImageUrls[0] || imageUrl.trim() || null,
        image_urls: allImageUrls,
        offer_label: offerLabel.trim() || null,
        offer_type: offerType,
        offer_value: offerType && offerType !== 'bogo' ? (parseFloat(offerValue) || null) : null,
        has_variants: hasVariants,
        variants,
        attribute_groups: hasVariants ? [] : attributeGroups,
      });

      if (result.success) {
        onClose();
      } else {
        setError(result.error || t('genericError'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('genericError');
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="vaango-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
      <div className="vaango-modal-content vaango-product-modal">
        {/* Header */}
        <div className="vaango-product-modal__header">
          <h2 id="product-form-title" className="vaango-product-modal__title">
            {initialProduct ? t('editProductTitle') : t('addProductTitle')}
          </h2>
          <button
            type="button"
            className="vaango-product-modal__close-btn"
            onClick={onClose}
            aria-label={t('closeBtn')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="vaango-product-modal__error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="vaango-product-modal__form">
          {/* Product Name */}
          <div className="vaango-form-group">
            <label className="vaango-form-label" htmlFor="prod-name">
              {t('productNameLabel')} <span className="vaango-required">*</span>
            </label>
            <Input
              id="prod-name"
              placeholder={t('productNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Price & Unit Row */}
          <div className="vaango-product-modal__row">
            <div className="vaango-form-group">
              <label className="vaango-form-label" htmlFor="prod-price">
                {t('productPriceLabel')} <span className="vaango-required">*</span>
              </label>
              <Input
                id="prod-price"
                type="number"
                min="0"
                step="0.5"
                placeholder="e.g. 45"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label" htmlFor="prod-unit">
                {t('productUnitLabel')} <span className="vaango-required">*</span>
              </label>
              <select
                id="prod-unit"
                className="vaango-select-input"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    Per {u}
                  </option>
                ))}
                <option value="other">{t('otherCustomUnit')}</option>
              </select>
            </div>
          </div>

          {unit === 'other' && (
            <div className="vaango-form-group">
              <label className="vaango-form-label" htmlFor="prod-custom-unit">
                {t('customUnitNameLabel')}
              </label>
              <Input
                id="prod-custom-unit"
                placeholder={t('customUnitEgPlaceholder')}
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
              />
            </div>
          )}

          <label className="vaango-checkbox-row mt-3">
            <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} />
            {t('productVariantsOption')}
          </label>
          {hasVariants ? (
            <div className="vaango-form-group mt-2">
              {variants.map((variant) => (
                <div key={variant.id} className="vaango-product-modal__row">
                  <Input placeholder={t('variantLabelPlaceholder')} value={variant.label} onChange={(e) => setVariants((items) => items.map((item) => item.id === variant.id ? { ...item, label: e.target.value } : item))} />
                  <Input type="number" min="0" placeholder={t('pricePlaceholder')} value={variant.price} onChange={(e) => setVariants((items) => items.map((item) => item.id === variant.id ? { ...item, price: Number(e.target.value) } : item))} />
                  <label><input type="checkbox" checked={variant.in_stock} onChange={(e) => setVariants((items) => items.map((item) => item.id === variant.id ? { ...item, in_stock: e.target.checked } : item))} /> {t('inStock')}</label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setVariants((items) => items.filter((item) => item.id !== variant.id))}>{t('deleteItem')}</Button>
                </div>
              ))}
              {variants.length < 8 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setVariants((items) => [...items, { id: `variant-${Date.now()}`, label: '', price: Number(price) || 0, in_stock: true }])}>
                  + {t('addVariantBtn')}
                </Button>
              )}
            </div>
          ) : (
            <div className="vaango-form-group mt-2">
              {attributeGroups.map((group, index) => (
                <div key={`${group.name}-${index}`} className="vaango-product-modal__row">
                  <Input placeholder={t('groupNamePlaceholder')} value={group.name} onChange={(e) => setAttributeGroups((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item))} />
                  <Input placeholder={t('optionsCommaSeparatedPlaceholder')} value={group.options.join(', ')} onChange={(e) => setAttributeGroups((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, options: e.target.value.split(',').map((option) => option.trim()).filter(Boolean) } : item))} />
                  <Button type="button" variant="outline" size="sm" onClick={() => setAttributeGroups((items) => items.filter((_, itemIndex) => itemIndex !== index))}>{t('deleteItem')}</Button>
                </div>
              ))}
              {attributeGroups.length < 4 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setAttributeGroups((items) => [...items, { name: '', options: [] }])}>
                  + {t('addAttributeGroupBtn')}
                </Button>
              )}
            </div>
          )}

          {/* Description */}
          <div className="vaango-form-group">
            <label className="vaango-form-label" htmlFor="prod-desc">
              {t('productDescriptionLabel')}
            </label>
            <textarea
              id="prod-desc"
              className="vaango-textarea"
              rows={2}
              placeholder={t('productDescriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Product Photos */}
          <div className="vaango-form-group">
            <label className="vaango-form-label">
              {t('productPhotosLabel')} <span className="vaango-label-hint">{t('upToFivePhotos')}</span>
            </label>
            {existingImageUrls.length > 0 && (
              <div className="vaango-product-photo-grid">
                {existingImageUrls.map((url, index) => (
                  <div key={url} className="vaango-product-photo-item">
                    <img src={url} alt={`Product ${index + 1}`} className="vaango-product-photo-thumb" />
                    <button type="button" className="vaango-product-photo-remove" onClick={() => setExistingImageUrls((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove photo">x</button>
                  </div>
                ))}
              </div>
            )}
            {existingImageUrls.length + imageFiles.length < 5 && (
              <>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="vaango-file-input mt-2"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const oversized = files.find((f) => f.size > 10 * 1024 * 1024);
                    if (oversized) {
                      setError(`Photo "${oversized.name}" exceeds the 10MB limit. Please choose a photo less than 10MB.`);
                      e.currentTarget.value = '';
                      return;
                    }
                    const accepted = files.slice(0, 5 - existingImageUrls.length - imageFiles.length);
                    setImageFiles((prev) => [...prev, ...accepted]);
                    setImageFilePreviews((prev) => [...prev, ...accepted.map((file) => URL.createObjectURL(file))]);
                    e.currentTarget.value = '';
                  }}
                />
                <p className="text-xs text-secondary mt-1" style={{ fontSize: '0.78rem' }}>
                  Supports JPG, PNG, WebP up to 10MB per image. Photos are automatically optimized for instant mobile performance.
                </p>
              </>
            )}
            {imageFilePreviews.length > 0 && (
              <div className="vaango-product-photo-grid mt-2">
                {imageFilePreviews.map((src, index) => (
                  <div key={src} className="vaango-product-photo-item">
                    <img src={src} alt={`New photo ${index + 1}`} className="vaango-product-photo-thumb" />
                    <button type="button" className="vaango-product-photo-remove" onClick={() => {
                      setImageFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                      setImageFilePreviews((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                    }} aria-label="Remove photo">x</button>
                  </div>
                ))}
              </div>
            )}
            <label className="vaango-form-label mt-2" htmlFor="prod-img">
              {t('optionalImageUrlLabel')}
            </label>
            <Input
              id="prod-img"
              type="url"
              placeholder="https://images.unsplash.com/..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              leftIcon={<Image size={18} />}
            />
            {imageUrl && existingImageUrls.length === 0 && (
              <img src={imageUrl} alt="Product preview" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginTop: 'var(--space-2)' }} />
            )}
          </div>

          {/* Offer */}
          <div className="vaango-form-group">
            <label className="vaango-form-label" htmlFor="prod-offer-label">
              {t('addOfferOptionalLabel')}
            </label>
            <Input id="prod-offer-label" placeholder={t('offerLabelPlaceholder')} value={offerLabel} onChange={(e) => setOfferLabel(e.target.value)} />
            <div className="vaango-product-modal__row">
              <select className="vaango-select-input" value={offerType || ''} onChange={(e) => setOfferType((e.target.value || null) as ShopProduct['offer_type'])}>
                <option value="">{t('noOfferType')}</option>
                <option value="bogo">BOGO (Buy 1 Get 1)</option>
                <option value="percent_off">% {t('percentOff')}</option>
                <option value="flat_off">{t('flatOff')}</option>
              </select>
              {offerType && offerType !== 'bogo' && (
                <Input type="number" min="0" step="0.01" placeholder={t('offerValueLabel')} value={offerValue} onChange={(e) => setOfferValue(e.target.value)} />
              )}
            </div>
          </div>

          {/* In Stock Toggle */}
          <div className="vaango-product-modal__stock-row">
            <label className="vaango-switch" htmlFor="prod-stock-toggle">
              <input
                id="prod-stock-toggle"
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
              />
              <span className="vaango-switch__slider" />
            </label>
            <div className="vaango-product-modal__stock-info">
              <span className="vaango-product-modal__stock-status">
                {isAvailable
                  ? t('inStockAvailableDesc')
                  : t('outOfStockUnavailableDesc')}
              </span>
              <span className="vaango-product-modal__stock-hint">
                {t('toggleStockCatalogueHint')}
              </span>
            </div>
          </div>

          {/* Form Actions */}
          <div className="vaango-product-modal__actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('cancelBtn')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              leftIcon={<Check size={18} />}
            >
              {initialProduct ? t('saveChanges') : t('addToCatalogue')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
