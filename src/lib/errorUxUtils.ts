/**
 * Vaangly Error Visibility & UX Utilities
 * Provides consistent error scrolling, focus management, and error classification.
 */

export interface ErrorClassification {
  kind: 'validation' | 'network' | 'auth' | 'business_rule' | 'server';
  category: 'validation' | 'network' | 'auth' | 'business_rule' | 'server';
  title?: string;
  message: string;
  canRetry: boolean;
}

/**
 * Classifies an error into actionable UX categories (validation, network, auth, business rule, server).
 */
export function classifyError(error: unknown, fallbackMessage = 'An unexpected error occurred.'): ErrorClassification {
  const rawMsg =
    typeof error === 'string'
      ? error
      : error instanceof Error
      ? error.message
      : (error as any)?.message || (error as any)?.error_description || fallbackMessage;

  const lower = rawMsg.toLowerCase();

  // 1. Network / Connectivity Failures
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('offline') ||
    lower.includes('timeout') ||
    lower.includes('connection refused') ||
    lower.includes('internet')
  ) {
    return {
      kind: 'network',
      category: 'network',
      title: 'Connection Issue',
      message: 'Unable to reach the server. Please check your internet connection and try again.',
      canRetry: true,
    };
  }

  // 2. Authentication & Authorization Failures
  if (
    lower.includes('jwt') ||
    lower.includes('session expired') ||
    lower.includes('unauthorized') ||
    lower.includes('not authenticated') ||
    lower.includes('forbidden') ||
    lower.includes('permission denied')
  ) {
    return {
      kind: 'auth',
      category: 'auth',
      title: 'Authentication Required',
      message: rawMsg || 'Please sign in to proceed with this action.',
      canRetry: true,
    };
  }

  // 3. Business Rules (e.g. slot taken, minimum order, out of stock)
  if (
    lower.includes('slot') ||
    lower.includes('booked') ||
    lower.includes('capacity') ||
    lower.includes('out of stock') ||
    lower.includes('unavailable') ||
    lower.includes('closed')
  ) {
    return {
      kind: 'business_rule',
      category: 'business_rule',
      title: 'Booking Unavailable',
      message: rawMsg,
      canRetry: true,
    };
  }

  // 4. Validation & Incomplete Selection Failures
  if (
    lower.includes('choose') ||
    lower.includes('select') ||
    lower.includes('required') ||
    lower.includes('valid') ||
    lower.includes('invalid') ||
    lower.includes('enter') ||
    lower.includes('please provide') ||
    lower.includes('mismatch') ||
    lower.includes('at least')
  ) {
    return {
      kind: 'validation',
      category: 'validation',
      title: 'Action Required',
      message: rawMsg,
      canRetry: false,
    };
  }

  // 5. Default Server / API Failure
  return {
    kind: 'server',
    category: 'server',
    title: 'Server Error',
    message: rawMsg,
    canRetry: true,
  };
}

export interface ScrollAndFocusOptions {
  /** Offset in pixels from viewport bottom (for sticky footers / mobile nav). Defaults to 80px */
  bottomBuffer?: number;
  /** Offset in pixels from viewport top (for sticky headers). Defaults to 70px */
  topBuffer?: number;
  /** Preferred scroll positioning. Defaults to 'center' */
  block?: ScrollLogicalPosition;
  /** Whether to set keyboard focus to the target element */
  focus?: boolean;
}

/**
 * Safely scrolls an error element or form field into view and manages focus without
 * getting obscured by sticky bottom bars (like mobile cart bars or nav bars).
 */
export function scrollAndFocusError(
  target: string | HTMLElement | null | undefined,
  options: ScrollAndFocusOptions = {}
): boolean {
  if (typeof window === 'undefined' || !target) return false;

  const element = typeof target === 'string' ? document.getElementById(target) : target;
  if (!element) return false;

  const {
    bottomBuffer = 85,
    topBuffer = 70,
    block = 'center',
    focus = true,
  } = options;

  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;

  // Check if comfortably in viewport with header and footer buffers
  const isComfortablyVisible =
    rect.top >= topBuffer && rect.bottom <= windowHeight - bottomBuffer;

  if (!isComfortablyVisible) {
    try {
      element.scrollIntoView({ behavior: 'smooth', block });
    } catch {
      element.scrollIntoView(true);
    }
  }

  if (focus) {
    // If element is not naturally focusable, set tabindex="-1" temporarily or permanently
    if (!element.hasAttribute('tabindex') && !('focus' in element && (element as any).type)) {
      element.setAttribute('tabindex', '-1');
    }
    try {
      (element as HTMLElement).focus({ preventScroll: true });
    } catch {
      // Ignore focus errors
    }
  }

  return true;
}
