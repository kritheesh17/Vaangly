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

export const cleanPaymentProofPath = (rawPathOrUrl: string | null | undefined): string => {
  if (!rawPathOrUrl) return '';
  let path = rawPathOrUrl.trim();

  // If it's a full URL containing '/payment-proofs/':
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const parsed = new URL(path);
      const marker = '/payment-proofs/';
      const idx = parsed.pathname.indexOf(marker);
      if (idx !== -1) {
        path = decodeURIComponent(parsed.pathname.substring(idx + marker.length));
      }
    } catch {
      // ignore
    }
  }

  // Strip leading bucket name if present
  if (path.startsWith('payment-proofs/')) {
    path = path.substring('payment-proofs/'.length);
  }

  // Strip leading slashes
  return path.replace(/^\/+/, '');
};

export const resolvePaymentProofUrl = async (
  rawPathOrUrl: string | null | undefined
): Promise<PaymentProofResolutionResult> => {
  if (!rawPathOrUrl || !rawPathOrUrl.trim()) {
    return { url: null, error: 'MISSING' };
  }

  const raw = rawPathOrUrl.trim();

  // If already a local blob URL, data URI, or pre-signed URL with signature token:
  if (raw.startsWith('blob:') || raw.startsWith('data:') || (raw.startsWith('http') && raw.includes('token='))) {
    return { url: raw, error: 'NONE' };
  }

  const cleanPath = cleanPaymentProofPath(raw);
  if (!cleanPath) {
    return { url: null, error: 'MISSING' };
  }

  if (!isSupabaseConfigured) {
    return { url: raw, error: 'NONE' };
  }

  try {
    // 1. Generate short-lived signed URL (3600 seconds = 1 hour)
    const { data, error } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(cleanPath, 3600);

    if (!error && data?.signedUrl) {
      return { url: data.signedUrl, error: 'NONE' };
    }

    // 2. Check if cleanPath is already an active external HTTP URL
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return { url: raw, error: 'NONE' };
    }

    if (error?.message?.toLowerCase().includes('not found')) {
      return { url: null, error: 'UNAVAILABLE' };
    }

    return { url: null, error: 'LOAD_FAILED' };
  } catch (err) {
    console.error('Error resolving payment proof signed URL:', err);
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return { url: raw, error: 'NONE' };
    }
    return { url: null, error: 'LOAD_FAILED' };
  }
};

