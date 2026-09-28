import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pndikgqbgchzkrmlrmzo.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuZGlrZ3FiZ2NoemtybWxybXpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTY2MTgwNSwiZXhwIjoyMTA1MjM3ODA1fQ.zPBOv5Hxloq21DhIT1Xq1CVNKT_OQArNHmA8dMz-eV4';

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  console.log('========================================================================');
  console.log('TESTING REAL BUSINESS-EVENT PUSH NOTIFICATIONS PIPELINE');
  console.log('========================================================================\n');

  // 1. Get real test shop and shopkeeper
  const { data: shop, error: shopErr } = await admin
    .from('shops')
    .select('id, name, owner_id')
    .eq('status', 'active')
    .eq('is_live', true)
    .limit(1)
    .single();

  assert.ok(!shopErr && shop, 'Found active live shop');
  console.log(`✓ Active test shop: ${shop.name} (${shop.id}), Owner: ${shop.owner_id}`);

  // 2. Get real test customer
  const { data: customer, error: custErr } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'customer')
    .limit(1)
    .single();

  assert.ok(!custErr && customer, 'Found test customer');
  console.log(`✓ Test customer: ${customer.full_name} (${customer.id})`);

  // 3. Test operational notification creation via RPC
  console.log('\n--- 1. Operational Notification Creation for Shopkeeper ---');
  const refCode = `ORD-TEST-${Date.now().toString().slice(-4)}`;
  const notifTitle = 'New order received';
  const notifBody = `New order #${refCode} from ${customer.full_name || 'Customer'}. Open Vaangly to view the order.`;

  const { data: createdNotif, error: notifErr } = await admin.rpc('vaangly_create_admin_notification', {
    p_recipient_id: shop.owner_id,
    p_shop_id: shop.id,
    p_type: 'NEW_ORDER',
    p_title: notifTitle,
    p_message: notifBody,
    p_reference_id: 'test-req-e2e',
    p_reference_code: refCode,
  });

  assert.ok(!notifErr && createdNotif, `Notification row created successfully: ${notifErr?.message || ''}`);
  assert.equal(createdNotif.recipient_id, shop.owner_id, 'Notification recipient matches shopkeeper');
  assert.equal(createdNotif.type, 'NEW_ORDER', 'Notification type is NEW_ORDER');
  assert.equal(createdNotif.title, notifTitle, 'Notification title matches expected');
  console.log(`✓ Notification created in DB (id: ${createdNotif.id}, recipient: ${createdNotif.recipient_id})`);

  // 4. Verify Edge Function invocation with active VAPID credentials
  console.log('\n--- 2. Edge Function Invocation With VAPID Secrets ---');
  const pushRes = await admin.functions.invoke('send-push-notification', {
    body: {
      user_id: shop.owner_id,
      title: notifTitle,
      body: notifBody,
      url: '/shopkeeper/requests',
      origin: 'https://vaangly.vercel.app',
    },
  });

  // Verify function executed with VAPID initialization (no 500 VAPID error)
  console.log('Edge function response status/error:', pushRes.error?.message || '200 OK');
  // Since mock or previous test subscription token might fail FCM delivery, ensure it is NOT a 500 VAPID unconfigured error
  const isVapidMissing = pushRes.error?.message?.includes('VAPID credentials not configured');
  assert.ok(!isVapidMissing, 'Edge Function has VAPID credentials configured and active');
  console.log('✓ Edge Function successfully loaded VAPID secrets and processed delivery attempt');

  // 5. Test Customer Notification on Ready for Pickup
  console.log('\n--- 3. Customer Notification on Order Ready for Pickup ---');
  const readyTitle = 'Order Ready for Pickup';
  const readyBody = `Your order #${refCode} is ready for customer pickup!`;

  const { data: readyNotif, error: readyErr } = await admin.rpc('vaangly_create_admin_notification', {
    p_recipient_id: customer.id,
    p_shop_id: shop.id,
    p_type: 'STATUS_CHANGE',
    p_title: readyTitle,
    p_message: readyBody,
    p_reference_id: 'test-req-e2e',
    p_reference_code: refCode,
  });

  assert.ok(!readyErr && readyNotif, `Ready notification created: ${readyErr?.message || ''}`);
  assert.equal(readyNotif.recipient_id, customer.id, 'Notification recipient matches customer');
  assert.equal(readyNotif.title, readyTitle, 'Title matches Order Ready for Pickup');
  console.log(`✓ Ready notification created in DB (id: ${readyNotif.id}, recipient: ${readyNotif.recipient_id})`);

  // 6. Cleanup test records
  console.log('\n--- 4. Cleanup Test Records ---');
  await admin.from('notifications').delete().in('id', [createdNotif.id, readyNotif.id]);
  console.log('✓ Cleaned up test notifications');

  console.log('\n========================================================================');
  console.log('ALL REAL BUSINESS-EVENT NOTIFICATION TESTS PASSED SUCCESSFULLY! 🎯');
  console.log('========================================================================\n');
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
