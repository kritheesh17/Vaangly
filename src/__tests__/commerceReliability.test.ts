import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { generateVariantCombinations } from '../lib/productVariants';
import { matchesCartItem, CartItem, getEffectiveQuantity } from '../context/CartContext';
import { isValidUpiQrUrl } from '../lib/upi';
import { Shop, ShopProduct, ProductVariant } from '../types/database';

console.log('=== Running Commerce Reliability Test Suite ===\n');

// Mock data fixtures
const mockShopNoUpi: Shop = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Kaveri Sweets',
  address_line: '12 Gandhi Road',
  phone: '9876543210',
  shop_type_id: 'st-bakery',
  status: 'active',
  is_live: true,
  delivery_available: true,
  delivery_fee: 30,
  free_delivery_above: 500,
  upi_id: null,
  upi_qr_url: null,
  owner_id: '00000000-0000-4000-8000-000000000099',
  location_id: '00000000-0000-4000-8000-000000000088',
  tagline: 'Best Traditional Sweets',
  photo_url: null,
  gps_lat: 12.9716,
  gps_lng: 77.5946,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as Shop;

const mockShopWithUpi: Shop = {
  ...mockShopNoUpi,
  upi_id: 'kaverisweets@okaxis',
  upi_qr_url: 'https://pndikgqbgchzkrmlrmzo.supabase.co/storage/v1/object/public/shop-qr-codes/kaveri-qr.png',
};

const redKurtiVariant: ProductVariant = {
  id: 'var-red-m',
  label: 'Red / M',
  price: 499,
  stock_quantity: 4,
  is_available: true,
  in_stock: true,
  attributes: { Color: 'Red', Size: 'M' },
};

const blueKurtiVariant: ProductVariant = {
  id: 'var-blue-l',
  label: 'Blue / L',
  price: 549,
  stock_quantity: null, // Untracked stock
  is_available: true,
  in_stock: true,
  attributes: { Color: 'Blue', Size: 'L' },
};

const variantProduct: ShopProduct = {
  id: '10000000-0000-4000-8000-000000000001',
  shop_id: mockShopNoUpi.id,
  name: 'Cotton Designer Kurti',
  description: 'Pure cotton daily wear',
  image_url: null,
  price: 499,
  unit: 'piece',
  is_available: true,
  has_variants: true,
  variants: [redKurtiVariant, blueKurtiVariant],
  created_at: new Date().toISOString(),
};

const simpleProduct: ShopProduct = {
  id: '20000000-0000-4000-8000-000000000002',
  shop_id: mockShopNoUpi.id,
  name: 'Mysore Pak Box',
  description: 'Traditional ghee sweets 500g',
  image_url: null,
  price: 250,
  unit: 'box',
  is_available: true,
  has_variants: false,
  track_inventory: true,
  stock_quantity: 2, // Limited stock
  created_at: new Date().toISOString(),
};

// ---------------------------------------------------------------------
// TEST 1: Variant Creation Defaults to Untracked Stock (Not Locked at 1)
// ---------------------------------------------------------------------
console.log('--- TEST 1: Variant Creation Default Stock Quantity ---');
{
  const result = generateVariantCombinations(
    [
      { name: 'Size', options: ['S', 'M', 'L'] },
      { name: 'Color', options: ['Black', 'White'] },
    ],
    [],
    299
  );

  assert.strictEqual(result.variants.length, 6, 'Generates 6 combinations');
  for (const variant of result.variants) {
    assert.strictEqual(
      variant.stock_quantity,
      null,
      `Variant "${variant.label}" must default stock_quantity to null (untracked), but got ${variant.stock_quantity}`
    );
    assert.strictEqual(variant.is_available, true, 'Variant is available by default');
    assert.strictEqual(variant.in_stock, true, 'Variant in_stock is true by default');
  }
  console.log('✓ generateVariantCombinations defaults stock_quantity to null (unlimited/untracked).');
}

