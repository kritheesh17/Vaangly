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

export const formatCleanVariantLabel = (variant: ProductVariant): string => {
  if (variant.label && variant.label.trim()) return variant.label;
  const attributes = Object.values(variant.attributes || {});
  if (attributes.length > 0) return attributes.join(' / ');
  return 'Standard';
};

export interface GenerateCombinationsResult {
  variants: ProductVariant[];
  totalCombinations: number;
  exceededLimit: boolean;
}

export const generateVariantCombinations = (
  groups: { name: string; options: string[] }[],
  existingVariants: ProductVariant[] = [],
  defaultPrice: number = 0
): GenerateCombinationsResult => {
  const validGroups = groups
    .filter((g) => g.name.trim() && g.options.length > 0)
    .map((g) => ({
      name: g.name.trim(),
      options: Array.from(new Set(g.options.map((o) => o.trim()).filter(Boolean))),
    }))
    .filter((g) => g.options.length > 0);

  if (validGroups.length === 0) {
    return { variants: existingVariants, totalCombinations: existingVariants.length, exceededLimit: false };
  }

  // Calculate total combinations
  const totalCombinations = validGroups.reduce((acc, g) => acc * g.options.length, 1);
  const MAX_COMBINATIONS = 36;
  if (totalCombinations > MAX_COMBINATIONS) {
    return { variants: existingVariants, totalCombinations, exceededLimit: true };
  }

  // Cartesian product
  let combinations: Record<string, string>[] = [{}];
  for (const group of validGroups) {
    const nextCombos: Record<string, string>[] = [];
    for (const combo of combinations) {
      for (const option of group.options) {
        nextCombos.push({ ...combo, [group.name]: option });
      }
    }
    combinations = nextCombos;
  }

  // Map to variants, strictly preserving existing variant values if attributes match
  const newVariants: ProductVariant[] = combinations.map((attrs) => {
    const existing = existingVariants.find((ev) => {
      const evAttrs = ev.attributes || {};
      const evKeys = Object.keys(evAttrs);
      const attrKeys = Object.keys(attrs);
      if (evKeys.length !== attrKeys.length) return false;
      return attrKeys.every((k) => evAttrs[k] === attrs[k]);
    });

    if (existing) {
      return {
        ...existing,
        attributes: attrs,
        label: Object.values(attrs).join(' / '),
      };
    }

    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `var-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return {
      id,
      label: Object.values(attrs).join(' / '),
      attributes: attrs,
      price: defaultPrice > 0 ? defaultPrice : 0,
      stock_quantity: 1,
      is_available: true,
      in_stock: true,
      sku: null,
      image_url: null,
    };
  });

  return { variants: newVariants, totalCombinations, exceededLimit: false };
};

export const isVisualAttribute = (attributeName: string): boolean => {
  const lower = attributeName.toLowerCase();
  return lower.includes('color') || lower.includes('colour') || lower.includes('shade') || lower.includes('pattern');
};

export const isMeasurementAttribute = (attributeName: string): boolean => {
  const lower = attributeName.toLowerCase();
  return (
    lower.includes('weight') ||
    lower.includes('size') ||
    lower.includes('pack') ||
    lower.includes('volume') ||
    lower.includes('quantity') ||
    lower.includes('storage') ||
    lower.includes('capacity')
  );
};

