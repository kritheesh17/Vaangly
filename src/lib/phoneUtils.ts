/**
 * Indian Mobile Phone Number Utilities
 *
 * Normalization & Validation standard for Vaangly:
 * Canonical representation: +91XXXXXXXXXX (13 chars, +91 followed by 10 digits starting with 6-9)
 */

/**
 * Validates if the given string represents a valid Indian mobile number.
 * Valid Indian mobile numbers are 10 digits long and start with digits 6, 7, 8, or 9.
 * Accepts common formats such as:
 * - 9876543210
 * - 09876543210
 * - 919876543210
 * - +919876543210
 * - +91 98765 43210
 * - +91-98765-43210
 */
export function isValidIndianMobile(phone: string | null | undefined): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const digitsOnly = phone.replace(/[\s\-\(\)\.]/g, '');

  // Must match either:
  // 10 digits starting with 6-9
  // 11 digits starting with 0 followed by 6-9
  // 12 digits starting with 91 followed by 6-9
  // 13 characters starting with +91 followed by 10 digits starting with 6-9
  const pattern = /^(?:\+91|91|0)?[6-9]\d{9}$/;
  return pattern.test(digitsOnly);
}

/**
 * Normalizes any valid Indian mobile number into canonical format: +91XXXXXXXXXX
 * Returns null if the phone is null, empty, or invalid.
 */
export function normalizeIndianPhone(phone: string | null | undefined): string | null {
  if (!isValidIndianMobile(phone)) {
    return null;
  }
  // Strip non-digits except initial +
  const clean = (phone || '').replace(/[\s\-\(\)\.]/g, '');
  let digits = clean.startsWith('+') ? clean.slice(1) : clean;

  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  // Ensure exactly 10 digits starting with 6-9
  if (/^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }

  return null;
}

/**
 * Formats a canonical or valid phone number for human-friendly display:
 * e.g. +91 98765 43210
 * Returns fallback string if missing or invalid.
 */
export function formatPhoneDisplay(phone: string | null | undefined, fallback = 'Not provided'): string {
  const normalized = normalizeIndianPhone(phone);
  if (!normalized) {
    if (phone && phone.trim()) {
      return phone.trim();
    }
    return fallback;
  }
  // Format +91XXXXXXXXXX as +91 XXXXX XXXXX
  const prefix = normalized.slice(0, 3);
  const part1 = normalized.slice(3, 8);
  const part2 = normalized.slice(8);
  return `${prefix} ${part1} ${part2}`;
}
