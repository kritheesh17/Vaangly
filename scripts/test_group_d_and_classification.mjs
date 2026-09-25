// Test Suite: Group D Sales & Services, Automated Business Classification, and Bakery Fulfillment
import assert from 'assert';

console.log('====================================================');
console.log('🧪 RUNNING GROUP D & ONBOARDING CLASSIFICATION SUITE');
console.log('====================================================\n');

// 1. Classification Engine Definition (mirroring ShopkeeperOnboardingPage logic)
function classifyBusiness({
  categoryCode,
  offersProducts,
  offersServices,
  offersAppointments,
  hasDineIn = false,
  hasTakeaway = false,
}) {
  let effectiveShopTypeCode;
  const isFood = ['bakery', 'restaurant'].includes(categoryCode);

  if (offersProducts && offersServices) {
    effectiveShopTypeCode = 'sales_service';
  } else if (offersProducts && !offersServices && !offersAppointments) {
    if (['grocery', 'bakery', 'restaurant', 'pharmacy', 'stationery'].includes(categoryCode)) {
      effectiveShopTypeCode = categoryCode;
    } else {
      effectiveShopTypeCode = 'sales_service';
    }
  } else if (offersServices && !offersProducts && !offersAppointments) {
    if (['tailor', 'mechanic', 'repair', 'laundry'].includes(categoryCode)) {
      effectiveShopTypeCode = categoryCode;
    } else {
      effectiveShopTypeCode = 'sales_service';
    }
  } else if (offersAppointments && !offersProducts) {
    if (['salon', 'clinic'].includes(categoryCode)) {
      effectiveShopTypeCode = categoryCode;
    } else {
      effectiveShopTypeCode = 'sales_service';
    }
  } else {
    effectiveShopTypeCode = 'sales_service';
  }

  // Derive capabilities
  const capabilities = [];
  if (offersProducts) capabilities.push('PRODUCT_SALES', 'COUNTER_PICKUP', 'DELIVERY');
  if (offersServices) capabilities.push('SERVICES', 'SERVICE_REQUESTS');
  if (offersAppointments) capabilities.push('APPOINTMENTS');
  if (isFood) {
    if (hasDineIn) capabilities.push('DINE_IN');
    if (hasTakeaway) capabilities.push('TAKEAWAY');
  }

  return { effectiveShopTypeCode, capabilities };
}

// TEST 1: Bakery Business Classification & Fulfillment
console.log('Test 1: Bakery shopkeeper onboarding');
{
  const bakery = classifyBusiness({
    categoryCode: 'bakery',
    offersProducts: true,
    offersServices: false,
    offersAppointments: false,
    hasDineIn: true,
    hasTakeaway: true,
  });

  assert.strictEqual(bakery.effectiveShopTypeCode, 'bakery', 'Bakery code should be bakery');
  assert.ok(bakery.capabilities.includes('PRODUCT_SALES'), 'Bakery must have PRODUCT_SALES');
  assert.ok(bakery.capabilities.includes('DINE_IN'), 'Bakery MUST support DINE_IN');
  assert.ok(bakery.capabilities.includes('TAKEAWAY'), 'Bakery MUST support TAKEAWAY');
  console.log('  ✓ Bakery automatically classified with Dine-in + Takeaway capabilities.');
}

// TEST 2: Group D Sales & Services Classification (Electronics/Mobile shop with repairs)
console.log('\nTest 2: Mobile / Electronics store with Repairs (Group D)');
{
  const mobileService = classifyBusiness({
    categoryCode: 'repair',
    offersProducts: true, // Sells phone cases, chargers, screen guards
    offersServices: true, // Phone screen and battery repair
    offersAppointments: false,
  });

  assert.strictEqual(mobileService.effectiveShopTypeCode, 'sales_service', 'Combined product+service shop must be sales_service');
  assert.ok(mobileService.capabilities.includes('PRODUCT_SALES'), 'Must have PRODUCT_SALES');
  assert.ok(mobileService.capabilities.includes('SERVICES'), 'Must have SERVICES');
  assert.ok(mobileService.capabilities.includes('SERVICE_REQUESTS'), 'Must have SERVICE_REQUESTS');
  console.log('  ✓ Dual Product + Service business automatically classified as Group D Sales & Services.');
}

