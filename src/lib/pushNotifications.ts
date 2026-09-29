import { supabase, isSupabaseConfigured } from './supabase';

const DEFAULT_VAPID_PUBLIC_KEY = 'BKuzP4a6YMPxqykLZz4F9OzckD3D9cY5THfBV-3EgKt8ZLFi3Cg3fE4pHdhab5Po9MzRcw32-DDm5JQJFKy0LbI';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;

export interface TestPushResult {
  timestamp: string;
  testType: 'Test A (Local SW)' | 'Test B (Cloud Web Push)';
  success: boolean;
  message: string;
}

export interface NotificationDiagnosticsData {
  environment: 'Localhost' | 'Production';
  origin: string;
  permission: 'default' | 'granted' | 'denied' | 'unsupported';
  swStatus: 'registered' | 'active' | 'waiting' | 'failed' | 'unsupported';
  pushSupported: boolean;
  pushSubscription: 'subscribed' | 'not subscribed';
  maskedEndpoint: string;
  backendRegistration: 'registered' | 'failed' | 'login_required' | 'not_registered';
  lastTestPush: TestPushResult | null;
}

// In-memory record of the last test push in the current session
let lastTestPushResult: TestPushResult | null = null;

export function getCurrentOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export function isLocalhostEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function maskEndpoint(endpoint: string | null | undefined): string {
  if (!endpoint) return 'None (Not Subscribed)';
  if (endpoint.length <= 36) return endpoint;
  const prefix = endpoint.slice(0, 24);
  const suffix = endpoint.slice(-8);
  return `${prefix}...${suffix}`;
}

export function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0))).buffer as ArrayBuffer;
}

/**
 * Reads live notification diagnostics for development and system health verification
 */
export async function getNotificationDiagnostics(): Promise<NotificationDiagnosticsData> {
  const isLocal = isLocalhostEnvironment();
  const origin = getCurrentOrigin();

  let permission: NotificationDiagnosticsData['permission'] = 'unsupported';
  if (typeof window !== 'undefined' && 'Notification' in window) {
    permission = Notification.permission;
  }

  let swStatus: NotificationDiagnosticsData['swStatus'] = 'unsupported';
  let pushSupported = false;
  let pushSubscription: NotificationDiagnosticsData['pushSubscription'] = 'not subscribed';
  let maskedEndpoint = 'None (Not Subscribed)';
  let backendRegistration: NotificationDiagnosticsData['backendRegistration'] = 'not_registered';

  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        if (registration.active) swStatus = 'active';
        else if (registration.waiting) swStatus = 'waiting';
        else swStatus = 'registered';

        if ('pushManager' in registration) {
          pushSupported = true;
          const sub = await registration.pushManager.getSubscription();
          if (sub) {
            pushSubscription = 'subscribed';
            maskedEndpoint = maskEndpoint(sub.endpoint);
          }
        }
      } else {
        swStatus = 'failed';
      }
    } catch {
      swStatus = 'failed';
    }
  }

  // Check backend registration status if Supabase is active
  if (isSupabaseConfigured) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        backendRegistration = 'login_required';
      } else {
        const { data: record, error } = await supabase
          .from('push_subscriptions')
          .select('subscription, platform, endpoint')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          backendRegistration = 'failed';
        } else if (record) {
          let subJson = record.subscription;
          if (typeof subJson === 'string') {
            try { subJson = JSON.parse(subJson); } catch {}
          }

          // Check if subscription exists for this specific origin or globally
          if (subJson?.subscriptionsByOrigin?.[origin] || subJson?.endpoint) {
            backendRegistration = 'registered';
          } else {
            backendRegistration = 'not_registered';
          }
        } else {
          backendRegistration = 'not_registered';
        }
      }
    } catch {
      backendRegistration = 'failed';
    }
  }

  return {
    environment: isLocal ? 'Localhost' : 'Production',
    origin,
    permission,
    swStatus,
    pushSupported,
    pushSubscription,
    maskedEndpoint,
    backendRegistration,
    lastTestPush: lastTestPushResult,
  };
}

/**
 * Registers or restores a Web Push subscription with strict origin separation.
 * Localhost and Production subscriptions are isolated and never overwrite each other.
 */
