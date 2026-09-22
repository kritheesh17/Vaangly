import { ProductVariant } from '../types/database';

export type VariantSelections = Record<string, string>;

export const variantIsAvailable = (variant: ProductVariant): boolean =>
  variant.is_available !== false &&
  variant.in_stock !== false &&
  (variant.stock_quantity === undefined || variant.stock_quantity === null || variant.stock_quantity > 0);

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
