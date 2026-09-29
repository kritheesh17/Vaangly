import type { Shop, SlotBreak } from '../types/database';
import {
  DEFAULT_SHOP_TIMEZONE,
  getShopCurrentDateTime,
  parseTimeToMinutes,
  minutesToFormattedTime,
} from './appointmentValidation';

export interface PickupDateOption {
  dateStr: string; // YYYY-MM-DD
  label: string;
  isToday: boolean;
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ...
}

export interface PickupTimeSlot {
  timeStr: string; // e.g. "19:00"
  formattedTime: string; // e.g. "07:00 PM"
  isoTimestamp: string; // Full ISO 8601 string with UTC or shop offset
  minutes: number;
}

export interface PickupValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Returns available pickup dates for a shop starting from today.
 * Respects advance booking days and available days configuration.
 */
export const getAvailablePickupDates = (
  shop: Shop,
  timeZone: string = DEFAULT_SHOP_TIMEZONE,
  nowDate: Date = new Date(),
  maxDays: number = 7
): PickupDateOption[] => {
  const shopNow = getShopCurrentDateTime(timeZone, nowDate);
  const limitDays = Math.min(
    Math.max(shop.slot_config?.advanceBookingDays || maxDays, 1),
    14
  );

  const availableDays = shop.slot_config?.availableDays;
  const dates: PickupDateOption[] = [];

  for (let i = 0; i < limitDays; i++) {
    // Generate date in shop timezone
    const targetDate = new Date(nowDate.getTime() + i * 24 * 60 * 60 * 1000);
    const targetShopInfo = getShopCurrentDateTime(timeZone, targetDate);

    // Calculate day of week (0 = Sunday, 1 = Monday, ...)
    // Construct local midnight to get DOW accurately
    const [y, m, d] = targetShopInfo.dateStr.split('-').map(Number);
    const localDateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = localDateObj.getUTCDay();

    // Respect availableDays filter if shop configured it
    if (availableDays && availableDays.length > 0 && !availableDays.includes(dayOfWeek)) {
      continue;
    }

    const isToday = targetShopInfo.dateStr === shopNow.dateStr;
    const isTomorrow = i === 1 || (!isToday && i <= 1);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const formattedDate = `${d} ${monthNames[m - 1]}`;

    let label: string;
    if (isToday) {
      label = `Today (${formattedDate})`;
    } else if (isTomorrow) {
      label = `Tomorrow (${formattedDate})`;
    } else {
      label = `${dayNames[dayOfWeek]}, ${formattedDate}`;
    }

    // Avoid duplicate dateStr
    if (!dates.some((d) => d.dateStr === targetShopInfo.dateStr)) {
      dates.push({
        dateStr: targetShopInfo.dateStr,
        label,
        isToday,
        dayOfWeek,
      });
    }
  }

  return dates;
};

/**
 * Builds an ISO timestamp from a dateStr (YYYY-MM-DD) and a timeStr (HH:mm) in shop timezone.
 */