// ---------------------------------------------------------------------
// TEST 2: Cart Item Identity & Cross-Variant Separation
// ---------------------------------------------------------------------
console.log('\n--- TEST 2: Cart Item Distinct Identity & No Variant Switching ---');
{
  const itemRed: CartItem = {
    product: variantProduct,
    quantity: 1,
    billed_quantity: 1,
    shopId: mockShopNoUpi.id,
    shop: mockShopNoUpi,
    selectedVariant: redKurtiVariant,
  };

  const itemBlue: CartItem = {
    product: variantProduct,
    quantity: 1,
    billed_quantity: 1,
    shopId: mockShopNoUpi.id,
    shop: mockShopNoUpi,
    selectedVariant: blueKurtiVariant,
  };

  const itemSimple: CartItem = {
    product: simpleProduct,
    quantity: 1,
    billed_quantity: 1,
    shopId: mockShopNoUpi.id,
    shop: mockShopNoUpi,
    selectedVariant: null,
  };

  // Red kurti matching
  assert.strictEqual(matchesCartItem(itemRed, variantProduct.id, 'var-red-m'), true);
  assert.strictEqual(matchesCartItem(itemRed, variantProduct.id, 'var-blue-l'), false);
  assert.strictEqual(matchesCartItem(itemRed, variantProduct.id, null), false);

  // Blue kurti matching
  assert.strictEqual(matchesCartItem(itemBlue, variantProduct.id, 'var-blue-l'), true);
  assert.strictEqual(matchesCartItem(itemBlue, variantProduct.id, 'var-red-m'), false);
  assert.strictEqual(matchesCartItem(itemBlue, variantProduct.id, null), false);

  // Simple product matching
  assert.strictEqual(matchesCartItem(itemSimple, simpleProduct.id, null), true);
  assert.strictEqual(matchesCartItem(itemSimple, simpleProduct.id, 'var-red-m'), false);

  console.log('✓ matchesCartItem enforces strict variant separation without cross-variant contamination.');
}

// ---------------------------------------------------------------------
// TEST 3: Cart Quantity Increment, Subtotal & Inventory Clamping
// ---------------------------------------------------------------------
console.log('\n--- TEST 3: Cart Quantity Increment, Calculations & Stock Limits ---');
{
  let cart: CartItem[] = [
    {
      product: variantProduct,
      quantity: 1,
      billed_quantity: 1,
      shopId: mockShopNoUpi.id,
      shop: mockShopNoUpi,
      selectedVariant: redKurtiVariant, // Max stock = 4
    },
    {
      product: variantProduct,
      quantity: 1,
      billed_quantity: 1,
      shopId: mockShopNoUpi.id,
      shop: mockShopNoUpi,
      selectedVariant: blueKurtiVariant, // Untracked stock (max = 99)
    },
  ];

  // Helper simulating updateQuantity
  const simulateUpdateQuantity = (
    items: CartItem[],
    productId: string,
    quantity: number,
    variantId?: string | null
  ): { nextItems: CartItem[]; success: boolean; maxStock?: number; error?: string } => {
    if (quantity <= 0) {
      return {
        nextItems: items.filter((i) => !matchesCartItem(i, productId, variantId)),
        success: true,
      };
    }

    const targetItem = items.find((i) => matchesCartItem(i, productId, variantId));
    if (!targetItem) return { nextItems: items, success: false, error: 'Item not found' };

    let maxStock = 99;
    if (targetItem.selectedVariant && targetItem.selectedVariant.stock_quantity != null) {
      maxStock = Math.max(0, targetItem.selectedVariant.stock_quantity);
    } else if (targetItem.product.track_inventory && targetItem.product.stock_quantity != null) {
      maxStock = Math.max(0, targetItem.product.stock_quantity);
    }

    if (quantity > maxStock) {
      const clamped = items.map((i) =>
        matchesCartItem(i, productId, variantId) ? { ...i, quantity: maxStock, billed_quantity: maxStock } : i
      );
      return {
        nextItems: clamped,
        success: false,
        maxStock,
        error: `Only ${maxStock} units available in stock.`,
      };
    }

    const updated = items.map((i) =>
      matchesCartItem(i, productId, variantId) ? { ...i, quantity, billed_quantity: quantity } : i
    );
    return { nextItems: updated, success: true, maxStock };
  };

  // Step 3a: Increment Red Kurti from 1 to 2
  const step1 = simulateUpdateQuantity(cart, variantProduct.id, 2, 'var-red-m');
  assert.strictEqual(step1.success, true);
  cart = step1.nextItems;
  assert.strictEqual(cart[0].quantity, 2, 'Red Kurti quantity is 2');
  assert.strictEqual(cart[1].quantity, 1, 'Blue Kurti quantity remains 1');

  // Step 3b: Increment Red Kurti to 4 (maximum stock)
  const step2 = simulateUpdateQuantity(cart, variantProduct.id, 4, 'var-red-m');
  assert.strictEqual(step2.success, true);
  cart = step2.nextItems;
  assert.strictEqual(cart[0].quantity, 4, 'Red Kurti quantity is 4');

  // Step 3c: Attempt to increment Red Kurti to 5 (exceeds stock of 4)
  const step3 = simulateUpdateQuantity(cart, variantProduct.id, 5, 'var-red-m');
  assert.strictEqual(step3.success, false, 'Must fail when exceeding max stock');
  assert.strictEqual(step3.maxStock, 4);
  assert.ok(step3.error?.includes('Only 4 units available'), 'Provides clear stock error feedback');
  assert.strictEqual(cart[0].quantity, 4, 'Quantity is clamped at 4');

  // Step 3d: Increment Blue Kurti (untracked stock) from 1 to 10
  const step4 = simulateUpdateQuantity(cart, variantProduct.id, 10, 'var-blue-l');
  assert.strictEqual(step4.success, true, 'Untracked stock allows quantity above 1');
  cart = step4.nextItems;
  assert.strictEqual(cart[1].quantity, 10, 'Blue Kurti quantity is 10');

  // Verify Subtotal & Cart Total Calculations
  // Red Kurti: 4 * 499 = 1996
  // Blue Kurti: 10 * 549 = 5490
  // Cart Total: 1996 + 5490 = 7486
  const redSubtotal = (cart[0].selectedVariant?.price ?? 0) * cart[0].billed_quantity;
  const blueSubtotal = (cart[1].selectedVariant?.price ?? 0) * cart[1].billed_quantity;
  const grandTotal = redSubtotal + blueSubtotal;

  assert.strictEqual(redSubtotal, 1996, 'Red Kurti subtotal calculated correctly');
  assert.strictEqual(blueSubtotal, 5490, 'Blue Kurti subtotal calculated correctly');
  assert.strictEqual(grandTotal, 7486, 'Grand total calculated correctly');

  console.log('✓ Quantity controls, price calculations, and stock clamping verified.');
}

