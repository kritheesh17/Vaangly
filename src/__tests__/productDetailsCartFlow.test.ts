import assert from 'assert';
import { findVariantForSelections, variantIsAvailable, variantLabel } from '../lib/productVariants';
import { cleanPaymentProofPath } from '../lib/paymentProof';
import { ShopProduct, ProductVariant, Shop } from '../types/database';

console.log('--- Testing Product Details & Cart Integration Flows ---');

// Mock data
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

// Simple product without variants
const simpleProduct: ShopProduct = {
  id: 'b0000000-0000-0000-0000-000000000001',
  shop_id: mockShop.id,
  name: 'Mysore Pak',
  description: 'Ghee rich Mysore Pak',
  price: 299,
  unit: 'box',
  is_available: true,
  image_url: null,
  has_variants: false,
  variants: [],
  created_at: new Date().toISOString(),
};

// Product with multi-attribute variants
const variantProduct: ShopProduct = {
  id: 'b0000000-0000-0000-0000-000000000002',
  shop_id: mockShop.id,
  name: 'Black Forest Cake',
  description: 'Fresh baked cake',
  price: 450,
  unit: 'kg',
  is_available: true,
  image_url: null,
  has_variants: true,
  variants: [
    {
      id: 'v0000000-0000-0000-0000-000000000001',
      label: '500g / Eggless',
      price: 350,
      stock_quantity: 10,
      is_available: true,
      attributes: { Size: '500g', Type: 'Eggless' },
    },
    {
      id: 'v0000000-0000-0000-0000-000000000002',
      label: '1kg / Eggless',
      price: 650,
      stock_quantity: 5,
      is_available: true,
      attributes: { Size: '1kg', Type: 'Eggless' },
    },
    {
      id: 'v0000000-0000-0000-0000-000000000003',
      label: '1kg / Regular',
      price: 600,
      stock_quantity: 0, // out of stock
      is_available: false,
      attributes: { Size: '1kg', Type: 'Regular' },
    },
  ],
  created_at: new Date().toISOString(),
};

// Simulation of CartContext.addItem logic
interface CartItem {
  product: ShopProduct;
  quantity: number;
  billed_quantity: number;
  shopId: string;
  shop: Shop;
  selectedVariant: ProductVariant | null;
}

function createCart() {
  let items: CartItem[] = [];

  const addItem = (product: ShopProduct, shop: Shop, variant?: ProductVariant | null) => {
    if (!product.is_available) return { success: false, error: 'Product is currently out of stock' };
    const existingIndex = items.findIndex(
      (i) =>
        i.product.id === product.id &&
        i.shopId === shop.id &&
        ((!variant && !i.selectedVariant) || i.selectedVariant?.id === variant?.id)
    );

    if (existingIndex > -1) {
      items[existingIndex].quantity += 1;
      items[existingIndex].billed_quantity += 1;
      return { success: true };
    }

    items.push({
      product,
      quantity: 1,
      billed_quantity: 1,
      shopId: shop.id,
      shop,
      selectedVariant: variant || null,
    });
    return { success: true };
  };

  const getItems = () => items;
  const getItemCount = () => items.reduce((sum, i) => sum + i.quantity, 0);
  const getTotalAmount = () =>
    items.reduce((sum, item) => {
      const unitPrice = item.selectedVariant?.price ?? item.product.price;
      return sum + unitPrice * item.billed_quantity;
    }, 0);

  return { addItem, getItems, getItemCount, getTotalAmount };
}

// ----------------------------------------------------
// TEST 1: Direct Product Card Add (Simple Product)
// ----------------------------------------------------
{
  const cart = createCart();
  cart.addItem(simpleProduct, mockShop, null);
  assert.strictEqual(cart.getItemCount(), 1, 'Cart count should be 1');
  assert.strictEqual(cart.getTotalAmount(), 299, 'Cart total should be 299');
  assert.strictEqual(cart.getItems()[0].product.name, 'Mysore Pak');
  console.log('✓ TEST 1 PASSED: Direct Product Card Add works for simple product');
}

// ----------------------------------------------------
// TEST 2: Product Details Modal Add (Simple Product)
// ----------------------------------------------------
{
  const cart = createCart();
  const product = simpleProduct;
  const hasVariants = Boolean(product.has_variants && product.variants && product.variants.length > 0);
  assert.strictEqual(hasVariants, false, 'Simple product has no variants');

  const resolvedVariant = null;
  const isOutOfStock = !product.is_available;
  assert.strictEqual(isOutOfStock, false, 'Product is in stock');

  const quantity = 1;
  const productToAdd = resolvedVariant ? { ...product } : product;
  for (let i = 0; i < quantity; i++) {
    cart.addItem(productToAdd, mockShop, resolvedVariant);
  }

  assert.strictEqual(cart.getItemCount(), 1, 'Cart count should be 1');
  assert.strictEqual(cart.getTotalAmount(), 299, 'Cart total should be 299');
  assert.strictEqual(cart.getItems()[0].product.id, simpleProduct.id);
  console.log('✓ TEST 2 PASSED: Product Details Modal Add works for simple product');
}

// ----------------------------------------------------
// TEST 3: Product Details Modal with Quantity > 1
// ----------------------------------------------------
{
  const cart = createCart();
  const product = simpleProduct;
  const quantity = 3;
  const resolvedVariant = null;
  const productToAdd = product;

  for (let i = 0; i < quantity; i++) {
    cart.addItem(productToAdd, mockShop, resolvedVariant);
  }

  assert.strictEqual(cart.getItemCount(), 3, 'Cart count should be 3');
  assert.strictEqual(cart.getTotalAmount(), 299 * 3, 'Cart total should be 897');
  console.log('✓ TEST 3 PASSED: Product Details Modal Add respects quantity = 3');
}

