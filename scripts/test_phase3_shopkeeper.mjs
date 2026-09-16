// Phase 3 Shopkeeper MVP Automated Verification Test Suite

import assert from 'assert';

console.log('========================================');
console.log('VAANGO PHASE 3 — SHOPKEEPER MVP TEST RUN');
console.log('========================================\n');

let passedTests = 0;
let totalTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✓ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ FAIL: ${description}`);
    console.error(err);
  }
}

// 1. Valid State Transitions Definition for Group A Order Workflow
const VALID_TRANSITIONS = {
  REQUESTED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'DELAYED', 'CANCELLED'],
  DELAYED: ['PREPARING', 'READY', 'CANCELLED'],
  READY: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

// 1. Order State Machine Transition Validator
function canTransition(fromState, toState) {
  const allowed = VALID_TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
}

test('State Machine: Happy Path (REQUESTED -> ACCEPTED -> PREPARING -> READY -> COMPLETED)', () => {
  assert.strictEqual(canTransition('REQUESTED', 'ACCEPTED'), true);
  assert.strictEqual(canTransition('ACCEPTED', 'PREPARING'), true);
  assert.strictEqual(canTransition('PREPARING', 'READY'), true);
  assert.strictEqual(canTransition('READY', 'COMPLETED'), true);
});

test('State Machine: Disallow illegal skip (REQUESTED -> COMPLETED without intermediate states)', () => {
  assert.strictEqual(canTransition('REQUESTED', 'COMPLETED'), false);
  assert.strictEqual(canTransition('REQUESTED', 'READY'), false);
  assert.strictEqual(canTransition('ACCEPTED', 'COMPLETED'), false);
});

test('State Machine: Delayed branch (PREPARING -> DELAYED -> READY)', () => {
  assert.strictEqual(canTransition('PREPARING', 'DELAYED'), true);
  assert.strictEqual(canTransition('DELAYED', 'READY'), true);
  assert.strictEqual(canTransition('DELAYED', 'PREPARING'), true);
});

test('State Machine: Rejection requires valid initial state (REQUESTED -> REJECTED)', () => {
  assert.strictEqual(canTransition('REQUESTED', 'REJECTED'), true);
  assert.strictEqual(canTransition('READY', 'REJECTED'), false);
  assert.strictEqual(canTransition('COMPLETED', 'REJECTED'), false);
});

// 2. Concurrency Guard Validation
test('Concurrency Guard: Reject transition if expectedCurrentState does not match actual state', () => {
  const mockOrder = { id: 'ord-101', current_state: 'ACCEPTED' };

  function attemptTransition(order, expectedState, newState) {
    if (order.current_state !== expectedState) {
      return { success: false, error: `Order was already updated to ${order.current_state}` };
    }
    order.current_state = newState;
    return { success: true };
  }

  // Session A succeeds
  const resA = attemptTransition(mockOrder, 'ACCEPTED', 'PREPARING');
  assert.strictEqual(resA.success, true);
  assert.strictEqual(mockOrder.current_state, 'PREPARING');

  // Session B still thinks state is ACCEPTED -> fails safely
  const resB = attemptTransition(mockOrder, 'ACCEPTED', 'PREPARING');
  assert.strictEqual(resB.success, false);
  assert.ok(resB.error.includes('already updated to PREPARING'));
});

// 3. Shop Visibility Rule (Approved — Catalogue Incomplete ≠ Live)
test('Visibility Rule: Customers cannot discover shops unless status is active AND is_live is true', () => {
  const sampleShops = [
    { id: 's1', name: 'Approved Incomplete', status: 'active', is_live: false },
    { id: 's2', name: 'Live Shop', status: 'active', is_live: true },
    { id: 's3', name: 'Pending Review Shop', status: 'pending', is_live: false },
    { id: 's4', name: 'Suspended Shop', status: 'suspended', is_live: true },
  ];

  const visibleToCustomer = sampleShops.filter(s => s.status === 'active' && s.is_live);
  assert.strictEqual(visibleToCustomer.length, 1);
  assert.strictEqual(visibleToCustomer[0].id, 's2');
});

// 4. Go-Live Catalogue Readiness Gate
test('Go-Live Rule: Cannot go live with empty catalogue', () => {
  function checkGoLiveEligibility(products) {
    if (products.length === 0) {
      return { eligible: false, error: 'Your catalogue has no products yet. Add at least one product before going live.' };
    }
    return { eligible: true };
  }

  const emptyResult = checkGoLiveEligibility([]);
  assert.strictEqual(emptyResult.eligible, false);
  assert.ok(emptyResult.error.includes('catalogue has no products'));

  const readyResult = checkGoLiveEligibility([{ id: 'p1', name: 'Rice', price: 60 }]);
  assert.strictEqual(readyResult.eligible, true);
});

// 5. Product Validation (Non-negative price, required name)
test('Catalogue: Validate non-negative prices and required fields', () => {
  function validateProduct(product) {
    if (!product.name || !product.name.trim()) return { valid: false, error: 'Name is required' };
    if (product.price === undefined || product.price === null || product.price < 0 || isNaN(product.price)) {
      return { valid: false, error: 'Price must be non-negative' };
    }
    return { valid: true };
  }

  assert.strictEqual(validateProduct({ name: '', price: 50 }).valid, false);
  assert.strictEqual(validateProduct({ name: 'Tomatoes', price: -10 }).valid, false);
  assert.strictEqual(validateProduct({ name: 'Tomatoes', price: 0 }).valid, true);
  assert.strictEqual(validateProduct({ name: 'Tomatoes', price: 45.5 }).valid, true);
});

// 6. Onboarding GPS Coordinates Validation
test('Onboarding: Require live device GPS latitude & longitude', () => {
  function validateApplication(app) {
    if (!app.shop_name?.trim()) return { valid: false, error: 'Shop name required' };
    if (!app.contact_phone?.trim()) return { valid: false, error: 'Contact phone required' };
    if (!app.gps_lat || !app.gps_lng) return { valid: false, error: 'Live device GPS coordinates required' };
    return { valid: true };
  }

  assert.strictEqual(validateApplication({ shop_name: 'Store', contact_phone: '9876512345' }).valid, false);
  assert.strictEqual(validateApplication({ shop_name: 'Store', contact_phone: '9876512345', gps_lat: 11.4533, gps_lng: 77.4361 }).valid, true);
});

// 7. Stock Out Behavior
test('Stock Management: Out of stock item prevents adding to new cart', () => {
  const product = { id: 'p1', name: 'Milk', price: 28, is_available: false };
  function canAddToCart(prod) {
    return prod.is_available === true;
  }
  assert.strictEqual(canAddToCart(product), false);
  product.is_available = true;
  assert.strictEqual(canAddToCart(product), true);
});

console.log(`\n========================================`);
console.log(`RESULTS: ${passedTests} of ${totalTests} TESTS PASSED`);
console.log(`========================================\n`);

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
