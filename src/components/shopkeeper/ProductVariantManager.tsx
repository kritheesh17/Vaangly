import React, { useState } from 'react';
import { ProductVariant, ProductAttributeGroup } from '../../types/database';
import { generateVariantCombinations } from '../../lib/productVariants';
import { compressImage } from '../../lib/imageCompressor';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import {
  Plus,
  Trash2,
  Image as ImageIcon,
  Check,
  AlertTriangle,
  Upload,
  X,
  Layers,
  Sparkles,
} from 'lucide-react';
import './ProductVariantManager.css';

interface ProductVariantManagerProps {
  variants: ProductVariant[];
  onChangeVariants: (variants: ProductVariant[]) => void;
  attributeGroups: ProductAttributeGroup[];
  onChangeAttributeGroups: (groups: ProductAttributeGroup[]) => void;
  basePrice: number;
  productImageUrls?: string[];
  shopId?: string;
  userId?: string;
}

const OPTION_PRESETS = [
  { name: 'Color', icon: '🎨', suggestions: ['Black', 'White', 'Blue', 'Red', 'Green', 'Gray'] },
  { name: 'Size', icon: '📏', suggestions: ['S', 'M', 'L', 'XL', 'XXL'] },
  { name: 'Weight', icon: '⚖️', suggestions: ['250 g', '500 g', '1 kg', '2 kg', '5 kg'] },
  { name: 'Pack Size', icon: '📦', suggestions: ['Pack of 1', 'Pack of 2', 'Pack of 4', 'Pack of 6'] },
  { name: 'Flavor', icon: '🍓', suggestions: ['Vanilla', 'Chocolate', 'Strawberry', 'Mango'] },
  { name: 'Storage', icon: '💾', suggestions: ['64 GB', '128 GB', '256 GB', '512 GB'] },
  { name: 'Material', icon: '🧵', suggestions: ['Cotton', 'Leather', 'Steel', 'Wood'] },
];

