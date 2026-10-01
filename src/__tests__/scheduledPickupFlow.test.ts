import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Read environment
const env: Record<string, string> = {};
if (fs.existsSync('.env')) {
  fs.readFileSync('.env', 'utf-8')
    .split('\n')
    .forEach((line) => {
      const [k, ...v] = line.trim().split('=');
      if (k && v.length) env[k] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
    });
}

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://pndikgqbgchzkrmlrmzo.supabase.co';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuZGlrZ3FiZ2NoemtybWxybXpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTY2MTgwNSwiZXhwIjoyMTA1MjM3ODA1fQ.zPBOv5Hxloq21DhIT1Xq1CVNKT_OQArNHmA8dMz-eV4';
const client = createClient(supabaseUrl, supabaseKey);

describe('Scheduled Pickup Checkout & Operating Hours Validation', () => {
  it('1. fetches an active shop with TIME operating hours and product', async () => {
    const { data: shops, error } = await client
      .from('shops')
      .select('id, name, owner_id, status, is_live, opening_time, closing_time, slot_config')
      .eq('status', 'active')
      .not('opening_time', 'is', null)
      .limit(1);

    assert.strictEqual(error, null, `Shop query failed: ${error?.message}`);
    assert.ok(shops && shops.length > 0, 'Must have at least one active shop with operating hours');
    const shop = shops[0];
    assert.ok(shop.opening_time, 'Shop must have opening_time');
    assert.ok(shop.closing_time, 'Shop must have closing_time');

    const { data: prods } = await client
      .from('shop_products')
      .select('id, name, price')
      .eq('shop_id', shop.id)
      .limit(1);

    assert.ok(prods && prods.length > 0, 'Shop must have at least one product for ordering');
    console.log(`[TEST] Target shop: ${shop.name} (${shop.id}), Hours: ${shop.opening_time} - ${shop.closing_time}`);
    console.log(`[TEST] Target product: ${prods[0].name} (₹${prods[0].price})`);
  });

  it('2. rejects scheduled pickup time in the past', async () => {
    const { data: shops } = await client
      .from('shops')
      .select('id, name')
      .eq('status', 'active')
      .not('opening_time', 'is', null)
      .limit(1);
    assert.ok(shops && shops.length > 0);
    const shopId = shops[0].id;

    const { data: prods } = await client.from('shop_products').select('id, name, price').eq('shop_id', shopId).limit(1);
    const prod = prods![0];

    const pastTime = new Date(Date.now() - 3600000).toISOString();
    const { data, error } = await client
      .from('requests')
      .insert({
        shop_id: shopId,
        reference_code: `TEST-PAST-${Date.now()}`,
        workflow_group_code: 'ORDER',
        customer_id: '194c51aa-76c6-4afd-83b0-9289ffe3cb88',
        customer_phone: '+919876543210',
        total_estimate: prod.price,
        current_state: 'REQUESTED',
        fulfillment_type: 'pickup',
        payment_method: 'pay_at_shop',
        pickup_at: pastTime,
        notes: JSON.stringify({
          customer_name: 'Automated Test Past',
          items: [{ product_id: prod.id, name: prod.name, price: prod.price, quantity: 1 }],
        }),
      })
      .select('id')
      .single();

    assert.ok(error, 'Past pickup time must be rejected by trigger');
    assert.match(
      error.message,
      /must be in the future|already started or passed/i,
      `Error message should indicate past time, got: ${error.message}`
    );
    if (data && 'id' in (data as Record<string, unknown>)) {
      await client.from('requests').delete().eq('id', (data as { id: string }).id);
    }
  });

  it('3. rejects scheduled pickup time outside shop operating hours', async () => {
    const { data: shops } = await client
      .from('shops')
      .select('id, name, opening_time, closing_time')
      .eq('status', 'active')
      .not('opening_time', 'is', null)
      .limit(1);
    assert.ok(shops && shops.length > 0);
    const shop = shops[0];

    const { data: prods } = await client.from('shop_products').select('id, name, price').eq('shop_id', shop.id).limit(1);
    const prod = prods![0];

    // Pick 03:00 AM IST tomorrow (shop opens at 08:00 AM)
    const tomorrow = new Date(Date.now() + 86400000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const closedTime = `${tomorrowStr}T03:00:00+05:30`;

    const { data, error } = await client
      .from('requests')
      .insert({
        shop_id: shop.id,
        reference_code: `TEST-CLOSED-${Date.now()}`,
        workflow_group_code: 'ORDER',
        customer_id: '194c51aa-76c6-4afd-83b0-9289ffe3cb88',
        customer_phone: '+919876543210',
        total_estimate: prod.price,
        current_state: 'REQUESTED',
        fulfillment_type: 'pickup',
        payment_method: 'pay_at_shop',
        pickup_at: closedTime,
        notes: JSON.stringify({
          customer_name: 'Automated Test Outside Hours',
          items: [{ product_id: prod.id, name: prod.name, price: prod.price, quantity: 1 }],
        }),
      })
      .select('id')
      .single();

    assert.ok(error, 'Outside hours pickup time must be rejected by trigger');
    assert.match(
      error.message,
      /outside shop operating hours/i,
      `Error message should indicate outside operating hours, got: ${error.message}`
    );
    if (data && 'id' in (data as Record<string, unknown>)) {
      await client.from('requests').delete().eq('id', (data as { id: string }).id);
    }
  });

  it('4. accepts ASAP order without error (pickup_at is NULL)', async () => {
    const { data: shops } = await client
      .from('shops')
      .select('id, name')
      .eq('status', 'active')
      .not('opening_time', 'is', null)
      .limit(1);
    assert.ok(shops && shops.length > 0);
    const shopId = shops[0].id;

    const { data: prods } = await client.from('shop_products').select('id, name, price').eq('shop_id', shopId).limit(1);
    const prod = prods![0];

    const refCode = `TEST-ASAP-${Date.now()}`;
    const { data: order, error } = await client
      .from('requests')
      .insert({
        shop_id: shopId,
        reference_code: refCode,
        workflow_group_code: 'ORDER',
        customer_id: '194c51aa-76c6-4afd-83b0-9289ffe3cb88',
        customer_phone: '+919876543210',
        total_estimate: prod.price,
        current_state: 'REQUESTED',
        fulfillment_type: 'pickup',
        payment_method: 'pay_at_shop',
        pickup_at: null,
        notes: JSON.stringify({
          customer_name: 'Automated Test ASAP',
          items: [{ product_id: prod.id, name: prod.name, price: prod.price, quantity: 1 }],
        }),
      })
      .select('id, shop_id, pickup_at, total_estimate')
      .single();

    assert.strictEqual(error, null, `ASAP order insert failed: ${error?.message}`);
    assert.ok(order?.id, 'ASAP order must return generated id');
    assert.strictEqual(order.pickup_at, null, 'ASAP order pickup_at must be null');

    // Clean up
    await client.from('requests').delete().eq('id', order.id);
  });

  it('5. accepts valid Scheduled Pickup order and creates request_items without 22007 error', async () => {
    const { data: shops } = await client
      .from('shops')
      .select('id, name, opening_time, closing_time')
      .eq('status', 'active')
      .not('opening_time', 'is', null)
      .limit(1);
    assert.ok(shops && shops.length > 0);
    const shop = shops[0];

    const { data: prods } = await client.from('shop_products').select('id, name, price').eq('shop_id', shop.id).limit(1);
    const prod = prods![0];

    // Pick 11:30 AM IST tomorrow (standard open operating hour)
    const tomorrow = new Date(Date.now() + 86400000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const validScheduledTime = `${tomorrowStr}T11:30:00+05:30`;
    const refCode = `TEST-SCHED-${Date.now()}`;

    const { data: order, error } = await client
      .from('requests')
      .insert({
        shop_id: shop.id,
        reference_code: refCode,
        workflow_group_code: 'ORDER',
        customer_id: '194c51aa-76c6-4afd-83b0-9289ffe3cb88',
        customer_phone: '+919876543210',
        total_estimate: prod.price,
        current_state: 'REQUESTED',
        fulfillment_type: 'pickup',
        payment_method: 'pay_at_shop',
        pickup_at: validScheduledTime,
        notes: JSON.stringify({
          customer_name: 'Automated Test Scheduled Order',
          items: [{ product_id: prod.id, name: prod.name, price: prod.price, quantity: 1 }],
        }),
      })
      .select('id, shop_id, pickup_at, total_estimate')
      .single();

    assert.strictEqual(
      error,
      null,
      `Scheduled pickup order insert failed with error: ${error?.message} (code: ${error?.code})`
    );
    assert.ok(order?.id, 'Scheduled order must return generated id');
    assert.ok(order.pickup_at, 'Scheduled order must have non-null pickup_at');

    // Insert request_items
    const { data: item, error: itemErr } = await client
      .from('request_items')
      .insert({
        request_id: order.id,
        product_name_snapshot: prod.name,
        unit_snapshot: 'unit',
        quantity: 1,
        effective_quantity: 1,
        unit_price: prod.price,
        discount_amount: 0,
        line_total: prod.price,
      })
      .select('id')
      .single();
    assert.strictEqual(itemErr, null, `request_items insert failed: ${itemErr?.message}`);
    assert.ok(item?.id, 'request_item must have id');

    // Verify shopkeeper visibility
    const { data: shopOrders, error: sErr } = await client
      .from('requests')
      .select('id, pickup_at, reference_code')
      .eq('shop_id', shop.id)
      .eq('id', order.id);

    assert.strictEqual(sErr, null, `Shopkeeper query failed: ${sErr?.message}`);
    assert.ok(shopOrders && shopOrders.length === 1, 'Shopkeeper must see the scheduled order');

    // Verify customer visibility
    const { data: custOrders, error: cErr } = await client
      .from('requests')
      .select('id, pickup_at, reference_code')
      .eq('customer_phone', '+919876543210')
      .eq('id', order.id);

    assert.strictEqual(cErr, null, `Customer query failed: ${cErr?.message}`);
    assert.ok(custOrders && custOrders.length >= 1, 'Customer must see the scheduled order');

    // Clean up
    await client.from('request_items').delete().eq('id', item.id);
    await client.from('requests').delete().eq('id', order.id);
  });
});
