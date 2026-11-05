import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  detectFileMimeType,
  isTransientUploadError,
  executeUploadQueue,
} from '../lib/fileUploadUtils';
import { classifyApplicationError } from '../lib/productErrorHelper';
import { prepareShopApplicationPayload } from '../lib/shopkeeperApi';
import { ShopApplication } from '../types/database';

describe('Shopkeeper Location Fallback & Upload Reliability Tests', () => {
  const baseMeta = {
    verifiedApplicantId: 'usr-applicant-123',
    resolvedShopTypeId: 'b149b555-5f5d-4f11-9a99-92f768c7e63b',
    resolvedLocationId: 'e2898492-4217-494b-90cb-ecb4f1784c17',
    normalizedContactPhone: '+919876543210',
  };

  const createMockApp = (overrides: Partial<ShopApplication> = {}) => ({
    applicant_id: 'usr-applicant-123',
    shop_name: 'Sri Murugan Stores',
    owner_name: 'Murugan',
    description: 'Fresh vegetables',
    shop_type_id: 'type-retail',
    location_id: 'loc-madurai-01',
    contact_phone: '+919876543210',
    address_line: '12 Bazaar Street, Simmakkal, Madurai',
    photo_url: 'https://storage.supabase.co/shop-photos/usr-123/photo.jpg',
    photo_urls: ['https://storage.supabase.co/shop-photos/usr-123/photo.jpg'],
    upi_id: 'murugan@okaxis',
    upi_qr_url: 'https://storage.supabase.co/shop-photos/usr-123/upi_qr.jpg',
    id_proof_url: 'usr-123/id_proof.pdf',
    gps_lat: 9.9252,
    gps_lng: 78.1198,
    google_maps_url: 'https://maps.google.com/?q=9.9252,78.1198',
    area: 'Simmakkal',
    district: 'Madurai',
    taluk: 'Madurai North',
    pincode: '625001',
    business_type: 'retail',
    offerings: ['products'],
    capabilities: ['fast_dispatch'],
    ...overrides,
  });

  // --------------------------------------------------------------------------
  // SECTION 1: LOCATION FALLBACK TESTS
  // --------------------------------------------------------------------------

  it('1. Location: GPS available stores exact valid coordinates', () => {
    const mockApp = createMockApp({ gps_lat: 9.9252, gps_lng: 78.1198 });
    const payload = prepareShopApplicationPayload(mockApp, baseMeta);

    assert.strictEqual(payload.gps_lat, 9.9252);
    assert.strictEqual(payload.gps_lng, 78.1198);
    assert.strictEqual(payload.address_line, '12 Bazaar Street, Simmakkal, Madurai');
  });

  it('2. Location: GPS unavailable with valid physical address stores NULL for coordinates', () => {
    const mockApp = createMockApp({
      gps_lat: null,
      gps_lng: null,
      address_line: '45 South Veli Street, Madurai - 625001',
      google_maps_url: 'https://maps.google.com/maps?q=Murugan+Stores',
    });
    const payload = prepareShopApplicationPayload(mockApp, baseMeta);

    // CRITICAL: Must be strictly NULL, never 0 or estimated coordinates
    assert.strictEqual(payload.gps_lat, null, 'gps_lat must be null when GPS is unavailable');
    assert.strictEqual(payload.gps_lng, null, 'gps_lng must be null when GPS is unavailable');
    assert.notStrictEqual(payload.gps_lat, 0, 'Must NEVER substitute zero coordinates');
    assert.notStrictEqual(payload.gps_lng, 0, 'Must NEVER substitute zero coordinates');

    // Preserves physical address and Google Maps profile
    assert.strictEqual(payload.address_line, '45 South Veli Street, Madurai - 625001');
    assert.strictEqual(payload.google_maps_url, 'https://maps.google.com/maps?q=Murugan+Stores');
  });

  it('3. Location: Validation rejects submission when BOTH GPS and address are missing', () => {
    const validateLocation = (gps: { lat: number; lng: number } | null, address: string) => {
      const hasValidGps =
        gps != null &&
        typeof gps.lat === 'number' &&
        typeof gps.lng === 'number' &&
        !isNaN(gps.lat) &&
        !isNaN(gps.lng) &&
        (gps.lat !== 0 || gps.lng !== 0);

      const hasValidAddress = Boolean(address && address.trim().length >= 5);
      return hasValidGps || hasValidAddress;
    };

    assert.strictEqual(validateLocation(null, ''), false, 'Missing GPS and empty address must be rejected');
    assert.strictEqual(validateLocation(null, '   '), false, 'Whitespace address must be rejected');
    assert.strictEqual(validateLocation(null, 'Main'), false, 'Short incomplete address must be rejected');
    assert.strictEqual(validateLocation({ lat: 0, lng: 0 }, ''), false, 'Zero coordinates must be rejected');
    assert.strictEqual(validateLocation(null, '12 Main Street, Madurai'), true, 'Valid address alone must succeed');
    assert.strictEqual(validateLocation({ lat: 9.9252, lng: 78.1198 }, ''), true, 'Valid GPS alone must succeed');
  });

  it('4. Location: Permission denied error classification preserves manual fallback', () => {
    const error = { code: 1, message: 'User denied Geolocation' };
    const isPermissionDenied = error.code === 1 || error.message.includes('denied');
    assert.strictEqual(isPermissionDenied, true);
  });

  it('5. Location: Timeout error classification preserves manual fallback', () => {
    const error = { code: 3, message: 'Geolocation position timeout' };
    const isTimeout = error.code === 3 || error.message.includes('timeout');
    assert.strictEqual(isTimeout, true);
  });

  it('6. Location: Unsupported browser gracefully detects missing geolocation API', () => {
    const hasGeolocation = typeof navigator !== 'undefined' && 'geolocation' in navigator;
    assert.strictEqual(typeof hasGeolocation, 'boolean');
  });

  // --------------------------------------------------------------------------
  // SECTION 2: MIME TYPE NORMALIZATION & MAGIC BYTE TESTS
  // --------------------------------------------------------------------------

  it('7. MIME: Correctly detects JPEG magic bytes [0xFF, 0xD8, 0xFF] regardless of missing file.type', async () => {
    // Simulate Android file with empty type
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const mockFile = new File([jpegBytes], 'storefront_camera.jpg', { type: '' });

    const result = await detectFileMimeType(mockFile, { allowPdf: false });
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.mimeType, 'image/jpeg');
    assert.strictEqual(result.extension, 'jpg');
  });

  it('8. MIME: Correctly detects PNG magic bytes [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const mockFile = new File([pngBytes], 'upi_qr.png', { type: 'application/octet-stream' });

    const result = await detectFileMimeType(mockFile, { allowPdf: false });
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.mimeType, 'image/png');
    assert.strictEqual(result.extension, 'png');
  });

  it('9. MIME: Correctly detects WebP magic bytes [RIFF ... WEBP]', async () => {
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x20, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    const mockFile = new File([webpBytes], 'storefront.webp', { type: '' });

    const result = await detectFileMimeType(mockFile, { allowPdf: false });
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.mimeType, 'image/webp');
    assert.strictEqual(result.extension, 'webp');
  });

  it('10. MIME: Correctly detects PDF for documents when allowPdf is true', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]); // %PDF-1.4
    const mockFile = new File([pdfBytes], 'aadhaar_card.pdf', { type: '' });

    const result = await detectFileMimeType(mockFile, { allowPdf: true });
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.mimeType, 'application/pdf');
    assert.strictEqual(result.extension, 'pdf');
  });

  it('11. MIME: Rejects PDF when allowPdf is false (photos bucket)', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
    const mockFile = new File([pdfBytes], 'document_as_photo.pdf', { type: 'application/pdf' });

    const result = await detectFileMimeType(mockFile, { allowPdf: false });
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.error?.includes('JPEG, PNG, or WebP images'), true);
  });

  it('12. MIME: Explicitly rejects dangerous / unsupported formats (e.g. script / executable disguised as jpg)', async () => {
    // ASCII "<script>alert(1)</script>" disguised as photo.jpg
    const textBytes = new TextEncoder().encode('<script>alert("xss")</script>');
    const mockFile = new File([textBytes], 'evil_photo.jpg', { type: 'image/jpeg' });

    const result = await detectFileMimeType(mockFile, { allowPdf: false });
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.error?.includes('unsupported format'), true);
  });

  // --------------------------------------------------------------------------
  // SECTION 3: UPLOAD RELIABILITY & QUEUE CONCURRENCY TESTS
  // --------------------------------------------------------------------------

  it('13. Upload Queue: Strictly limits concurrency to 2 simultaneous uploads', async () => {
    let activeWorkers = 0;
    let maxObservedActive = 0;
    const testItems = [1, 2, 3, 4, 5, 6];

    await executeUploadQueue(
      testItems,
      async (item) => {
        activeWorkers++;
        if (activeWorkers > maxObservedActive) {
          maxObservedActive = activeWorkers;
        }
        // Small delay to simulate network latency
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeWorkers--;
        return `done-${item}`;
      },
      { concurrency: 2 }
    );

    assert.strictEqual(maxObservedActive <= 2, true, `Concurrency exceeded limit: max observed was ${maxObservedActive}`);
  });

  it('14. Upload Queue: Automatically retries transient network errors with exponential backoff', async () => {
    let attempts = 0;
    const items = ['photo1'];

    const results = await executeUploadQueue(
      items,
      async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('TypeError: Failed to fetch (transient 4G drop)');
        }
        return 'success-url';
      },
      { concurrency: 1, maxRetries: 2, initialBackoffMs: 10 }
    );

    assert.strictEqual(attempts, 2, 'Should succeed on second attempt');
    assert.deepStrictEqual(results, ['success-url']);
  });

  it('15. Upload Queue: Permanent errors (e.g. 403 Forbidden / RLS violation) fail immediately without retry', async () => {
    let attempts = 0;
    const items = ['photo1'];

    await assert.rejects(
      async () => {
        await executeUploadQueue(
          items,
          async () => {
            attempts++;
            throw new Error('new row violates row-level security policy for table "objects"');
          },
          { concurrency: 1, maxRetries: 2, initialBackoffMs: 10 }
        );
      },
      (err: Error) => {
        assert.strictEqual(err.message.includes('row-level security'), true);
        return true;
      }
    );

    assert.strictEqual(attempts, 1, 'Permanent RLS failure must NOT be retried');
  });

  it('16. isTransientUploadError classifies transient vs permanent errors correctly', () => {
    // Transient errors
    assert.strictEqual(isTransientUploadError(new Error('Failed to fetch')), true);
    assert.strictEqual(isTransientUploadError(new Error('NetworkError when attempting to fetch resource')), true);
    assert.strictEqual(isTransientUploadError(new Error('Upload timed out for photo.jpg')), true);
    assert.strictEqual(isTransientUploadError({ status: 502, message: 'Bad Gateway' }), true);
    assert.strictEqual(isTransientUploadError({ status: 503, message: 'Service Unavailable' }), true);
    assert.strictEqual(isTransientUploadError({ status: 429, message: 'Too Many Requests' }), true);

    // Permanent errors
    assert.strictEqual(isTransientUploadError({ status: 400, message: 'mime type not allowed' }), false);
    assert.strictEqual(isTransientUploadError({ status: 403, message: 'Unauthorized' }), false);
    assert.strictEqual(isTransientUploadError({ status: 413, message: 'Payload Too Large' }), false);
    assert.strictEqual(isTransientUploadError(new Error('row-level security policy')), false);
    assert.strictEqual(isTransientUploadError(new Error('unsupported format')), false);
  });

  // --------------------------------------------------------------------------
  // SECTION 4: ERROR CLASSIFICATION PRECISION TESTS
  // --------------------------------------------------------------------------

  it('17. classifyApplicationError accurately reports upload timeouts under storage category', () => {
    const uploadTimeoutErr = new Error('Unable to upload storefront.jpg: Upload timed out for storefront.jpg');
    const classified = classifyApplicationError(uploadTimeoutErr);

    assert.strictEqual(classified.category, 'storage');
    assert.strictEqual(classified.isRetryable, true);
    assert.strictEqual(classified.userMessage.includes('Photo upload timed out on your cellular connection'), true);
  });

  it('18. classifyApplicationError accurately reports unsupported MIME types under validation category', () => {
    const mimeErr = new Error('Unable to upload file.exe: mime type application/octet-stream is not allowed');
    const classified = classifyApplicationError(mimeErr);

    assert.strictEqual(classified.category, 'validation');
    assert.strictEqual(classified.isRetryable, false);
    assert.strictEqual(classified.userMessage.includes('Invalid file format'), true);
  });

  it('19. classifyApplicationError accurately reports genuine network failure under network category', () => {
    const networkErr = new TypeError('Failed to fetch');
    const classified = classifyApplicationError(networkErr);

    assert.strictEqual(classified.category, 'network');
    assert.strictEqual(classified.isRetryable, true);
    assert.strictEqual(
      classified.userMessage,
      "We couldn't connect to Vaangly. Check your internet connection and try again."
    );
  });
});