export const ProductVariantManager: React.FC<ProductVariantManagerProps> = ({
  variants,
  onChangeVariants,
  attributeGroups,
  onChangeAttributeGroups,
  basePrice,
  productImageUrls = [],
  shopId,
  userId,
}) => {
  // Option Value Input State per group
  const [newValueInputs, setNewValueInputs] = useState<Record<number, string>>({});
  const [customOptionName, setCustomOptionName] = useState('');
  const [isAddingCustomOption, setIsAddingCustomOption] = useState(false);

  // Variant Image Upload / Select Modal
  const [imageModalVariantId, setImageModalVariantId] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  // Deletion Confirmation Modal
  const [variantToDelete, setVariantToDelete] = useState<ProductVariant | null>(null);
  const [groupToDeleteIndex, setGroupToDeleteIndex] = useState<number | null>(null);

  // Combination Warning
  const [combinationWarning, setCombinationWarning] = useState<string | null>(null);

  // 1. Add preset option group
  const handleAddPresetGroup = (presetName: string) => {
    if (attributeGroups.some((g) => g.name.toLowerCase() === presetName.toLowerCase())) {
      return;
    }
    if (attributeGroups.length >= 3) {
      setCombinationWarning('Products can have at most 3 option types (e.g. Color, Size, Material).');
      return;
    }

    const updatedGroups = [...attributeGroups, { name: presetName, options: [] }];
    onChangeAttributeGroups(updatedGroups);
    setCombinationWarning(null);
  };

  // 2. Add custom option group
  const handleAddCustomGroup = () => {
    const trimmed = customOptionName.trim();
    if (!trimmed) return;
    if (attributeGroups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) {
      setCombinationWarning(`Option "${trimmed}" already exists.`);
      return;
    }
    if (attributeGroups.length >= 3) {
      setCombinationWarning('Products can have at most 3 option types.');
      return;
    }

    const updatedGroups = [...attributeGroups, { name: trimmed, options: [] }];
    onChangeAttributeGroups(updatedGroups);
    setCustomOptionName('');
    setIsAddingCustomOption(false);
    setCombinationWarning(null);
  };

  // 3. Add value to an option group
  const handleAddValueToGroup = (groupIndex: number, valToAdd?: string) => {
    const val = (valToAdd || newValueInputs[groupIndex] || '').trim();
    if (!val) return;

    const group = attributeGroups[groupIndex];
    if (group.options.some((o) => o.toLowerCase() === val.toLowerCase())) {
      return;
    }

    const updatedGroups = attributeGroups.map((g, idx) => {
      if (idx !== groupIndex) return g;
      return { ...g, options: [...g.options, val] };
    });

    onChangeAttributeGroups(updatedGroups);
    setNewValueInputs((prev) => ({ ...prev, [groupIndex]: '' }));

    // Automatically synchronize combinations, preserving all existing variants
    syncCombinations(updatedGroups);
  };

  // 4. Remove value from option group
  const handleRemoveValueFromGroup = (groupIndex: number, valueIndex: number) => {
    const updatedGroups = attributeGroups.map((g, idx) => {
      if (idx !== groupIndex) return g;
      return { ...g, options: g.options.filter((_, oIdx) => oIdx !== valueIndex) };
    });

    onChangeAttributeGroups(updatedGroups);
    syncCombinations(updatedGroups);
  };

  // 5. Synchronize combinations safely
  const syncCombinations = (groups: ProductAttributeGroup[]) => {
    const res = generateVariantCombinations(groups, variants, basePrice);
    if (res.exceededLimit) {
      setCombinationWarning(`This configuration generates ${res.totalCombinations} combinations. To ensure fast customer loading, products are limited to 36 combinations.`);
      return;
    }
    setCombinationWarning(null);
    if (res.variants.length > 0) {
      onChangeVariants(res.variants);
    }
  };

  // 6. Delete option group confirmation
  const handleConfirmDeleteGroup = () => {
    if (groupToDeleteIndex === null) return;
    const updatedGroups = attributeGroups.filter((_, idx) => idx !== groupToDeleteIndex);
    onChangeAttributeGroups(updatedGroups);
    setGroupToDeleteIndex(null);
    syncCombinations(updatedGroups);
  };

  // 7. Add single variant manually
  const handleAddManualVariant = () => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newVar: ProductVariant = {
      id,
      label: `Option ${variants.length + 1}`,
      price: basePrice > 0 ? basePrice : 0,
      stock_quantity: null,
      is_available: true,
      in_stock: true,
      sku: null,
      image_url: null,
    };
    onChangeVariants([...variants, newVar]);
  };

  // 8. Update specific variant field
  const handleUpdateVariant = (variantId: string, updates: Partial<ProductVariant>) => {
    const updated = variants.map((v) => {
      if (v.id !== variantId) return v;
      const merged = { ...v, ...updates };

      // Handle stock and availability sync
      if (updates.stock_quantity !== undefined) {
        if (updates.stock_quantity !== null && updates.stock_quantity <= 0) {
          merged.stock_quantity = 0;
          merged.in_stock = false;
          merged.is_available = false;
        } else if (updates.stock_quantity !== null && updates.stock_quantity > 0) {
          merged.in_stock = true;
          if (updates.is_available === undefined) {
            merged.is_available = true;
          }
        }
      } else if (updates.is_available !== undefined) {
        merged.in_stock = updates.is_available;
      }
      return merged;
    });
    onChangeVariants(updated);
  };

  // 9. Confirm variant deletion
  const handleConfirmDeleteVariant = () => {
    if (!variantToDelete) return;
    onChangeVariants(variants.filter((v) => v.id !== variantToDelete.id));
    setVariantToDelete(null);
  };

  // 10. Handle image upload for variant
  const handleVariantImageUpload = async (file: File) => {
    if (!imageModalVariantId) return;
    setIsUploadingImage(true);
    setImageUploadError(null);

    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase storage is not configured.');
      }

      const compressed = await compressImage(file, {
        maxDimension: 800,
        quality: 0.75,
        maxFileSizeMB: 8,
      });

      const folder = userId || shopId || 'public';
      const path = `${folder}/variants/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;

      const { error: uploadError } = await supabase.storage.from('shop-photos').upload(path, compressed, {
        upsert: true,
        contentType: 'image/jpeg',
      });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const publicUrl = supabase.storage.from('shop-photos').getPublicUrl(path).data.publicUrl;
      handleUpdateVariant(imageModalVariantId, { image_url: publicUrl });
      setImageModalVariantId(null);
    } catch (err: unknown) {
      setImageUploadError(err instanceof Error ? err.message : 'Image upload failed. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const activeModalVariant = variants.find((v) => v.id === imageModalVariantId);

  return (
    <div className="vaango-variant-manager">
      {/* 1. Header & Options Setup */}
      <div className="vaango-variant-manager__header">
        <div>
          <h4 className="vaango-variant-manager__title">
            <Layers size={18} className="vaango-variant-manager__title-icon" />
            Product Options & Variants
          </h4>
          <p className="vaango-variant-manager__subtitle">
            Create customer-selectable options like Color, Size, Weight, or Pack. Each combination will have its own price, stock, and image.
          </p>
        </div>
      </div>

      {/* Preset Buttons Bar */}
      <div className="vaango-variant-presets">
        <span className="vaango-variant-presets__label">Add Option:</span>
        <div className="vaango-variant-presets__list">
          {OPTION_PRESETS.map((preset) => {
            const isAdded = attributeGroups.some((g) => g.name.toLowerCase() === preset.name.toLowerCase());
            return (
              <button
                key={preset.name}
                type="button"
                disabled={isAdded || attributeGroups.length >= 3}
                className={`vaango-preset-chip ${isAdded ? 'vaango-preset-chip--added' : ''}`}
                onClick={() => handleAddPresetGroup(preset.name)}
                title={isAdded ? `${preset.name} is already added` : `Add ${preset.name} option`}
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
                {isAdded && <Check size={12} className="ml-1" />}
              </button>
            );
          })}
          {!isAddingCustomOption ? (
            <button
              type="button"
              disabled={attributeGroups.length >= 3}
              className="vaango-preset-chip vaango-preset-chip--custom"
              onClick={() => setIsAddingCustomOption(true)}
            >
              <Plus size={14} />
              <span>Custom</span>
            </button>
          ) : (
            <div className="vaango-custom-option-input-wrap">
              <Input
                placeholder="e.g. Strap Type"
                value={customOptionName}
                onChange={(e) => setCustomOptionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomGroup();
                  }
                }}
                autoFocus
              />
              <Button type="button" size="sm" variant="primary" onClick={handleAddCustomGroup}>
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsAddingCustomOption(false);
                  setCustomOptionName('');
                }}
              >
                <X size={14} />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Warning Alert if excessive combinations */}
      {combinationWarning && (
        <div className="vaango-variant-alert vaango-variant-alert--warning">
          <AlertTriangle size={18} className="vaango-variant-alert__icon" />
          <span>{combinationWarning}</span>
        </div>
      )}

      {/* 2. Active Option Groups (Configuring Values) */}
      {attributeGroups.length > 0 && (
        <div className="vaango-option-groups-list">
          {attributeGroups.map((group, groupIdx) => {
            const preset = OPTION_PRESETS.find((p) => p.name.toLowerCase() === group.name.toLowerCase());
            const suggestions = preset?.suggestions.filter((s) => !group.options.includes(s)) || [];

            return (
              <div key={groupIdx} className="vaango-option-group-card">
                <div className="vaango-option-group-card__header">
                  <div className="vaango-option-group-card__title">
                    <span className="vaango-option-badge">Option {groupIdx + 1}</span>
                    <strong className="vaango-option-name">{group.name}</strong>
                    <span className="vaango-option-count">({group.options.length} values)</span>
                  </div>
                  <button
                    type="button"
                    className="vaango-option-delete-btn"
                    onClick={() => setGroupToDeleteIndex(groupIdx)}
                    title={`Remove ${group.name} option`}
                    aria-label={`Remove ${group.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Values Pill Chips */}
                <div className="vaango-option-values-row">
                  {group.options.map((val, valIdx) => (
                    <span key={valIdx} className="vaango-option-value-pill">
                      <span>{val}</span>
                      <button
                        type="button"
                        className="vaango-option-value-remove"
                        onClick={() => handleRemoveValueFromGroup(groupIdx, valIdx)}
                        title={`Remove ${val}`}
                        aria-label={`Remove ${val}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}

                  {/* Add Value Input */}
                  <div className="vaango-option-value-input-box">
                    <input
                      type="text"
                      className="vaango-option-inline-input"
                      placeholder={`Add ${group.name.toLowerCase()} value...`}
                      value={newValueInputs[groupIdx] || ''}
                      onChange={(e) =>
                        setNewValueInputs((prev) => ({ ...prev, [groupIdx]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddValueToGroup(groupIdx);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="vaango-option-inline-add-btn"
                      onClick={() => handleAddValueToGroup(groupIdx)}
                      disabled={!(newValueInputs[groupIdx] || '').trim()}
                    >
                      <Plus size={14} />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {/* Quick Suggestion Chips */}
                {suggestions.length > 0 && (
                  <div className="vaango-option-suggestions">
                    <span className="vaango-option-suggestions__label">Suggested:</span>
                    {suggestions.slice(0, 5).map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        className="vaango-suggestion-chip"
                        onClick={() => handleAddValueToGroup(groupIdx, sug)}
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Variants Matrix / Table View */}
      <div className="vaango-variants-table-section">
        <div className="vaango-variants-table-header">
          <div>
            <h5 className="vaango-variants-table-title">
              Configured Variants ({variants.length})
            </h5>
            <p className="vaango-variants-table-hint">
              Set distinct prices, stock levels, or images for each variant combination.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            leftIcon={<Plus size={14} />}
            onClick={handleAddManualVariant}
          >
            Add Variant
          </Button>
        </div>

        {variants.length === 0 ? (
          <div className="vaango-variants-empty">
            <Sparkles size={28} className="vaango-variants-empty__icon" />
            <strong>No variants created yet</strong>
            <p>
              Add options above (like Color, Size, or Weight) to automatically generate combinations, or click &ldquo;Add Variant&rdquo; to create a custom variant.
            </p>
          </div>
        ) : (
          <div className="vaango-variants-cards-grid">
            {variants.map((variant) => {
              const isAvailable = variant.is_available !== false && variant.in_stock !== false;
              const hasStock = variant.stock_quantity == null || variant.stock_quantity > 0;
              const isTracked = variant.stock_quantity !== null && variant.stock_quantity !== undefined;

              return (
                <div
                  key={variant.id}
                  className={`vaango-variant-row-card ${!isAvailable || !hasStock ? 'vaango-variant-row-card--out' : ''}`}
                >
                  {/* Top Bar: Variant Name & Badges */}
                  <div className="vaango-variant-row-card__top">
                    <div className="vaango-variant-row-card__identity">
                      {/* Thumbnail or Upload Button */}
                      <button
                        type="button"
                        className="vaango-variant-thumb-btn"
                        onClick={() => setImageModalVariantId(variant.id)}
                        title="Click to select or upload an image for this variant"
                      >
                        {variant.image_url ? (
                          <img src={variant.image_url} alt={variant.label || 'Variant'} className="vaango-variant-thumb" />
                        ) : (
                          <div className="vaango-variant-thumb-placeholder">
                            <ImageIcon size={18} />
                            <span>+ Photo</span>
                          </div>
                        )}
                      </button>

                      <div className="vaango-variant-row-card__labels">
                        <strong className="vaango-variant-label">
                          {variant.label || 'Custom Variant'}
                        </strong>
                        {variant.attributes && Object.keys(variant.attributes).length > 0 && (
                          <div className="vaango-variant-attribute-badges">
                            {Object.entries(variant.attributes).map(([attrK, attrV]) => (
                              <span key={attrK} className="vaango-variant-attr-tag">
                                {attrK}: <strong>{attrV}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="vaango-variant-row-card__status-actions">
                      <span
                        className={`vaango-variant-status-indicator ${
                          isAvailable && hasStock
                            ? 'vaango-variant-status-indicator--in'
                            : 'vaango-variant-status-indicator--out'
                        }`}
                      >
                        {isAvailable && hasStock ? 'In Stock' : 'Unavailable'}
                      </span>
                      <button
                        type="button"
                        className="vaango-variant-delete-btn"
                        onClick={() => setVariantToDelete(variant)}
                        title="Delete variant"
                        aria-label={`Delete ${variant.label || 'variant'}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Form Controls Grid */}
                  <div className="vaango-variant-row-card__controls">
                    {/* Price Input */}
                    <div className="vaango-variant-field">
                      <label className="vaango-variant-field-label">Price (₹)</label>
                      <div className="vaango-currency-input-wrap">
                        <span className="vaango-currency-symbol">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="vaango-variant-input"
                          placeholder="Price"
                          value={variant.price}
                          onChange={(e) =>
                            handleUpdateVariant(variant.id, {
                              price: e.target.value === '' ? 0 : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>

                    {/* Stock Quantity Input */}
                    <div className="vaango-variant-field">
                      <label className="vaango-variant-field-label">
                        Stock Quantity
                        <label className="vaango-track-stock-checkbox">
                          <input
                            type="checkbox"
                            checked={isTracked}
                            onChange={(e) =>
                              handleUpdateVariant(variant.id, {
                                stock_quantity: e.target.checked ? 1 : null,
                              })
                            }
                          />
                          <span>Track</span>
                        </label>
                      </label>
                      {isTracked ? (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="vaango-variant-input"
                          placeholder="Units"
                          value={variant.stock_quantity ?? ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : Number(e.target.value);
                            handleUpdateVariant(variant.id, { stock_quantity: val });
                          }}
                        />
                      ) : (
                        <span className="vaango-variant-untracked-note">Unlimited Stock</span>
                      )}
                    </div>

                    {/* Availability Switch */}
                    <div className="vaango-variant-field vaango-variant-field--toggle">
                      <label className="vaango-variant-field-label">Availability</label>
                      <label className="vaango-toggle-switch">
                        <input
                          type="checkbox"
                          checked={variant.is_available !== false && variant.in_stock !== false}
                          onChange={(e) =>
                            handleUpdateVariant(variant.id, {
                              is_available: e.target.checked,
                              in_stock: e.target.checked,
                            })
                          }
                        />
                        <span className="vaango-toggle-slider" />
                        <span className="vaango-toggle-label">
                          {variant.is_available !== false && variant.in_stock !== false
                            ? 'Available'
                            : 'Disabled'}
                        </span>
                      </label>
                    </div>

                    {/* Optional SKU */}
                    <div className="vaango-variant-field">
                      <label className="vaango-variant-field-label">SKU (Optional)</label>
                      <input
                        type="text"
                        className="vaango-variant-input"
                        placeholder="e.g. BLK-SM-01"
                        value={variant.sku || ''}
                        onChange={(e) =>
                          handleUpdateVariant(variant.id, { sku: e.target.value || null })
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: Image Picker / Uploader for Variant */}
      <Modal
        isOpen={Boolean(imageModalVariantId)}
        onClose={() => {
          setImageModalVariantId(null);
          setImageUploadError(null);
        }}
        title={`Set Photo for "${activeModalVariant?.label || 'Variant'}"`}
        maxWidth="md"
      >
        <div className="vaango-variant-image-modal">
          <p className="vaango-variant-image-modal__hint">
            Upload a photo specific to this variant, or pick one from the product photos already added.
          </p>

          {imageUploadError && (
            <div className="vaango-variant-alert vaango-variant-alert--error mb-3">
              <AlertTriangle size={18} />
              <span>{imageUploadError}</span>
            </div>
          )}

          {/* Option A: Upload New Photo */}
          <div className="vaango-variant-image-upload-zone mb-4">
            <label className="vaango-variant-upload-btn">
              <Upload size={18} />
              <span>{isUploadingImage ? 'Optimizing & Uploading...' : 'Upload New Photo'}</span>
              <input
                type="file"
                accept="image/*"
                disabled={isUploadingImage}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleVariantImageUpload(file);
                }}
              />
            </label>
          </div>

          {/* Option B: Choose from existing product images */}
          {productImageUrls.length > 0 && (
            <div>
              <span className="vaango-variant-existing-title">
                Or choose from uploaded product photos:
              </span>
              <div className="vaango-variant-existing-grid">
                {productImageUrls.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`vaango-variant-photo-choice ${
                      activeModalVariant?.image_url === url
                        ? 'vaango-variant-photo-choice--selected'
                        : ''
                    }`}
                    onClick={() => {
                      if (imageModalVariantId) {
                        handleUpdateVariant(imageModalVariantId, { image_url: url });
                        setImageModalVariantId(null);
                      }
                    }}
                  >
                    <img src={url} alt={`Option ${idx + 1}`} />
                    {activeModalVariant?.image_url === url && (
                      <div className="vaango-variant-photo-choice__check">
                        <Check size={16} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Option C: Remove current image */}
          {activeModalVariant?.image_url && (
            <div className="mt-4 pt-3 border-t border-border flex justify-between items-center">
              <span className="text-sm text-secondary">Currently has a variant photo</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (imageModalVariantId) {
                    handleUpdateVariant(imageModalVariantId, { image_url: null });
                    setImageModalVariantId(null);
                  }
                }}
              >
                Remove Photo
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL 2: Delete Variant Confirmation */}
      <Modal
        isOpen={Boolean(variantToDelete)}
        onClose={() => setVariantToDelete(null)}
        title="Delete Variant?"
        maxWidth="sm"
      >
        <div className="p-1">
          <p className="text-sm text-secondary mb-4 leading-relaxed">
            Are you sure you want to delete variant{' '}
            <strong>&ldquo;{variantToDelete?.label || 'this variant'}&rdquo;</strong>? Customers will no longer be able to select or purchase this combination.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setVariantToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDeleteVariant}>
              Yes, Delete Variant
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 3: Delete Option Group Confirmation */}
      <Modal
        isOpen={groupToDeleteIndex !== null}
        onClose={() => setGroupToDeleteIndex(null)}
        title="Remove Option Group?"
        maxWidth="sm"
      >
        <div className="p-1">
          <p className="text-sm text-secondary mb-4 leading-relaxed">
            Removing this option will delete all associated variant combinations. Are you sure you want to proceed?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setGroupToDeleteIndex(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDeleteGroup}>
              Remove Option
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

