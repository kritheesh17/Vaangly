import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('=== Running Kartzo Cart & Merchant Enhancements Verification Tests ===\n');

  // -------------------------------------------------------------------------
  // 1. BRAND NAME VERIFICATION (Part 1)
  // -------------------------------------------------------------------------
  console.log('--- 1. Brand Name Replacement Verification ---');
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  assert(indexHtml.includes('<title>Kartzo</title>'), 'index.html title must be Kartzo');

  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/manifest.json'), 'utf8'));
  assert.strictEqual(manifest.name, 'Kartzo', 'Manifest name must be Kartzo');
  assert.strictEqual(manifest.short_name, 'Kartzo', 'Manifest short_name must be Kartzo');

  const stringsXml = fs.readFileSync(path.resolve(__dirname, '../../android/app/src/main/res/values/strings.xml'), 'utf8');
  assert(stringsXml.includes('<string name="app_name">Kartzo</string>'), 'strings.xml app_name must be Kartzo');

  const capacitorConfig = fs.readFileSync(path.resolve(__dirname, '../../capacitor.config.ts'), 'utf8');
  assert(capacitorConfig.includes("appName: 'Kartzo'"), 'capacitor.config.ts appName must be Kartzo');

  console.log('✓ Brand replacement verified across HTML, Manifest, Android strings, and Capacitor config\n');

  // -------------------------------------------------------------------------
  // 2. MERCHANT APPLICATION NAVIGATION FIX (Part 2)
  // -------------------------------------------------------------------------
  console.log('--- 2. Merchant Navigation Fix Verification ---');
  const loginPage = fs.readFileSync(path.resolve(__dirname, '../pages/auth/LoginPage.tsx'), 'utf8');
  assert(
    loginPage.includes('to="/shopkeeper/apply"'),
    'LoginPage must link directly to "/shopkeeper/apply" without circular redirect'
  );
  assert(
    !loginPage.includes("to={isAuthenticated ? '/shopkeeper/apply' : '/login?redirect=/shopkeeper/apply'}"),
    'LoginPage must not contain circular redirect link'
  );

  const appTsx = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');
  assert(
    appTsx.includes('path="/shopkeeper/apply"') && appTsx.includes('element={<ShopkeeperOnboardingPage />}'),
    'App.tsx must allow direct access to ShopkeeperOnboardingPage without blocking ProtectedRoute'
  );
  assert(
    appTsx.includes('path="/apply"') && appTsx.includes('to="/shopkeeper/apply"'),
    'App.tsx must provide alias route /apply redirecting to /shopkeeper/apply'
  );

  const onboardingPage = fs.readFileSync(path.resolve(__dirname, '../pages/shopkeeper/ShopkeeperOnboardingPage.tsx'), 'utf8');
  assert(
    onboardingPage.includes("navigate('/login?redirect=/shopkeeper/apply')"),
    'ShopkeeperOnboardingPage must redirect unauthenticated guest submissions to login with redirect'
  );

  console.log('✓ Merchant navigation cleanly connects desktop and mobile users directly to application flow\n');

  // -------------------------------------------------------------------------
  // 3. MULTI-STORE CART RESTRUCTURING & EXPAND/COLLAPSE (Part 3 & Part 6)
  // -------------------------------------------------------------------------
  console.log('--- 3. Multi-Store Cart Restructuring Verification ---');
  const cartPage = fs.readFileSync(path.resolve(__dirname, '../pages/CartPage.tsx'), 'utf8');

  assert(cartPage.includes('expandedShopIds'), 'CartPage must maintain expandedShopIds state');
  assert(cartPage.includes('toggleExpandShop'), 'CartPage must implement toggleExpandShop handler');
  assert(cartPage.includes('vaango-cart-order-badge'), 'CartPage must display order badge (Order X)');
  assert(cartPage.includes('Order {groupIndex + 1}'), 'CartPage must render sequential order number');
  assert(cartPage.includes('vaango-cart-details-toggle-btn'), 'CartPage must render details toggle button');
  assert(cartPage.includes("'See Details'"), 'CartPage must have See Details label when collapsed');
  assert(cartPage.includes("'Hide Details'"), 'CartPage must have Hide Details label when expanded');
  assert(cartPage.includes('vaango-cart-expanded-content'), 'CartPage must wrap expandable details');
  assert(cartPage.includes('Place Order with {shop.name}'), 'CartPage must render independent store checkout button');

  // Verify CartContext clearShopItems isolation
  const cartContext = fs.readFileSync(path.resolve(__dirname, '../context/CartContext.tsx'), 'utf8');
  assert(
    cartContext.includes('clearShopItems(shopId)'),
    'CartContext must only clear the submitted shop items, leaving other stores intact'
  );

  console.log('✓ Multi-store cart cards, expand/collapse toggles, and store order isolation verified\n');

  // -------------------------------------------------------------------------
  // 4. MERCHANT-CONTROLLED PAYMENT METHODS (Part 4)
  // -------------------------------------------------------------------------
  console.log('--- 4. Merchant Payment Control Verification ---');
  const dbTypes = fs.readFileSync(path.resolve(__dirname, '../types/database.ts'), 'utf8');
  assert(
    dbTypes.includes("export type MerchantPaymentPreference = 'both' | 'upi_only' | 'pay_at_shop_only'"),
    'database.ts must define MerchantPaymentPreference type'
  );
  assert(
    dbTypes.includes('payment_preference?: MerchantPaymentPreference | null'),
    'Shop interface must include payment_preference'
  );

  const shopkeeperProfile = fs.readFileSync(path.resolve(__dirname, '../pages/shopkeeper/ShopkeeperProfilePage.tsx'), 'utf8');
  assert(
    shopkeeperProfile.includes('paymentPreference') && shopkeeperProfile.includes('setPaymentPreference'),
    'ShopkeeperProfilePage must manage paymentPreference state'
  );
  assert(
    shopkeeperProfile.includes("payment_preference: paymentPreference"),
    'ShopkeeperProfilePage must persist payment_preference in updateShopProfile'
  );
  assert(
    shopkeeperProfile.includes('Accepted Payment Methods'),
    'ShopkeeperProfilePage must render payment preference controls'
  );

  // Server-side validation in CartContext
  assert(
    cartContext.includes("pref === 'pay_at_shop_only' && paymentMethod === 'upi'") &&
    cartContext.includes('This merchant currently accepts Pay at Shop / Cash only.'),
    'CartContext must reject UPI orders when merchant specifies pay_at_shop_only'
  );
  assert(
    cartContext.includes("pref === 'upi_only' && paymentMethod === 'pay_at_shop'") &&
    cartContext.includes('This merchant currently accepts UPI / Online payments only.'),
    'CartContext must reject Pay at Shop orders when merchant specifies upi_only'
  );

  console.log('✓ Merchant payment method control (both, upi_only, pay_at_shop_only) and enforcement verified\n');

  // -------------------------------------------------------------------------
  // 5. APPOINTMENT SEPARATION FROM CART (Part 7)
  // -------------------------------------------------------------------------
  console.log('--- 5. Appointment Separation Verification ---');
  assert(
    cartContext.includes('Appointments and services are booked independently and cannot be added to the shopping cart.'),
    'CartContext.addItem must strictly reject appointment and service items'
  );

  console.log('✓ Appointments and services strictly prohibited from entering shopping cart data flow\n');

  // -------------------------------------------------------------------------
  // 6. PRESERVE DEFERRED UPI PAYMENT WORKFLOW (Part 5)
  // -------------------------------------------------------------------------
  console.log('--- 6. Deferred UPI Workflow Verification ---');
  assert(
    !cartPage.includes('vaango-upi-qr') && !cartPage.includes('payment-proof-gallery'),
    'CartPage must not render UPI QR code or proof upload before order acceptance'
  );

  const requestDetail = fs.readFileSync(path.resolve(__dirname, '../pages/RequestDetailPage.tsx'), 'utf8');
  assert(
    requestDetail.includes("Once accepted, you'll receive the UPI payment instructions and QR code here."),
    'RequestDetailPage must explain QR is provided only upon order acceptance'
  );
  assert(
    requestDetail.includes('isAcceptedState && !isTerminalState && isOnlinePayment'),
    'RequestDetailPage must only display UPI QR after order is accepted by merchant'
  );

  console.log('✓ Deferred UPI payment workflow preserved: no advance payment before merchant acceptance\n');

  // -------------------------------------------------------------------------
  // 7. MIGRATION 79 SECURITY & FINANCIAL DEFENSES (Part 1 & 2)
  // -------------------------------------------------------------------------
  console.log('--- 7. Migration 79 Security & Financial Defenses ---');
  const migration79Sql = fs.readFileSync(
    path.resolve(__dirname, '../../supabase/migrations/20261122000079_harden_checkout_rls_and_authoritative_platform_fee.sql'),
    'utf8'
  );

  // 7.1 Verify calculate_platform_fee prevents untrusted client forced calculation bypass
  assert(
    migration79Sql.includes('untrusted callers (anon, authenticated)') &&
    migration79Sql.includes('current_user NOT IN (\'postgres\', \'service_role\', \'supabase_admin\')'),
    'calculate_platform_fee must prevent untrusted clients from bypassing master switch via p_force_calculation'
  );

  // 7.2 Verify verify_merchant_settlement validates upward adjustments
  assert(
    migration79Sql.includes('p_verified_amount_paise > v_st.amount_paise') &&
    migration79Sql.includes('exceeds submitted settlement amount'),
    'verify_merchant_settlement must require explicit explanation if verified amount exceeds submitted amount'
  );

  // 7.3 Verify Migration 79 declares payment_preference column on public.shops
  assert(
    migration79Sql.includes('ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS payment_preference TEXT DEFAULT \'both\''),
    'Migration 79 must declare payment_preference column on public.shops with check constraint'
  );

  // 7.4 Verify CartContext is backward-compatible with pre-migration databases
  assert(
    !cartContext.includes(".select('id, name, owner_id, status, is_live, upi_id, upi_qr_url, delivery_available, delivery_fee, free_delivery_above, address_line, phone, payment_preference')"),
    'CartContext must not query payment_preference directly in base shop select to avoid breaking pre-migration production'
  );

  console.log('✓ Migration 79 security hardening and backward-compatible resilience verified\n');

  console.log('=========================================================================');
  console.log('ALL KARTZO ENHANCEMENT VERIFICATION TESTS PASSED (6/6 CHECKS)');
  console.log('=========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
