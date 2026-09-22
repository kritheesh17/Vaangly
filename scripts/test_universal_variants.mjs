import assert from 'assert';

const variants = [
  { id: 'phone-8128', attributes: { RAM: '8GB', Storage: '128GB' }, price: 20000, stock_quantity: 10, is_available: true },
  { id: 'phone-8256', attributes: { RAM: '8GB', Storage: '256GB' }, price: 23000, stock_quantity: 0, is_available: true },
  { id: 'phone-12256', attributes: { RAM: '12GB', Storage: '256GB' }, price: 27000, stock_quantity: 4, is_available: true },
];

const available = (variant) => variant.is_available !== false && variant.stock_quantity > 0;
const findVariant = (selection) => variants.find((variant) => Object.entries(selection).every(([key, value]) => variant.attributes[key] === value)) || null;
const checkout = (selection, quantity) => {
  const variant = findVariant(selection);
  if (!variant) throw new Error('Selected variant no longer exists');
  if (!available(variant)) throw new Error('Selected variant is out of stock or unavailable');
  if (quantity > variant.stock_quantity) throw new Error('Selected variant is out of stock or unavailable');
  variant.stock_quantity -= quantity;
  return { variant_id: variant.id, price: variant.price, attributes: { ...variant.attributes }, quantity };
};

assert.strictEqual(findVariant({ RAM: '12GB', Storage: '128GB' }), null, 'invalid combinations are rejected');
assert.throws(() => checkout({ RAM: '8GB', Storage: '256GB' }, 1), /out of stock/);
const first = checkout({ RAM: '8GB', Storage: '128GB' }, 2);
assert.deepStrictEqual(first.attributes, { RAM: '8GB', Storage: '128GB' });
assert.strictEqual(first.price, 20000);
assert.strictEqual(variants[0].stock_quantity, 8);
assert.throws(() => checkout({ RAM: '8GB', Storage: '128GB' }, 9), /out of stock/);
const second = checkout({ RAM: '12GB', Storage: '256GB' }, 4);
assert.strictEqual(second.price, 27000);
assert.strictEqual(variants[2].stock_quantity, 0);
assert.ok(variants.some(available), 'one exhausted variant does not hide available variants');
assert.ok(!available(variants[1]), 'zero stock is unavailable');

const cart = [first, { ...first, variant_id: 'phone-12256', attributes: { RAM: '12GB', Storage: '256GB' } }];
assert.strictEqual(new Set(cart.map((item) => item.variant_id)).size, 2, 'variant lines remain separate');
const historical = { ...first, attributes: { ...first.attributes } };
variants[0].price = 999;
variants[0].attributes.RAM = '16GB';
assert.strictEqual(historical.price, 20000, 'historical price is snapshotted');
assert.strictEqual(historical.attributes.RAM, '8GB', 'historical attributes are snapshotted');

const simpleProduct = { track_inventory: true, stock_quantity: 3 };
assert.ok(simpleProduct.stock_quantity >= 0, 'simple products retain product-level stock');
const banned = { ...variants[0], is_available: false };
assert.strictEqual(available(banned), false, 'disabled variants cannot be purchased');

console.log('Universal variant contract tests: 12 passed');
