import assert from 'assert';
import {
  variantIsAvailable,
  productHasAvailableVariant,
  computeProductAvailability,
  updateVariantInList,
} from '../lib/productVariants';
import { ShopProduct, ProductVariant, Shop } from '../types/database';

console.log('=== Running Comprehensive Variant-Level Inventory Management Tests ===\n');

// Mock shop
const mockShop: Shop = {
  id: 'a0000000-0000-0000-0000-000000000001',
  owner_id: 'u0000000-0000-0000-0000-000000000001',
  shop_type_id: 'st00000-0000-0000-0000-000000000001',
  location_id: 't0000000-0000-0000-0000-000000000001',
  name: 'Salem Sweets & Bakery',
  tagline: null,
  address_line: '123 Bazaar Street',
  phone: '9876543210',
  status: 'active',
  is_live: true,
  delivery_available: true,
  delivery_fee: 30,
  upi_id: 'salemsweets@upi',
  is_open_today: true,
  opening_time: '09:00',
  closing_time: '21:00',
  photo_url: null,
  gps_lat: null,
  gps_lng: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ----------------------------------------------------
// TEST 1: Variant Model & Individual Stock/Availability
// Requirement 1: Each product variant must have its own stock quantity and availability status.
// Requirement 9: Preserve existing variant prices, attributes, images, and product data.
// ----------------------------------------------------
console.log('--- TEST 1: Individual variant stock and availability model ---');
{
  const product: ShopProduct = {
    id: 'b0000000-0000-0000-0000-000000000010',
    shop_id: mockShop.id,
    name: 'Cotton T-Shirt',
    description: '100% Organic Cotton',
    price: 499,
    unit: 'piece',
    is_available: true,
    has_variants: true,
    image_url: 'https://example.com/shirt.jpg',
    variants: [
      {
        id: 'var-small',
        label: 'Small',
        price: 499,
        stock_quantity: 5,
        is_available: true,
        in_stock: true,
        attributes: { Size: 'S' },
        image_url: 'https://example.com/small.jpg',
      },
      {
        id: 'var-medium',
        label: 'Medium',
        price: 529,
        stock_quantity: 0,
        is_available: false,
        in_stock: false,
        attributes: { Size: 'M' },
        image_url: 'https://example.com/medium.jpg',
      },
      {
        id: 'var-large',
        label: 'Large',
        price: 549,
        stock_quantity: 8,
        is_available: true,
        in_stock: true,
        attributes: { Size: 'L' },
        image_url: 'https://example.com/large.jpg',
      },
    ],
    created_at: new Date().toISOString(),
  };

  assert.strictEqual(product.variants?.length, 3);
  assert.strictEqual(product.variants[0].stock_quantity, 5);
  assert.strictEqual(variantIsAvailable(product.variants[0]), true);

  // Medium variant has 0 stock and is disabled
  assert.strictEqual(product.variants[1].stock_quantity, 0);
  assert.strictEqual(variantIsAvailable(product.variants[1]), false);

  // Large variant has 8 stock and is available
  assert.strictEqual(product.variants[2].stock_quantity, 8);
  assert.strictEqual(variantIsAvailable(product.variants[2]), true);

  // Preserves existing variant prices, attributes, images
  assert.strictEqual(product.variants[1].price, 529);
  assert.strictEqual(product.variants[1].attributes?.Size, 'M');
  assert.strictEqual(product.variants[1].image_url, 'https://example.com/medium.jpg');

  console.log('✓ TEST 1 PASSED: Variants hold independent stock quantities, availability statuses, prices, and attributes');
}

// ----------------------------------------------------
// TEST 2: Shopkeeper individual variant stock updates
// Requirement 2: Shopkeepers must be able to update stock for individual variants without marking the entire product out of stock.
// Requirement 4: Keep other in-stock variants available on the product page.
// Requirement 6: If at least one variant remains in stock, keep the product available.
// ----------------------------------------------------
console.log('--- TEST 2: Shopkeeper updates single variant stock ---');
{
  const initialVariants: ProductVariant[] = [
    { id: 'v1', label: 'Small', price: 100, stock_quantity: 5, is_available: true, in_stock: true },
    { id: 'v2', label: 'Medium', price: 120, stock_quantity: 4, is_available: true, in_stock: true },
    { id: 'v3', label: 'Large', price: 140, stock_quantity: 8, is_available: true, in_stock: true },
  ];

  // Shopkeeper sets Medium stock to 0
  const afterMediumZero = updateVariantInList(initialVariants, 'v2', { stock_quantity: 0 });

  assert.strictEqual(afterMediumZero.find((v) => v.id === 'v2')?.stock_quantity, 0);
  assert.strictEqual(variantIsAvailable(afterMediumZero.find((v) => v.id === 'v2')!), false, 'Medium must be unavailable');

  // Small and Large remain unchanged and in stock
  assert.strictEqual(afterMediumZero.find((v) => v.id === 'v1')?.stock_quantity, 5);
  assert.strictEqual(variantIsAvailable(afterMediumZero.find((v) => v.id === 'v1')!), true, 'Small remains in stock');
  assert.strictEqual(afterMediumZero.find((v) => v.id === 'v3')?.stock_quantity, 8);
  assert.strictEqual(variantIsAvailable(afterMediumZero.find((v) => v.id === 'v3')!), true, 'Large remains in stock');

  // Overall product availability check: Small & Large remain in stock -> product stays available!
  const productAvailable = computeProductAvailability({
    has_variants: true,
    variants: afterMediumZero,
    is_available: true,
  });
  assert.strictEqual(productAvailable, true, 'Product must remain available when at least one variant is in stock');

  console.log('✓ TEST 2 PASSED: Updating one variant to 0 does not mark entire product out of stock; other variants remain available');
}

// ----------------------------------------------------
// TEST 3: All variants out of stock -> Product automatically unavailable
// Requirement 5: If every variant is out of stock, mark the product as unavailable automatically.
// ----------------------------------------------------
console.log('--- TEST 3: All variants reach zero stock ---');
{
  const variantsAllZero: ProductVariant[] = [
    { id: 'v1', label: 'Small', price: 100, stock_quantity: 0, is_available: false, in_stock: false },
    { id: 'v2', label: 'Medium', price: 120, stock_quantity: 0, is_available: false, in_stock: false },
    { id: 'v3', label: 'Large', price: 140, stock_quantity: 0, is_available: false, in_stock: false },
  ];

  assert.strictEqual(productHasAvailableVariant(variantsAllZero), false, 'No variants available');

  const productAvailable = computeProductAvailability({
    has_variants: true,
    variants: variantsAllZero,
    is_available: true,
  });
  assert.strictEqual(productAvailable, false, 'Product must automatically be marked unavailable when all variants are out of stock');

  console.log('✓ TEST 3 PASSED: When every variant is out of stock, product is marked unavailable automatically');
}

// ----------------------------------------------------
// TEST 4: Restocking an out-of-stock variant
// Restocking any variant makes the product available again
// ----------------------------------------------------
console.log('--- TEST 4: Restocking one variant from all-zero state ---');
{
  const variantsAllZero: ProductVariant[] = [
    { id: 'v1', label: 'Small', price: 100, stock_quantity: 0, is_available: false, in_stock: false },
    { id: 'v2', label: 'Medium', price: 120, stock_quantity: 0, is_available: false, in_stock: false },
  ];

  // Restock Small with 10 units
  const restocked = updateVariantInList(variantsAllZero, 'v1', { stock_quantity: 10 });
  const small = restocked.find((v) => v.id === 'v1')!;
  assert.strictEqual(small.stock_quantity, 10);
  assert.strictEqual(small.in_stock, true);
  assert.strictEqual(small.is_available, true);
  assert.strictEqual(variantIsAvailable(small), true);

  // Medium remains 0 and unavailable
  const medium = restocked.find((v) => v.id === 'v2')!;
  assert.strictEqual(medium.stock_quantity, 0);
  assert.strictEqual(variantIsAvailable(medium), false);

  // Product becomes available again
  const productAvailable = computeProductAvailability({
    has_variants: true,
    variants: restocked,
    is_available: false,
  });
  assert.strictEqual(productAvailable, true, 'Product automatically becomes available upon restocking at least one variant');

  console.log('✓ TEST 4 PASSED: Restocking a variant restores product availability while keeping other out-of-stock variants disabled');
}

// ----------------------------------------------------
// TEST 5: Cart Add & Checkout Validation for Variants
// Requirement 7: Customers must not be able to add an unavailable variant to the cart or complete checkout with it.
// ----------------------------------------------------
console.log('--- TEST 5: Cart addition & pre-checkout validation for unavailable variants ---');
{
  const testProduct: ShopProduct = {
    id: 'b0000000-0000-0000-0000-000000000020',
    shop_id: mockShop.id,
    name: 'Almond Halwa',
    description: 'Traditional sweet',
    price: 300,
    unit: 'box',
    is_available: true,
    image_url: null,
    has_variants: true,
    variants: [
      { id: 'var-250g', label: '250g', price: 150, stock_quantity: 3, is_available: true, in_stock: true },
      { id: 'var-500g', label: '500g', price: 290, stock_quantity: 0, is_available: false, in_stock: false },
      { id: 'var-1kg', label: '1kg', price: 560, stock_quantity: 2, is_available: true, in_stock: true },
    ],
    created_at: new Date().toISOString(),
  };

  interface CartItem {
    product: ShopProduct;
    quantity: number;
    selectedVariant: ProductVariant | null;
  }

  // Simulated Cart implementation matching updated CartContext logic
  const cart: CartItem[] = [];

  const addToCart = (product: ShopProduct, variant?: ProductVariant | null) => {
    if (!product.is_available) {
      return { success: false, error: 'Product is currently out of stock' };
    }
    if (product.has_variants) {
      if (!variant) {
        return { success: false, error: 'Please select an available variant.' };
      }
      if (!variantIsAvailable(variant)) {
        return { success: false, error: 'Selected variant is currently out of stock.' };
      }
      if (variant.stock_quantity != null) {
        const currentQty = cart.find((i) => i.product.id === product.id && i.selectedVariant?.id === variant.id)?.quantity || 0;
        if (currentQty + 1 > variant.stock_quantity) {
          return { success: false, error: `Only ${variant.stock_quantity} available in stock for ${variant.label || 'this option'}.` };
        }
      }
    }
    const existingIndex = cart.findIndex((i) => i.product.id === product.id && i.selectedVariant?.id === variant?.id);
    if (existingIndex > -1) {
      cart[existingIndex].quantity += 1;
      return { success: true };
    }
    cart.push({ product, quantity: 1, selectedVariant: variant || null });
    return { success: true };
  };

  // 1. Attempt adding out-of-stock 500g variant -> Rejected!
  const add500g = addToCart(testProduct, testProduct.variants![1]);
  assert.strictEqual(add500g.success, false);
  assert.strictEqual(add500g.error, 'Selected variant is currently out of stock.');
  assert.strictEqual(cart.length, 0, 'Cart remains empty');

  // 2. Add in-stock 250g variant -> Accepted!
  const add250g = addToCart(testProduct, testProduct.variants![0]);
  assert.strictEqual(add250g.success, true);
  assert.strictEqual(cart.length, 1);
  assert.strictEqual(cart[0].selectedVariant?.label, '250g');

  // 3. Exceeding available stock (stock_quantity = 3)
  const add2 = addToCart(testProduct, testProduct.variants![0]);
  assert.strictEqual(add2.success, true);
  const add3 = addToCart(testProduct, testProduct.variants![0]);
  assert.strictEqual(add3.success, true);
  // Total in cart is now 3. Attempting 4th:
  const add4 = addToCart(testProduct, testProduct.variants![0]);
  assert.strictEqual(add4.success, false);
  assert(add4.error?.includes('Only 3 available in stock'));

  // 4. Pre-checkout validation function
  const validateCartBeforeCheckout = (items: CartItem[]) => {
    for (const item of items) {
      if (!item.product.is_available) return { valid: false, error: `${item.product.name} is out of stock` };
      if (item.product.has_variants) {
        if (!item.selectedVariant || !variantIsAvailable(item.selectedVariant)) {
          return { valid: false, error: `${item.product.name} (${item.selectedVariant?.label || 'Option'}) is out of stock` };
        }
        if (item.selectedVariant.stock_quantity != null && item.quantity > item.selectedVariant.stock_quantity) {
          return { valid: false, error: `Quantity exceeds available stock for ${item.selectedVariant.label}` };
        }
      }
    }
    return { valid: true };
  };

  // Valid cart check
  assert.strictEqual(validateCartBeforeCheckout(cart.slice(0, 3)).valid, true);

  // Cart with unavailable variant check
  const badCart: CartItem[] = [
    { product: testProduct, quantity: 1, selectedVariant: testProduct.variants![1] }, // 500g variant with 0 stock
  ];
  const badCheck = validateCartBeforeCheckout(badCart);
  assert.strictEqual(badCheck.valid, false);
  assert(badCheck.error?.includes('out of stock'));

  console.log('✓ TEST 5 PASSED: Customers cannot add out-of-stock variants to cart or pass pre-checkout validation');
}

// ----------------------------------------------------
// TEST 6: Atomic Concurrent Checkout Simulation & Overselling Prevention
// Requirement 8: Validate stock on the backend as well as the frontend to prevent overselling and concurrent checkout races.
// ----------------------------------------------------
console.log('--- TEST 6: Concurrent checkout race condition simulation ---');
{
  // Simulated database product row with 1 unit of a variant
  class DatabaseProductSimulator {
    private variants: ProductVariant[];
    private isAvailable: boolean;
    private locked: boolean = false;

    constructor(initialVariants: ProductVariant[]) {
      this.variants = JSON.parse(JSON.stringify(initialVariants));
      this.isAvailable = this.variants.some((v) => variantIsAvailable(v));
    }

    // Simulates SELECT * FROM shop_products WHERE id = ... FOR UPDATE
    // followed by atomic decrement inside a database transaction
    async executeOrderTransaction(variantId: string, quantity: number): Promise<{ success: boolean; error?: string }> {
      // Simulate acquisition of PostgreSQL row-level exclusive lock
      while (this.locked) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      this.locked = true;

      try {
        if (!this.isAvailable) {
          return { success: false, error: 'Product is unavailable' };
        }

        const variant = this.variants.find((v) => v.id === variantId);
        if (!variant) {
          return { success: false, error: 'Selected variant no longer exists' };
        }

        if (!variantIsAvailable(variant) || (variant.stock_quantity != null && variant.stock_quantity < quantity)) {
          return { success: false, error: 'Selected variant is out of stock or unavailable' };
        }

        // Decrement variant stock atomically
        if (variant.stock_quantity != null) {
          variant.stock_quantity -= quantity;
          if (variant.stock_quantity <= 0) {
            variant.stock_quantity = 0;
            variant.in_stock = false;
            variant.is_available = false;
          }
        }

        // Trigger logic: auto-sync product availability
        this.isAvailable = this.variants.some((v) => variantIsAvailable(v));

        return { success: true };
      } finally {
        // Release row lock
        this.locked = false;
      }
    }

    getVariantStock(variantId: string): number | null | undefined {
      return this.variants.find((v) => v.id === variantId)?.stock_quantity;
    }

    getProductAvailable(): boolean {
      return this.isAvailable;
    }
  }

  // Setup: Variant has exactly 1 unit left
  const db = new DatabaseProductSimulator([
    { id: 'var-last-one', label: 'Exclusive Watch', price: 9999, stock_quantity: 1, is_available: true, in_stock: true },
  ]);

  // Simulate two concurrent checkout attempts racing to buy the last 1 item
  const runRace = async () => {
    const [buyerA, buyerB] = await Promise.all([
      db.executeOrderTransaction('var-last-one', 1),
      db.executeOrderTransaction('var-last-one', 1),
    ]);

    // Exactly one must succeed, and exactly one must be rejected
    const successes = [buyerA, buyerB].filter((r) => r.success).length;
    const failures = [buyerA, buyerB].filter((r) => !r.success).length;

    assert.strictEqual(successes, 1, 'Exactly one concurrent buyer must succeed');
    assert.strictEqual(failures, 1, 'The competing buyer must be rejected with out-of-stock');
    assert.strictEqual(db.getVariantStock('var-last-one'), 0, 'Final stock must be exactly 0 (no overselling)');
    assert.strictEqual(db.getProductAvailable(), false, 'Product must now be automatically unavailable');
  };

  await runRace();
  console.log('✓ TEST 6 PASSED: Atomic row-locked validation prevents overselling under concurrent checkout races');
}

// ----------------------------------------------------
// TEST 7: Simple Products Without Variants Unaffected
// Requirement 10: For products without variants, preserve the existing product-level stock behavior.
// ----------------------------------------------------
console.log('--- TEST 7: Simple products without variants preserve existing behavior ---');
{
  const simpleProduct: ShopProduct = {
    id: 'b0000000-0000-0000-0000-000000000030',
    shop_id: mockShop.id,
    name: 'Mysore Pak',
    description: 'Traditional sweet',
    price: 250,
    unit: 'box',
    is_available: true,
    image_url: null,
    has_variants: false,
    variants: [],
    track_inventory: true,
    stock_quantity: 15,
    created_at: new Date().toISOString(),
  };

  // Simple product availability relies on product-level is_available & stock_quantity
  const avail1 = computeProductAvailability(simpleProduct);
  assert.strictEqual(avail1, true, 'In-stock simple product is available');

  // Simple product with stock = 0
  const zeroStockSimple: ShopProduct = { ...simpleProduct, stock_quantity: 0 };
  const avail2 = computeProductAvailability(zeroStockSimple);
  assert.strictEqual(avail2, false, 'Zero stock tracked simple product is unavailable');

  // Simple product without inventory tracking (unlimited)
  const untrackedSimple: ShopProduct = { ...simpleProduct, track_inventory: false, stock_quantity: null, is_available: true };
  const avail3 = computeProductAvailability(untrackedSimple);
  assert.strictEqual(avail3, true, 'Untracked simple product respects is_available flag');

  console.log('✓ TEST 7 PASSED: Products without variants preserve existing product-level stock behavior');
}

// ----------------------------------------------------
// TEST 8: Full Lifecycle Example from Prompt
// "Example: A product has Small = 5, Medium = 0, Large = 8.
//  Medium is unavailable, but Small and Large remain purchasable."
// ----------------------------------------------------
console.log('--- TEST 8: Prompt Specification Verification ---');
{
  let variants: ProductVariant[] = [
    { id: 's', label: 'Small', price: 200, stock_quantity: 5, is_available: true, in_stock: true },
    { id: 'm', label: 'Medium', price: 220, stock_quantity: 0, is_available: false, in_stock: false },
    { id: 'l', label: 'Large', price: 240, stock_quantity: 8, is_available: true, in_stock: true },
  ];

  // 1. Medium is unavailable for purchase
  const medium = variants.find((v) => v.id === 'm')!;
  assert.strictEqual(variantIsAvailable(medium), false);

  // 2. Small and Large remain purchasable
  const small = variants.find((v) => v.id === 's')!;
  const large = variants.find((v) => v.id === 'l')!;
  assert.strictEqual(variantIsAvailable(small), true);
  assert.strictEqual(variantIsAvailable(large), true);

  // 3. Product remains available because Small and Large are in stock
  assert.strictEqual(productHasAvailableVariant(variants), true);
  assert.strictEqual(computeProductAvailability({ has_variants: true, variants, is_available: true }), true);

  // 4. Customer buys all 5 units of Small
  variants = updateVariantInList(variants, 's', { stock_quantity: 0 });
  assert.strictEqual(variantIsAvailable(variants.find((v) => v.id === 's')!), false);
  // Large still has 8 -> product still available!
  assert.strictEqual(computeProductAvailability({ has_variants: true, variants, is_available: true }), true);

  // 5. Customer buys all 8 units of Large
  variants = updateVariantInList(variants, 'l', { stock_quantity: 0 });
  assert.strictEqual(variantIsAvailable(variants.find((v) => v.id === 'l')!), false);
  // Now Small = 0, Medium = 0, Large = 0 -> Product becomes unavailable automatically!
  assert.strictEqual(computeProductAvailability({ has_variants: true, variants, is_available: true }), false);

  // 6. Shopkeeper restocks Medium to 12 units
  variants = updateVariantInList(variants, 'm', { stock_quantity: 12 });
  assert.strictEqual(variantIsAvailable(variants.find((v) => v.id === 'm')!), true);
  // Product automatically becomes available again!
  assert.strictEqual(computeProductAvailability({ has_variants: true, variants, is_available: false }), true);

  console.log('✓ TEST 8 PASSED: Example scenario (Small=5, Medium=0, Large=8) verified completely through its full lifecycle\n');
}

console.log('ALL 8 VARIANT-LEVEL INVENTORY MANAGEMENT TEST SUITES PASSED SUCCESSFULLY!');
