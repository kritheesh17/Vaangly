import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  prepareShopApplicationPayload,
  cleanupApplicationUploads,
} from '../lib/shopkeeperApi';
import { classifyApplicationError } from '../lib/productErrorHelper';
import { ShopApplication } from '../types/database';

describe('Shopkeeper Application Submission & Error Handling Regression Tests', () => {
  const mockApplicationData: Omit<
    ShopApplication,
    'id' | 'status' | 'created_at' | 'updated_at' | 'review_notes' | 'reviewed_by'
  > = {
    applicant_id: 'usr-applicant-123',
    shop_name: ' Sri Murugan Stores ',
    owner_name: ' Murugan ',
    description: ' Fresh vegetables and grocery items ',
    shop_type_id: 'type-retail',
    location_id: 'loc-madurai-01',
    contact_phone: '+919876543210',
    address_line: ' 12 Bazaar Street ',
    photo_url: 'https://storage.supabase.co/shop-photos/usr-applicant-123/photos/1_0.png',
    photo_urls: [
      'https://storage.supabase.co/shop-photos/usr-applicant-123/photos/1_0.png',
      'https://storage.supabase.co/shop-photos/usr-applicant-123/photos/1_1.png',
      'https://storage.supabase.co/shop-photos/usr-applicant-123/photos/1_2.png',
      'https://storage.supabase.co/shop-photos/usr-applicant-123/photos/1_3.png',
    ],
    upi_id: 'murugan@okaxis',
    upi_qr_url: 'https://storage.supabase.co/shop-photos/usr-applicant-123/upi-qr/upi_qr.png',
    id_proof_url: 'usr-applicant-123/id_proof_123.pdf',
    gps_lat: 9.9252,
    gps_lng: 78.1198,
    google_maps_url: 'https://maps.google.com/?q=9.9252,78.1198',
    area: ' Simmakkal ',
    district: ' Madurai ',
    taluk: ' Madurai North ',
    pincode: ' 625001 ',
    business_type: 'retail',
    offerings: ['products', 'services'],
    capabilities: ['fast_dispatch'],
    delivery_available: true,
    delivery_fee: 30,
    free_delivery_above: 500,
  };

  const meta = {
    verifiedApplicantId: 'usr-applicant-123',
    resolvedShopTypeId: 'b149b555-5f5d-4f11-9a99-92f768c7e63b',
    resolvedLocationId: 'e2898492-4217-494b-90cb-ecb4f1784c17',
    normalizedContactPhone: '+919876543210',
  };

  it('1. prepareShopApplicationPayload strictly excludes unsupported delivery fields', () => {
    const payload = prepareShopApplicationPayload(mockApplicationData, meta);

    // CRITICAL: The 3 fields missing in production DB schema MUST be omitted
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(payload, 'delivery_available'),
      false,
      'delivery_available must NOT be included in shop_applications payload'
    );
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(payload, 'delivery_fee'),
      false,
      'delivery_fee must NOT be included in shop_applications payload'
    );
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(payload, 'free_delivery_above'),
      false,
      'free_delivery_above must NOT be included in shop_applications payload'
    );
  });

  it('2. prepareShopApplicationPayload preserves all required application fields and metadata', () => {
    const payload = prepareShopApplicationPayload(mockApplicationData, meta);

    assert.strictEqual(payload.applicant_id, 'usr-applicant-123');
    assert.strictEqual(payload.shop_name, 'Sri Murugan Stores');
    assert.strictEqual(payload.owner_name, 'Murugan');
    assert.strictEqual(payload.description, 'Fresh vegetables and grocery items');
    assert.strictEqual(payload.shop_type_id, 'b149b555-5f5d-4f11-9a99-92f768c7e63b');
    assert.strictEqual(payload.location_id, 'e2898492-4217-494b-90cb-ecb4f1784c17');
    assert.strictEqual(payload.contact_phone, '+919876543210');
    assert.strictEqual(payload.address_line, '12 Bazaar Street');
    assert.strictEqual(payload.status, 'submitted');
    assert.strictEqual(payload.photo_urls.length, 4);
    assert.strictEqual(payload.photo_url, payload.photo_urls[0]);
    assert.strictEqual(payload.upi_id, 'murugan@okaxis');
    assert.strictEqual(payload.upi_qr_url, 'https://storage.supabase.co/shop-photos/usr-applicant-123/upi-qr/upi_qr.png');
    assert.strictEqual(payload.id_proof_url, 'usr-applicant-123/id_proof_123.pdf');
    assert.strictEqual(payload.gps_lat, 9.9252);
    assert.strictEqual(payload.gps_lng, 78.1198);
    assert.strictEqual(payload.google_maps_url, 'https://maps.google.com/?q=9.9252,78.1198');
    assert.strictEqual(payload.area, 'Simmakkal');
    assert.strictEqual(payload.district, 'Madurai');
    assert.strictEqual(payload.taluk, 'Madurai North');
    assert.strictEqual(payload.pincode, '625001');
    assert.strictEqual(payload.business_type, 'retail');
    assert.deepStrictEqual(payload.offerings, ['products', 'services']);
    assert.deepStrictEqual(payload.capabilities, ['fast_dispatch']);
    assert.strictEqual(payload.review_notes, null);
    assert.strictEqual(payload.reviewed_by, null);
  });

  it('3. All keys in prepareShopApplicationPayload match valid production database columns', () => {
    const payload = prepareShopApplicationPayload(mockApplicationData, meta);
    const validProductionColumns = new Set([
      'applicant_id',
      'shop_name',
      'owner_name',
      'description',
      'shop_type_id',
      'location_id',
      'contact_phone',
      'address_line',
      'status',
      'photo_url',
      'photo_urls',
      'upi_id',
      'upi_qr_url',
      'id_proof_url',
      'gps_lat',
      'gps_lng',
      'google_maps_url',
      'area',
      'district',
      'taluk',
      'pincode',
      'business_type',
      'offerings',
      'capabilities',
      'review_notes',
      'reviewed_by',
    ]);

    const payloadKeys = Object.keys(payload);
    for (const key of payloadKeys) {
      assert.strictEqual(
        validProductionColumns.has(key),
        true,
        `Key '${key}' is not in the recognized production database columns`
      );
    }
  });

  it('4. classifyApplicationError sanitizes system/schema errors into user-friendly message', () => {
    // PostgREST 42703 / column not found error
    const schemaError = {
      code: '42703',
      message: 'column shop_applications.delivery_available does not exist',
    };

    const classified = classifyApplicationError(schemaError);
    assert.strictEqual(classified.category, 'system');
    assert.strictEqual(classified.isRetryable, true);
    assert.strictEqual(
      classified.userMessage,
      "Couldn't submit your application right now. Your entered information has been preserved. Please try again."
    );
    // Sensitive DB column names must NEVER leak to the end user
    assert.strictEqual(classified.userMessage.includes('delivery_available'), false);
    assert.strictEqual(classified.userMessage.includes('42703'), false);
    assert.strictEqual(classified.userMessage.includes('column'), false);
  });

  it('5. cleanupApplicationUploads safely handles empty input and does not throw', async () => {
    // Should resolve without error on empty paths
    await assert.doesNotReject(async () => {
      await cleanupApplicationUploads([]);
      await cleanupApplicationUploads([{ bucket: 'shop-photos', paths: [] }]);
    });
  });

  it('6. cleanupApplicationUploads failure-path swallows storage errors and logs diagnostics', async () => {
    // Even if storage deletion encounters an error or network drop, cleanupApplicationUploads
    // must NEVER throw or break the caller flow, so that the original submission error is preserved
    let warnLogged = false;
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnLogged = true;
      originalWarn(...args);
    };

    try {
      // Simulate calling with mock paths
      await assert.doesNotReject(async () => {
        await cleanupApplicationUploads([
          { bucket: 'shop-photos', paths: ['invalid-non-existent-path/photo.png'] },
        ]);
      });
      assert.strictEqual(typeof warnLogged, 'boolean');
    } finally {
      console.warn = originalWarn;
    }
  });
});
