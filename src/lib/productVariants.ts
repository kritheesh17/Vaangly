import { ProductVariant } from '../types/database';

export type VariantSelections = Record<string, string>;

export const variantIsAvailable = (variant: ProductVariant): boolean =>
  variant.is_available !== false &&
  variant.in_stock !== false &&
  (variant.stock_quantity === undefined || variant.stock_quantity === null || variant.stock_quantity > 0);

export const productHasAvailableVariant = (variants?: ProductVariant[] | null): boolean =>
  Boolean(variants && variants.length > 0 && variants.some(variantIsAvailable));

export const computeProductAvailability = (product: {
  has_variants?: boolean;
  variants?: ProductVariant[];
  is_available: boolean;
  track_inventory?: boolean;
  stock_quantity?: number | null;
}): boolean => {
  if (product.has_variants) {
    return productHasAvailableVariant(product.variants);
  }
  if (product.track_inventory && product.stock_quantity != null) {
    return product.is_available && product.stock_quantity > 0;
  }
  return product.is_available;
};

export const updateVariantInList = (
  variants: ProductVariant[],
  variantId: string,
  updates: Partial<ProductVariant>
): ProductVariant[] => {
  return variants.map((variant) => {
    if (variant.id !== variantId) return variant;

    const merged = { ...variant, ...updates };

    if (updates.stock_quantity !== undefined) {
      if (updates.stock_quantity != null && updates.stock_quantity <= 0) {
        merged.stock_quantity = 0;
        merged.in_stock = false;
        merged.is_available = false;
      } else if (updates.stock_quantity != null && updates.stock_quantity > 0) {
        merged.in_stock = true;
        // If is_available was not explicitly disabled in updates, set to true
        if (updates.is_available === undefined) {
          merged.is_available = true;
        }
      }
    } else if (updates.is_available !== undefined) {
      merged.in_stock = updates.is_available;
    }

    return merged;
  });
};

export const variantLabel = (variant: ProductVariant): string => {
  const attributes = Object.entries(variant.attributes || {});
  if (attributes.length > 0) return attributes.map(([name, value]) => `${name}: ${value}`).join(' / ');
  return variant.label || 'Option';
};

export const variantAttributeGroups = (variants: ProductVariant[]): Record<string, string[]> => {
  const groups: Record<string, string[]> = {};
  variants.forEach((variant) => {
    Object.entries(variant.attributes || {}).forEach(([name, value]) => {
      if (!groups[name]) groups[name] = [];
      if (!groups[name].includes(value)) groups[name].push(value);
    });
  });
  return groups;
};

export const findVariantForSelections = (
  variants: ProductVariant[],
  selections: VariantSelections
): ProductVariant | null => {
  const selectedNames = Object.keys(selections);
  if (selectedNames.length === 0) return null;
  return variants.find((variant) => {
    const attributes = variant.attributes || {};
    return selectedNames.length === Object.keys(attributes).length &&
      selectedNames.every((name) => attributes[name] === selections[name]);
  }) || null;
};

export const optionIsReachable = (
  variants: ProductVariant[],
  selections: VariantSelections,
  attributeName: string,
  option: string
): boolean => variants.some((variant) => {
  if (!variantIsAvailable(variant)) return false;
  const attributes = variant.attributes || {};
  return attributes[attributeName] === option &&
    Object.entries(selections).every(([name, value]) => name === attributeName || attributes[name] === value);
});
