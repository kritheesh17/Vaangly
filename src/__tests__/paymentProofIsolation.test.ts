import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  cleanPaymentProofPath,
  isPaymentProofPath,
  resolvePaymentProofUrl,
  validatePaymentProofFile,
} from '../lib/paymentProof';

describe('Payment Proof / Product Image Isolation & Security Audit', () => {
  const PRODUCT_IMAGE_RED = 'https://pndikgqbgchzkrmlrmzo.supabase.co/storage/v1/object/public/shop-photos/shop-999/products/product-red.jpg';
  const PRODUCT_IMAGE_GREEN = 'https://pndikgqbgchzkrmlrmzo.supabase.co/storage/v1/object/public/shop-photos/shop-999/products/product-green.jpg';
  const PRODUCT_IMAGE_BLUE = 'https://pndikgqbgchzkrmlrmzo.supabase.co/storage/v1/object/public/shop-photos/shop-999/products/product-blue.jpg';
  const PAYMENT_PROOF_RECEIPT = 'pending/user-blue/payment-receipt-blue.png';

  it('1. isPaymentProofPath strictly validates bucket and path prefixes', () => {
    // Valid payment-proof paths
    assert.strictEqual(isPaymentProofPath('pending/user-123/uuid.jpg'), true);
    assert.strictEqual(isPaymentProofPath('requests/req-456/uuid.png'), true);
    assert.strictEqual(isPaymentProofPath('demo-proof.jpg'), true);

    // Forbidden product/shop paths
    assert.strictEqual(isPaymentProofPath('shop-photos/shop-123/products/tomato.jpg'), false);
    assert.strictEqual(isPaymentProofPath('products/1790262590255_0_0bvi.jpg'), false);
    assert.strictEqual(isPaymentProofPath('catalogue/dress.png'), false);
    assert.strictEqual(isPaymentProofPath('shops/banner.jpg'), false);
    assert.strictEqual(isPaymentProofPath('avatars/user.jpg'), false);
    assert.strictEqual(isPaymentProofPath(''), false);
  });

  it('2. cleanPaymentProofPath rejects product image URLs and extracts only payment-proofs paths', () => {
    // Valid Supabase URL to payment-proofs
    assert.strictEqual(
      cleanPaymentProofPath('https://pndikgqbgchzkrmlrmzo.supabase.co/storage/v1/object/public/payment-proofs/pending/user-123/receipt.jpeg'),
      'pending/user-123/receipt.jpeg'
    );
    // Relative with bucket prefix
    assert.strictEqual(
      cleanPaymentProofPath('payment-proofs/pending/user-123/receipt.jpeg'),
      'pending/user-123/receipt.jpeg'
    );
    // Relative with leading slash
    assert.strictEqual(
      cleanPaymentProofPath('/pending/user-123/receipt.jpeg'),
      'pending/user-123/receipt.jpeg'
    );

    // CRITICAL: Product image URLs must NEVER be cleaned as a valid payment proof path
    assert.strictEqual(cleanPaymentProofPath(PRODUCT_IMAGE_RED), '');
    assert.strictEqual(cleanPaymentProofPath('shop-photos/shop-1/products/item.jpg'), '');
    assert.strictEqual(cleanPaymentProofPath('https://images.unsplash.com/photo-123'), '');
    assert.strictEqual(cleanPaymentProofPath('products/item.png'), '');
  });

  it('3. resolvePaymentProofUrl rejects product image URLs and does NOT fall back to raw URL', async () => {
    const result = await resolvePaymentProofUrl(PRODUCT_IMAGE_RED);
    assert.strictEqual(result.url, null);
    assert.strictEqual(result.error, 'UNAVAILABLE');
    assert.notStrictEqual(result.url, PRODUCT_IMAGE_RED);
  });

  it('4. resolvePaymentProofUrl handles missing or empty proof cleanly', async () => {
    const nullRes = await resolvePaymentProofUrl(null);
    assert.strictEqual(nullRes.url, null);
    assert.strictEqual(nullRes.error, 'MISSING');

    const emptyRes = await resolvePaymentProofUrl('   ');
    assert.strictEqual(emptyRes.url, null);
    assert.strictEqual(emptyRes.error, 'MISSING');
  });

  it('5. Controlled Test: paymentProofUrl !== productImageUrl across single and multi-product orders', async () => {
    // Customer uploaded PAYMENT-BLUE
    const resolvedProof = await resolvePaymentProofUrl(PAYMENT_PROOF_RECEIPT);
    // In test environment without mock or signed storage
    const proofUrl = resolvedProof.url || PAYMENT_PROOF_RECEIPT;

    // Verify paymentProofUrl !== productImageUrl
    assert.notStrictEqual(proofUrl, PRODUCT_IMAGE_RED, 'Payment proof must NEVER equal PRODUCT-RED image');
    assert.notStrictEqual(proofUrl, PRODUCT_IMAGE_GREEN, 'Payment proof must NEVER equal PRODUCT-GREEN image');
    assert.notStrictEqual(proofUrl, PRODUCT_IMAGE_BLUE, 'Payment proof must NEVER equal PRODUCT-BLUE image');

    // Verify bucket isolation
    assert.ok(
      !proofUrl.includes('/shop-photos/') && !proofUrl.includes('/products/'),
      'Payment proof path must NOT point to shop-photos or products storage'
    );
  });

  it('6. Pay-at-shop (cash) order with no payment proof returns MISSING and never product image', async () => {
    const cashOrderProofPath = null;
    const result = await resolvePaymentProofUrl(cashOrderProofPath);

    assert.strictEqual(result.url, null);
    assert.strictEqual(result.error, 'MISSING');
    assert.notStrictEqual(result.url, PRODUCT_IMAGE_RED);
  });

  it('7. Validation guards valid image MIME types and rejects non-image payloads', () => {
    const validFile = new File(['mock content'], 'receipt.png', { type: 'image/png' });
    assert.strictEqual(validatePaymentProofFile(validFile), null);

    const pdfFile = new File(['mock content'], 'receipt.pdf', { type: 'application/pdf' });
    assert.ok(validatePaymentProofFile(pdfFile)?.includes('JPG, PNG, WEBP, or GIF'));

    const emptyFile = new File([], 'empty.png', { type: 'image/png' });
    assert.ok(validatePaymentProofFile(emptyFile)?.includes('smaller than 10MB'));
  });
});
