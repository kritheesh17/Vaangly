export interface WorkingPeriodInput {
  id?: string;
  start: string;
  end: string;
}

export interface BreakInput {
  id?: string;
  title?: string;
  start: string;
  end: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Parse time string (e.g. "09:00 AM", "1:30 PM", "14:00") into minutes from midnight.
 */
export const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const trimmed = timeStr.trim().toUpperCase();
  const is12Hour = trimmed.includes('AM') || trimmed.includes('PM');

  if (is12Hour) {
    const isPM = trimmed.includes('PM');
    const clean = trimmed.replace('AM', '').replace('PM', '').trim();
    const [hStr, mStr] = clean.split(':');
    let hours = parseInt(hStr, 10) || 0;
    const minutes = parseInt(mStr, 10) || 0;
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  const [hStr, mStr] = trimmed.split(':');
  const hours = parseInt(hStr, 10) || 0;
  const minutes = parseInt(mStr, 10) || 0;
  return hours * 60 + minutes;
};

/**
 * Format total minutes from midnight into "hh:mm A" string.
 */
export const minutesToFormattedTime = (totalMinutes: number): string => {
  const norm = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(norm / 60);
  const minutes = norm % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours12)}:${pad(minutes)} ${period}`;
};

/**
 * Validates working periods (shifts) and breaks for appointment schedules.
 *
 * Rules:
 * 1. Must have at least one working period.
 * 2. Opening time must be earlier than closing time for each shift.
 * 3. Working shifts must not overlap each other.
 * 4. For each break:
 *    - Start time must be earlier than end time (duration > 0).
 *    - Must fall completely inside a working period OR completely inside the gap between two working periods.
 *    - Must NOT partially overlap a working period.
 *    - Must NOT extend outside the overall schedule.
 *    - Must NOT overlap another break.
 *    - Touching shift boundaries is allowed:
 *      * If break starts exactly when Shift 1 ends and ends before or when Shift 2 starts (e.g. 13:00–13:30), it is a valid gap break.
 */
export const validateWorkingHoursAndBreaks = (
  workingPeriods: WorkingPeriodInput[],
  breaks: BreakInput[] = []
): ValidationResult => {
  if (!workingPeriods || workingPeriods.length === 0) {
    return { valid: false, error: 'Please configure at least one working period.' };
  }

  // 1. Validate individual working periods and parse them
  const parsedPeriods: { start: string; end: string; startMin: number; endMin: number }[] = [];
  for (const period of workingPeriods) {
    if (!period.start || !period.end) {
      return { valid: false, error: 'All working periods must have valid start and end times.' };
    }
    const startMin = parseTimeToMinutes(period.start);
    const endMin = parseTimeToMinutes(period.end);

    if (startMin >= endMin) {
      return {
        valid: false,
        error: `Opening time (${period.start}) must be earlier than closing time (${period.end}).`,
      };
    }

    parsedPeriods.push({ start: period.start, end: period.end, startMin, endMin });
  }

  // 2. Sort working periods by start time
  parsedPeriods.sort((a, b) => a.startMin - b.startMin);

  // 3. Check for overlapping working periods
  for (let i = 0; i < parsedPeriods.length - 1; i++) {
    const current = parsedPeriods[i];
    const next = parsedPeriods[i + 1];
    if (current.endMin > next.startMin) {
      return {
        valid: false,
        error: `Working shifts cannot overlap each other (${current.start}–${current.end} and ${next.start}–${next.end}).`,
      };
    }
  }

  // 4. Calculate gaps between shifts and schedule boundaries
  const gaps: { startMin: number; endMin: number }[] = [];
  for (let i = 0; i < parsedPeriods.length - 1; i++) {
    if (parsedPeriods[i].endMin < parsedPeriods[i + 1].startMin) {
      gaps.push({
        startMin: parsedPeriods[i].endMin,
        endMin: parsedPeriods[i + 1].startMin,
      });
    }
  }

  const overallScheduleStart = parsedPeriods[0].startMin;
  const overallScheduleEnd = parsedPeriods[parsedPeriods.length - 1].endMin;

  // 5. Validate breaks
  const parsedBreaks: { title: string; start: string; end: string; startMin: number; endMin: number }[] = [];

  for (const brk of breaks) {
    const title = brk.title?.trim() || 'Break';
    if (!brk.start || !brk.end) {
      return { valid: false, error: `Break "${title}" must have valid start and end times.` };
    }

    const bStart = parseTimeToMinutes(brk.start);
    const bEnd = parseTimeToMinutes(brk.end);

    if (bStart >= bEnd) {
      return {
        valid: false,
        error: `Break "${title}" start time (${brk.start}) must be earlier than break end time (${brk.end}).`,
      };
    }

    // A break is valid if it falls completely inside a working period
    const insidePeriod = parsedPeriods.some(
      (p) => bStart >= p.startMin && bEnd <= p.endMin
    );

    // OR falls completely inside a gap between shifts
    // (including touching shift boundaries: e.g. starting exactly at Shift 1 end or ending at Shift 2 start)
    const insideGap = gaps.some(
      (g) => bStart >= g.startMin && bEnd <= g.endMin
    );

    if (!insidePeriod && !insideGap) {
      if (bStart < overallScheduleStart || bEnd > overallScheduleEnd) {
        return {
          valid: false,
          error: `Break "${title}" (${brk.start} – ${brk.end}) falls outside the working schedule.`,
        };
      }
      return {
        valid: false,
        error: `Break "${title}" (${brk.start} – ${brk.end}) must fall completely inside a working shift or within the gap between shifts.`,
      };
    }

    // Check for overlap with other breaks
    for (const prev of parsedBreaks) {
      if (bStart < prev.endMin && bEnd > prev.startMin) {
        return {
          valid: false,
          error: `Breaks "${prev.title}" and "${title}" cannot overlap.`,
        };
      }
    }

    parsedBreaks.push({ title, start: brk.start, end: brk.end, startMin: bStart, endMin: bEnd });
  }

  return { valid: true };
};

/**
 * Canonical default shop operating timezone (Asia/Kolkata for Indian shops).
 */
export const DEFAULT_SHOP_TIMEZONE = 'Asia/Kolkata';

export interface ShopCurrentDateTime {
  dateStr: string; // YYYY-MM-DD in shop local timezone
  currentMinutes: number; // minutes from midnight (0..1439) in shop local timezone
  formattedTime: string; // HH:mm (24-hour)
  year: number;
  month: number; // 1-indexed (1..12)
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
}

/**
 * Returns the current date and time in the shop's local timezone.
 * Uses Intl.DateTimeFormat for strict timezone-safe date/time resolution.
 */
export const getShopCurrentDateTime = (
  timeZone: string = DEFAULT_SHOP_TIMEZONE,
  targetDate: Date = new Date()
): ShopCurrentDateTime => {
  const safeTz = timeZone || DEFAULT_SHOP_TIMEZONE;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_SHOP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  const parts = formatter.formatToParts(targetDate);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const year = parseInt(getPart('year'), 10) || targetDate.getFullYear();
  const month = parseInt(getPart('month'), 10) || targetDate.getMonth() + 1;
  const day = parseInt(getPart('day'), 10) || targetDate.getDate();
  const hour = parseInt(getPart('hour'), 10) || 0;
  const minute = parseInt(getPart('minute'), 10) || 0;

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const currentMinutes = hour * 60 + minute;
  const formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return {
    dateStr,
    currentMinutes,
    formattedTime,
    year,
    month,
    day,
    hour,
    minute,
  };
};

/**
 * Checks if an appointment slot has already started or passed based on the shop's local time.
 * - If slot_date is in the past (< current shop date): returns true
 * - If slot_date is in the future (> current shop date): returns false
 * - If slot_date is today: returns true if slot start_time <= current shop time (slot already started)
 */
export const isSlotInPast = (
  slotDateStr: string,
  slotStartTime: string,
  timeZone: string = DEFAULT_SHOP_TIMEZONE,
  nowDate: Date = new Date()
): boolean => {
  if (!slotDateStr || !slotStartTime) return false;
  const shopNow = getShopCurrentDateTime(timeZone, nowDate);

  if (slotDateStr < shopNow.dateStr) {
    return true;
  }
  if (slotDateStr > shopNow.dateStr) {
    return false;
  }

  const slotStartMinutes = parseTimeToMinutes(slotStartTime);
  return slotStartMinutes <= shopNow.currentMinutes;
};

/**
 * Filters appointment slots for customer booking:
 * - If selectedDateStr is a past date: returns []
 * - If selectedDateStr is today: returns ONLY slots where slot.start_time > current shop time
 * - If selectedDateStr is a future date: returns all slots unchanged
 */
export const filterFutureSlots = <T extends { slot_date: string; start_time: string }>(
  slots: T[],
  selectedDateStr: string,
  timeZone: string = DEFAULT_SHOP_TIMEZONE,
  nowDate: Date = new Date()
): T[] => {
  if (!slots || slots.length === 0) return [];
  const shopNow = getShopCurrentDateTime(timeZone, nowDate);

  // 1. Past dates: no slots can be booked
  if (selectedDateStr < shopNow.dateStr) {
    return [];
  }

  // 2. Future dates: all configured slots are valid (subject to capacity/breaks)
  if (selectedDateStr > shopNow.dateStr) {
    return slots;
  }

  // 3. Today: ONLY slots whose start time is strictly in the future (has not started yet)
  return slots.filter((slot) => parseTimeToMinutes(slot.start_time) > shopNow.currentMinutes);
};

