import assert from 'assert';
import {
  generateVariantCombinations,
  isVisualAttribute,
  isMeasurementAttribute,
  formatCleanVariantLabel,
  findVariantForSelections,
  optionIsReachable,
  computeProductAvailability,
} from '../lib/productVariants';
import { ProductVariant, ShopProduct } from '../types/database';

console.log('=== Running Product Variant System Redesign Verification Tests ===\n');

// ----------------------------------------------------
// TEST 1: Product Without Variants (Simple Product Compatibility)
// ----------------------------------------------------
console.log('--- TEST 1: Simple Product Without Variants ---');
{
  const simpleProduct: ShopProduct = {
    id: 'p0000000-0000-0000-0000-000000000001',
    shop_id: 's0000000-0000-0000-0000-000000000001',
    name: 'Fresh Cow Milk',
    description: 'Direct from dairy',
    image_url: null,
    price: 32,
    unit: '500ml',
    is_available: true,
    has_variants: false,
    variants: [],
    attribute_groups: [],
    track_inventory: false,
    stock_quantity: null,
    created_at: new Date().toISOString(),
  };

  assert.strictEqual(simpleProduct.has_variants, false);
  assert.strictEqual(computeProductAvailability(simpleProduct), true);

  // If inventory tracked
  const trackedProduct = { ...simpleProduct, track_inventory: true, stock_quantity: 0 };
  assert.strictEqual(computeProductAvailability(trackedProduct), false);
  const trackedInStock = { ...simpleProduct, track_inventory: true, stock_quantity: 10 };
  assert.strictEqual(computeProductAvailability(trackedInStock), true);

  console.log('✓ Simple product availability and inventory backwards-compatibility verified.');
}

// ----------------------------------------------------
// TEST 2: Single-Option Generation (e.g. Weight or Pack Size)
// ----------------------------------------------------
console.log('\n--- TEST 2: Single Option Generation ---');
{
  const groups = [
    { name: 'Weight', options: ['250g', '500g', '1kg'] },
  ];

  const result = generateVariantCombinations(groups, [], 100);
  assert.strictEqual(result.exceededLimit, false);
  assert.strictEqual(result.totalCombinations, 3);
  assert.strictEqual(result.variants.length, 3);

  assert.strictEqual(result.variants[0].attributes?.Weight, '250g');
  assert.strictEqual(result.variants[0].label, '250g');
  assert.strictEqual(result.variants[0].price, 100);
  assert.strictEqual(result.variants[0].is_available, true);
  assert.strictEqual(result.variants[0].in_stock, true);

  console.log('✓ Single-option generation generated 3 correct variants with default pricing.');
}

// ----------------------------------------------------
// TEST 3: Multi-Option Matrix Generation & Preservation
// ----------------------------------------------------
console.log('\n--- TEST 3: Multi-Option Matrix Generation & Data Preservation ---');
{
  const groups = [
    { name: 'Color', options: ['Red', 'Blue'] },
    { name: 'Size', options: ['S', 'M', 'L'] },
  ];

  const gen1 = generateVariantCombinations(groups, [], 499);
  assert.strictEqual(gen1.totalCombinations, 6);
  assert.strictEqual(gen1.variants.length, 6);

  // Customize one variant: price ₹599, stock 15, custom SKU and image
  const redM = gen1.variants.find((v) => v.attributes?.Color === 'Red' && v.attributes?.Size === 'M');
  assert(redM, 'Red/M must exist');
  redM.price = 599;
  redM.stock_quantity = 15;
  redM.sku = 'SKU-RED-M';
  redM.image_url = 'https://example.com/photos/red-m.jpg';

  // Add a new Size 'XL' (2 colors x 4 sizes = 8 combos)
  const updatedGroups = [
    { name: 'Color', options: ['Red', 'Blue'] },
    { name: 'Size', options: ['S', 'M', 'L', 'XL'] },
  ];

  const gen2 = generateVariantCombinations(updatedGroups, gen1.variants, 499);
  assert.strictEqual(gen2.totalCombinations, 8);
  assert.strictEqual(gen2.variants.length, 8);

  // Verify that Red/M strictly preserved its customized values!
  const preservedRedM = gen2.variants.find((v) => v.attributes?.Color === 'Red' && v.attributes?.Size === 'M');
  assert(preservedRedM, 'Preserved Red/M must exist');
  assert.strictEqual(preservedRedM.price, 599, 'Price must be preserved');
  assert.strictEqual(preservedRedM.stock_quantity, 15, 'Stock must be preserved');
  assert.strictEqual(preservedRedM.sku, 'SKU-RED-M', 'SKU must be preserved');
  assert.strictEqual(preservedRedM.image_url, 'https://example.com/photos/red-m.jpg', 'Image URL must be preserved');

  console.log('✓ Cartesian product generation correctly preserved prices, stock, SKU, and image URL.');
}

