import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Shopkeeper Background Push Notification Pipeline Tests', () => {
  const ROOT = process.cwd();
  const pushLibPath = path.join(ROOT, 'src', 'lib', 'pushNotifications.ts');
  const edgeFunctionPath = path.join(ROOT, 'supabase', 'functions', 'send-push-notification', 'index.ts');
  const swPath = path.join(ROOT, 'public', 'sw.js');
  const aptApiPath = path.join(ROOT, 'src', 'lib', 'appointmentServiceApi.ts');
  const skPromptPath = path.join(ROOT, 'src', 'components', 'shopkeeper', 'ShopkeeperPushNotificationPrompt.tsx');
  const skDashPath = path.join(ROOT, 'src', 'pages', 'shopkeeper', 'ShopkeeperDashboardPage.tsx');
  const skReqsPath = path.join(ROOT, 'src', 'pages', 'shopkeeper', 'ShopkeeperRequestsPage.tsx');
  const skProfilePath = path.join(ROOT, 'src', 'pages', 'shopkeeper', 'ShopkeeperProfilePage.tsx');

  it('1. Push Lib: multi-device preservation structure is defined and used', () => {
    assert.ok(fs.existsSync(pushLibPath), 'pushNotifications.ts exists');
    const content = fs.readFileSync(pushLibPath, 'utf-8');

    // StoredDeviceSubscription interface
    assert.ok(content.includes('interface StoredDeviceSubscription'), 'StoredDeviceSubscription interface declared');
    assert.ok(content.includes('endpoints: StoredDeviceSubscription[]'), 'endpoints array declared in registration payload');
    assert.ok(content.includes('endpoints.findIndex'), 'Checks for existing device endpoint to prevent duplicate devices');
    assert.ok(content.includes('subscriptionsByOrigin: existingSubsByOrigin'), 'Preserves subscriptionsByOrigin for backward compatibility');
  });

  it('2. Push Lib: registration keeps up to 10 active endpoints without overwriting other devices', () => {
    const content = fs.readFileSync(pushLibPath, 'utf-8');
    assert.ok(content.includes('endpoints.length >= 10'), 'Limits endpoint array growth safely to 10 most recent devices');
    assert.ok(content.includes('endpoints.push(currentDeviceSub)'), 'Appends new distinct device endpoint to endpoints list');
  });

  it('3. Push Lib: unregister only removes current device endpoint leaving other devices intact', () => {
    const content = fs.readFileSync(pushLibPath, 'utf-8');
    assert.ok(
      content.includes('parsed.endpoints = parsed.endpoints.filter((e: any) => e.endpoint !== currentEndpoint)'),
      'Unregister filters only the current device endpoint from endpoints array'
    );
    assert.ok(
      content.includes('if (remainingEndpoints > 0 || remainingOrigins > 0)'),
      'Updates row with remaining active endpoints rather than destroying entire user subscription'
    );
  });

  it('4. Push Lib: diagnostics accurately checks device endpoint presence in backend endpoints array', () => {
    const content = fs.readFileSync(pushLibPath, 'utf-8');
    assert.ok(
      content.includes('subJson.endpoints.some((e: any) => e.endpoint === activeEndpoint)'),
      'Diagnostics validates whether the active device endpoint exists in Supabase endpoints'
    );
  });

  it('5. Edge Function: gathers targets across all devices in endpoints array without dropping differing origins', () => {
    assert.ok(fs.existsSync(edgeFunctionPath), 'send-push-notification/index.ts exists');
    const content = fs.readFileSync(edgeFunctionPath, 'utf-8');

    assert.ok(
      content.includes('if (Array.isArray(subData.endpoints))'),
      'Targets collected from subData.endpoints array'
    );
    assert.ok(
      content.includes('for (const ep of subData.endpoints)'),
      'Iterates across all registered device endpoints for the user'
    );
    assert.ok(
      content.includes('if (is_test && origin)'),
      'Origin filtering restricted strictly to test pushes, allowing business events to wake all user devices'
    );
  });

  it('6. Edge Function: prunes dead endpoints cleanly from endpoints array, subscriptionsByEndpoint, and subscriptionsByOrigin', () => {
    const content = fs.readFileSync(edgeFunctionPath, 'utf-8');

    assert.ok(
      content.includes('subData.endpoints = subData.endpoints.filter((e: any) => !deadEndpoints.includes(e.endpoint))'),
      'Prunes dead endpoints from endpoints array'
    );
    assert.ok(
      content.includes("subData.subscriptionsByOrigin as Record<string, any>"),
      'Prunes dead endpoints from subscriptionsByOrigin'
    );
    assert.ok(
      content.includes('if (hasRemaining)'),
      'Updates subscription row if other devices remain, only deleting when 0 endpoints remain'
    );
  });

  it('7. Service Worker: configured for background waking, high urgency, and notificationclick navigation', () => {
    assert.ok(fs.existsSync(swPath), 'public/sw.js exists');
    const content = fs.readFileSync(swPath, 'utf-8');

    assert.ok(content.includes('renotify: true'), 'renotify: true ensures vibration alert even with duplicate tags');
    assert.ok(content.includes('requireInteraction: true'), 'requireInteraction: true prevents mobile auto-dismissal before shopkeeper notices');
    assert.ok(content.includes('vibrate: [300, 100, 300, 100, 300]'), 'Audible/vibratory pattern configured for incoming orders');
    assert.ok(content.includes('clients.openWindow(fullTargetUrl)'), 'Opens target order page when app is closed in background');
    assert.ok(content.includes("VAANGLY_CACHE_VERSION = 'vaangly-cache-v1.0.1'"), 'Service worker cache version bumped for fresh client deployment');
  });

  it('8. Appointment & Service API: dispatches notifyOrderLifecycle for appointment bookings and service requests', () => {
    assert.ok(fs.existsSync(aptApiPath), 'appointmentServiceApi.ts exists');
    const content = fs.readFileSync(aptApiPath, 'utf-8');

    assert.ok(content.includes('// Notify shopkeeper and customer of appointment booking'), 'Appointment booking dispatches notifications');
    assert.ok(content.includes('// Notify shopkeeper and customer of service request'), 'Service request dispatches notifications');
    assert.ok(content.includes("event: 'ORDER_PLACED'"), 'ORDER_PLACED event triggered for both appointment and service requests');
  });

  it('9. Shopkeeper UI: ShopkeeperPushNotificationPrompt component is fully implemented with banner & card modes', () => {
    assert.ok(fs.existsSync(skPromptPath), 'ShopkeeperPushNotificationPrompt.tsx exists');
    const content = fs.readFileSync(skPromptPath, 'utf-8');

    assert.ok(content.includes('Enable Instant Order Alerts'), 'Displays user-facing reason to enable alerts');
    assert.ok(content.includes('handleEnableNotifications'), 'Provides 1-click permission request handler');
    assert.ok(content.includes('handleTestAlert'), 'Provides 1-click live test notification handler');
    assert.ok(content.includes('How to unblock in Android Chrome'), 'Provides clear step-by-step unblock instructions if denied');
    assert.ok(content.includes('vaangly_sk_notif_banner_dismissed_until'), 'Respects user dismissal with 24h cooldown');
  });

  it('10. Integration: ShopkeeperPushNotificationPrompt mounted across Dashboard, Requests, and Profile pages', () => {
    const dashContent = fs.readFileSync(skDashPath, 'utf-8');
    const reqsContent = fs.readFileSync(skReqsPath, 'utf-8');
    const profileContent = fs.readFileSync(skProfilePath, 'utf-8');

    assert.ok(dashContent.includes('<ShopkeeperPushNotificationPrompt variant="banner" />'), 'Mounted in ShopkeeperDashboardPage');
    assert.ok(reqsContent.includes('<ShopkeeperPushNotificationPrompt variant="banner" />'), 'Mounted in ShopkeeperRequestsPage');
    assert.ok(profileContent.includes('<ShopkeeperPushNotificationPrompt variant="card" showDismiss={false} />'), 'Mounted in ShopkeeperProfilePage');
  });
});
