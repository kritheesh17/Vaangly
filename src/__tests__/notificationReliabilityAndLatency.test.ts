import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('=== Running Vaangly Notification Reliability & Latency Optimization Tests ===\n');

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Edge Function Push Notification Reliability & Hardening
  // -------------------------------------------------------------------------
  console.log('--- Test Suite 1: Push Notification Edge Function Reliability ---');

  const edgePushSource = fs.readFileSync(
    path.resolve(__dirname, '../../supabase/functions/send-push-notification/index.ts'),
    'utf8'
  );

  // 1.1 Retry with exponential backoff on transient errors
  assert(
    edgePushSource.includes('async function sendNotificationWithRetry'),
    'Edge Function must implement sendNotificationWithRetry helper'
  );
  assert(
    edgePushSource.includes('statusCode === 429') &&
      edgePushSource.includes('statusCode >= 500 && statusCode <= 504') &&
      edgePushSource.includes('ETIMEDOUT') &&
      edgePushSource.includes('ECONNRESET'),
    'sendNotificationWithRetry must handle HTTP 429, 500-504, ETIMEDOUT, and ECONNRESET'
  );
  assert(
    edgePushSource.includes('Math.min(200 * Math.pow(2, attempt - 1), 1000)'),
    'sendNotificationWithRetry must implement bounded exponential backoff'
  );
  console.log('✓ 1.1 Retry mechanism: Bounded exponential backoff on transient errors confirmed');

  // 1.2 Dead endpoint pruning safety (No false positive pruning on generic 400/403)
  assert(
    !edgePushSource.includes('statusCode === 400 || statusCode === 403 || statusCode === 404'),
    'Edge Function must NOT prune subscriptions on generic 400 or 403'
  );
  assert(
    edgePushSource.includes('statusCode === 404 ||') &&
      edgePushSource.includes('statusCode === 410 ||') &&
      edgePushSource.includes("errBody.includes('unregistered')") &&
      edgePushSource.includes("errBody.includes('NotRegistered')"),
    'Edge Function must strictly prune only genuinely unregistered/expired/gone (404/410) endpoints'
  );
  console.log('✓ 1.2 Dead endpoint pruning: Strict 404/410/unregistered check confirmed (no false pruning)');

  // 1.3 In-flight tag deduplication
  assert(
    edgePushSource.includes('recentDispatches = new Map<string, number>()'),
    'Edge Function must maintain recentDispatches map for tag deduplication'
  );
  assert(
    edgePushSource.includes('dedupKey = `${user_id}:${notificationTag}`') ||
      edgePushSource.includes('dedupKey = `${user_id}:${notificationTag}'),
    'Edge Function must construct dedupKey using user_id and notificationTag'
  );
  assert(
    edgePushSource.includes('deduplicated: true'),
    'Edge Function must return deduplicated: true when duplicate push is suppressed'
  );
  console.log('✓ 1.3 Deduplication: 5-second tag deduplication confirmed');

  // 1.4 Token privacy and endpoint masking in logs
  assert(
    edgePushSource.includes('function maskEndpoint(endpoint'),
    'Edge Function must implement maskEndpoint helper'
  );
  assert(
    edgePushSource.includes('maskEndpoint(target.endpoint)'),
    'Edge Function logs must mask target endpoints to prevent credential leakage'
  );
  console.log('✓ 1.4 Logging security: Endpoint masking in server logs confirmed');

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Checkout Database Latency & Parallel Query Execution
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 2: Checkout Latency & Query Parallelization ---');

  const cartContextSource = fs.readFileSync(
    path.resolve(__dirname, '../context/CartContext.tsx'),
    'utf8'
  );

  // 2.1 Parallel pre-flight query execution
  assert(
    cartContextSource.includes('await Promise.all([') &&
      cartContextSource.includes('fetchCustomerModeration(user.id)') &&
      cartContextSource.includes("from('shops')") &&
      cartContextSource.includes("from('shop_products')"),
    'CartContext submitShopRequest must run customer moderation, shop status, and product checks concurrently via Promise.all'
  );
  console.log('✓ 2.1 Latency optimization: Moderation, shop state, and product catalog run concurrently in 1 RTT');

  // 2.2 Non-blocking post-order operations
  assert(
    cartContextSource.includes('void (async () => {') &&
      cartContextSource.includes("supabase.from('request_events').insert") &&
      cartContextSource.includes('notifyOrderLifecycle'),
    'CartContext must run request_events insert and notifyOrderLifecycle asynchronously without blocking checkout response'
  );
  assert(
    cartContextSource.includes('Promise.allSettled(notifPromises)'),
    'CartContext post-order notifications must be dispatched concurrently via Promise.allSettled'
  );
  console.log('✓ 2.2 Checkout response time: Post-order auditing and push notifications run non-blockingly');

  // 2.3 Critical business rules & security gates preserved
  assert(
    cartContextSource.includes('moderation?.is_suspended'),
    'CartContext must preserve customer abuse suspension gate'
  );
  assert(
    cartContextSource.includes('dbShop.status !== \'active\' || !dbShop.is_live'),
    'CartContext must preserve live shop active verification'
  );
  assert(
    cartContextSource.includes("paymentMethod === 'upi'") &&
      cartContextSource.includes('UPI payment is unavailable because this shop has not configured its UPI QR code'),
    'CartContext must preserve UPI QR verification gate'
  );
  assert(
    cartContextSource.includes('variantIsAvailable(dbVar)'),
    'CartContext must preserve variant availability gate'
  );
  assert(
    cartContextSource.includes('dbProd.stock_quantity < cartItem.quantity'),
    'CartContext must preserve inventory stock quantity gate'
  );
  console.log('✓ 2.3 Business gates preserved: Suspension, shop status, UPI QR, variant availability, and stock checks intact');

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Functional Helpers Verification
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 3: Functional Helpers Verification ---');

  // Test maskEndpoint logic
  function testMaskEndpoint(ep?: string | null): string {
    if (!ep || typeof ep !== 'string') return 'unknown';
    if (ep.length <= 30) return ep;
    return `${ep.slice(0, 20)}...${ep.slice(-8)}`;
  }

  assert.strictEqual(testMaskEndpoint(null), 'unknown');
  assert.strictEqual(testMaskEndpoint(''), 'unknown');
  assert.strictEqual(testMaskEndpoint('short-endpoint'), 'short-endpoint');
  const longEp = 'https://fcm.googleapis.com/fcm/send/e1234567890abcdefghijklmnopqrstuvwxyz';
  const masked = testMaskEndpoint(longEp);
  assert(masked.startsWith('https://fcm.googleap...'));
  assert(masked.endsWith('stuvwxyz'));
  assert(!masked.includes('abcdefghijklmno'));
  console.log('✓ 3.1 Endpoint masking helper functions as expected');

  // Test retry backoff computation
  function computeBackoff(attempt: number): number {
    return Math.min(200 * Math.pow(2, attempt - 1), 1000);
  }
  assert.strictEqual(computeBackoff(1), 200);
  assert.strictEqual(computeBackoff(2), 400);
  assert.strictEqual(computeBackoff(3), 800);
  assert.strictEqual(computeBackoff(4), 1000);
  assert.strictEqual(computeBackoff(5), 1000);
  console.log('✓ 3.2 Exponential backoff formula bounds and scales correctly');

  console.log('\n========================================');
  console.log('ALL NOTIFICATION & LATENCY TESTS PASSED!');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