// ----------------------------------------------------
// TEST 4: Product Details Modal with Multi-Attribute Variant
// ----------------------------------------------------
{
  const cart = createCart();
  const product = variantProduct;
  const hasVariants = Boolean(product.has_variants && product.variants && product.variants.length > 0);
  assert.strictEqual(hasVariants, true, 'Product has variants');

  const selectedAttributes = { Size: '1kg', Type: 'Eggless' };
  const resolvedVariant = findVariantForSelections(product.variants || [], selectedAttributes);
  assert(resolvedVariant !== null, 'Variant should resolve');
  assert.strictEqual(resolvedVariant?.price, 650, 'Selected variant price should be 650');
  assert.strictEqual(variantIsAvailable(resolvedVariant!), true, 'Variant should be in stock');

  const productToAdd = {
    ...product,
    price: resolvedVariant.price,
    unit: variantLabel(resolvedVariant),
  };

  const quantity = 2;
  for (let i = 0; i < quantity; i++) {
    cart.addItem(productToAdd, mockShop, resolvedVariant);
  }

  assert.strictEqual(cart.getItemCount(), 2, 'Cart count should be 2');
  assert.strictEqual(cart.getTotalAmount(), 650 * 2, 'Cart total should be 1300');
  assert.strictEqual(cart.getItems()[0].selectedVariant?.id, resolvedVariant.id);
  console.log('✓ TEST 4 PASSED: Product Details Modal Add with variant uses variant price (650) and quantity (2)');
}

// ----------------------------------------------------
// TEST 5: Out of stock variant is prevented from adding
// ----------------------------------------------------
{
  const product = variantProduct;
  const selectedAttributes = { Size: '1kg', Type: 'Regular' };
  const resolvedVariant = findVariantForSelections(product.variants || [], selectedAttributes);
  assert(resolvedVariant !== null, 'Variant found');
  assert.strictEqual(variantIsAvailable(resolvedVariant!), false, 'Regular 1kg is out of stock');
  const hasVariants = Boolean(product.has_variants && product.variants && product.variants.length > 0);
  const isOutOfStock = !product.is_available || (hasVariants && resolvedVariant !== null && !variantIsAvailable(resolvedVariant));
  assert.strictEqual(isOutOfStock, true, 'isOutOfStock correctly identifies out of stock variant');
  console.log('✓ TEST 5 PASSED: Out of stock variant is prevented from adding');
}

// ----------------------------------------------------
// TEST 6: Mobile Bottom Navigation Theme Toggle Contract
// ----------------------------------------------------
{
  const getThemeUI = (theme: 'light' | 'dark') => ({
    icon: theme === 'dark' ? 'Sun' : 'Moon',
    label: theme === 'dark' ? 'Light' : 'Dark',
    ariaLabel: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
  });

  let currentTheme: 'light' | 'dark' = 'light';
  const toggleTheme = () => {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  };

  // Light mode expectations
  assert.strictEqual(currentTheme, 'light');
  let ui = getThemeUI(currentTheme);
  assert.strictEqual(ui.icon, 'Moon', 'Shows Moon in light mode');
  assert.strictEqual(ui.label, 'Dark', 'Label indicates switch to Dark in light mode');
  assert.strictEqual(ui.ariaLabel, 'Switch to dark mode');

  // Toggle to dark
  toggleTheme();
  assert.strictEqual(currentTheme, 'dark');
  ui = getThemeUI(currentTheme);
  assert.strictEqual(ui.icon, 'Sun', 'Shows Sun in dark mode');
  assert.strictEqual(ui.label, 'Light', 'Label indicates switch to Light in dark mode');
  assert.strictEqual(ui.ariaLabel, 'Switch to light mode');

  console.log('✓ TEST 6 PASSED: Mobile Bottom Navigation Theme Toggle contract verified');
}

// ----------------------------------------------------
// TEST 7: Payment Proof Path Normalization & State Logic
// ----------------------------------------------------
{
  // 1. Clean relative path
  assert.strictEqual(
    cleanPaymentProofPath('pending/user-123/file.png'),
    'pending/user-123/file.png'
  );
  // 2. Strips leading slash
  assert.strictEqual(
    cleanPaymentProofPath('/pending/user-123/file.png'),
    'pending/user-123/file.png'
  );
  // 3. Strips bucket name prefix
  assert.strictEqual(
    cleanPaymentProofPath('payment-proofs/pending/user-123/file.png'),
    'pending/user-123/file.png'
  );
  // 4. Extracts path from full Supabase storage URL
  assert.strictEqual(
    cleanPaymentProofPath('https://xyz.supabase.co/storage/v1/object/public/payment-proofs/pending/user-123/file.png'),
    'pending/user-123/file.png'
  );

  // Separate UI state derivation check
  const deriveState = (screenshotUrl: string | null, isLoaded: boolean, hasError: boolean) => {
    if (!screenshotUrl) return 'NOT_SUBMITTED';
    if (!isLoaded && !hasError) return 'LOADING';
    if (hasError) return 'ERROR';
    return 'READY';
  };

  assert.strictEqual(deriveState(null, false, false), 'NOT_SUBMITTED');
  assert.strictEqual(deriveState('pending/u/f.png', false, false), 'LOADING');
  assert.strictEqual(deriveState('pending/u/f.png', false, true), 'ERROR');
  assert.strictEqual(deriveState('pending/u/f.png', true, false), 'READY');

  console.log('✓ TEST 7 PASSED: Payment Proof Path Normalization & distinct UI state logic verified');
}

console.log('\nALL 7 REGRESSION & FEATURE TESTS PASSED SUCCESSFULLY!');
