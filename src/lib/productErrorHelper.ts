/**
 * Product Error Helper
 * Classifies Supabase PostgREST, network, and database errors into friendly,
 * actionable shopkeeper messages. Never leaks raw SQL or internal error strings.
 */

export interface ClassifiedProductError {
  userMessage: string;
  isRetryable: boolean;
  category: 'validation' | 'permission' | 'not_found' | 'network' | 'conflict' | 'unknown';
}

export function classifyProductError(err: unknown): ClassifiedProductError {
  if (!err) {
    return {
      userMessage: "Couldn't save your changes. Please try again. If the problem continues, refresh the page and try again.",
      isRetryable: true,
      category: 'unknown',
    };
  }

  // Safe property extraction from PostgrestError, Error, or plain object
  const errObj = typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const code = typeof errObj.code === 'string' ? errObj.code : '';
  const rawMessage = typeof errObj.message === 'string' ? errObj.message : (err instanceof Error ? err.message : String(err));
  const details = typeof errObj.details === 'string' ? errObj.details : '';

  const combined = `${code} ${rawMessage} ${details}`.toLowerCase();

  // 1. Network / Connectivity Failure
  if (
    combined.includes('failed to fetch') ||
    combined.includes('networkerror') ||
    combined.includes('network error') ||
    combined.includes('net::err_') ||
    combined.includes('offline') ||
    combined.includes('timeout') ||
    combined.includes('abort')
  ) {
    return {
      userMessage: "Couldn't connect to the server. Check your internet connection and try again.",
      isRetryable: true,
      category: 'network',
    };
  }

  // 2. Permission / RLS Failure
  if (
    code === '42501' ||
    combined.includes('permission denied') ||
    combined.includes('violates row-level security') ||
    combined.includes('unauthorized') ||
    combined.includes('access denied') ||
    combined.includes('not allowed')
  ) {
    return {
      userMessage: "You don't have permission to edit this product.",
      isRetryable: false,
      category: 'permission',
    };
  }

  // 3. Product No Longer Exists (e.g., deleted concurrently or 0 rows returned)
  if (
    code === 'PGRST116' ||
    combined.includes('0 rows') ||
    combined.includes('contains 0 rows') ||
    combined.includes('not found') ||
    combined.includes('does not exist')
  ) {
    return {
      userMessage: "This product is no longer available in your catalogue. Please refresh the page.",
      isRetryable: false,
      category: 'not_found',
    };
  }

  // 4. Concurrent / Stale Data Conflict
  if (
    code === '40001' ||
    (code === '23505' && combined.includes('concurrent')) ||
    combined.includes('conflict') ||
    combined.includes('stale') ||
    combined.includes('version mismatch')
  ) {
    return {
      userMessage: "This product was updated elsewhere. Please refresh the page and try again.",
      isRetryable: false,
      category: 'conflict',
    };
  }

  // 5. Validation Failure / Constraint Violation
  if (
    code === '23514' || // check constraint
    code === '23502' || // not-null constraint
    code === '22P02' || // invalid input syntax
    code === 'PGRST204' || // schema cache / invalid column
    combined.includes('check constraint') ||
    combined.includes('validation') ||
    combined.includes('negative') ||
    combined.includes('required') ||
    combined.includes('must have valid attributes')
  ) {
    return {
      userMessage: "Please check the product details and try again.",
      isRetryable: true,
      category: 'validation',
    };
  }

  // 6. Temporary / Unknown Save Failure
  return {
    userMessage: "Couldn't save your changes. Please try again. If the problem continues, refresh the page and try again.",
    isRetryable: true,
    category: 'unknown',
  };
}

export interface ClassifiedApplicationError {
  userMessage: string;
  isRetryable: boolean;
  category: 'validation' | 'permission' | 'session' | 'duplicate' | 'network' | 'storage' | 'system' | 'unknown';
}

/**
 * Classifies Shopkeeper Application submission errors into actionable shopkeeper messages
 * or non-blaming system error messages. Never exposes raw SQL, PostgreSQL codes, or table names.
 */