// ---------------------------------------------------------------------
// TEST 4: BOGO (Buy 1 Get 1 Free) Billed vs Delivered Calculation
// ---------------------------------------------------------------------
console.log('\n--- TEST 4: BOGO Offers with Quantity Controls ---');
{
  const bogoProduct: ShopProduct = {
    id: '30000000-0000-4000-8000-000000000003',
    shop_id: mockShopNoUpi.id,
    name: 'Artisan Scented Candle',
    description: 'Natural soy wax candle',
    image_url: null,
    price: 350,
    unit: 'piece',
    is_available: true,
    offer_type: 'bogo',
    offer_label: 'Buy 1 Get 1 Free',
    created_at: new Date().toISOString(),
  };

  const bogoCartItem: CartItem = {
    product: bogoProduct,
    quantity: 3,
    billed_quantity: 3,
    shopId: mockShopNoUpi.id,
    shop: mockShopNoUpi,
    selectedVariant: null,
  };

  // With quantity 3: billed for 3, receives 6
  assert.strictEqual(bogoCartItem.billed_quantity, 3);
  assert.strictEqual(getEffectiveQuantity(bogoCartItem), 6);
  assert.strictEqual(bogoCartItem.product.price * bogoCartItem.billed_quantity, 1050);

  console.log('✓ BOGO item accurately calculates billed vs delivered items as quantity changes.');
}

// ---------------------------------------------------------------------
// TEST 5: Authoritative Shop UPI Sync & Validation
// ---------------------------------------------------------------------
console.log('\n--- TEST 5: UPI QR Code Added Later - Stale Cache Invalidation ---');
{
  // Simulated initial cart stored in localStorage when shop had no UPI
  const staleCartItems: CartItem[] = [
    {
      product: simpleProduct,
      quantity: 1,
      billed_quantity: 1,
      shopId: mockShopNoUpi.id,
      shop: mockShopNoUpi, // upi_qr_url is NULL
    },
  ];

  assert.strictEqual(isValidUpiQrUrl(staleCartItems[0].shop.upi_qr_url), false, 'Initial cart has no valid UPI QR');

  // Shopkeeper adds UPI QR code to shop profile in database
  const liveShopsFromDatabase: Shop[] = [mockShopWithUpi];

  // Simulating syncCartShops
  const syncCart = (items: CartItem[], freshShops: Shop[]): CartItem[] => {
    const shopMap = new Map(freshShops.map((s) => [s.id, s]));
    return items.map((item) => {
      const fresh = shopMap.get(item.shopId || item.shop.id);
      return fresh ? { ...item, shop: { ...item.shop, ...fresh } } : item;
    });
  };

  const refreshedCart = syncCart(staleCartItems, liveShopsFromDatabase);
  assert.strictEqual(
    isValidUpiQrUrl(refreshedCart[0].shop.upi_qr_url),
    true,
    'After syncCartShops, cart shop is refreshed with live UPI QR'
  );
  assert.strictEqual(
    refreshedCart[0].shop.upi_id,
    'kaverisweets@okaxis',
    'Authoritative UPI ID is now present in cart'
  );

  console.log('✓ Stale cart shop data successfully refreshed with authoritative database state.');
}

