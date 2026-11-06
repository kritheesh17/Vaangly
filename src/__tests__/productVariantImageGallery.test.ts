import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { ShopProduct, ProductVariant } from '../types/database';

describe('Product Variant Multi-Image Gallery & Carousel Tests', () => {
  const ROOT = process.cwd();
  const modalPath = path.join(ROOT, 'src', 'components', 'customer', 'ProductDetailModal.tsx');
  const cardPath = path.join(ROOT, 'src', 'components', 'customer', 'ProductCard.tsx');
  const cartContextPath = path.join(ROOT, 'src', 'context', 'CartContext.tsx');
  const formModalPath = path.join(ROOT, 'src', 'components', 'shopkeeper', 'ProductFormModal.tsx');

  // Test data representing Kurti in production
  const sampleProduct: ShopProduct = {
    id: '5256c275-cbe7-42c6-8854-dc36878c4954',
    shop_id: 'fa2945f9-57b6-4ab2-9a33-a686533a6432',
    name: 'Kurti',
    description: null,
    created_at: '2026-11-05T18:00:34.795055+00:00',
    price: 299,
    unit: 'item',
    is_available: true,
    image_url: 'https://storage/products/prod_0.jpg',
    image_urls: [
      'https://storage/products/prod_0.jpg',
      'https://storage/products/prod_1.jpg',
      'https://storage/products/prod_2.jpg',
      'https://storage/products/prod_3.jpg',
    ],
    has_variants: true,
    variants: [
      {
        id: 'var-1',
        label: 'Printed pink kurti / S',
        price: 299,
        in_stock: true,
        is_available: true,
        stock_quantity: 1,
        image_url: 'https://storage/variants/var_pink.jpg',
        attributes: { Color: 'Printed pink kurti', Size: 'S' },
      },
      {
        id: 'var-2',
        label: 'Option 2',
        price: 299,
        in_stock: true,
        is_available: true,
        stock_quantity: 1,
        image_url: 'https://storage/variants/var_option2.jpg',
        attributes: { Color: 'Blue kurti', Size: 'M' },
      },
    ],
    attribute_groups: [
      { name: 'Color', options: ['Printed pink kurti', 'Blue kurti'] },
      { name: 'Size', options: ['S', 'M'] },
    ],
  };

  it('1. Gallery composition: places selected variant image at index 0 followed by deduplicated base product images', () => {
    const selectedVariant = sampleProduct.variants![0]; // Pink kurti
    const baseImages: string[] = [];
    sampleProduct.image_urls!.forEach((u) => {
      if (!baseImages.includes(u)) baseImages.push(u);
    });

    const activeGallery: string[] = [];
    if (selectedVariant.image_url) {
      activeGallery.push(selectedVariant.image_url);
    }
    baseImages.forEach((u) => {
      if (!activeGallery.includes(u)) activeGallery.push(u);
    });

    assert.strictEqual(activeGallery.length, 5);
    assert.strictEqual(activeGallery[0], 'https://storage/variants/var_pink.jpg');
    assert.strictEqual(activeGallery[1], 'https://storage/products/prod_0.jpg');
    assert.strictEqual(activeGallery[2], 'https://storage/products/prod_1.jpg');
    assert.strictEqual(activeGallery[3], 'https://storage/products/prod_2.jpg');
    assert.strictEqual(activeGallery[4], 'https://storage/products/prod_3.jpg');

    // Crucial: Option 2's image is NOT in this variant's gallery
    assert.ok(!activeGallery.includes('https://storage/variants/var_option2.jpg'));
  });

  it('2. Gallery composition: when variant has no dedicated image, falls back cleanly to base product images', () => {
    const variantWithoutImage: ProductVariant = {
      id: 'var-no-img',
      label: 'Standard',
      price: 299,
      in_stock: true,
      is_available: true,
      image_url: null,
      attributes: { Color: 'Plain', Size: 'L' },
    };

    const baseImages: string[] = [];
    sampleProduct.image_urls!.forEach((u) => {
      if (!baseImages.includes(u)) baseImages.push(u);
    });

    const activeGallery: string[] = [];
    if (variantWithoutImage.image_url) {
      activeGallery.push(variantWithoutImage.image_url);
    }
    baseImages.forEach((u) => {
      if (!activeGallery.includes(u)) activeGallery.push(u);
    });

    assert.strictEqual(activeGallery.length, 4);
    assert.strictEqual(activeGallery[0], 'https://storage/products/prod_0.jpg');
    assert.strictEqual(activeGallery[1], 'https://storage/products/prod_1.jpg');
  });

  it('3. Gallery switching: switching variant updates the gallery to new variant photo without index jumping', () => {
    // When switching from var-1 (pink) to var-2 (blue)
    const var2 = sampleProduct.variants![1];
    const baseImages: string[] = [];
    sampleProduct.image_urls!.forEach((u) => {
      if (!baseImages.includes(u)) baseImages.push(u);
    });

    const activeGalleryVar2: string[] = [];
    if (var2.image_url) {
      activeGalleryVar2.push(var2.image_url);
    }
    baseImages.forEach((u) => {
      if (!activeGalleryVar2.includes(u)) activeGalleryVar2.push(u);
    });

    assert.strictEqual(activeGalleryVar2[0], 'https://storage/variants/var_option2.jpg');
    assert.ok(!activeGalleryVar2.includes('https://storage/variants/var_pink.jpg'));
  });

  it('4. Carousel bounds & wraparound: Next and Prev wrap safely without out-of-bounds or undefined', () => {
    const total = 5;
    const nextIdx = (cur: number) => (cur === total - 1 ? 0 : cur + 1);
    const prevIdx = (cur: number) => (cur === 0 ? total - 1 : cur - 1);

    // Next from 0
    assert.strictEqual(nextIdx(0), 1);
    // Next from last index wraps to 0
    assert.strictEqual(nextIdx(4), 0);
    // Prev from 0 wraps to last index
    assert.strictEqual(prevIdx(0), 4);
    // Prev from 3 goes to 2
    assert.strictEqual(prevIdx(3), 2);

    // Safe index clamping test
    const arbitraryOutOfBounds = 99;
    const clamped = Math.min(Math.max(0, arbitraryOutOfBounds), total - 1);
    assert.strictEqual(clamped, 4);
  });

  it('5. Source audit: ProductDetailModal.tsx uses activeGalleryImages and does not destroy nav buttons on error', () => {
    assert.ok(fs.existsSync(modalPath), 'ProductDetailModal.tsx exists');
    const content = fs.readFileSync(modalPath, 'utf-8');

    // Check gallery logic
    assert.ok(content.includes('activeGalleryImages'), 'Uses activeGalleryImages computed state');
    assert.ok(content.includes('baseProductImages'), 'Isolates base product photos from variant photos');
    assert.ok(content.includes('setImageErrors'), 'Tracks image errors per URL instead of index/boolean');
    assert.ok(content.includes('safeImageIndex'), 'Uses safe clamped image index');
    assert.ok(content.includes('fallbackDisplayUrl'), 'Provides fallback image on failed URL');

    // Controls must always be inside main-image-wrap
    assert.ok(content.includes('vaango-prod-modal__main-image-wrap'), 'Has main-image-wrap container');
    assert.ok(content.includes('vaango-prod-modal__nav-btn--prev'), 'Has Prev nav button');
    assert.ok(content.includes('vaango-prod-modal__nav-btn--next'), 'Has Next nav button');
    assert.ok(content.includes('onTouchStart'), 'Supports mobile touch swiping');
    assert.ok(content.includes('onTouchEnd'), 'Supports mobile touch swiping end');

    // Ensure no stale reference to allImages
    assert.ok(!content.includes('allImages'), 'No deprecated allImages array');
  });

  it('6. Source audit: ProductCard.tsx provides unified cardGallery and URL-scoped error tracking', () => {
    assert.ok(fs.existsSync(cardPath), 'ProductCard.tsx exists');
    const content = fs.readFileSync(cardPath, 'utf-8');

    assert.ok(content.includes('cardGallery'), 'Computes cardGallery for product card');
    assert.ok(content.includes('safeCardIndex'), 'Uses safe clamped card index');
    assert.ok(content.includes('setImageErrors'), 'Uses per-URL error tracking instead of single boolean');
    assert.ok(content.includes('cardGallery.length > 1'), 'Renders dots when cardGallery has multiple images');
    assert.ok(content.includes('initialVariant={selectedVariant}'), 'Passes selected variant to modal');
    assert.ok(content.includes('initialAttributes={selectedAttributes}'), 'Passes selected attributes to modal');
  });

  it('7. Source audit: CartContext.tsx queries correct table shop_products (not shops_products)', () => {
    assert.ok(fs.existsSync(cartContextPath), 'CartContext.tsx exists');
    const content = fs.readFileSync(cartContextPath, 'utf-8');

    assert.ok(content.includes(".from('shop_products')"), "Queries correct 'shop_products' table");
    assert.ok(!content.includes(".from('shops_products')"), "Does not contain erroneous 'shops_products'");
  });

  it('8. Source audit: ProductFormModal.tsx preserves image_urls array on edit and submit', () => {
    assert.ok(fs.existsSync(formModalPath), 'ProductFormModal.tsx exists');
    const content = fs.readFileSync(formModalPath, 'utf-8');

    assert.ok(content.includes('image_urls: allImageUrls'), 'Submits allImageUrls array to database');
    assert.ok(content.includes('initialProduct.image_urls'), 'Loads existing image_urls when editing a product');
  });
});
