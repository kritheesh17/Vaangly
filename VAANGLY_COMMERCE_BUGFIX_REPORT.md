# Vaangly Commerce Reliability & Push Notification Report

**Project:** Vaangly  
**Branch:** `fix/commerce-reliability-cart-upi-push`  
**Latest Commits:**  
- `053b83e` — `fix(commerce): resolve cart quantity limits, authoritative UPI config, and backend stock validation`  
- `8266cfd` — `fix(push): resolve background push notifications, multi-device sync, and shopkeeper alerts`  
**Production Target:** `https://vaangly.vercel.app`  
**Production Supabase Backend:** `pndikgqbgchzkrmlrmzo` (`vaangly-staging-test-2`, `ap-northeast-1`)  
**Test Suite Status:** 34/34 Passed (0 Failures)  
**Production Build Status:** Passed (5.91s, clean Vite bundle)  

---

## Executive Summary

This report documents the end-to-end investigation, diagnosis, implementation, and automated verification of three critical production commerce issues in Vaangly:

1. **Issue A (Cart Quantity Management):** Customers were unable to increase product quantities in their cart beyond 1 unit due to hardcoded variant default stock caps, silent quantity clamping, and variant matching ambiguity.
2. **Issue B (Shopkeeper UPI Configuration Added Later):** When shopkeepers added their UPI QR code after initial shop registration, customers with existing or new carts were blocked from checking out with UPI (*"This shop doesn't have UPI method"*), caused by stale shop metadata snapshots stored in client `localStorage` and missing live database reconciliation.
3. **Issue C (Background Push Notification Reliability):** Shopkeepers did not reliably receive background push alerts when their browser was backgrounded, phone locked, or application closed, caused by multi-device subscription overwriting, Edge Function origin filtering, and lack of persistent service worker interaction flags.

All three issues have been resolved with backward-compatible code, zero destructive database alterations, authoritative live database synchronization, and an expanded automated regression suite.

---

## 1. Issue A — Cart Quantity Management

### 1.1 Root Cause Analysis

Four independent root causes were uncovered that locked cart quantities at 1:

1. **Hardcoded Variant Stock Cap:**
   - In `src/lib/productVariants.ts` (line 174), `generateVariantCombinations` defaulted every generated variant to `stock_quantity: 1`.
   - In `src/components/shopkeeper/ProductVariantManager.tsx` (line 167) and `src/components/shopkeeper/ProductFormModal.tsx` (line 502), newly added manual variants were initialized with `stock_quantity: 1`.
   - Consequently, every product variant was marked as having an inventory cap of exactly 1 unit.

2. **Silent Stock Clamping in `updateQuantity`:**
   - In `src/context/CartContext.tsx` (line 259), clicking `+` evaluated `Math.min(maxStock, quantity)`. Because `maxStock` was 1, clicking `+` silently clamped the quantity back to 1 without any error message or user feedback.

3. **Variant Matching Ambiguity:**
   - In `CartContext.tsx`, item identification used `(!variantId || i.selectedVariant?.id === variantId)`. When `variantId` was omitted or null, `!variantId` evaluated to `true`, matching any variant belonging to the same `productId`. This caused cross-variant quantity contamination when multiple options of the same product were in the cart.

4. **Missing Live Backend Inventory Validation:**
   - On checkout submission, `submitShopRequest` trusted client-side state and did not re-verify product availability or stock against `shops_products` in Supabase.

### 1.2 Implemented Changes

- **Untracked Stock by Default (`src/lib/productVariants.ts`, `ProductVariantManager.tsx`, `ProductFormModal.tsx`):**
  Changed default `stock_quantity: 1` to `stock_quantity: null`. When `stock_quantity == null`, inventory is untracked (allowing quantities up to 99). If a shopkeeper explicitly enables "Track Stock", they specify the available units.
- **Strict Variant Identity (`src/context/CartContext.tsx`):**
  Implemented `matchesCartItem(item, productId, variantId)` which strictly matches `item.selectedVariant?.id ?? null === variantId ?? null`. This prevents variant switching or merging distinct variants (e.g., Red Kurti and Blue Kurti remain distinct line items).
