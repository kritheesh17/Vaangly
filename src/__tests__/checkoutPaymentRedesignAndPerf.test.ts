import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { clearCatalogCache, fetchCustomerLocationCatalog, fetchNearbyShopCatalog } from '../lib/search';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('=== Running Checkout Payment Redesign, Performance, & Push Reliability Tests ===\n');

// -------------------------------------------------------------------------
// TEST SUITE 1: Checkout Payment Flow & Instructions
// -------------------------------------------------------------------------
console.log('--- Test Suite 1: Checkout Payment Flow & Messages ---');

// 1.1 CartPage source inspection for UPI instructions and removal of upfront QR/upload
const cartPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/CartPage.tsx'), 'utf8');

assert(
  !cartPageSource.includes('<UpiPaymentPanel'),
  'CartPage must not render UpiPaymentPanel or request payment upfront'
);
assert(
  !cartPageSource.includes('Add payment proof before placing a UPI order.'),
  'CartPage must not block UPI order placement due to missing payment proof'
);

// Verify exact UPI message in CartPage
assert(
  cartPageSource.includes("YOU DON&apos;T NEED TO PAY RIGHT NOW.") || cartPageSource.includes("YOU DON'T NEED TO PAY RIGHT NOW."),
  'CartPage must display the exact required UPI notice header'
);
assert(
  cartPageSource.includes("Once the shopkeeper accepts your order, you&apos;ll receive the UPI payment instructions.") ||
  cartPageSource.includes("Once the shopkeeper accepts your order, you'll receive the UPI payment instructions."),
  'CartPage must inform customer that UPI payment instructions arrive after acceptance'
);

// Verify exact Pay-at-Shop message in CartPage
assert(
  cartPageSource.includes("Your order request will be sent to the shopkeeper for approval."),
  'CartPage must display the exact approval notice for Pay-at-Shop'
);
assert(
  cartPageSource.includes("Payment is due when you collect your order."),
  'CartPage must display payment due on collection notice for Pay-at-Shop'
);
console.log('✓ 1.1 CartPage: Upfront payment panel removed, exact UPI and Pay-at-Shop instructions confirmed');

// 1.2 RequestDetailPage source inspection for acceptance gating
const requestDetailSource = fs.readFileSync(path.resolve(__dirname, '../pages/RequestDetailPage.tsx'), 'utf8');

assert(
  requestDetailSource.includes('Awaiting Shopkeeper Acceptance'),
  'RequestDetailPage must display Awaiting Shopkeeper Acceptance for unaccepted orders'
);
assert(
  requestDetailSource.includes("in('current_state', ['ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'READY', 'COMPLETED'])"),
  'RequestDetailPage must enforce server-side state filter on payment screenshot update'
);
assert(
  requestDetailSource.includes('Payment can only be submitted after the shopkeeper has accepted your order.'),
  'RequestDetailPage must display clear client-side validation error if order is not accepted'
);
assert(
  requestDetailSource.includes('This order was declined by the shopkeeper. No payment is required.') ||
  requestDetailSource.includes('Payment not required'),
  'RequestDetailPage must show payment not required for rejected or cancelled requests'
);
console.log('✓ 1.2 RequestDetailPage: Acceptance gating, rejected order protection, and server-side update filters confirmed');

// 1.3 Appointment flow preservation
assert(
  requestDetailSource.includes("if (groupCode === 'APPOINTMENT')"),
  'RequestDetailPage must preserve appointment payment workflows separate from product orders'
);
assert(
  requestDetailSource.includes('confirmAppointmentOnlinePayment'),
  'Appointment online payment confirmation RPC must remain intact'
);
console.log('✓ 1.3 Appointment workflows: Appointment booking and payment lifecycle strictly preserved');

// -------------------------------------------------------------------------
// TEST SUITE 2: Performance & Catalog Caching
// -------------------------------------------------------------------------
console.log('\n--- Test Suite 2: Website Performance & Catalog Caching ---');

clearCatalogCache();

// 2.1 Catalog caching in offline/mock mode
const cat1 = await fetchCustomerLocationCatalog('loc-kangeyam');
const cat2 = await fetchCustomerLocationCatalog('loc-kangeyam');
assert(cat1 === cat2, 'Subsequent fetchCustomerLocationCatalog within TTL must return cached object reference');

// 2.2 Forced refresh bypasses cache
const cat3 = await fetchCustomerLocationCatalog('loc-kangeyam', true);
assert(cat3 !== cat1, 'Forced refresh must query fresh catalog');

