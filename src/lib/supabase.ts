import { createClient } from '@supabase/supabase-js';

const getEnvVar = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabasePublishableKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');
const configuredAppUrl = getEnvVar('VITE_APP_URL')?.trim().replace(/\/$/, '');

if (!supabaseUrl && typeof window !== 'undefined') {
  throw new Error('Missing VITE_SUPABASE_URL environment variable');
}

if (!supabasePublishableKey && typeof window !== 'undefined') {
  throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY environment variable');
}

export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabasePublishableKey || 'dummy-key'
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

const isValidSupabaseUrl = (url: string): boolean => {
  if (url.toLowerCase().includes('your-project-id')) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    const isLocalHttp =
      parsedUrl.protocol === 'http:' &&
      (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1');
    const isHttps = parsedUrl.protocol === 'https:';

    return isHttps || isLocalHttp;
  } catch {
    return false;
  }
};

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  isValidSupabaseUrl(supabaseUrl)
);