- **Cart Quantity Controls with User Feedback (`src/context/CartContext.tsx`, `src/pages/CartPage.tsx`, `src/pages/ShopDetailPage.tsx`):**
  `updateQuantity` returns `{ success: boolean, maxStock?: number, error?: string }`. When a customer clicks `+` at max available stock, quantity clamps to `maxStock` and a clear toast error informs the user: *"Only X units available in stock."*
- **Batch Add Support (`addItem`):**
  `addItem` now accepts a `quantityToAdd` parameter (default 1), eliminating looping in `ProductDetailModal` and `ProductCard`.
- **Live Backend Inventory Verification (`submitShopRequest`):**
  Before inserting an order into Supabase `requests`, `submitShopRequest` queries `shops_products` for live availability, banned status, and variant stock. If stock changed between cart creation and checkout, the order is rejected with an informative error.
- **Accessible Touch Sizing (`src/pages/CartPage.css`):**
  Defined complete `.vaango-qty-control`, `.vaango-qty-btn`, and `.vaango-qty-display` classes with 40-44px touch targets and `touch-action: manipulation` for mobile reliability.

---

## 2. Issue B — Authoritative Shop UPI Configuration & Stale Cache Sync

### 2.1 Root Cause Analysis

Three root causes caused the checkout failure when a shopkeeper added a UPI QR code after shop creation:

1. **Stale Shop Snapshot in LocalStorage:**
   - When a customer added an item to cart from `ShopDetailPage`, the current `shop` object was serialized into `localStorage` (`vaango-customer-cart`). If the shop had not yet set up UPI, `shop.upi_qr_url` was stored as `null`.
   - `CartContext` and `CartPage` loaded `group.shop` directly from `localStorage` without ever refreshing it from Supabase.

2. **Client-Side Premature Rejection:**
   - In `CartPage.tsx` (line 795), the UPI button was disabled via `disabled={!isValidUpiQrUrl(shop.upi_qr_url)}`.
   - In `handleCheckoutShop` (line 246), clicking checkout with UPI checked `group.shop.upi_qr_url` and immediately aborted with: *"UPI payment is currently unavailable because this shop has not configured its UPI QR code."*
   - Because `group.shop` was never refreshed, the client blocked the customer even though the database already had the valid QR code!

3. **Stale Data Passed to Backend Trigger:**
   - In `submitShopRequest` (lines 445-446), the stale `targetShop.upi_qr_url: null` was written into `requests.notes`.
   - Although the database trigger `trg_require_request_shop_upi_qr` (`require_shop_upi_qr()`) checks `public.shops.upi_qr_url`, the client blocked submission before the database could ever be reached.
   - When shopkeepers saved their profile in `ShopkeeperProfilePage`, no event was dispatched to invalidate open cart snapshots.

### 2.2 Implemented Changes

- **Authoritative Shop Refresh (`syncCartShops` in `src/context/CartContext.tsx`):**
  Added `syncCartShops()` to query Supabase `shops` for `id, name, owner_id, status, is_live, upi_id, upi_qr_url, delivery_available, delivery_fee, free_delivery_above, address_line, phone, photo_url, slot_config` for all shops currently represented in the cart, updating `items` with fresh metadata.
- **Event-Driven & Mount Invalidation (`CartPage.tsx`, `CartContext.tsx`):**
  `CartPage` invokes `syncCartShops()` on mount. In addition, window listeners for `vaango-shops-changed` and window `focus` automatically refresh cart shop data whenever shopkeeper profile updates occur or when the customer returns to the cart tab.
- **Cross-Component Change Event (`src/lib/shopkeeperApi.ts`):**
  In `updateShopProfile`, upon successful database update, a `vaango-shops-changed` event is dispatched containing the fresh shop metadata.