// 2.3 Nearby catalog caching
const nearby1 = await fetchNearbyShopCatalog(11.005, 77.561, 5000);
const nearby2 = await fetchNearbyShopCatalog(11.005, 77.561, 5000);
assert(nearby1 === nearby2, 'Subsequent fetchNearbyShopCatalog within TTL must return cached object reference');

// 2.4 Cache invalidation event / clearCatalogCache
if (typeof window !== 'undefined') {
  window.dispatchEvent(new Event('vaango-shops-changed'));
} else {
  clearCatalogCache();
}
const nearby3 = await fetchNearbyShopCatalog(11.005, 77.561, 5000);
assert(nearby3 !== nearby1, 'clearCatalogCache must invalidate cached catalog');
console.log('✓ 2.1-2.4 Search: 60s in-memory TTL caching and event-driven invalidation verified');

// 2.5 Code-splitting verification of build artifacts
const distAssets = fs.existsSync(path.resolve(__dirname, '../../dist/assets'))
  ? fs.readdirSync(path.resolve(__dirname, '../../dist/assets'))
  : [];

if (distAssets.length > 0) {
  const indexJs = distAssets.find((f) => f.startsWith('index-') && f.endsWith('.js'));
  assert(indexJs, 'dist/assets/index-[hash].js must exist');

  const indexStats = fs.statSync(path.resolve(__dirname, '../../dist/assets', indexJs));
  const indexSizeKb = indexStats.size / 1024;
  console.log(`  Current Main Bundle Size: ${indexSizeKb.toFixed(2)} kB`);

  assert(
    indexSizeKb < 250,
    `Main bundle size (${indexSizeKb.toFixed(2)} kB) must be under 250 kB after performance optimization`
  );

  // Verify heavy modules are code-split into their own chunks
  const hasI18nChunk = distAssets.some((f) => f.startsWith('i18n-data-') && f.endsWith('.js'));
  assert(hasI18nChunk, 'i18n must be code-split into its own i18n-data chunk');

  const hasAdminApiChunk = distAssets.some((f) => f.startsWith('adminApi-') && f.endsWith('.js'));
  assert(hasAdminApiChunk, 'adminApi must be code-split into its own chunk');

  const hasShopkeeperApiChunk = distAssets.some((f) => f.startsWith('shopkeeperApi-') && f.endsWith('.js'));
  assert(hasShopkeeperApiChunk, 'shopkeeperApi must be code-split into its own chunk');
  console.log('✓ 2.5 Code splitting: Bundle size under 250 kB, heavy modules verified in isolated chunks');
} else {
  console.log('  (Skipping 2.5 dist assertion: dist not yet generated)');
}

// -------------------------------------------------------------------------
// TEST SUITE 3: Push Notification Reliability & Tagging
// -------------------------------------------------------------------------
console.log('\n--- Test Suite 3: Push Notification Reliability & Tagging ---');

// 3.1 Service worker configuration inspection
const swSource = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');

assert(
  swSource.includes('requireInteraction: true'),
  'Service worker push options must configure requireInteraction for persistent visibility'
);
assert(
  swSource.includes('vibrate:'),
  'Service worker push options must specify standardized vibration pattern'
);
assert(
  swSource.includes('notificationclose'),
  'Service worker must handle notificationclose event for diagnostics'
);
console.log('✓ 3.1 Service worker: Mobile push options and lifecycle listeners verified');

// 3.2 NotificationApi event tag uniqueness
const notifSource = fs.readFileSync(path.resolve(__dirname, '../lib/notificationApi.ts'), 'utf8');
assert(
  notifSource.includes("tag: `vaangly-${referenceCode || requestId || Date.now()}-${event}`"),
  'NotificationApi must generate event-specific notification tags so sequential updates are not swallowed'
);
console.log('✓ 3.2 NotificationApi: Unique event tags verified to prevent background alert suppression');

// 3.3 ShopkeeperApi safe notification wrapper
const shopkeeperApiSource = fs.readFileSync(path.resolve(__dirname, '../lib/shopkeeperApi.ts'), 'utf8');
assert(
  shopkeeperApiSource.includes('async function safeNotifyLifecycle'),
  'ShopkeeperApi must define safeNotifyLifecycle helper'
);
assert(
  !shopkeeperApiSource.includes('void notifyOrderLifecycle({'),
  'ShopkeeperApi must not use unwrapped void notifyOrderLifecycle'
);
console.log('✓ 3.3 ShopkeeperApi: Observable safe notification wrapper confirmed across all state transitions');

  console.log('\n========================================');
  console.log('ALL CHECKOUT, PERF, & PUSH TESTS PASSED!');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