export function classifyApplicationError(err: unknown): ClassifiedApplicationError {
  if (!err) {
    return {
      userMessage: "Couldn't submit your application right now. Your entered information has been preserved. Please try again.",
      isRetryable: true,
      category: 'unknown',
    };
  }

  // Safe property extraction
  const errObj = typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const code = typeof errObj.code === 'string' ? errObj.code : '';
  const rawMessage = typeof errObj.message === 'string' ? errObj.message : (err instanceof Error ? err.message : String(err));
  const details = typeof errObj.details === 'string' ? errObj.details : '';
  const hint = typeof errObj.hint === 'string' ? errObj.hint : '';

  const combined = `${code} ${rawMessage} ${details} ${hint}`.toLowerCase();

  // 1. Session / Authentication Expired
  if (
    combined.includes('jwt expired') ||
    combined.includes('session expired') ||
    combined.includes('session_expired') ||
    combined.includes('invalid jwt') ||
    combined.includes('refresh_token_not_found') ||
    combined.includes('please sign in') ||
    combined.includes('sign in first') ||
    combined.includes('authentication verification timed out') ||
    errObj.status === 401
  ) {
    return {
      userMessage: 'Your session has expired. Please sign in again to submit your application.',
      isRetryable: false,
      category: 'session',
    };
  }

  // 2. Network / Connectivity Failure
  if (
    combined.includes('failed to fetch') ||
    combined.includes('networkerror') ||
    combined.includes('network error') ||
    combined.includes('net::err_') ||
    combined.includes('offline') ||
    combined.includes('timeout') ||
    combined.includes('abort')
  ) {
    return {
      userMessage: "We couldn't connect to Vaangly. Check your internet connection and try again.",
      isRetryable: true,
      category: 'network',
    };
  }

  // 3. Storage Upload Errors
  if (
    combined.includes('storage') ||
    combined.includes('bucket') ||
    combined.includes('unable to upload') ||
    combined.includes('upload timed out') ||
    combined.includes('shop-photos') ||
    combined.includes('shop-documents')
  ) {
    if (combined.includes('payload too large') || combined.includes('too large') || combined.includes('size limit')) {
      return {
        userMessage: 'That file is too large. Please upload a smaller file.',
        isRetryable: true,
        category: 'storage',
      };
    }
    return {
      userMessage: "Couldn't upload your storefront photos or documents. Please check your internet connection and try again.",
      isRetryable: true,
      category: 'storage',
    };
  }

  // 4. Duplicate Application
  if (
    code === '23505' ||
    combined.includes('duplicate key') ||
    combined.includes('already exists') ||
    combined.includes('application under review') ||
    combined.includes('already submitted')
  ) {
    return {
      userMessage: 'You already have an application under review. Please wait for admin review.',
      isRetryable: false,
      category: 'duplicate',
    };
  }

  // 5. Specific Validation & Constraint Failures
  if (combined.includes('upi qr code is required') || combined.includes('upi_qr')) {
    return {
      userMessage: 'UPI QR code is required to accept UPI payments.',
      isRetryable: true,
      category: 'validation',
    };
  }

  if (code === '23503' || combined.includes('foreign key')) {
    return {
      userMessage: 'Invalid town or category selected. Please re-select your town and category.',
      isRetryable: true,
      category: 'validation',
    };
  }

  if (code === '23502') { // Not-null constraint
    return {
      userMessage: 'Please enter all required business and address information before submitting.',
      isRetryable: true,
      category: 'validation',
    };
  }

  // 6. Permission / RLS Failure
  if (
    code === '42501' ||
    combined.includes('permission denied') ||
    combined.includes('violates row-level security') ||
    combined.includes('unauthorized') ||
    combined.includes('access denied') ||
    combined.includes('not allowed')
  ) {
    return {
      userMessage: "You don't have permission to submit an application with this account. Please sign in with your partner account.",
      isRetryable: false,
      category: 'permission',
    };
  }

  // 7. System / Database Failure (Never leak raw SQL or PostgreSQL codes)
  return {
    userMessage: "Couldn't submit your application right now. Your entered information has been preserved. Please try again.",
    isRetryable: true,
    category: 'system',
  };
}