- **Authoritative Checkout Validation (`submitShopRequest`):**
  `submitShopRequest` queries `shops` directly from Supabase, verifies that `dbShop.status === 'active'` and `dbShop.is_live === true`, strictly validates `isValidUpiQrUrl(dbShop.upi_qr_url)` for UPI payments, and injects `dbShop.upi_id` and `dbShop.upi_qr_url` into the request payload.
- **Strict Security Preserved:**
  If a shop genuinely has no UPI QR code (or has a placeholder like `your-project-id`), the request is strictly rejected on both client and database levels, preserving the `require_shop_upi_qr()` database trigger.

---

## 3. Issue C — Background Push Notification Reliability

### 3.1 Root Cause Analysis

1. **Device Overwrite in Single-Origin Mapping:**
   - Push subscriptions were stored in `profiles.push_subscription` under a single origin key. When a shopkeeper logged in on phone and desktop, each registration replaced the other.
2. **Edge Function Origin Filtering:**
   - In `supabase/functions/send-push-notification/index.ts`, incoming webhook requests checked if the subscription origin matched the notification request origin, causing notifications to be dropped for background devices.
3. **Missing Lifecycle Triggers:**
   - Appointment and custom service requests did not invoke `notifyOrderLifecycle`, leaving appointment-based shopkeepers without order notifications.
4. **Silent / Non-Persistent Service Worker Alerts:**
   - `public/sw.js` was missing `requireInteraction: true`, `renotify: true`, and distinct vibration patterns, causing mobile devices to silently dismiss notifications when locked.
5. **No Shopkeeper Onboarding Prompt:**
   - Shopkeepers had no dedicated in-app UI to request notification permissions, test alerts, or troubleshoot blocked notifications.

### 3.2 Implemented Changes (Committed in `8266cfd`)

- **Multi-Device Array (`src/lib/pushNotifications.ts`):**
  Introduced `endpoints: StoredDeviceSubscription[]` retaining up to 10 active devices per user. Unregistering one device leaves other registered phones/desktops intact.
- **Edge Function Delivery (`send-push-notification/index.ts`):**
  Edge function delivers to all device endpoints for business notifications (`is_test: false`), automatically pruning dead subscriptions (HTTP 404/410).
- **Service Worker Persistence (`public/sw.js`):**
  Added `requireInteraction: true`, `renotify: true`, distinct vibration `[300, 100, 300, 100, 300]`, and bumped cache to `vaango-cache-v1.0.1`.
- **Appointment Triggers (`src/lib/appointmentServiceApi.ts`):**
  Added `notifyOrderLifecycle` triggers for appointment bookings.
- **Shopkeeper Permission Component (`ShopkeeperPushNotificationPrompt.tsx`):**
  1-click permission activation, 1-click test alert, live endpoint diagnostic verification, and Android Chrome site settings guidance mounted across Dashboard, Requests, and Profile pages.

---

## 4. Verification and Test Results

### 4.1 Automated Test Suites (34/34 Passing)

Executed via `node scripts/run_all_tests.mjs`:

```text
Found 34 test suites in E:\Vango\src\__tests__

Testing adminSubscriptionsAndShopDetail.test.ts... ✓ PASS
Testing appointmentBookingPaymentUI.test.ts... ✓ PASS
Testing appointmentPaymentStatusPresentation.test.ts... ✓ PASS
Testing authEnvironmentAndOAuthFlow.test.ts... ✓ PASS
Testing commerceReliability.test.ts... ✓ PASS
Testing dashboardDataAuthenticity.test.ts... ✓ PASS
Testing errorVisibilityAndCartUX.test.ts... ✓ PASS
Testing informationRetrievalAndLocationSave.test.ts... ✓ PASS
Testing liveModeNoMockFallback.test.ts... ✓ PASS
Testing masterCatalogueFlow.test.ts... ✓ PASS
Testing mobileResponsiveLayout.test.ts... ✓ PASS
Testing notificationBadge.test.ts... ✓ PASS
Testing notificationDropdownPositioning.test.ts... ✓ PASS
Testing orderCancellationAndAbusePrevention.test.ts... ✓ PASS
Testing orderNotificationLifecycle.test.ts... ✓ PASS
Testing passwordResetFlow.test.ts... ✓ PASS
Testing paymentProofIsolation.test.ts... ✓ PASS
Testing productDetailsCartFlow.test.ts... ✓ PASS
Testing productVariantRedesign.test.ts... ✓ PASS
Testing pwaInstallationStateMachine.test.ts... ✓ PASS
Testing requestListOrdering.test.ts... ✓ PASS
Testing runtimeSecurityValidation.test.ts... ✓ PASS
Testing scheduledPickupFlow.test.ts... ✓ PASS
Testing sec01PushNotificationAuth.test.ts... ✓ PASS
Testing sec02AppointmentBookingAuth.test.ts... ✓ PASS
Testing sec03RedirectSanitization.test.ts... ✓ PASS
Testing sec04ShopkeeperRoleEscalation.test.ts... ✓ PASS
Testing sec05HttpSecurityHeaders.test.ts... ✓ PASS
Testing shopkeeperApplicationSubmission.test.ts... ✓ PASS
Testing shopkeeperBackgroundPush.test.ts... ✓ PASS
Testing shopkeeperLocationAndUploadReliability.test.ts... ✓ PASS
Testing shopkeeperNavigationAndAnalytics.test.ts... ✓ PASS
Testing uiRedesignRegressions.test.ts... ✓ PASS
Testing variantInventoryManagement.test.ts... ✓ PASS

========================================
TEST RESULTS: 34 PASSED, 0 FAILED out of 34
========================================

ALL TESTS PASSED!
```

### 4.2 Production Build Verification

Executed via `npm run build`:

```text
> vaango@0.1.0 build
> tsc && vite build

vite v6.4.3 building for production...
transforming...
✓ 2145 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                              2.38 kB │ gzip:   1.02 kB
dist/assets/index-D4Ryp3rT.js                              510.18 kB │ gzip: 124.79 kB
dist/assets/index-BNwEQ9HV.css                             119.12 kB │ gzip:  23.90 kB
[PWA Plugin] Injected MW3YLXQ0 into dist/sw.js
✓ built in 5.91s
```

---

## 5. File Modification Summary

| File Path | Description of Changes |
| :--- | :--- |
| `src/lib/productVariants.ts` | Defaulted `stock_quantity: null` in `generateVariantCombinations` for untracked inventory. |
| `src/components/shopkeeper/ProductVariantManager.tsx` | Defaulted `stock_quantity: null` for manual variant creation. |
| `src/components/shopkeeper/ProductFormModal.tsx` | Defaulted `stock_quantity: null` for standard initial variant. |
| `src/context/CartContext.tsx` | Added `matchesCartItem`, `syncCartShops`, `quantityToAdd` parameter in `addItem`, stock limits & clamping in `updateQuantity`, live backend inventory check, and authoritative shop UPI validation in `submitShopRequest`. |
| `src/pages/CartPage.tsx` | Invokes `syncCartShops` on mount; re-verifies live shop QR before UPI submission; displays toast feedback on stock limits; improved button accessibility. |
| `src/pages/CartPage.css` | Comprehensive `.vaango-qty-control` styling with 40-44px touch targets. |
| `src/components/customer/ProductCard.tsx` | Direct `quantityToAdd` pass-through to `addItem`. |
| `src/pages/ShopDetailPage.tsx` | Direct `quantityToAdd` pass-through and stock limit toast feedback. |
| `src/lib/shopkeeperApi.ts` | Dispatches `vaango-shops-changed` event upon successful shop profile update. |
| `src/__tests__/commerceReliability.test.ts` | 7 automated tests covering variant defaults, cart item identity, quantity controls, calculations, BOGO, stale cache sync, and UPI security. |

---

## 6. Production Safety & Next Steps

- **Database Integrity:** No migrations required; no schema changes or table drops.
- **Production Data:** Zero production records created, modified, or deleted.
- **Branch State:** Working tree is clean on branch `fix/commerce-reliability-cart-upi-push`.
- **Merge Readiness:** Ready for merge into `main` and production release upon explicit user approval.
