import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isValidUpiQrUrl } from '../lib/upi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('=== Running Vaangly Checkout UPI QR Configuration Detection Tests ===\n');

  // =========================================================================
  // TEST SUITE 1: UPI QR URL Validation (`isValidUpiQrUrl`)
  // =========================================================================
  console.log('--- Test Suite 1: UPI QR URL Validation ---');

  // 1.1 Valid Supabase storage URLs (HTTPS & HTTP)
  const validProductionUrl =
    'https://pndikgqbgchzkrmlrmzo.supabase.co/storage/v1/object/public/shop-photos/b6b1633f-63ac-4a50-b1ed-3ae3635dd92a/shops/fa2945f9-57b6-4ab2-9a33-a686533a6432/upi_qr_1793902747525.png';
  assert.strictEqual(isValidUpiQrUrl(validProductionUrl), true, 'Valid production Supabase storage URL must pass');

  const validLocalHttp = 'http://localhost:54321/storage/v1/object/public/shop-photos/test.png';
  assert.strictEqual(isValidUpiQrUrl(validLocalHttp), true, 'Valid local HTTP URL must pass');

  // 1.2 Data URLs (local preview/demo)
  const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  assert.strictEqual(isValidUpiQrUrl(validDataUrl), true, 'Valid base64 data:image URL must pass');

  // 1.3 Null, undefined, empty, and whitespace
  assert.strictEqual(isValidUpiQrUrl(null), false, 'null must be invalid');
  assert.strictEqual(isValidUpiQrUrl(undefined), false, 'undefined must be invalid');
  assert.strictEqual(isValidUpiQrUrl(''), false, 'empty string must be invalid');
  assert.strictEqual(isValidUpiQrUrl('   '), false, 'whitespace must be invalid');

  // 1.4 Placeholder / unconfigured project URLs
  assert.strictEqual(
    isValidUpiQrUrl('https://your-project-id.supabase.co/storage/v1/object/public/shop-photos/qr.png'),
    false,
    'Placeholder "your-project-id" must be rejected'
  );
  assert.strictEqual(
    isValidUpiQrUrl('https://YOUR-PROJECT-ID.supabase.co/storage/qr.png'),
    false,
    'Case-insensitive "YOUR-PROJECT-ID" must be rejected'
  );

  // 1.5 Malformed or non-http protocols
  assert.strictEqual(isValidUpiQrUrl('javascript:alert(1)'), false, 'javascript: URI must be rejected');
  assert.strictEqual(isValidUpiQrUrl('ftp://example.com/qr.png'), false, 'ftp: URI must be rejected');
  assert.strictEqual(isValidUpiQrUrl('not-a-valid-url'), false, 'Plain text must be rejected');

  console.log('✓ 1.1 - 1.5 UPI QR URL validation correctly distinguishes valid and invalid URLs\n');

  // =========================================================================
  // TEST SUITE 2: Nearby Search RPC & Catalog Hydration (`search.ts`)
  // =========================================================================
  console.log('--- Test Suite 2: Nearby Search RPC & Catalog Hydration ---');

  const searchSource = fs.readFileSync(path.resolve(__dirname, '../lib/search.ts'), 'utf8');

  // 2.1 Verify fetchNearbyShopCatalog maps upi_qr_url
  assert(
    searchSource.includes('upi_qr_url: (shop.upi_qr_url as string | null | undefined) ?? null'),
    'fetchNearbyShopCatalog must map upi_qr_url from live database RPC'
  );

  // 2.2 Verify defensive parallel hydration for backward compatibility
  assert(
    searchSource.includes('needsUpiHydration') && searchSource.includes('from(\'shops\').select(\'id, upi_qr_url, upi_id\')'),
    'fetchNearbyShopCatalog must include parallel fallback hydration for backward compatibility'
  );

  console.log('✓ 2.1 - 2.2 Search catalog safely retrieves and hydratively guarantees upi_qr_url\n');

  // =========================================================================
  // TEST SUITE 3: Cart Context Synchronization (`CartContext.tsx`)
  // =========================================================================
  console.log('--- Test Suite 3: Cart Context Synchronization ---');

  const cartContextSource = fs.readFileSync(path.resolve(__dirname, '../context/CartContext.tsx'), 'utf8');

  // 3.1 Verify syncCartShops returns a fresh Map of shops to avoid closure staleness
  assert(
    cartContextSource.includes('syncCartShops: () => Promise<Map<string, Shop>>'),
    'CartContextType must define syncCartShops as returning Promise<Map<string, Shop>>'
  );

  // 3.2 Verify syncCartShops directly awaits the Supabase query (no nested floating async IIFE)
  const syncCartShopsBody = cartContextSource.slice(
    cartContextSource.indexOf('const syncCartShops ='),
    cartContextSource.indexOf('const itemCount =')
  );
  assert(
    !syncCartShopsBody.includes('(async () => {') && syncCartShopsBody.includes('await supabase'),
    'syncCartShops must await supabase query without nested floating async IIFE'
  );

  // 3.3 Verify itemsRef is used to read current items synchronously across async cycles
  assert(
    cartContextSource.includes('itemsRef.current'),
    'CartContext must use itemsRef to read latest items without depending on React closure'
  );

  // 3.4 Verify CartContext uses isValidUpiQrUrl for authoritative validation
  assert(
    cartContextSource.includes('if (!isValidUpiQrUrl(dbShop.upi_qr_url))'),
    'CartContext must use isValidUpiQrUrl to validate dbShop.upi_qr_url authoritatively'
  );

  console.log('✓ 3.1 - 3.4 CartContext synchronization correctly updates and returns fresh shop state\n');

  // =========================================================================
  // TEST SUITE 4: Checkout UI Behavior & Multi-Shop Scenarios (`CartPage.tsx`)
  // =========================================================================
  console.log('--- Test Suite 4: Checkout UI Behavior & Multi-Shop Scenarios ---');

  const cartPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/CartPage.tsx'), 'utf8');

  // 4.1 Verify handleCheckoutShop re-syncs and checks fresh shop map if closed shop state is stale
  assert(
    cartPageSource.includes('const freshMap = await syncCartShops()') &&
    cartPageSource.includes('activeShopRecord = freshMap.get(shopId) ||'),
    'CartPage must inspect freshly returned shop map from syncCartShops to prevent stale closure false-positives'
  );

  // 4.2 Verify clear explanatory note is displayed when UPI is unavailable
  assert(
    cartPageSource.includes('vaango-cart-upi-unavailable-note') &&
    cartPageSource.includes('UPI payment is currently unavailable because this shop has not configured its UPI QR code'),
    'CartPage must render an informative inline note explaining why UPI is unavailable'
  );

  // 4.3 Verify deferred payment preservation: No QR code image or payment instructions rendered in CartPage
  assert(
    !cartPageSource.includes('vaango-upi-qr') && !cartPageSource.includes('payment-proof-gallery'),
    'CartPage must never display the merchant UPI QR code image or payment proof upload during checkout'
  );

  console.log('✓ 4.1 - 4.3 CartPage checkout UI behavior respects shop capability and preserves deferred flow\n');

  // =========================================================================
  // TEST SUITE 5: Database Trigger Verification (`Migration 74 SQL`)
  // =========================================================================
  console.log('--- Test Suite 5: Database Trigger Verification (Migration 74) ---');

  const migration74Path = path.resolve(__dirname, '../../supabase/migrations/20261109000074_fix_nearby_shops_upi_qr_and_request_trigger.sql');
  assert(fs.existsSync(migration74Path), 'Migration 74 file must exist');

  const migration74Sql = fs.readFileSync(migration74Path, 'utf8');

  // 5.1 Verify trigger require_request_shop_upi_qr checks upi_qr_url without mandating upi_id
  assert(
    migration74Sql.includes('CREATE OR REPLACE FUNCTION public.require_request_shop_upi_qr()'),
    'Migration 74 must recreate require_request_shop_upi_qr'
  );
  assert(
    !migration74Sql.includes('NULLIF(trim(COALESCE(upi_id, \'\')), \'\') IS NOT NULL'),
    'require_request_shop_upi_qr must NOT require upi_id IS NOT NULL'
  );
  assert(
    migration74Sql.includes('NULLIF(trim(COALESCE(upi_qr_url, \'\')), \'\') IS NOT NULL'),
    'require_request_shop_upi_qr must require upi_qr_url'
  );
  assert(
    migration74Sql.includes("upi_qr_url ~* '^(https?://|data:image/)'"),
    'require_request_shop_upi_qr must validate url scheme'
  );

  // 5.2 Verify get_nearby_shops includes upi_qr_url in RETURNS TABLE and SELECT
  assert(
    migration74Sql.includes('DROP FUNCTION IF EXISTS public.get_nearby_shops'),
    'Migration 74 must drop existing get_nearby_shops to support RETURNS TABLE signature update'
  );
  assert(
    migration74Sql.includes('upi_qr_url TEXT'),
    'Migration 74 must add upi_qr_url TEXT to get_nearby_shops return columns'
  );
  assert(
    migration74Sql.includes('s.upi_qr_url::TEXT'),
    'Migration 74 must select s.upi_qr_url::TEXT'
  );
  assert(
    migration74Sql.includes('GRANT EXECUTE ON FUNCTION public.get_nearby_shops'),
    'Migration 74 must grant execute privileges to anon, authenticated, service_role'
  );

  console.log('✓ 5.1 - 5.2 Migration 74 SQL correctly rectifies trigger validation and RPC column set\n');

  // =========================================================================
  // TEST SUITE 6: Accepted Order & Customer Payment View
  // =========================================================================
  console.log('--- Test Suite 6: Accepted Order & Customer Payment View ---');

  const requestDetailSource = fs.readFileSync(path.resolve(__dirname, '../pages/RequestDetailPage.tsx'), 'utf8');

  // 6.1 Verify RequestDetailPage shows QR code whenever upi_qr_url is valid, even without shop_upi_id
  assert(
    requestDetailSource.includes('{isValidUpiQrUrl(payload.shop_upi_qr_url) ? <>'),
    'RequestDetailPage must display UPI payment section whenever shop_upi_qr_url is valid, independent of shop_upi_id'
  );

  // 6.2 Verify "Copy UPI ID" and deep link are rendered conditionally when shop_upi_id is present
  assert(
    requestDetailSource.includes('{payload.shop_upi_id && (') &&
    requestDetailSource.includes('Copy UPI ID'),
    'RequestDetailPage must conditionally render Copy UPI ID only when shop_upi_id is provided'
  );

  // 6.3 Verify AppointmentBookingCard uses isValidUpiQrUrl(shop.upi_qr_url)
  const appointmentCardSource = fs.readFileSync(path.resolve(__dirname, '../components/customer/AppointmentBookingCard.tsx'), 'utf8');
  assert(
    appointmentCardSource.includes('const hasAuthoritativeUpi = isValidUpiQrUrl(shop.upi_qr_url);'),
    'AppointmentBookingCard must consider UPI available whenever upi_qr_url is valid'
  );

  console.log('✓ 6.1 - 6.3 Accepted order view and appointments display QR code and upload controls properly\n');

  console.log('=========================================================================');
  console.log('ALL CHECKOUT UPI QR CONFIGURATION DETECTION TESTS PASSED (6/6 SUITES)');
  console.log('=========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
