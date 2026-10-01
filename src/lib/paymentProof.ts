import { supabase, isSupabaseConfigured } from './supabase';

const MAX_PAYMENT_PROOF_BYTES = 10 * 1024 * 1024;
const ALLOWED_PAYMENT_PROOF_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const validatePaymentProofFile = (file: File): string | null => {
  if (!ALLOWED_PAYMENT_PROOF_TYPES.has(file.type.toLowerCase())) {
    return 'Payment proof must be a JPG, PNG, WEBP, or GIF image.';
  }
  if (file.size <= 0 || file.size > MAX_PAYMENT_PROOF_BYTES) {
    return 'Payment proof must be smaller than 10MB.';
  }
  return null;
};

export const uploadPendingPaymentProof = async (file: File, userId: string): Promise<string> => {
  const validationError = validatePaymentProofFile(file);
  if (validationError) throw new Error(validationError);
  if (!isSupabaseConfigured) return `pending/${userId}/demo-${Date.now()}.jpg`;

  const extension = file.type.split('/')[1] || 'jpg';
  const path = `pending/${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('payment-proofs').upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
};

export const removePendingPaymentProof = async (path: string | null): Promise<void> => {
  if (!path || !isSupabaseConfigured || !path.startsWith('pending/')) return;
  await supabase.storage.from('payment-proofs').remove([path]);
};

export type PaymentProofResolutionResult = {
  url: string | null;
  error: 'NONE' | 'MISSING' | 'LOAD_FAILED' | 'UNAVAILABLE';
};

export const isPaymentProofPath = (path: string): boolean => {
  if (!path) return false;
  const lower = path.toLowerCase();
  // Strictly disallow product images, shop photos, catalogue images, or other non-proof buckets
  if (
    lower.startsWith('shop-photos/') ||
    lower.includes('/shop-photos/') ||
    lower.startsWith('products/') ||
    lower.includes('/products/') ||
    lower.startsWith('catalogue/') ||
    lower.includes('/catalogue/') ||
    lower.startsWith('shops/') ||
    lower.includes('/shops/') ||
    lower.startsWith('avatars/') ||
    lower.includes('/avatars/')
  ) {
    return false;
  }

  // Must begin with an authorized payment proof path segment
  return (
    lower.startsWith('pending/') ||
    lower.startsWith('requests/') ||
    lower.startsWith('demo-')
  );
};

export const cleanPaymentProofPath = (rawPathOrUrl: string | null | undefined): string => {
  if (!rawPathOrUrl) return '';
  let path = rawPathOrUrl.trim();

  // If it's a full URL:
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const parsed = new URL(path);
      const marker = '/payment-proofs/';
      const idx = parsed.pathname.indexOf(marker);
      if (idx !== -1) {
        path = decodeURIComponent(parsed.pathname.substring(idx + marker.length));
      } else {
        // Any HTTP URL not in /payment-proofs/ bucket (e.g. shop-photos, product images) is invalid
        return '';
      }
    } catch {
      return '';
    }
  }

  // Strip leading bucket name if present
  if (path.startsWith('payment-proofs/')) {
    path = path.substring('payment-proofs/'.length);
  }

  // Strip leading slashes
  path = path.replace(/^\/+/, '');

  if (!isPaymentProofPath(path)) {
    return '';
  }

  return path;
};

export const resolvePaymentProofUrl = async (
  rawPathOrUrl: string | null | undefined
): Promise<PaymentProofResolutionResult> => {
  if (!rawPathOrUrl || !rawPathOrUrl.trim()) {
    return { url: null, error: 'MISSING' };
  }

  const raw = rawPathOrUrl.trim();
  const lower = raw.toLowerCase();

  // Explicit guard: reject product images, shop photos, and catalogue assets immediately
  if (
    lower.includes('/shop-photos/') ||
    lower.includes('/products/') ||
    lower.startsWith('shop-photos/') ||
    lower.startsWith('products/') ||
    lower.startsWith('catalogue/') ||
    lower.includes('/catalogue/')
  ) {
    console.warn('[PaymentProof] Isolation guard: rejected non-payment-proof asset from proof resolution:', raw);
    return { url: null, error: 'UNAVAILABLE' };
  }

  // If already a local blob URL or data URI created by client file input during upload:
  if (raw.startsWith('blob:') || raw.startsWith('data:')) {
    return { url: raw, error: 'NONE' };
  }

  // If pre-signed URL with signature token, ensure it strictly belongs to payment-proofs bucket
  if (raw.startsWith('http') && raw.includes('token=')) {
    if (raw.includes('/payment-proofs/')) {
      return { url: raw, error: 'NONE' };
    }
    return { url: null, error: 'UNAVAILABLE' };
  }

  const cleanPath = cleanPaymentProofPath(raw);
  if (!cleanPath) {
    return { url: null, error: 'UNAVAILABLE' };
  }

  if (!isSupabaseConfigured) {
    // In mock mode without live Supabase, only allow valid payment proof paths
    if (cleanPath.startsWith('pending/') || cleanPath.startsWith('requests/') || cleanPath.startsWith('demo-')) {
      return { url: raw, error: 'NONE' };
    }
    return { url: null, error: 'UNAVAILABLE' };
  }

  try {
    // 1. Generate short-lived signed URL (3600 seconds = 1 hour) strictly from payment-proofs bucket
    const { data, error } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(cleanPath, 3600);

    if (!error && data?.signedUrl) {
      return { url: data.signedUrl, error: 'NONE' };
    }

    if (error?.message?.toLowerCase().includes('not found')) {
      return { url: null, error: 'UNAVAILABLE' };
    }

    return { url: null, error: 'LOAD_FAILED' };
  } catch (err) {
    console.error('Error resolving payment proof signed URL:', err);
    return { url: null, error: 'LOAD_FAILED' };
  }
};


