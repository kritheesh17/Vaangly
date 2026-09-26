/**
 * Centralized INR Currency Formatter for Vaangly Indian Marketplace
 * Ensures consistent ₹ symbol and Indian numbering formatting across all catalogue components.
 */

export const formatINR = (amount: number | string | null | undefined): string => {
  if (amount === null || amount === undefined || amount === '') return '₹0';
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numeric)) return '₹0';
  return `₹${numeric.toLocaleString('en-IN')}`;
};

export const formatPriceRangeINR = (
  min: number | string | null | undefined,
  max: number | string | null | undefined
): string => {
  const formattedMin = formatINR(min);
  const formattedMax = formatINR(max);
  if (formattedMin === formattedMax) return formattedMin;
  return `${formattedMin} – ${formattedMax}`;
};