export const buildShopIsoTimestamp = (
  dateStr: string,
  timeStr: string,
  timeZone: string = DEFAULT_SHOP_TIMEZONE
): string => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const [year, month, day] = dateStr.split('-').map(Number);

  // For Asia/Kolkata (IST), standard offset is +05:30
  // Handle dynamically via Intl or default IST
  let offsetString = '+05:30';
  try {
    const d = new Date(Date.UTC(year, month - 1, day, hours, minutes));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(d);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (tzPart && tzPart.startsWith('GMT')) {
      offsetString = tzPart.replace('GMT', '');
      if (offsetString === '') offsetString = '+00:00';
    }
  } catch {
    offsetString = '+05:30';
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00${offsetString}`;
};

/**
 * Returns available pickup time slots for a shop on a given date.
 * - Respects opening_time and closing_time (or slot_config.ranges).
 * - Excludes break periods.
 * - For TODAY: strictly excludes slots that are in the past or currently started (start_time <= current shop time).
 * - For FUTURE DATES: displays all regular operating slots.
 */
export const getAvailablePickupSlots = (
  shop: Shop,
  selectedDateStr: string,
  timeZone: string = DEFAULT_SHOP_TIMEZONE,
  nowDate: Date = new Date(),
  slotIntervalMinutes: number = 30
): PickupTimeSlot[] => {
  if (!selectedDateStr) return [];

  const shopNow = getShopCurrentDateTime(timeZone, nowDate);
  const isSelectedDateToday = selectedDateStr === shopNow.dateStr;
  const isSelectedDatePast = selectedDateStr < shopNow.dateStr;

  if (isSelectedDatePast) {
    return [];
  }

  // Determine working periods
  let startMinutes = 8 * 60; // default 08:00 AM
  let endMinutes = 21 * 60; // default 09:00 PM

  if (shop.opening_time) {
    startMinutes = parseTimeToMinutes(shop.opening_time);
  }
  if (shop.closing_time) {
    endMinutes = parseTimeToMinutes(shop.closing_time);
  }

  if (startMinutes >= endMinutes) {
    // Fallback sensible range if data malformed
    startMinutes = 8 * 60;
    endMinutes = 21 * 60;
  }

  // Parse breaks
  const breaks: { startMin: number; endMin: number }[] = [];
  if (shop.slot_config?.breaks && Array.isArray(shop.slot_config.breaks)) {
    shop.slot_config.breaks.forEach((b: SlotBreak) => {
      const bStart = parseTimeToMinutes(b.start);
      const bEnd = parseTimeToMinutes(b.end);
      if (bStart < bEnd) {
        breaks.push({ startMin: bStart, endMin: bEnd });
      }
    });
  }

  // Minimum buffer for same-day prep (e.g., minimum 15 mins prep time)
  const prepBufferMinutes = shop.slot_config?.bufferMinutes ?? 15;
  const currentThreshold = shopNow.currentMinutes + prepBufferMinutes;

  const slots: PickupTimeSlot[] = [];
  const interval = shop.slot_config?.slotDurationMinutes || slotIntervalMinutes || 30;

  for (let m = startMinutes; m <= endMinutes; m += interval) {
    // 1. For TODAY: do not show past times or times that have already started
    if (isSelectedDateToday && m <= currentThreshold) {
      continue;
    }

    // 2. Check if this pickup time falls within any break period
    const inBreak = breaks.some((b) => m >= b.startMin && m < b.endMin);
    if (inBreak) {
      continue;
    }

    const hours24 = Math.floor(m / 60);
    const mins = m % 60;
    const timeStr = `${String(hours24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    const formattedTime = minutesToFormattedTime(m);
    const isoTimestamp = buildShopIsoTimestamp(selectedDateStr, timeStr, timeZone);

    slots.push({
      timeStr,
      formattedTime,
      isoTimestamp,
      minutes: m,
    });
  }

  return slots;
};

/**
 * Validates a requested pickup_at timestamp before order submission.
 * Null/empty is valid (ASAP order).
 */
export const validateOrderPickupAt = (
  shop: Shop,
  pickupAt: string | null | undefined,
  timeZone: string = DEFAULT_SHOP_TIMEZONE,
  nowDate: Date = new Date()
): PickupValidationResult => {
  // ASAP is always valid
  if (!pickupAt) {
    return { valid: true };
  }

  const pickupDate = new Date(pickupAt);
  if (isNaN(pickupDate.getTime())) {
    return { valid: false, error: 'Invalid pickup date and time format.' };
  }

  // Check future timestamp
  if (pickupDate.getTime() <= nowDate.getTime()) {
    return { valid: false, error: 'Pickup date and time cannot be in the past and must be in the future.' };
  }

  const shopNow = getShopCurrentDateTime(timeZone, nowDate);
  const pickupShopInfo = getShopCurrentDateTime(timeZone, pickupDate);

  // Past date
  if (pickupShopInfo.dateStr < shopNow.dateStr) {
    return { valid: false, error: 'Pickup date cannot be in the past.' };
  }

  // Today past or currently started time
  if (pickupShopInfo.dateStr === shopNow.dateStr) {
    if (pickupShopInfo.currentMinutes <= shopNow.currentMinutes) {
      return { valid: false, error: 'Selected pickup time has already started or passed today.' };
    }
  }

  // Advance booking limit
  const maxAdvance = shop.slot_config?.advanceBookingDays;
  if (maxAdvance && maxAdvance > 0) {
    const diffMs = pickupDate.getTime() - nowDate.getTime();
    const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays > maxAdvance) {
      return {
        valid: false,
        error: `Pickup date cannot be more than ${maxAdvance} days in advance.`,
      };
    }
  }

  // Available days
  if (shop.slot_config?.availableDays && shop.slot_config.availableDays.length > 0) {
    const [y, m, d] = pickupShopInfo.dateStr.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
    if (!shop.slot_config.availableDays.includes(dayOfWeek)) {
      return { valid: false, error: 'The shop is closed on the selected pickup day.' };
    }
  }

  // Opening hours
  let startMinutes = 8 * 60;
  let endMinutes = 21 * 60;
  if (shop.opening_time) startMinutes = parseTimeToMinutes(shop.opening_time);
  if (shop.closing_time) endMinutes = parseTimeToMinutes(shop.closing_time);

  if (pickupShopInfo.currentMinutes < startMinutes || pickupShopInfo.currentMinutes > endMinutes) {
    return {
      valid: false,
      error: `Pickup time must be within shop operating hours (${minutesToFormattedTime(startMinutes)} – ${minutesToFormattedTime(endMinutes)}).`,
    };
  }

  // Breaks
  if (shop.slot_config?.breaks && Array.isArray(shop.slot_config.breaks)) {
    for (const b of shop.slot_config.breaks) {
      const bStart = parseTimeToMinutes(b.start);
      const bEnd = parseTimeToMinutes(b.end);
      if (pickupShopInfo.currentMinutes >= bStart && pickupShopInfo.currentMinutes < bEnd) {
        return {
          valid: false,
          error: `Pickup time cannot be during shop break hours (${b.start} – ${b.end}).`,
        };
      }
    }
  }

  return { valid: true };
};

