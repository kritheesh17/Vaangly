import { supabase, isSupabaseConfigured } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0))).buffer as ArrayBuffer;
}

export async function registerPushSubscription(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) {
    return false;
  }

  const permission = Notification.permission;
  if (permission !== 'granted') return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
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
        const { error } = await supabase.from('push_subscriptions').upsert(
          {
            user_id: user.id,
            subscription: JSON.stringify(subscription),
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
        await supabase.from('push_subscriptions').delete().eq('user_id', user.id);
      }
    }
  } catch (err) {
    console.warn('[Vaangly Push] Error unregistering push subscription:', err);
  }
}

/**
 * Triggers a real test notification:
 * 1. Shows a real notification via ServiceWorkerRegistration.showNotification (works in standalone PWA & Mobile Chrome)
 * 2. If user_id is provided, dispatches an actual network push through the Supabase edge function
 */
export async function sendTestPushNotification(userId?: string): Promise<{ success: boolean; message: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { success: false, message: 'Notifications are not supported by this browser.' };
  }

  if (Notification.permission !== 'granted') {
    return { success: false, message: 'Notification permission has not been granted.' };
  }

  try {
    if (!('serviceWorker' in navigator)) {
      return { success: false, message: 'Service worker is not supported on this browser.' };
    }

    const registration = await navigator.serviceWorker.ready;

    // Trigger device notification via Service Worker
    await registration.showNotification('Vaangly Test Notification', {
      body: 'Your device notification channel is working and active! ✨',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'vaangly-test-alert',
      data: {
        url: '/permissions',
      },
    } as NotificationOptions);

    // If an authenticated user is present, also trigger backend edge push delivery
    if (userId && isSupabaseConfigured) {
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            user_id: userId,
            title: 'Vaangly Live Push Test',
            body: 'Cloud push delivery verified successfully from backend server.',
            url: '/permissions',
          },
        });
      } catch (edgeErr) {
        console.warn('[Vaangly Push] Backend edge function invocation note:', edgeErr);
      }
    }

    return { success: true, message: 'Test notification sent successfully!' };
  } catch (err) {
    console.error('[Vaangly Push] Test notification delivery failed:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to display notification.',
    };
  }
}
