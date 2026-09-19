import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const configuredAppUrl = import.meta.env.VITE_APP_URL?.trim().replace(/\/$/, '');

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable');
}

if (!supabasePublishableKey) {
  throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY environment variable');
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);

export const getAuthRedirectUrl = (redirectPath?: string): string => {
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isWebOrigin = browserOrigin.startsWith('http://') || browserOrigin.startsWith('https://');
  // Always favor the current active browser origin so dynamic local dev ports (3000, 3001) and staging work seamlessly
  const baseAppUrl = isWebOrigin
    ? browserOrigin
    : (configuredAppUrl || 'https://vaangly.vercel.app');

  const callbackUrl = `${baseAppUrl}/auth/callback`;
  if (redirectPath && redirectPath !== '/') {
    return `${callbackUrl}?redirect=${encodeURIComponent(redirectPath)}`;
  }
  return callbackUrl;
};

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  !supabaseUrl.includes('your-project-id') &&
  supabaseUrl.startsWith('https://')
);
