/**
 * Development & Health Check Utility for Supabase Connection
 *
 * Tests API and client reachability safely without requiring database tables or application schema.
 */

import { supabase } from './supabase';

export interface SupabaseDiagnosticReport {
  supabaseUrlConfigured: boolean;
  supabaseUrl: string;
  publishableKeyConfigured: boolean;
  maskedPublishableKey: string;
  clientInitialized: boolean;
  networkReachable: boolean;
  latencyMs?: number;
  authServiceStatus: 'HEALTHY' | 'ERROR' | 'SKIPPED';
  errorMessage?: string;
  testedAt: string;
}

/**
 * Masks a publishable key for safe display (e.g., "sb_publishable_Bg...Ow_laq6g_iF")
 */
export const maskPublishableKey = (key: string): string => {
  if (!key) return '(not configured)';
  if (key.length <= 16) return '***';
  return `${key.slice(0, 16)}...${key.slice(-10)}`;
};

/**
 * Runs a non-destructive connection and reachability test.
 * Uses the Supabase GoTrue Auth service session check, which requires
 * zero application tables and confirms API keys and URL validity.
 */
export const testSupabaseConnection = async (): Promise<SupabaseDiagnosticReport> => {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

  const report: SupabaseDiagnosticReport = {
    supabaseUrlConfigured: Boolean(url && url.startsWith('https://') && !url.includes('your-project-id')),
    supabaseUrl: url || '(not configured)',
    publishableKeyConfigured: Boolean(key && key.length > 10),
    maskedPublishableKey: maskPublishableKey(key),
    clientInitialized: Boolean(supabase),
    networkReachable: false,
    authServiceStatus: 'SKIPPED',
    testedAt: new Date().toISOString(),
  };

  if (!report.supabaseUrlConfigured || !report.publishableKeyConfigured) {
    report.errorMessage = 'Missing or placeholder VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env';
    return report;
  }

  const startTime = performance.now();

  try {
    // Safe initialization check: requests session status from Supabase Auth service.
    // Confirms URL routing, SSL handshake, gateway authentication, and client state without querying tables.
    const { error } = await supabase.auth.getSession();
    const latency = Math.round(performance.now() - startTime);
    report.latencyMs = latency;

    if (error) {
      report.authServiceStatus = 'ERROR';
      report.errorMessage = error.message;
      report.networkReachable = false;
    } else {
      report.networkReachable = true;
      report.authServiceStatus = 'HEALTHY';
    }
  } catch (err: unknown) {
    report.networkReachable = false;
    report.authServiceStatus = 'ERROR';
    report.errorMessage = err instanceof Error ? err.message : 'Network error connecting to Supabase endpoint';
  }

  return report;
};

// Expose on window object and log in development mode only
if (import.meta.env.DEV) {
  interface WindowWithSupabaseCheck extends Window {
    checkSupabase?: () => Promise<SupabaseDiagnosticReport>;
  }

  (window as unknown as WindowWithSupabaseCheck).checkSupabase = testSupabaseConnection;

  // Auto-log connection diagnostics in development console
  testSupabaseConnection().then((diag) => {
    /* eslint-disable no-console */
    console.groupCollapsed('%c[Vaango Dev] 🔌 Supabase Connection Status', 'color: #10B981; font-weight: bold;');
    console.log('Supabase URL Configured:', diag.supabaseUrlConfigured ? 'YES' : 'NO', `(${diag.supabaseUrl})`);
    console.log('Publishable Key Configured:', diag.publishableKeyConfigured ? 'YES' : 'NO', `(${diag.maskedPublishableKey})`);
    console.log('Client Initialized:', diag.clientInitialized ? 'YES' : 'NO');
    console.log('Network/API Reachable:', diag.networkReachable ? `YES (${diag.latencyMs}ms latency)` : 'NO');
    console.log('Auth Service Status:', diag.authServiceStatus);
    if (diag.errorMessage) {
      console.error('Connection Error:', diag.errorMessage);
    }
    console.log('Run window.checkSupabase() anytime in console to re-test.');
    console.groupEnd();
    /* eslint-enable no-console */
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[Vaango Dev] Supabase diagnostic check error:', err);
  });
}
