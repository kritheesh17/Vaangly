import React, { useState, useEffect } from 'react';
import { X, Image, AlertCircle, Check } from 'lucide-react';
import { ShopProduct, ProductAttributeGroup, ProductVariant } from '../../types/database';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useLanguage } from '../../context/LanguageContext';
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
  const { t, language } = useLanguage();
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
      setError(language === 'ta' ? 'தயவுசெய்து பொருளின் பெயரை உள்ளிடுக.' : 'Please enter a product name.');
      return;
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError(language === 'ta' ? 'சரியான விலையை உள்ளிடுக (₹0 அல்லது அதிகம்).' : 'Please enter a valid price (₹0 or greater).');
      return;
    }

    const finalUnit = unit === 'other' ? customUnit.trim() || 'item' : unit;

    setIsSubmitting(true);
    try {
      const uploadedUrls: string[] = [];
      for (let index = 0; index < imageFiles.length; index += 1) {
        const file = imageFiles[index];
        if (!isSupabaseConfigured) {
          uploadedUrls.push(URL.createObjectURL(file));
          continue;
        }
        const filePath = `shop-photos/${shopId}/products/${Date.now()}_${index}.jpg`;
        const uploadPromise = supabase.storage.from('shop-photos').upload(filePath, file, { upsert: true });
        const timeoutPromise = new Promise<{ data: null; error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error('Image upload timed out. Please check your network connection.')), 15000)
        );
        const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);
        if (uploadError) throw uploadError;
        uploadedUrls.push(supabase.storage.from('shop-photos').getPublicUrl(filePath).data.publicUrl);
      }
      const allImageUrls = [...existingImageUrls, ...uploadedUrls];
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
            {initialProduct
              ? (language === 'ta' ? 'பொருளைத் திருத்துக' : 'Edit Product')
              : (language === 'ta' ? 'புதிய பொருள் சேர்க்க' : 'Add New Product')}
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
              placeholder={language === 'ta' ? 'எ.கா. நாட்டு தக்காளி, ஆவின் பால்...' : 'e.g. Country Tomatoes, Milk 1L...'}
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
                <option value="other">{language === 'ta' ? 'வேறு அலகு...' : 'Other custom unit...'}</option>
              </select>
            </div>
          </div>

          {unit === 'other' && (
            <div className="vaango-form-group">
              <label className="vaango-form-label" htmlFor="prod-custom-unit">
                {language === 'ta' ? 'தனிப்பயன் அலகு பெயர்' : 'Custom Unit Name'}
              </label>
              <Input
                id="prod-custom-unit"
                placeholder="e.g. bundle, litre, crate"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
              />
            </div>
          )}

          <label className="vaango-checkbox-row mt-3">
            <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} />
            {language === 'ta' ? 'இந்த பொருளுக்கு அளவு/வேறுபாடுகள் உண்டு (எ.கா. 500g, 1kg)' : 'This product has size/variant options'}
          </label>
          {hasVariants ? (
            <div className="vaango-form-group mt-2">
              {variants.map((variant) => (
                <div key={variant.id} className="vaango-product-modal__row">
                  <Input placeholder="Variant label" value={variant.label} onChange={(e) => setVariants((items) => items.map((item) => item.id === variant.id ? { ...item, label: e.target.value } : item))} />
                  <Input type="number" min="0" placeholder="Price" value={variant.price} onChange={(e) => setVariants((items) => items.map((item) => item.id === variant.id ? { ...item, price: Number(e.target.value) } : item))} />
                  <label><input type="checkbox" checked={variant.in_stock} onChange={(e) => setVariants((items) => items.map((item) => item.id === variant.id ? { ...item, in_stock: e.target.checked } : item))} /> {t('inStock')}</label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setVariants((items) => items.filter((item) => item.id !== variant.id))}>{t('deleteItem')}</Button>
                </div>
              ))}
              {variants.length < 8 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setVariants((items) => [...items, { id: `variant-${Date.now()}`, label: '', price: Number(price) || 0, in_stock: true }])}>
                  + {language === 'ta' ? 'அளவு சேர்க்க' : 'Add Variant'}
                </Button>
              )}
            </div>
          ) : (
            <div className="vaango-form-group mt-2">
              {attributeGroups.map((group, index) => (
                <div key={`${group.name}-${index}`} className="vaango-product-modal__row">
                  <Input placeholder="Group name" value={group.name} onChange={(e) => setAttributeGroups((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item))} />
                  <Input placeholder="Options comma-separated" value={group.options.join(', ')} onChange={(e) => setAttributeGroups((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, options: e.target.value.split(',').map((option) => option.trim()).filter(Boolean) } : item))} />
                  <Button type="button" variant="outline" size="sm" onClick={() => setAttributeGroups((items) => items.filter((_, itemIndex) => itemIndex !== index))}>{t('deleteItem')}</Button>
                </div>
              ))}
              {attributeGroups.length < 4 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setAttributeGroups((items) => [...items, { name: '', options: [] }])}>
                  + {language === 'ta' ? 'கூடுதல் பண்பு சேர்க்க' : 'Add Attribute Group'}
                </Button>
              )}
            </div>
          )}

          {/* Description */}
          <div className="vaango-form-group">
            <label className="vaango-form-label" htmlFor="prod-desc">
              {language === 'ta' ? 'விளக்கம் / குறிப்புகள் (விருப்பத்தேர்வு)' : 'Description / Notes (Optional)'}
            </label>
            <textarea
              id="prod-desc"
              className="vaango-textarea"
              rows={2}
              placeholder={language === 'ta' ? 'பொருளின் தரம் அல்லது விவரங்கள்...' : 'Brief details about quality, farm source, or preparation...'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Product Photos */}
          <div className="vaango-form-group">
            <label className="vaango-form-label">
              {language === 'ta' ? 'பொருள் புகைப்படங்கள்' : 'Product Photos'} <span className="vaango-label-hint">{language === 'ta' ? '- 5 படங்கள் வரை' : '- Up to 5 photos'}</span>
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
              <input
                type="file"
                accept="image/*"
                multiple
                className="vaango-file-input mt-2"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const accepted = files.slice(0, 5 - existingImageUrls.length - imageFiles.length);
                  setImageFiles((prev) => [...prev, ...accepted]);
                  setImageFilePreviews((prev) => [...prev, ...accepted.map((file) => URL.createObjectURL(file))]);
                  e.currentTarget.value = '';
                }}
              />
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
              {language === 'ta' ? 'அல்லது இணையப் பட URL' : 'Optional Image URL'}
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
              {language === 'ta' ? 'சிறப்புச் சலுகை (விருப்பத்தேர்வு)' : 'Add an offer (Optional)'}
            </label>
            <Input id="prod-offer-label" placeholder="e.g. Buy 1 Get 1 / 10% Off" value={offerLabel} onChange={(e) => setOfferLabel(e.target.value)} />
            <div className="vaango-product-modal__row">
              <select className="vaango-select-input" value={offerType || ''} onChange={(e) => setOfferType((e.target.value || null) as ShopProduct['offer_type'])}>
                <option value="">{language === 'ta' ? 'சலுகை வகை இல்லை' : 'No offer type'}</option>
                <option value="bogo">BOGO (Buy 1 Get 1)</option>
                <option value="percent_off">% {language === 'ta' ? 'தள்ளுபடி' : 'off'}</option>
                <option value="flat_off">{language === 'ta' ? 'நேரடி தள்ளுபடி' : 'Flat off'}</option>
              </select>
              {offerType && offerType !== 'bogo' && (
                <Input type="number" min="0" step="0.01" placeholder={language === 'ta' ? 'சலுகை மதிப்பு' : 'Offer value'} value={offerValue} onChange={(e) => setOfferValue(e.target.value)} />
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
                  ? (language === 'ta' ? 'இருப்பில் உள்ளது (ஆர்டர் செய்யலாம்)' : 'In Stock (Available for ordering)')
                  : (language === 'ta' ? 'இருப்பில் இல்லை (வாடிக்கையாளர் ஆர்டர் செய்ய முடியாது)' : 'Out of Stock (Customers cannot order)')}
              </span>
              <span className="vaango-product-modal__stock-hint">
                {language === 'ta'
                  ? 'பொருட்கள் பட்டியலில் இருந்தும் ஒரே கிளிக்கில் இருப்பை மாற்றலாம்.'
                  : 'You can also toggle stock instantly with one click from your catalogue list.'}
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
              {initialProduct ? (language === 'ta' ? 'மாற்றங்களைச் சேமி' : 'Save Changes') : (language === 'ta' ? 'பட்டியலில் சேர்க்க' : 'Add to Catalogue')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