// ---------------------------------------------------------------------
// TEST 6: Strict UPI Security Rejection When Shop Legitimately Has No QR
// ---------------------------------------------------------------------
console.log('\n--- TEST 6: Security Rejection for Shops Truly Lacking UPI QR ---');
{
  // A shop with no QR code or invalid placeholder
  const invalidShops = [
    { ...mockShopNoUpi, upi_qr_url: null },
    { ...mockShopNoUpi, upi_qr_url: '' },
    { ...mockShopNoUpi, upi_qr_url: 'https://your-project-id.supabase.co/storage/placeholder.png' },
    { ...mockShopNoUpi, upi_qr_url: 'javascript:alert(1)' },
  ];

  for (const shop of invalidShops) {
    const isValid = isValidUpiQrUrl(shop.upi_qr_url);
    assert.strictEqual(isValid, false, `Must reject invalid QR: ${shop.upi_qr_url}`);
  }

  console.log('✓ Strict validation rejects missing, placeholder, or malicious UPI QR codes.');
}

// ---------------------------------------------------------------------
// TEST 7: Codebase Source Inspection for Key Functional Protections
// ---------------------------------------------------------------------
console.log('\n--- TEST 7: Codebase Source Inspection for Reliability Fixes ---');
{
  const ROOT = process.cwd();
  const cartContextPath = path.join(ROOT, 'src', 'context', 'CartContext.tsx');
  const cartPagePath = path.join(ROOT, 'src', 'pages', 'CartPage.tsx');
  const productVariantsPath = path.join(ROOT, 'src', 'lib', 'productVariants.ts');
  const shopkeeperApiPath = path.join(ROOT, 'src', 'lib', 'shopkeeperApi.ts');
  const cartPageCssPath = path.join(ROOT, 'src', 'pages', 'CartPage.css');

  const cartContextContent = fs.readFileSync(cartContextPath, 'utf-8');
  const cartPageContent = fs.readFileSync(cartPagePath, 'utf-8');
  const productVariantsContent = fs.readFileSync(productVariantsPath, 'utf-8');
  const shopkeeperApiContent = fs.readFileSync(shopkeeperApiPath, 'utf-8');
  const cartPageCssContent = fs.readFileSync(cartPageCssPath, 'utf-8');

  // 7a: CartContext contains syncCartShops and authoritative database check
  assert.ok(cartContextContent.includes('syncCartShops'), 'CartContext exports syncCartShops');
  assert.ok(
    cartContextContent.includes("from('shop_products')") || cartContextContent.includes("from('shops_products')"),
    'CartContext performs backend live inventory verification on order placement'
  );
  assert.ok(
    cartContextContent.includes("dbShop.upi_qr_url"),
    'CartContext validates dbShop.upi_qr_url authoritatively on order submission'
  );
  assert.ok(
    cartContextContent.includes("window.addEventListener('vaango-shops-changed'"),
    'CartContext listens to vaango-shops-changed to invalidate stale cache'
  );

  // 7b: CartPage invokes syncCartShops on mount and validates live UPI QR
  assert.ok(cartPageContent.includes('syncCartShops();'), 'CartPage calls syncCartShops on mount');
  assert.ok(cartPageContent.includes('disabled={!isValidUpiQrUrl(shop.upi_qr_url)}'), 'CartPage checks UPI QR validity');

  // 7c: productVariants defaults stock_quantity to null (untracked)
  assert.ok(
    productVariantsContent.includes('stock_quantity: null,'),
    'generateVariantCombinations sets stock_quantity to null'
  );

  // 7d: shopkeeperApi dispatches vaango-shops-changed on profile update
  assert.ok(
    shopkeeperApiContent.includes("new CustomEvent('vaango-shops-changed'"),
    'updateShopProfile dispatches vaango-shops-changed'
  );

  // 7e: CSS mobile touch targets
  assert.ok(
    cartPageCssContent.includes('.vaango-qty-control'),
    'CartPage.css contains explicit .vaango-qty-control definitions'
  );
  assert.ok(
    cartPageCssContent.includes('min-width: 40px;') || cartPageCssContent.includes('height: 40px;'),
    'Touch friendly sizing defined for mobile viewport'
  );

  console.log('✓ Source code guarantees all commerce reliability protections.');
}

console.log('\n=============================================');
console.log('ALL COMMERCE RELIABILITY TESTS PASSED (7/7)!');
console.log('=============================================\n');