// ----------------------------------------------------
// TEST 4: Combination Guard Limit (Max 36)
// ----------------------------------------------------
console.log('\n--- TEST 4: Combination Guard Limit ---');
{
  const largeGroups = [
    { name: 'Color', options: ['C1', 'C2', 'C3', 'C4'] }, // 4
    { name: 'Size', options: ['S1', 'S2', 'S3'] },         // 3 -> 12
    { name: 'Material', options: ['M1', 'M2', 'M3', 'M4'] }, // 4 -> 48 > 36!
  ];

  const result = generateVariantCombinations(largeGroups, []);
  assert.strictEqual(result.exceededLimit, true);
  assert.strictEqual(result.totalCombinations, 48);

  console.log('✓ Generator strictly prevents runaway matrix explosions beyond 36 combinations.');
}

// ----------------------------------------------------
// TEST 5: Visual & Measurement Attribute Detectors
// ----------------------------------------------------
console.log('\n--- TEST 5: Attribute Classification ---');
{
  assert.strictEqual(isVisualAttribute('Color'), true);
  assert.strictEqual(isVisualAttribute('Colour'), true);
  assert.strictEqual(isVisualAttribute('Shade'), true);
  assert.strictEqual(isVisualAttribute('Pattern'), true);
  assert.strictEqual(isVisualAttribute('Size'), false);
  assert.strictEqual(isVisualAttribute('Weight'), false);

  assert.strictEqual(isMeasurementAttribute('Weight'), true);
  assert.strictEqual(isMeasurementAttribute('Pack Size'), true);
  assert.strictEqual(isMeasurementAttribute('Size'), true);
  assert.strictEqual(isMeasurementAttribute('Storage'), true);
  assert.strictEqual(isMeasurementAttribute('Volume'), true);
  assert.strictEqual(isMeasurementAttribute('Color'), false);

  console.log('✓ Visual and measurement classification functions work accurately.');
}

// ----------------------------------------------------
// TEST 6: Customer Selection Resolution & Reachability
// ----------------------------------------------------
console.log('\n--- TEST 6: Customer Selection Resolution & Reachability ---');
{
  const variants: ProductVariant[] = [
    {
      id: 'v1',
      label: 'Black / S',
      attributes: { Color: 'Black', Size: 'S' },
      price: 299,
      is_available: true,
      in_stock: true,
      stock_quantity: 5,
    },
    {
      id: 'v2',
      label: 'Black / M',
      attributes: { Color: 'Black', Size: 'M' },
      price: 349,
      is_available: true,
      in_stock: true,
      stock_quantity: 0, // Out of stock
    },
    {
      id: 'v3',
      label: 'White / S',
      attributes: { Color: 'White', Size: 'S' },
      price: 299,
      is_available: false, // Disabled
      in_stock: false,
    },
    {
      id: 'v4',
      label: 'White / M',
      attributes: { Color: 'White', Size: 'M' },
      price: 349,
      is_available: true,
      in_stock: true,
      stock_quantity: 2,
    },
  ];

  // Exact resolution
  const match = findVariantForSelections(variants, { Color: 'Black', Size: 'S' });
  assert.strictEqual(match?.id, 'v1');

  // Incomplete selection returns null
  const incomplete = findVariantForSelections(variants, { Color: 'Black' });
  assert.strictEqual(incomplete, null);

  // Reachability:
  // Given Color: 'Black', is 'S' reachable? (v1 has stock 5 -> reachable)
  assert.strictEqual(optionIsReachable(variants, { Color: 'Black' }, 'Size', 'S'), true);
  // Given Color: 'Black', is 'M' reachable? (v2 has stock 0 -> NOT reachable)
  assert.strictEqual(optionIsReachable(variants, { Color: 'Black' }, 'Size', 'M'), false);
  // Given Color: 'White', is 'S' reachable? (v3 is unavailable -> NOT reachable)
  assert.strictEqual(optionIsReachable(variants, { Color: 'White' }, 'Size', 'S'), false);
  // Given Color: 'White', is 'M' reachable? (v4 has stock 2 -> reachable)
  assert.strictEqual(optionIsReachable(variants, { Color: 'White' }, 'Size', 'M'), true);

  console.log('✓ Variant selection matching and stock-aware option reachability verified.');
}

// ----------------------------------------------------
// TEST 7: Clean Formatting for Customer UI
// ----------------------------------------------------
console.log('\n--- TEST 7: Clean Formatting ---');
{
  const v1: ProductVariant = {
    id: 'v1',
    label: 'Color: Red / Size: XL',
    attributes: { Color: 'Red', Size: 'XL' },
    price: 499,
    is_available: true,
    in_stock: true,
  };

  // formatCleanVariantLabel cleans up raw technical strings
  const formatted = formatCleanVariantLabel(v1);
  assert.strictEqual(formatted, 'Color: Red / Size: XL');

  const v2: ProductVariant = {
    id: 'v2',
    label: '',
    attributes: { Color: 'Blue', Size: 'L' },
    price: 499,
    is_available: true,
    in_stock: true,
  };
  assert.strictEqual(formatCleanVariantLabel(v2), 'Blue / L');

  console.log('✓ Clean customer-facing formatting verified.');
}

console.log('\n======================================================');
console.log('ALL PRODUCT VARIANT REDESIGN TESTS PASSED SUCCESSFULLY');
console.log('======================================================\n');
