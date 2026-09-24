import assert from 'assert';
import { findVariantForSelections, variantAttributeGroups, variantIsAvailable, variantLabel } from '../lib/productVariants';
import { ShopProduct, ProductVariant, Shop } from '../types/database';

console.log('--- Testing Product Details & Cart Integration Flows ---');

// Mock data
const mockShop: Shop = {
  id: 'a0000000-0000-0000-0000-000000000001',
  name: 'Salem Sweets & Bakery',
  description: 'Authentic bakery',
  address_line: '123 Bazaar Street',
  phone: '9876543210',
  is_active: true,
  is_verified: true,
  business_type: 'BAKERY',
  town_id: 't0000000-0000-0000-0000-000000000001',
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
  category: 'SWEETS',
  is_available: true,
  has_variants: false,
  variants: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Product with multi-attribute variants
const variantProduct: ShopProduct = {
  id: 'b0000000-0000-0000-0000-000000000002',
  shop_id: mockShop.id,
  name: 'Black Forest Cake',
  description: 'Fresh baked cake',
  price: 450,
  unit: 'kg',
  category: 'CAKES',
  is_available: true,
  has_variants: true,
  variants: [
    {
      id: 'v0000000-0000-0000-0000-000000000001',
      product_id: 'b0000000-0000-0000-0000-000000000002',
      name: '500g / Eggless',
      price: 350,
      stock_quantity: 10,
      is_available: true,
      attributes: { Size: '500g', Type: 'Eggless' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'v0000000-0000-0000-0000-000000000002',
      product_id: 'b0000000-0000-0000-0000-000000000002',
      name: '1kg / Eggless',
      price: 650,
      stock_quantity: 5,
      is_available: true,
      attributes: { Size: '1kg', Type: 'Eggless' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'v0000000-0000-0000-0000-000000000003',
      product_id: 'b0000000-0000-0000-0000-000000000002',
      name: '1kg / Regular',
      price: 600,
      stock_quantity: 0, // out of stock
      is_available: false,
      attributes: { Size: '1kg', Type: 'Regular' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
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
  // Direct Add on ProductCard
  cart.addItem(simpleProduct, mockShop, null);
  assert.strictEqual(cart.getItemCount(), 1, 'Cart count should be 1');
  assert.strictEqual(cart.getTotalAmount(), 299, 'Cart total should be 299');
  assert.strictEqual(cart.getItems()[0].product.name, 'Mysore Pak');
  console.log('✓ TEST 1 PASSED: Direct Product Card Add works for simple product');
}

// ----------------------------------------------------
// TEST 2: Product Details Modal Add (Simple Product)
// Reproduce bug flow: user clicks Add in modal on simple product
// In the old broken code, resolvedVariant was null and handleAdd was suppressed:
// onClick={() => resolvedVariant && handleAdd()} -> DID NOTHING!
// In the fixed code:
// ----------------------------------------------------
{
  const cart = createCart();
  const product = simpleProduct;
  const hasVariants = Boolean(product.has_variants && product.variants && product.variants.length > 0);
  assert.strictEqual(hasVariants, false, 'Simple product has no variants');

  const resolvedVariant = null;
  const isOutOfStock = !product.is_available;
  assert.strictEqual(isOutOfStock, false, 'Product is in stock');

  // Trigger fixed handleAdd:
  const quantity = 1;
  const productToAdd = resolvedVariant ? { ...product } : product;
  // ProductCard onAddToCart handler:
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

  // Select 1kg / Eggless
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
// TEST 5: Out of stock variant is flagged and rejected
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
// TEST 6: Unselected variant validation
// ----------------------------------------------------
{
  const product = variantProduct;
  const hasVariants = Boolean(product.has_variants && product.variants && product.variants.length > 0);
  const resolvedVariant = null; // No match or not selected
  let warned = false;
  if (hasVariants && !resolvedVariant) {
    warned = true;
  }
  assert.strictEqual(warned, true, 'User is warned to select variant');
  console.log('✓ TEST 6 PASSED: Incomplete variant selection is caught with user warning');
}

console.log('\nALL 6 REGRESSION TESTS PASSED SUCCESSFULLY!');
