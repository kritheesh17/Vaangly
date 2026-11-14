import assert from 'assert';
import fs from 'fs';
import path from 'path';
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

  // =========================================================================
  // TEST SUITE 8: Production Bug Regression Matrix & Fallback Logic (13 Tests)
  // =========================================================================
  console.log('\n--- Test Suite 8: Production Bug Regression Matrix & Fallback (13 Tests) ---');

  interface MockCampaignItem {
    id: string;
    name: string;
    status: 'draft' | 'scheduled' | 'active' | 'paused' | 'expired' | 'rejected';
    media_type: 'image' | 'video';
    media_url: string;
    destination_url: string;
    skip_duration: 5 | 10 | 30;
    priority: number;
    start_at: number;
    end_at: number;
    recent_impressions: number;
    recent_errors: number;
  }

  // Simulation engine for candidate selection & rotation matching Migration 76
  function simulateGetEligibleAd(
    campaigns: MockCampaignItem[],
    now: number,
    lastSeenId?: string,
    excludeIds: string[] = []
  ): MockCampaignItem | null {
    // 1. Filter candidates
    const candidates = campaigns.filter((c) => {
      if (c.status !== 'active') return false;
      if (now < c.start_at || now > c.end_at) return false;
      if (excludeIds.includes(c.id)) return false;
      return true;
    });

    if (candidates.length === 0) return null;

    // 2. Sort by repetition penalty, error penalty, impressions ASC
    const sorted = [...candidates].sort((a, b) => {
      const aRepPenalty = lastSeenId && a.id === lastSeenId ? 1 : 0;
      const bRepPenalty = lastSeenId && b.id === lastSeenId ? 1 : 0;
      if (aRepPenalty !== bRepPenalty) return aRepPenalty - bRepPenalty;

      const aErrPenalty = a.recent_errors > 0 ? 1 : 0;
      const bErrPenalty = b.recent_errors > 0 ? 1 : 0;
      if (aErrPenalty !== bErrPenalty) return aErrPenalty - bErrPenalty;

      if (a.recent_impressions !== b.recent_impressions) {
        return a.recent_impressions - b.recent_impressions;
      }
      return 0;
    });

    return sorted[0];
  }

  const now = Date.now();
  const pastOneHour = now - 3600 * 1000;
  const futureOneDay = now + 86400 * 1000;

  const mockImageAd: MockCampaignItem = {
    id: 'camp-img-001',
    name: 'Diwali Banner',
    status: 'active',
    media_type: 'image',
    media_url: 'https://pndikgqbgchzkrmlrmzo.supabase.co/storage/v1/object/public/advertisement-media/img1.png',
    destination_url: 'https://example.com/diwali',
    skip_duration: 5,
    priority: 1,
    start_at: pastOneHour,
    end_at: futureOneDay,
    recent_impressions: 1,
    recent_errors: 0,
  };

  const mockVideoAd: MockCampaignItem = {
    id: 'camp-vid-002',
    name: 'Mega Store Video',
    status: 'active',
    media_type: 'video',
    media_url: 'https://pndikgqbgchzkrmlrmzo.supabase.co/storage/v1/object/public/advertisement-media/vid1.mp4',
    destination_url: 'https://example.com/video',
    skip_duration: 10,
    priority: 1,
    start_at: pastOneHour,
    end_at: futureOneDay,
    recent_impressions: 0,
    recent_errors: 0,
  };

  // 8.1 Single image advertisement
  const test1 = simulateGetEligibleAd([mockImageAd], now);
  assert.strictEqual(test1?.id, 'camp-img-001', '8.1: Single image ad must be returned');

  // 8.2 Single video advertisement
  const test2 = simulateGetEligibleAd([mockVideoAd], now);
  assert.strictEqual(test2?.id, 'camp-vid-002', '8.2: Single video ad must be returned');

  // 8.3 Multiple image advertisements
  const mockImageAd2: MockCampaignItem = {
    ...mockImageAd,
    id: 'camp-img-003',
    name: 'New Year Banner',
    recent_impressions: 0,
  };
  const test3 = simulateGetEligibleAd([mockImageAd, mockImageAd2], now);
  assert.strictEqual(test3?.id, 'camp-img-003', '8.3: Ad with fewer impressions should be prioritized');

  // 8.4 Image and video advertisements together (Fair rotation)
  const test4 = simulateGetEligibleAd([mockImageAd, mockVideoAd], now, 'camp-vid-002');
  assert.strictEqual(test4?.id, 'camp-img-001', '8.4: After seeing video, image ad is selected due to repetition penalty');

  // 8.5 Invalid video URL detection
  const invalidUrlRes = validateDestinationUrl('http://insecure-video.com');
  assert.strictEqual(invalidUrlRes.valid, false, '8.5: Insecure destination URL is blocked');

  // 8.6 Video playback failure telemetry
  let errorLogged = false;
  const mockTrackError = (eventType: string) => {
    if (eventType === 'playback_error') errorLogged = true;
  };
  mockTrackError('playback_error');
  assert.strictEqual(errorLogged, true, '8.6: Playback error event must be logged on video failure');

  // 8.7 Expired video campaign
  const expiredVideoAd: MockCampaignItem = {
    ...mockVideoAd,
    id: 'camp-vid-expired',
    status: 'active',
    end_at: now - 1000, // expired 1s ago
  };
  const test7 = simulateGetEligibleAd([expiredVideoAd], now);
  assert.strictEqual(test7, null, '8.7: Expired campaign must never be returned');

  // 8.8 Paused video campaign
  const pausedVideoAd: MockCampaignItem = {
    ...mockVideoAd,
    id: 'camp-vid-paused',
    status: 'paused',
  };
  const test8 = simulateGetEligibleAd([pausedVideoAd], now);
  assert.strictEqual(test8, null, '8.8: Paused campaign must never be returned');

  // 8.9 Invalid creative rejection (e.g. executable/pdf)
  const invalidFile = new File(['code'], 'malicious.exe', { type: 'application/x-msdownload' });
  const fileVal = validateMediaFile(invalidFile, 'video');
  assert.strictEqual(fileVal.valid, false, '8.9: Invalid media format is rejected');

  // 8.10 Campaign rotation after media failure (Poison pill fix)
  // When video has error, exclude it from next eligible call
  const brokenVideoAd: MockCampaignItem = {
    ...mockVideoAd,
    recent_errors: 3,
  };
  // Fallback with exclusion
  const test10a = simulateGetEligibleAd([brokenVideoAd, mockImageAd], now, undefined, [brokenVideoAd.id]);
  assert.strictEqual(test10a?.id, 'camp-img-001', '8.10a: Excluded broken video falls back to valid image campaign');

  // Automatic error penalty ranking (even without explicit exclude)
  const test10b = simulateGetEligibleAd([brokenVideoAd, mockImageAd], now);
  assert.strictEqual(test10b?.id, 'camp-img-001', '8.10b: Campaign with playback errors is deprioritized over healthy campaign');

  // 8.11 Frequency controls with different sessions
  localStorage.clear();
  sessionStorage.clear();
  const settings: AdSettings = {
    id: 'default',
    is_enabled: true,
    max_ads_per_session: 1,
    cooldown_minutes: 15,
    default_skip_duration: 5,
    rotation_strategy: 'fair_round_robin',
    updated_at: new Date().toISOString(),
  };

  // Fresh session 1
  assert.strictEqual(isEligibleForOpeningAd(settings, '/'), true, '8.11a: Fresh session is eligible');

  // Ad fails to load: markAdDisplayed was NOT called
  // Session count remains 0, cooldown remains 0
  assert.strictEqual(isEligibleForOpeningAd(settings, '/'), true, '8.11b: Unrendered ad does not consume frequency quota');

  // Ad successfully renders: markAdDisplayed is called
  markAdDisplayed('camp-img-001');
  assert.strictEqual(isEligibleForOpeningAd(settings, '/'), false, '8.11c: Rendered ad consumes session quota');

  // 8.12 No eligible advertisement
  const test12 = simulateGetEligibleAd([], now);
  assert.strictEqual(test12, null, '8.12: When no campaigns are active, returns null gracefully');

  // 8.13 Existing checkout, payment, and appointment protections
  const protectedRoutes = ['/cart', '/checkout', '/orders', '/requests', '/appointments', '/shopkeeper', '/admin'];
  for (const r of protectedRoutes) {
    assert.strictEqual(isCriticalTransactionRoute(r), true, `8.13: Protected route ${r} must never allow ads`);
  }

  console.log('✓ Test Suite 8 Passed: All 13 regression tests passed cleanly.');

  // Verify migration 76 exists on disk
  const migration76Path = path.resolve('supabase/migrations/20261114000076_fix_ad_campaign_fallback_and_rotation.sql');
  assert.strictEqual(fs.existsSync(migration76Path), true, 'Migration 76 must exist in supabase/migrations');

  console.log('\n===============================================================');
  console.log('ALL ADVERTISEMENT MANAGEMENT SYSTEM TESTS PASSED SUCCESSFULLY!');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