export async function registerPushSubscription(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !VAPID_PUBLIC_KEY
  ) {
    return false;
  }

  const permission = Notification.permission;
  if (permission !== 'granted') return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    let existing = await registration.pushManager.getSubscription();

    // Check if existing subscription was created with the active VAPID key
    if (existing && existing.options && existing.options.applicationServerKey) {
      const existingKeyBuf = new Uint8Array(existing.options.applicationServerKey);
      const expectedKeyBuf = new Uint8Array(urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY));
      let isMatch = existingKeyBuf.length === expectedKeyBuf.length;
      if (isMatch) {
        for (let i = 0; i < existingKeyBuf.length; i++) {
          if (existingKeyBuf[i] !== expectedKeyBuf[i]) {
            isMatch = false;
            break;
          }
        }
      }
      if (!isMatch) {
        try {
          await existing.unsubscribe();
        } catch {
          // ignore
        }
        existing = null;
      }
    }

    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
      }));

    if (isSupabaseConfigured) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const origin = getCurrentOrigin();
        const isLocal = isLocalhostEnvironment();
        const rawJson = subscription.toJSON();

        // 1. Fetch existing subscription row to preserve other environments (e.g. production vs localhost)
        const { data: existingRow } = await supabase
          .from('push_subscriptions')
          .select('subscription, platform, endpoint')
          .eq('user_id', user.id)
          .maybeSingle();

        let existingSubsByOrigin: Record<string, unknown> = {};
        if (existingRow?.subscription) {
          let parsed = existingRow.subscription;
          if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch {}
          }
          if (parsed && typeof parsed === 'object') {
            if (parsed.subscriptionsByOrigin) {
              existingSubsByOrigin = { ...parsed.subscriptionsByOrigin };
            } else if (parsed.endpoint) {
              const legacyOrigin = parsed.origin || (existingRow.platform === 'localhost' ? 'http://localhost' : 'https://vaangly.vercel.app');
              existingSubsByOrigin[legacyOrigin] = {
                endpoint: parsed.endpoint,
                keys: parsed.keys,
                platform: existingRow.platform || 'web',
                origin: legacyOrigin,
                updated_at: new Date().toISOString(),
              };
            }
          }
        }

        // 2. Add or update current origin's subscription
        existingSubsByOrigin[origin] = {
          endpoint: subscription.endpoint,
          keys: rawJson.keys,
          platform: isLocal ? 'localhost' : 'web',
          origin,
          updated_at: new Date().toISOString(),
        };

        const subscriptionPayload = {
          ...rawJson,
          origin,
          environment: isLocal ? 'localhost' : 'production',
          platform: isLocal ? 'localhost' : 'web',
          subscriptionsByOrigin: existingSubsByOrigin,
        };

        const { error } = await supabase.from('push_subscriptions').upsert(
          {
            user_id: user.id,
            endpoint: subscription.endpoint,
            platform: isLocal ? 'localhost' : 'web',
            subscription: subscriptionPayload,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

        if (error) {
          console.warn('[Vaangly Push] Failed to upsert subscription into Supabase:', error);
          return false;
        }
      }
    }
    return true;
  } catch (err) {
    console.warn('[Vaangly Push] Error registering push subscription:', err);
    return false;
  }
}

/**
 * Safely unregisters push subscription for the current origin without destroying
 * other environments' subscriptions for this user.
 */
export async function unregisterPushSubscription(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }

    if (isSupabaseConfigured) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const origin = getCurrentOrigin();
        const { data: existingRow } = await supabase
          .from('push_subscriptions')
          .select('subscription')
          .eq('user_id', user.id)
          .maybeSingle();

        if (existingRow?.subscription) {
          let parsed = existingRow.subscription;
          if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch {}
          }
          if (parsed?.subscriptionsByOrigin) {
            delete parsed.subscriptionsByOrigin[origin];
            const remainingOrigins = Object.keys(parsed.subscriptionsByOrigin);
            if (remainingOrigins.length > 0) {
              // Update with remaining environments
              await supabase
                .from('push_subscriptions')
                .update({
                  subscription: parsed,
                  updated_at: new Date().toISOString(),
                })
                .eq('user_id', user.id);
              return;
            }
          }
        }
        // If no other environments remain, delete row
        await supabase.from('push_subscriptions').delete().eq('user_id', user.id);
      }
    }
  } catch (err) {
    console.warn('[Vaangly Push] Error unregistering push subscription:', err);
  }
}

/**
 * TEST A — Local Service-Worker Notification
 * Directly tests navigator.serviceWorker.ready -> registration.showNotification(...)
 * Verifies that the local browser/device notification capability works even without cloud backend.
 */
