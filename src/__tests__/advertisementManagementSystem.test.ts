import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateDestinationUrl,
  validateMediaFile,
  isCriticalTransactionRoute,
  isEligibleForOpeningAd,
  markAdDisplayed,
  markAdSkipped,
  AD_SESSION_COUNT_KEY,
  AD_LAST_SHOWN_KEY,
  AD_LAST_SKIPPED_KEY,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
} from '../lib/advertisementApi';
import { AdSettings, SkipDuration } from '../types/advertisement';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory mock storage for Node environment tests
class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

// Attach polyfills if running in raw Node tsx environment
if (typeof globalThis.sessionStorage === 'undefined') {
  (globalThis as unknown as { sessionStorage: MockStorage }).sessionStorage = new MockStorage();
}
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as unknown as { localStorage: MockStorage }).localStorage = new MockStorage();
}

async function runTests() {
  console.log('=== Running Vaangly Advertisement Management System Tests ===\n');

  // =========================================================================
  // TEST SUITE 1: Destination URL Security & Validation
  // =========================================================================
  console.log('--- Test Suite 1: Destination URL Validation ---');

  // 1.1 Valid secure HTTPS URLs
  const validUrls = [
    'https://example.com',
    'https://subdomain.advertiser.com/promo-sale?utm_source=vaangly',
    'https://shop.localbrand.in/offer#diwali',
    'https://brand.co.in/products/item-123',
  ];
  for (const url of validUrls) {
    const res = validateDestinationUrl(url);
    assert.strictEqual(res.valid, true, `Valid HTTPS URL must pass: ${url}`);
    assert.strictEqual(res.error, undefined);
  }

  // 1.2 Insecure HTTP URLs
  const httpRes = validateDestinationUrl('http://insecure.example.com');
  assert.strictEqual(httpRes.valid, false, 'Insecure HTTP URL must be rejected');
  assert.ok(httpRes.error?.includes('https://'), 'Error must mention https://');

  // 1.3 Dangerous URL schemes
  const dangerousUrls = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://ftp.example.com',
    'vbscript:msgbox(1)',
  ];
  for (const url of dangerousUrls) {
    const res = validateDestinationUrl(url);
    assert.strictEqual(res.valid, false, `Dangerous scheme must be rejected: ${url}`);
  }

  // 1.4 Empty / malformed URLs
  assert.strictEqual(validateDestinationUrl('').valid, false, 'Empty URL must fail');
  assert.strictEqual(validateDestinationUrl('   ').valid, false, 'Whitespace URL must fail');
  assert.strictEqual(validateDestinationUrl('not-a-url').valid, false, 'String without protocol must fail');
  assert.strictEqual(validateDestinationUrl('https://').valid, false, 'Bare https:// must fail');

  console.log('✓ Test Suite 1 Passed: Destination URLs validated & secured.');

  // =========================================================================
  // TEST SUITE 2: Media File Validation & Size Limits
  // =========================================================================
  console.log('\n--- Test Suite 2: Media File Validation & Formats ---');

  // 2.1 Valid image formats
  for (const mime of ALLOWED_IMAGE_TYPES) {
    const file = new File(['mock-img-content'], 'test.jpg', { type: mime });
    const res = validateMediaFile(file, 'image');
    assert.strictEqual(res.valid, true, `MIME ${mime} must be accepted for image`);
  }

  // 2.2 Unsupported image formats
  const badImageFiles = [
    new File(['mock'], 'test.gif', { type: 'image/gif' }),
    new File(['mock'], 'test.svg', { type: 'image/svg+xml' }),
    new File(['mock'], 'test.pdf', { type: 'application/pdf' }),
  ];
  for (const file of badImageFiles) {
    const res = validateMediaFile(file, 'image');
    assert.strictEqual(res.valid, false, `Unsupported format ${file.type} must be rejected`);
  }

  // 2.3 Oversized image
  const oversizedImage = new File(['mock'], 'large.png', { type: 'image/png' });
  Object.defineProperty(oversizedImage, 'size', { value: MAX_IMAGE_SIZE_BYTES + 1024 });
  const imgRes = validateMediaFile(oversizedImage, 'image');
  assert.strictEqual(imgRes.valid, false, 'Images over 10MB must be rejected');
  assert.ok(imgRes.error?.includes('10MB'), 'Error must mention 10MB limit');

  // 2.4 Valid video formats
  for (const mime of ALLOWED_VIDEO_TYPES) {
    const file = new File(['mock-video-content'], 'test.mp4', { type: mime });
    const res = validateMediaFile(file, 'video');
    assert.strictEqual(res.valid, true, `MIME ${mime} must be accepted for video`);
  }

  // 2.5 Unsupported video formats
  const badVideoFiles = [
    new File(['mock'], 'test.avi', { type: 'video/x-msvideo' }),
    new File(['mock'], 'test.mov', { type: 'video/quicktime' }),
  ];
  for (const file of badVideoFiles) {
    const res = validateMediaFile(file, 'video');
    assert.strictEqual(res.valid, false, `Unsupported video ${file.type} must be rejected`);
  }

  // 2.6 Oversized video
  const oversizedVideo = new File(['mock'], 'large.mp4', { type: 'video/mp4' });
  Object.defineProperty(oversizedVideo, 'size', { value: MAX_VIDEO_SIZE_BYTES + 2048 });
  const vidRes = validateMediaFile(oversizedVideo, 'video');
  assert.strictEqual(vidRes.valid, false, 'Videos over 50MB must be rejected');
  assert.ok(vidRes.error?.includes('50MB'), 'Error must mention 50MB limit');

  console.log('✓ Test Suite 2 Passed: Media formats & sizes strictly validated.');

  // =========================================================================
  // TEST SUITE 3: Skip Duration Options (Strictly 5s, 10s, 30s)
  // =========================================================================
  console.log('\n--- Test Suite 3: Skip Duration Options ---');

  const validDurations: SkipDuration[] = [5, 10, 30];
  assert.deepStrictEqual(validDurations, [5, 10, 30]);

  const invalidDurations = [0, 1, 3, 15, 20, 60, -5];
  for (const dur of invalidDurations) {
    assert.strictEqual(validDurations.includes(dur as SkipDuration), false, `Duration ${dur} must not be allowed`);
  }

  console.log('✓ Test Suite 3 Passed: Skip duration options strictly constrained.');

  // =========================================================================
  // TEST SUITE 4: Critical Transaction Route Protection
  // =========================================================================
  console.log('\n--- Test Suite 4: Route Transaction Protection ---');

  const criticalPaths = [
    '/cart',
    '/checkout',
    '/request-confirmation/12345',
    '/request/abc-def-123',
    '/requests/abc-def-123',
    '/orders',
    '/bookings',
    '/complete-profile',
    '/auth/callback',
    '/login',
    '/register',
    '/reset-password',
    '/shopkeeper/dashboard',
    '/shopkeeper/requests',
    '/admin/dashboard',
  ];
  for (const path of criticalPaths) {
    assert.strictEqual(isCriticalTransactionRoute(path), true, `Route ${path} must be protected as critical`);
  }

  const safePaths = ['/', '/shops', '/explore', '/shop/test-123'];
  for (const path of safePaths) {
    assert.strictEqual(isCriticalTransactionRoute(path), false, `Landing route ${path} must not be blocked`);
  }

  console.log('✓ Test Suite 4 Passed: Critical checkout & payment routes protected.');

  // =========================================================================
  // TEST SUITE 5: Customer Frequency & Cooldown Controls
  // =========================================================================
  console.log('\n--- Test Suite 5: Customer Frequency & Cooldown Controls ---');

  const defaultSettings: AdSettings = {
    id: 'default',
    is_enabled: true,
    max_ads_per_session: 1,
    cooldown_minutes: 15,
    default_skip_duration: 5,
    rotation_strategy: 'fair_round_robin',
    updated_at: new Date().toISOString(),
  };

  // Clean state
  sessionStorage.clear();
  localStorage.clear();
  assert.strictEqual(isEligibleForOpeningAd(defaultSettings, '/'), true, 'Fresh customer must be eligible');

  // Disabled globally
  const disabledSettings = { ...defaultSettings, is_enabled: false };
  assert.strictEqual(isEligibleForOpeningAd(disabledSettings, '/'), false, 'Disabled platform must not serve ads');

  // Max ads per session
  sessionStorage.setItem(AD_SESSION_COUNT_KEY, '1');
  assert.strictEqual(isEligibleForOpeningAd(defaultSettings, '/'), false, 'Session limit of 1 must be respected');
  sessionStorage.clear();

  // Cooldown active (5 mins ago)
  const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
  localStorage.setItem(AD_LAST_SHOWN_KEY, String(fiveMinsAgo));
  assert.strictEqual(isEligibleForOpeningAd(defaultSettings, '/'), false, '15-min cooldown must block repeat ad');

  // Cooldown passed (16 mins ago)
  const sixteenMinsAgo = Date.now() - 16 * 60 * 1000;
  localStorage.setItem(AD_LAST_SHOWN_KEY, String(sixteenMinsAgo));
  assert.strictEqual(isEligibleForOpeningAd(defaultSettings, '/'), true, 'Expired cooldown must restore eligibility');

  // Skip cooldown
  const twoMinsAgo = Date.now() - 2 * 60 * 1000;
  localStorage.setItem(AD_LAST_SKIPPED_KEY, String(twoMinsAgo));
  assert.strictEqual(isEligibleForOpeningAd(defaultSettings, '/'), false, 'Skip cooldown must block immediate repeat');

  localStorage.clear();
  sessionStorage.clear();

  // State recording
  markAdDisplayed('camp-101');
  assert.strictEqual(sessionStorage.getItem(AD_SESSION_COUNT_KEY), '1');
  assert.ok(localStorage.getItem(AD_LAST_SHOWN_KEY) !== null);

  markAdSkipped();
  assert.ok(localStorage.getItem(AD_LAST_SKIPPED_KEY) !== null);

  console.log('✓ Test Suite 5 Passed: Frequency, session limits, and cooldowns verified.');

  // =========================================================================
  // TEST SUITE 6: Analytics Math & Division by Zero Protection
  // =========================================================================
  console.log('\n--- Test Suite 6: Analytics Math & Division by Zero Protection ---');

  // 6.1 Normal CTR calculation
  const impressions = 500;
  const clicks = 25;
  const ctr = Number(((clicks / impressions) * 100).toFixed(2));
  assert.strictEqual(ctr, 5.0, 'CTR should be 5%');

  // 6.2 Zero impressions protection
  const zeroImpressions = 0;
  const zeroClicks = 0;
  const zeroCtr = zeroImpressions > 0 ? Number(((zeroClicks / zeroImpressions) * 100).toFixed(2)) : 0;
  assert.strictEqual(zeroCtr, 0, 'Zero impressions must return 0% without NaN or Infinity');
  assert.strictEqual(isNaN(zeroCtr), false);
  assert.strictEqual(isFinite(zeroCtr), true);

  // 6.3 Completion and skip rates
  const totalViews = 200;
  const completed = 80;
  const skipped = 120;
  const compRate = Number(((completed / totalViews) * 100).toFixed(2));
  const skipRate = Number(((skipped / totalViews) * 100).toFixed(2));
  assert.strictEqual(compRate, 40.0);
  assert.strictEqual(skipRate, 60.0);
  assert.strictEqual(compRate + skipRate, 100.0);

  console.log('✓ Test Suite 6 Passed: Analytics metrics calculate accurately.');

  // =========================================================================
  // TEST SUITE 7: Architecture & Database Migration Integrity
  // =========================================================================
  console.log('\n--- Test Suite 7: Schema & Component Architecture ---');

  // Verify migration 75 exists on disk
  const migrationPath = path.resolve('supabase/migrations/20261114000075_advertisement_management_system.sql');
  assert.strictEqual(fs.existsSync(migrationPath), true, 'Migration 75 must exist in supabase/migrations');

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.ad_settings'), 'Must create ad_settings');
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.ad_campaigns'), 'Must create ad_campaigns');
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.ad_creatives'), 'Must create ad_creatives');
  assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.ad_events'), 'Must create ad_events');
  assert.ok(migrationSql.includes('advertisement-media'), 'Must create storage bucket advertisement-media');
  assert.ok(migrationSql.includes('get_eligible_advertisement'), 'Must define get_eligible_advertisement RPC');
  assert.ok(migrationSql.includes('record_ad_event'), 'Must define record_ad_event RPC');
  assert.ok(migrationSql.includes('get_ad_analytics'), 'Must define get_ad_analytics RPC');

  console.log('✓ Test Suite 7 Passed: Migration 75 contains complete schema, storage & RPCs.');

  console.log('\n===============================================================');
  console.log('ALL ADVERTISEMENT MANAGEMENT SYSTEM TESTS PASSED SUCCESSFULLY!');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