// TEST 3: Grocery Store (Group A Retail)
console.log('\nTest 3: Pure Retail Grocery Store');
{
  const grocery = classifyBusiness({
    categoryCode: 'grocery',
    offersProducts: true,
    offersServices: false,
    offersAppointments: false,
  });

  assert.strictEqual(grocery.effectiveShopTypeCode, 'grocery');
  assert.ok(grocery.capabilities.includes('PRODUCT_SALES'));
  assert.ok(grocery.capabilities.includes('COUNTER_PICKUP'));
  assert.ok(!grocery.capabilities.includes('SERVICES'), 'Grocery should not have SERVICES');
  assert.ok(!grocery.capabilities.includes('APPOINTMENTS'), 'Grocery should not have APPOINTMENTS');
  console.log('  ✓ Grocery correctly mapped to standard retail with delivery/pickup.');
}

// TEST 4: Clinic / Salon (Group B Appointments)
console.log('\nTest 4: Clinic / Salon Appointments');
{
  const clinic = classifyBusiness({
    categoryCode: 'clinic',
    offersProducts: false,
    offersServices: false,
    offersAppointments: true,
  });

  assert.strictEqual(clinic.effectiveShopTypeCode, 'clinic');
  assert.ok(clinic.capabilities.includes('APPOINTMENTS'));
  assert.ok(!clinic.capabilities.includes('PRODUCT_SALES'));
  console.log('  ✓ Clinic correctly classified with slot-based APPOINTMENTS.');
}

// TEST 5: Bike / Car Workshop (Group C Services)
console.log('\nTest 5: Vehicle Garage / Workshop');
{
  const mechanic = classifyBusiness({
    categoryCode: 'mechanic',
    offersProducts: false,
    offersServices: true,
    offersAppointments: false,
  });

  assert.strictEqual(mechanic.effectiveShopTypeCode, 'mechanic');
  assert.ok(mechanic.capabilities.includes('SERVICES'));
  assert.ok(mechanic.capabilities.includes('SERVICE_REQUESTS'));
  console.log('  ✓ Mechanic shop correctly classified with service requests.');
}

// TEST 6: Auto-Repair shop that also sells spare parts -> Elevated to Group D
console.log('\nTest 6: Workshop that also sells spare parts');
{
  const workshopWithParts = classifyBusiness({
    categoryCode: 'mechanic',
    offersProducts: true,
    offersServices: true,
    offersAppointments: false,
  });

  assert.strictEqual(workshopWithParts.effectiveShopTypeCode, 'sales_service', 'Selling parts + labor elevates to Group D');
  assert.ok(workshopWithParts.capabilities.includes('PRODUCT_SALES'));
  assert.ok(workshopWithParts.capabilities.includes('SERVICES'));
  console.log('  ✓ Workshop selling parts + labor automatically classified as Group D Sales & Services.');
}

// TEST 7: Bakery Fulfillment Detection (Cart & Checkout)
console.log('\nTest 7: Bakery Fulfillment in Customer Cart');
{
  function offersDineIn(shop, shopTypeCode) {
    return (
      ['restaurant', 'hotel', 'bakery'].includes(shopTypeCode || '') ||
      (Array.isArray(shop.capabilities) && shop.capabilities.includes('DINE_IN')) ||
      shop.business_type === 'bakery' ||
      shop.business_type === 'restaurant'
    );
  }

  const legacyBakery = { id: 's1', business_type: null, capabilities: null };
  assert.strictEqual(offersDineIn(legacyBakery, 'bakery'), true, 'Legacy bakery via shopType code must offer dine-in');

  const newBakery = { id: 's2', business_type: 'bakery', capabilities: ['PRODUCT_SALES', 'DINE_IN', 'TAKEAWAY'] };
  assert.strictEqual(offersDineIn(newBakery, 'bakery'), true, 'New bakery must offer dine-in');

  const groceryShop = { id: 's3', business_type: 'grocery', capabilities: ['PRODUCT_SALES'] };
  assert.strictEqual(offersDineIn(groceryShop, 'grocery'), false, 'Grocery must not offer dine-in');
  console.log('  ✓ Fulfillment detection accurately distinguishes Bakery from Grocery without regressing legacy shops.');
}

console.log('\n====================================================');
console.log('🎉 ALL GROUP D & CLASSIFICATION TESTS PASSED (7/7)');
console.log('====================================================');
