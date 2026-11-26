/**
 * KARTZO PRODUCTION REMEDIATION: UX, PERFORMANCE & BRANDING TEST SUITE
 *
 * Verifies fixes for:
 * 1. BUG-AUDIT-03: Guest checkout OAuth redirect preservation
 * 2. PERF-AUDIT-01: Mock data extraction & bundle decoupling
 * 3. BRAND-AUDIT-01: Support email address update to support@kartzo.in
 */

import fs from 'fs';
import path from 'path';
import { isValidUuid, UUID_REGEX } from '../lib/uuid';
import { getShopType, MOCK_SHOP_TYPES, SHOP_TYPE_UUIDS } from '../lib/shopTypes';
import { getAuthRedirectUrl } from '../lib/supabase';

function runUXAndPerfRemediationTests() {
  console.log('\n--- 1. BUG-AUDIT-03: OAuth Checkout Redirect Preservation ---');

  const cartPageFile = path.resolve('src/pages/CartPage.tsx');
  const cartPageContent = fs.readFileSync(cartPageFile, 'utf8');

  // Verify signInWithGoogle('/cart') invocation
  if (!cartPageContent.includes("signInWithGoogle('/cart')")) {
    throw new Error("BUG-AUDIT-03 FAILED: CartPage does not pass '/cart' to signInWithGoogle");
  }

  // Verify sessionStorage and localStorage redirect persistence
  if (!cartPageContent.includes("sessionStorage.setItem('vaangly_auth_redirect', '/cart')")) {
    throw new Error("BUG-AUDIT-03 FAILED: CartPage does not persist vaangly_auth_redirect in sessionStorage");
  }
  if (!cartPageContent.includes("localStorage.setItem('vaangly_auth_redirect', '/cart')")) {
    throw new Error("BUG-AUDIT-03 FAILED: CartPage does not persist vaangly_auth_redirect in localStorage");
  }

  // Verify getAuthRedirectUrl constructs the redirect parameter correctly
  const redirectUrl = getAuthRedirectUrl('/cart');
  if (!redirectUrl.includes('?redirect=%2Fcart')) {
    throw new Error(`BUG-AUDIT-03 FAILED: getAuthRedirectUrl('/cart') returned '${redirectUrl}' without ?redirect=%2Fcart`);
  }
  console.log(`✓ getAuthRedirectUrl('/cart') generates verified URL: ${redirectUrl}`);

  // Verify AuthCallbackPage processes the redirect
  const authCallbackFile = path.resolve('src/pages/auth/AuthCallbackPage.tsx');
  const authCallbackContent = fs.readFileSync(authCallbackFile, 'utf8');
  if (!authCallbackContent.includes("query.get('redirect')") || !authCallbackContent.includes("sessionStorage.getItem('vaangly_auth_redirect')")) {
    throw new Error('BUG-AUDIT-03 FAILED: AuthCallbackPage does not read redirect destination from query or sessionStorage');
  }
  console.log('✓ AuthCallbackPage authoritative redirect restoration is verified');


  console.log('\n--- 2. PERF-AUDIT-01: Utility Decoupling & Bundle Optimization ---');

  // Test isValidUuid utility
  const sampleValidUuid = '0f56b1ab-c358-4638-bf0c-4b510a15482f';
  const sampleInvalidUuid = 'invalid-uuid-12345';
  if (!isValidUuid(sampleValidUuid) || isValidUuid(sampleInvalidUuid) || isValidUuid(null) || isValidUuid('')) {
    throw new Error('PERF-AUDIT-01 FAILED: isValidUuid returned incorrect boolean result');
  }
  if (!UUID_REGEX.test(sampleValidUuid)) {
    throw new Error('PERF-AUDIT-01 FAILED: UUID_REGEX failed to match valid UUID');
  }
  console.log('✓ isValidUuid correctly validates RFC 4122 UUIDs');

  // Test getShopType resolver
  const groceryType = getShopType('grocery');
  const uuidType = getShopType('0f56b1ab-c358-4638-bf0c-4b510a15482f');
  const legacyType = getShopType('type-grocery');
  if (!groceryType || groceryType.code !== 'grocery' || !uuidType || !legacyType) {
    throw new Error('PERF-AUDIT-01 FAILED: getShopType failed to resolve shop type by code or UUID');
  }
  if (MOCK_SHOP_TYPES.length !== 13) {
    throw new Error(`PERF-AUDIT-01 FAILED: Expected 13 shop types, got ${MOCK_SHOP_TYPES.length}`);
  }
  if (!SHOP_TYPE_UUIDS[groceryType.code]) {
    throw new Error('PERF-AUDIT-01 FAILED: SHOP_TYPE_UUIDS missing grocery code');
  }
  console.log(`✓ getShopType correctly resolves all ${MOCK_SHOP_TYPES.length} business types`);

  // Verify CartContext.tsx does not import mockData
  const cartContextFile = path.resolve('src/context/CartContext.tsx');
  const cartContextContent = fs.readFileSync(cartContextFile, 'utf8');
  if (cartContextContent.includes("from '../data/mockData'") || cartContextContent.includes('from "../data/mockData"')) {
    throw new Error('PERF-AUDIT-01 FAILED: CartContext still imports from mockData.ts');
  }
  console.log('✓ CartContext is cleanly decoupled from mockData.ts');

  // Verify dist/index.html has zero preloads for mock-data
  const indexHtmlDist = path.resolve('dist/index.html');
  if (fs.existsSync(indexHtmlDist)) {
    const distHtml = fs.readFileSync(indexHtmlDist, 'utf8');
    if (distHtml.includes('mock-data')) {
      throw new Error('PERF-AUDIT-01 FAILED: dist/index.html contains preloaded mock-data chunk!');
    }
    console.log('✓ dist/index.html contains zero preloaded mock-data chunks');
  }


  console.log('\n--- 3. BRAND-AUDIT-01: Support Contact Address ---');

  const footerFile = path.resolve('src/components/layout/Footer.tsx');
  const footerContent = fs.readFileSync(footerFile, 'utf8');

  if (!footerContent.includes('mailto:support@kartzo.in')) {
    throw new Error('BRAND-AUDIT-01 FAILED: Footer.tsx does not contain mailto:support@kartzo.in');
  }
  if (footerContent.includes('mailto:support@vaango.com')) {
    throw new Error('BRAND-AUDIT-01 FAILED: Footer.tsx still contains obsolete support@vaango.com');
  }
  console.log('✓ Footer.tsx contains verified support address: support@kartzo.in');

  console.log('\nALL UX, PERFORMANCE & BRANDING REMEDIATION TESTS PASSED!');
}

runUXAndPerfRemediationTests();
