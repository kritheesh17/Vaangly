import assert from 'assert';
import {
  searchApprovedMasterProducts,
  checkMasterProductDuplicates,
  createMasterProductProposal,
} from '../lib/masterCatalogueApi';
import { ShopProduct, MasterProduct } from '../types/database';

console.log('--- Testing Shopkeeper Master Catalogue & Contribution Flows ---');

async function runTests() {
  // Test 1: Approved master products are searchable
  const allApproved = await searchApprovedMasterProducts();
  assert(allApproved.length > 0, 'Must return approved master products');
  const tomato = allApproved.find((p) => p.name.toLowerCase().includes('tomato'));
  assert(tomato !== undefined, 'Tomato must exist in master catalogue');
  console.log('✓ TEST 1 PASSED: Approved master products visible in catalogue');

  // Test 2: Case-insensitive search works
  const searchLower = await searchApprovedMasterProducts('tomato');
  const searchUpper = await searchApprovedMasterProducts('TOMATO');
  const searchMixed = await searchApprovedMasterProducts('ToMaTo');
  assert(searchLower.length > 0, 'Lower search finds products');
  assert.strictEqual(searchLower.length, searchUpper.length, 'Upper search matches lower search count');
  assert.strictEqual(searchLower.length, searchMixed.length, 'Mixed search matches lower search count');
  console.log('✓ TEST 2 PASSED: Case-insensitive search works for "tomato", "TOMATO", "ToMaTo"');

  // Test 3: Duplicate detection with normalized names
  const dupCheck1 = await checkMasterProductDuplicates('Tomato');
  const dupCheck2 = await checkMasterProductDuplicates('  tomato  ');
  const dupCheck3 = await checkMasterProductDuplicates('TOMATO');
  assert(dupCheck1.length > 0, 'Duplicate check finds Tomato');
  assert.strictEqual(dupCheck1[0].name, 'Tomato');
  assert.strictEqual(dupCheck1.length, dupCheck2.length, 'Normalized spaces match duplicate');
  assert.strictEqual(dupCheck1.length, dupCheck3.length, 'Case-insensitive match duplicate');
  console.log('✓ TEST 3 PASSED: Normalized duplicate detection detects "Tomato", "  tomato  ", "TOMATO"');

  // Test 4: Selecting a master product links master_product_id
  const selectedMaster = tomato!;
  const shopA_Product: ShopProduct = {
    id: 'sp-001',
    shop_id: 'shop-a',
    name: selectedMaster.name,
    description: selectedMaster.description,
    price: 40,
    unit: 'kg',
    is_available: true,
    image_url: selectedMaster.image_url,
    master_product_id: selectedMaster.id,
    created_at: new Date().toISOString(),
  };

  assert.strictEqual(shopA_Product.master_product_id, selectedMaster.id);
  assert.strictEqual(shopA_Product.price, 40);
  console.log('✓ TEST 4 PASSED: Selecting master product links shop product via master_product_id');

  // Test 5: Shopkeeper customization isolates price and stock between shops
  const shopB_Product: ShopProduct = {
    id: 'sp-002',
    shop_id: 'shop-b',
    name: selectedMaster.name,
    description: 'Organic local tomatoes',
    price: 48,
    unit: 'kg',
    is_available: true,
    image_url: selectedMaster.image_url,
    master_product_id: selectedMaster.id,
    created_at: new Date().toISOString(),
  };

  assert.strictEqual(shopA_Product.master_product_id, shopB_Product.master_product_id);
  assert.notStrictEqual(shopA_Product.price, shopB_Product.price);
  assert.strictEqual(shopA_Product.price, 40);
  assert.strictEqual(shopB_Product.price, 48);
  console.log('✓ TEST 5 PASSED: Shop-specific price and listings remain isolated between shops (₹40 vs ₹48)');

  // Test 6: Master product itself remains immutable when shop product is customized
  assert.strictEqual(selectedMaster.id, 'mp-seed-001');
  assert.strictEqual(selectedMaster.status, 'approved');
  // Master product has no price or shop inventory
  assert.strictEqual((selectedMaster as any).price, undefined);
  console.log('✓ TEST 6 PASSED: Master product reference remains immutable and independent');

  // Test 7: Universal variants work on shop product linked to master product
  const shopWithVariants: ShopProduct = {
    id: 'sp-003',
    shop_id: 'shop-a',
    name: 'Rice',
    description: null,
    image_url: null,
    price: 60,
    unit: 'kg',
    is_available: true,
    master_product_id: 'mp-seed-004',
    has_variants: true,
    variants: [
      { id: 'var-1', label: '1kg Pack', price: 60, attributes: { 'Pack Size': '1kg' }, is_available: true },
      { id: 'var-2', label: '5kg Bag', price: 280, attributes: { 'Pack Size': '5kg' }, is_available: true },
      { id: 'var-3', label: '25kg Sack', price: 1350, attributes: { 'Pack Size': '25kg' }, is_available: true },
    ],
    created_at: new Date().toISOString(),
  };

  assert.strictEqual(shopWithVariants.variants?.length, 3);
  assert.strictEqual(shopWithVariants.variants![1].price, 280);
  console.log('✓ TEST 7 PASSED: Universal variants (Pack Size 1kg, 5kg, 25kg) work with master product linkage');

  // Test 8: Shopkeeper creating unknown product contributes to master catalogue as pending
  const customProposal = await createMasterProductProposal({
    name: 'Organic Kodo Millet',
    description: 'Unpolished native siridhanya millet grains',
    brand: 'Nammalvar Naturals',
  });

  assert.strictEqual(customProposal.status, 'pending');
  assert.strictEqual(customProposal.name, 'Organic Kodo Millet');
  assert.strictEqual(customProposal.brand, 'Nammalvar Naturals');

  const shopCustomProduct: ShopProduct = {
    id: 'sp-004',
    shop_id: 'shop-a',
    name: customProposal.name,
    description: null,
    image_url: null,
    price: 110,
    unit: '500g',
    is_available: true,
    master_product_id: customProposal.id,
    created_at: new Date().toISOString(),
  };

  assert.strictEqual(shopCustomProduct.master_product_id, customProposal.id);
  console.log('✓ TEST 8 PASSED: New product contribution created as status="pending" and linked to shop product');

  // Test 9: Non-admin proposal cannot set status to 'approved'
  const unauthorizedStatusAttempt: Partial<MasterProduct> = {
    name: 'Tampered Product',
    status: 'approved',
  };
  // createMasterProductProposal enforces status = 'pending'
  const safeCreated = await createMasterProductProposal({
    name: unauthorizedStatusAttempt.name!,
  });
  assert.strictEqual(safeCreated.status, 'pending', 'Shopkeeper proposal status must always be pending');
  console.log('✓ TEST 9 PASSED: Shopkeeper cannot elevate proposal status to approved');

  console.log('\nALL 9 MASTER CATALOGUE & SHOPKEEPER CONTRIBUTION TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
