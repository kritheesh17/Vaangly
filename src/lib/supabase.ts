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

export const getAuthRedirectUrl = (): string => {
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isWebOrigin = browserOrigin.startsWith('http://') || browserOrigin.startsWith('https://');
  const isLocalBrowserOrigin = /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(browserOrigin);
  const appUrl = isWebOrigin && !isLocalBrowserOrigin
    ? browserOrigin
    : configuredAppUrl || browserOrigin;
  return `${appUrl}/auth/callback`;
};

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabasePublishableKey &&
  !supabaseUrl.includes('your-project-id') &&
  supabaseUrl.startsWith('https://')
);