export async function sendLocalSwTestNotification(): Promise<{ success: boolean; message: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    const res = { success: false, message: 'Notifications are not supported by this browser.' };
    recordTestPush('Test A (Local SW)', res.success, res.message);
    return res;
  }

  if (Notification.permission !== 'granted') {
    const res = { success: false, message: 'Notification permission has not been granted yet.' };
    recordTestPush('Test A (Local SW)', res.success, res.message);
    return res;
  }

  if (!('serviceWorker' in navigator)) {
    const res = { success: false, message: 'Service worker is not supported in this browser.' };
    recordTestPush('Test A (Local SW)', res.success, res.message);
    return res;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const origin = getCurrentOrigin();

    await registration.showNotification('Vaangly Test (Local SW)', {
      body: `Local Service Worker notification channel is active on ${origin}! 🚀`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'vaangly-local-sw-test',
      data: {
        url: '/permissions',
      },
    } as NotificationOptions);

    const res = { success: true, message: 'Test A passed: Local service-worker notification displayed.' };
    recordTestPush('Test A (Local SW)', true, res.message);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to display service worker notification.';
    recordTestPush('Test A (Local SW)', false, message);
    return { success: false, message };
  }
}

/**
 * TEST B — Real Web Push via Cloud Supabase Edge Function
 * Sends through Edge Function -> Web Push Service -> Browser -> SW push event -> showNotification()
 */
export async function sendCloudEdgePushNotification(userId?: string): Promise<{ success: boolean; message: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    const res = { success: false, message: 'Notifications are not supported by this browser.' };
    recordTestPush('Test B (Cloud Web Push)', false, res.message);
    return res;
  }

  if (Notification.permission !== 'granted') {
    const res = { success: false, message: 'Notification permission has not been granted yet.' };
    recordTestPush('Test B (Cloud Web Push)', false, res.message);
    return res;
  }

  if (!isSupabaseConfigured) {
    const res = { success: false, message: 'Supabase backend is not configured.' };
    recordTestPush('Test B (Cloud Web Push)', false, res.message);
    return res;
  }

  // If no userId is provided, attempt to get active authenticated user
  let targetUserId = userId;
  if (!targetUserId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      targetUserId = user?.id;
    } catch {
      // unauthenticated
    }
  }

  if (!targetUserId) {
    const res = {
      success: false,
      message: 'Cloud Web Push requires an authenticated user. Please sign in to test the Supabase Edge Function pipeline.',
    };
    recordTestPush('Test B (Cloud Web Push)', false, res.message);
    return res;
  }

  try {
    const origin = getCurrentOrigin();
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: targetUserId,
        title: 'Vaangly Real Web Push',
        body: `Live Web Push received on ${origin} via Supabase Edge Function! ✨`,
        url: '/permissions',
        origin,
      },
    });

    if (error) {
      const errMsg = error.message || 'Supabase Edge Function invocation failed.';
      recordTestPush('Test B (Cloud Web Push)', false, errMsg);
      return { success: false, message: errMsg };
    }

    const res = {
      success: true,
      message: `Test B passed: Cloud Web Push dispatched via Supabase Edge Function! (${JSON.stringify(data || 'Sent')})`,
    };
    recordTestPush('Test B (Cloud Web Push)', true, res.message);
    return res;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown Edge Function error.';
    recordTestPush('Test B (Cloud Web Push)', false, errMsg);
    return { success: false, message: errMsg };
  }
}

/**
 * Unified Test Notification
 * Tests the REAL notification pipeline:
 * - Attempts Test B (Real Web Push) if authenticated.
 * - Always falls back to / executes Test A (Local SW) to ensure visual feedback, reporting exact pipeline status.
 */
export async function sendTestPushNotification(userId?: string): Promise<{ success: boolean; message: string }> {
  // If user is authenticated, run real cloud push test (Test B)
  if (userId) {
    const cloudResult = await sendCloudEdgePushNotification(userId);
    if (cloudResult.success) {
      return cloudResult;
    }
  }

  // Run Test A (Local SW Notification)
  const localResult = await sendLocalSwTestNotification();
  if (localResult.success && !userId) {
    return {
      success: true,
      message: 'Local service worker notification displayed. (Note: Sign in to test Cloud Edge Web Push)',
    };
  }
  return localResult;
}

function recordTestPush(testType: 'Test A (Local SW)' | 'Test B (Cloud Web Push)', success: boolean, message: string) {
  lastTestPushResult = {
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    testType,
    success,
    message,
  };
}

/**
 * Dispatches an authenticated business event push notification to a target user.
 * Automatically bundles the current browser origin for strict endpoint routing.
 */
export async function sendBusinessPushNotification({
  userId,
  title,
  body,
  url,
  origin,
}: {
  userId: string;
  title: string;
  body: string;
  url: string;
  origin?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !userId) {
    return { success: false, error: 'Supabase unconfigured or missing userId' };
  }
  try {
    const { error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: userId,
        title,
        body,
        url,
        ...(origin ? { origin } : {}),
      },
    });
    if (error) {
      console.warn('[Business Push] Failed to deliver push:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown push delivery error';
    console.warn('[Business Push] Delivery exception:', msg);
    return { success: false, error: msg };
  }
}

