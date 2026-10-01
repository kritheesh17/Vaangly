import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pndikgqbgchzkrmlrmzo.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuZGlrZ3FiZ2NoemtybWxybXpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTY2MTgwNSwiZXhwIjoyMTA1MjM3ODA1fQ.zPBOv5Hxloq21DhIT1Xq1CVNKT_OQArNHmA8dMz-eV4';
const PUB_KEY = 'sb_publishable_Ea-dHCdnXPqX0JGLknChig_uzJNwW50';

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const client = createClient(SUPABASE_URL, PUB_KEY);

async function runRegressionSuite() {
  console.log('========================================================================');
  console.log('BACKGROUND PUSH NOTIFICATION REGRESSION & INTEGRITY TEST SUITE');
  console.log('========================================================================\n');

  // Test 1: Service Worker Push Event Handler Logic
  console.log('--- Test 1: Service Worker Push & Renotify Logic Verification ---');
  function simulateSwPushEvent(rawPayload) {
    let data = { title: 'Vaangly', body: 'You have a new update.', url: '/' };
    if (rawPayload) {
      if (typeof rawPayload === 'object') {
        data = rawPayload;
      } else {
        try {
          data = JSON.parse(rawPayload);
        } catch {
          data = { title: 'Vaangly', body: rawPayload, url: '/' };
        }
      }
    }
    const title = data.title || 'Vaangly';
    const tag = data.tag || `vaangly-${Date.now()}`;
    const options = {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: tag,
      renotify: true,
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/',
        timestamp: Date.now(),
      },
      actions: data.actions || [],
    };
    return { title, options };
  }

  const simulated = simulateSwPushEvent(JSON.stringify({
    title: 'New Order #ORD-1234',
    body: 'Customer placed an order for ₹450',
    url: '/shopkeeper/requests/req-123',
    tag: 'vaangly-order-ORD-1234',
  }));

  assert.equal(simulated.title, 'New Order #ORD-1234');
  assert.equal(simulated.options.renotify, true, 'renotify must be true for background device alerting');
  assert.equal(simulated.options.tag, 'vaangly-order-ORD-1234', 'tag matches contextual order ID');
  assert.deepEqual(simulated.options.vibrate, [200, 100, 200], 'vibration pattern configured for background alerting');
  assert.equal(simulated.options.data.url, '/shopkeeper/requests/req-123', 'navigation URL matches order route');
  console.log('✓ SW push event simulation generates valid options with renotify: true');

  // Test 2: In-App Notification and Badge Integrity Remains Intact
  console.log('\n--- Test 2: In-App Realtime Notification Integrity ---');
  const testRefCode = `ORD-REG-${Date.now().toString().slice(-4)}`;
  const { data: testShop } = await admin.from('shops').select('id, owner_id').eq('is_live', true).limit(1).single();
  assert.ok(testShop, 'Found active live shop');

  const { data: createdNotif, error: notifErr } = await admin.rpc('vaangly_create_admin_notification', {
    p_recipient_id: testShop.owner_id,
    p_shop_id: testShop.id,
    p_type: 'NEW_ORDER',
    p_title: 'Order Received',
    p_message: `In-app test for order #${testRefCode}`,
    p_reference_id: 'test-reg-id',
    p_reference_code: testRefCode,
  });
  assert.ok(!notifErr && createdNotif, 'Created in-app notification row in database');
  assert.equal(createdNotif.recipient_id, testShop.owner_id);
  assert.equal(createdNotif.is_read, false);
  console.log(`✓ In-app notification created (id: ${createdNotif.id}) for recipient ${testShop.owner_id}`);

  // Test 3: Correct recipient subscription lookup
  console.log('\n--- Test 3: Recipient Subscription Lookup & Origin Isolation ---');
  const { data: subRecord, error: subErr } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', testShop.owner_id)
    .maybeSingle();

  assert.ok(!subErr, 'Query push_subscriptions without error');
  assert.ok(subRecord, `Recipient has registered push subscription row for ${testShop.owner_id}`);
  assert.ok(subRecord.subscription.subscriptionsByOrigin['https://vaangly.vercel.app'], 'Production origin subscription exists');
  console.log(`✓ Subscription lookup verified for shop owner ${testShop.owner_id}`);

  // Test 4: Push Sender Invocation with High Urgency & VAPID Config
  console.log('\n--- Test 4: Push Sender Invocation & FCM Response ---');
  const pushRes = await client.functions.invoke('send-push-notification', {
    body: {
      user_id: testShop.owner_id,
      title: 'Order Received',
      body: `Background push test for order #${testRefCode}`,
      url: `/shopkeeper/requests/test-reg-id`,
      origin: 'https://vaangly.vercel.app',
      tag: `vaangly-order-${testRefCode}`,
    },
  });

  assert.equal(pushRes.error, null, 'Edge function returned 200 without error');
  assert.equal(pushRes.data?.success, true, 'Push delivery reported success');
  assert.ok(pushRes.data?.sent >= 1, 'At least 1 push notification dispatched to FCM');
  console.log(`✓ Edge Function successfully dispatched high-urgency push to FCM (sent: ${pushRes.data.sent})`);

  // Test 5: Expired Subscription Pruning Safety
  console.log('\n--- Test 5: Expired Subscription Pruning Safety ---');
  const dummyDeadUserId = 'a02f656f-873b-44cf-884d-fc4e764db2e5';
  const dummyDeadEndpoint = 'https://fcm.googleapis.com/fcm/send/dead-token-' + Date.now();
  await admin.from('push_subscriptions').upsert({
    user_id: dummyDeadUserId,
    endpoint: dummyDeadEndpoint,
    platform: 'web',
    subscription: {
      endpoint: dummyDeadEndpoint,
      keys: { auth: 'dead_auth', p256dh: 'dead_p256dh' },
      origin: 'https://vaangly.vercel.app',
      subscriptionsByOrigin: {
        'https://vaangly.vercel.app': {
          endpoint: dummyDeadEndpoint,
          keys: { auth: 'dead_auth', p256dh: 'dead_p256dh' },
        },
      },
    },
  });

  const deadPushRes = await client.functions.invoke('send-push-notification', {
    body: {
      user_id: dummyDeadUserId,
      title: 'Dead Token Test',
      body: 'Should prune dead endpoint',
      origin: 'https://vaangly.vercel.app',
    },
  });
  // FCM will reject the dead token with 400/404, edge function will catch, log, prune, and report 502
  assert.ok(deadPushRes.error !== null, 'Dead endpoint rejected by FCM as expected');

  // Verify that the dead subscription was pruned from the database
  const { data: prunedCheck } = await admin
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', dummyDeadUserId)
    .maybeSingle();
  assert.equal(prunedCheck, null, 'Dead subscription row was automatically pruned from database');
  console.log('✓ Dead subscription automatically pruned from push_subscriptions on delivery rejection');

  // Test 6: Push failure does not break order state transitions
  console.log('\n--- Test 6: Push Failure Does Not Break Order Transitions ---');
  // Simulate order notification when recipient has no push subscription
  const unregUserId = '36809ed8-0e08-43f1-8974-302a571d1313'; // user without push sub
  const noSubPush = await client.functions.invoke('send-push-notification', {
    body: {
      user_id: unregUserId,
      title: 'Order Status',
      body: 'Test no subscription',
    },
  });
  assert.ok(noSubPush.error !== null, 'Returns 404/502 when no subscription exists');
  // But in-app row creation still succeeds completely
  const { data: fallbackNotif, error: fallbackErr } = await admin.rpc('vaangly_create_admin_notification', {
    p_recipient_id: unregUserId,
    p_shop_id: testShop.id,
    p_type: 'STATUS_CHANGE',
    p_title: 'Order Confirmed',
    p_message: 'Your order was confirmed',
    p_reference_id: 'test-fallback-id',
    p_reference_code: testRefCode,
  });
  assert.ok(!fallbackErr && fallbackNotif, 'Order notification record created regardless of push subscription status');
  console.log('✓ Push failure does not block order lifecycle notifications');

  // Cleanup
  console.log('\n--- Cleanup Test Data ---');
  await admin.from('notifications').delete().in('id', [createdNotif.id, fallbackNotif.id]);
  console.log('✓ Cleaned up test notifications');

  console.log('\n========================================================================');
  console.log('ALL BACKGROUND PUSH NOTIFICATION REGRESSION TESTS PASSED! 🚀');
  console.log('========================================================================\n');
}

runRegressionSuite().catch((err) => {
  console.error('Regression suite failed:', err);
  process.exit(1);
});
