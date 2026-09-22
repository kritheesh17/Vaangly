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