/**
 * Format pickup_at timestamp for display.
 * e.g.:
 * - null => "ASAP"
 * - Today => "Today, 7:00 PM"
 * - Tomorrow => "Tomorrow, 7:00 PM"
 * - Other => "02 Oct, 7:00 PM"
 */
export const formatPickupTime = (
  pickupAt: string | null | undefined,
  timeZone: string = DEFAULT_SHOP_TIMEZONE,
  nowDate: Date = new Date()
): string => {
  if (!pickupAt) {
    return 'ASAP';
  }

  try {
    const date = new Date(pickupAt);
    if (isNaN(date.getTime())) return 'ASAP';

    const shopNow = getShopCurrentDateTime(timeZone, nowDate);
    const targetShop = getShopCurrentDateTime(timeZone, date);

    const formattedTime = minutesToFormattedTime(targetShop.currentMinutes);

    if (targetShop.dateStr === shopNow.dateStr) {
      return `Today, ${formattedTime}`;
    }

    // Check if tomorrow
    const [ny, nm, nd] = shopNow.dateStr.split('-').map(Number);
    const tomorrowDate = new Date(Date.UTC(ny, nm - 1, nd + 1, 12, 0, 0));
    const tomorrowInfo = getShopCurrentDateTime(timeZone, tomorrowDate);

    if (targetShop.dateStr === tomorrowInfo.dateStr) {
      return `Tomorrow, ${formattedTime}`;
    }

    // Other date: "02 Oct, 7:00 PM"
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [, tm, td] = targetShop.dateStr.split('-').map(Number);
    const datePart = `${String(td).padStart(2, '0')} ${monthNames[tm - 1]}`;

    return `${datePart}, ${formattedTime}`;
  } catch {
    return 'ASAP';
  }
};

/**
 * Sorts orders by pickup urgency:
 * 1. ASAP orders (immediate pickup needed) or earliest requested pickup time
 * 2. Creation time as a tie-breaker
 */
export const sortOrdersByPickupPriority = <T extends { pickup_at?: string | null; created_at: string }>(
  orders: T[]
): T[] => {
  return [...orders].sort((a, b) => {
    // If both have pickup_at, compare pickup_at
    if (a.pickup_at && b.pickup_at) {
      const timeDiff = new Date(a.pickup_at).getTime() - new Date(b.pickup_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }

    // If one is ASAP and one is scheduled:
    // An ASAP order requires immediate action, so compare its created_at with the scheduled pickup_at
    const targetTimeA = a.pickup_at ? new Date(a.pickup_at).getTime() : new Date(a.created_at).getTime();
    const targetTimeB = b.pickup_at ? new Date(b.pickup_at).getTime() : new Date(b.created_at).getTime();

    if (targetTimeA !== targetTimeB) {
      return targetTimeA - targetTimeB;
    }

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
};
