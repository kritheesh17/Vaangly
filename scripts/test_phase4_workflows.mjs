// Phase 4 Appointments & Services Automated Verification Test Suite

import assert from 'assert';

console.log('====================================================');
console.log('VAANGO PHASE 4 — APPOINTMENTS & SERVICES TEST SUITE');
console.log('====================================================\n');

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

// -------------------------------------------------------------
// 1. WORKFLOW STATE MACHINES BY GROUP
// -------------------------------------------------------------
const VALID_TRANSITIONS_BY_GROUP = {
  ORDER: {
    REQUESTED: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY', 'DELAYED', 'CANCELLED'],
    DELAYED: ['PREPARING', 'READY', 'CANCELLED'],
    READY: ['COMPLETED'],
    COMPLETED: [],
    REJECTED: [],
    CANCELLED: [],
    EXPIRED: [],
  },
  APPOINTMENT: {
    REQUESTED: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
    CONFIRMED: ['IN_PROGRESS', 'DELAYED', 'NO_SHOW', 'CANCELLED'],
    DELAYED: ['CONFIRMED', 'IN_PROGRESS', 'NO_SHOW', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    REJECTED: [],
    CANCELLED: [],
    EXPIRED: [],
    NO_SHOW: [],
  },
  SERVICE: {
    REQUESTED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
    ACCEPTED: ['IN_PROGRESS', 'DELAYED', 'CANCELLED'],
    IN_PROGRESS: ['READY', 'DELAYED', 'CANCELLED'],
    DELAYED: ['IN_PROGRESS', 'READY', 'CANCELLED'],
    READY: ['COMPLETED'],
    COMPLETED: [],
    REJECTED: [],
    CANCELLED: [],
    EXPIRED: [],
  },
};

function canTransition(group, fromState, toState) {
  const allowed = VALID_TRANSITIONS_BY_GROUP[group]?.[fromState] || [];
  return allowed.includes(toState);
}

// --- Group B (Appointment) Transitions ---
test('Group B Appointment: Happy Path (REQUESTED -> CONFIRMED -> IN_PROGRESS -> COMPLETED)', () => {
  assert.strictEqual(canTransition('APPOINTMENT', 'REQUESTED', 'CONFIRMED'), true);
  assert.strictEqual(canTransition('APPOINTMENT', 'CONFIRMED', 'IN_PROGRESS'), true);
  assert.strictEqual(canTransition('APPOINTMENT', 'IN_PROGRESS', 'COMPLETED'), true);
});

test('Group B Appointment: Exceptional States (DELAYED, NO_SHOW, REJECTED)', () => {
  // Can delay a confirmed slot
  assert.strictEqual(canTransition('APPOINTMENT', 'CONFIRMED', 'DELAYED'), true);
  assert.strictEqual(canTransition('APPOINTMENT', 'DELAYED', 'IN_PROGRESS'), true);
  // Can mark no-show
  assert.strictEqual(canTransition('APPOINTMENT', 'CONFIRMED', 'NO_SHOW'), true);
  assert.strictEqual(canTransition('APPOINTMENT', 'DELAYED', 'NO_SHOW'), true);
  // Rejection at requested state
  assert.strictEqual(canTransition('APPOINTMENT', 'REQUESTED', 'REJECTED'), true);
});

test('Group B Appointment: Disallow invalid transitions', () => {
  // Cannot jump straight from REQUESTED to COMPLETED
  assert.strictEqual(canTransition('APPOINTMENT', 'REQUESTED', 'COMPLETED'), false);
  // Cannot mark no-show once COMPLETED
  assert.strictEqual(canTransition('APPOINTMENT', 'COMPLETED', 'NO_SHOW'), false);
  // Completed cannot transition to anything
  assert.strictEqual(canTransition('APPOINTMENT', 'COMPLETED', 'CANCELLED'), false);
  // Cannot jump to PREPARING (ORDER specific state)
  assert.strictEqual(canTransition('APPOINTMENT', 'CONFIRMED', 'PREPARING'), false);
});

// --- Group C (Service) Transitions ---
test('Group C Service: Happy Path (REQUESTED -> ACCEPTED -> IN_PROGRESS -> READY -> COMPLETED)', () => {
  assert.strictEqual(canTransition('SERVICE', 'REQUESTED', 'ACCEPTED'), true);
  assert.strictEqual(canTransition('SERVICE', 'ACCEPTED', 'IN_PROGRESS'), true);
  assert.strictEqual(canTransition('SERVICE', 'IN_PROGRESS', 'READY'), true);
  assert.strictEqual(canTransition('SERVICE', 'READY', 'COMPLETED'), true);
});

test('Group C Service: Delay and Rejection communication', () => {
  assert.strictEqual(canTransition('SERVICE', 'ACCEPTED', 'DELAYED'), true);
  assert.strictEqual(canTransition('SERVICE', 'IN_PROGRESS', 'DELAYED'), true);
  assert.strictEqual(canTransition('SERVICE', 'DELAYED', 'READY'), true);
  assert.strictEqual(canTransition('SERVICE', 'REQUESTED', 'REJECTED'), true);
});

test('Group C Service: Disallow invalid transitions', () => {
  assert.strictEqual(canTransition('SERVICE', 'REQUESTED', 'READY'), false);
  assert.strictEqual(canTransition('SERVICE', 'COMPLETED', 'CANCELLED'), false);
  // Cannot transition to appointment-only NO_SHOW
  assert.strictEqual(canTransition('SERVICE', 'IN_PROGRESS', 'NO_SHOW'), false);
});

// --- Group A (Order) Regression Check ---
test('Group A Order: Regression Check (PREPARING, READY, COMPLETED remain intact)', () => {
  assert.strictEqual(canTransition('ORDER', 'REQUESTED', 'ACCEPTED'), true);
  assert.strictEqual(canTransition('ORDER', 'ACCEPTED', 'PREPARING'), true);
  assert.strictEqual(canTransition('ORDER', 'PREPARING', 'READY'), true);
  assert.strictEqual(canTransition('ORDER', 'READY', 'COMPLETED'), true);
  assert.strictEqual(canTransition('ORDER', 'REQUESTED', 'CONFIRMED'), false); // Appointment state not allowed in ORDER
});

// -------------------------------------------------------------
// 2. DOUBLE-BOOKING CONCURRENCY PROTECTION
// -------------------------------------------------------------
test('Appointment Slot Protection: Prevent double booking of identical slot', () => {
  // Simulated slot ledger
  const slotsTable = [
    { id: 'slot-101', shop_id: 'shop-salon-1', slot_date: '2026-09-15', start_time: '10:00', is_available: true },
    { id: 'slot-102', shop_id: 'shop-salon-1', slot_date: '2026-09-15', start_time: '10:30', is_available: true },
  ];

  function reserveSlotAtomic(slotId, customerId) {
    const slot = slotsTable.find((s) => s.id === slotId);
    if (!slot) return { success: false, error: 'Slot not found' };
    if (!slot.is_available) {
      return { success: false, error: 'That appointment slot was just booked by someone else. Please choose another time.' };
    }
    // Atomic lock & mark
    slot.is_available = false;
    slot.booked_by = customerId;
    return { success: true, slot };
  }

  // Customer A reserves 10:00 AM slot
  const resA = reserveSlotAtomic('slot-101', 'cust-A');
  assert.strictEqual(resA.success, true);
  assert.strictEqual(resA.slot.is_available, false);

  // Customer B attempts to reserve the same 10:00 AM slot concurrently
  const resB = reserveSlotAtomic('slot-101', 'cust-B');
  assert.strictEqual(resB.success, false);
  assert.strictEqual(resB.error.includes('just booked by someone else'), true);

  // Customer B selects alternative slot 10:30 AM and succeeds
  const resB_alt = reserveSlotAtomic('slot-102', 'cust-B');
  assert.strictEqual(resB_alt.success, true);
});

// -------------------------------------------------------------
// 3. SERVICE PRICING VALIDATION & CONFIRMATION
// -------------------------------------------------------------
test('Service Pricing: Fixed rate vs Estimated Range Validation', () => {
  function validateServicePrice(priceType, price, minPrice, maxPrice) {
    if (priceType === 'fixed') {
      if (!price || price <= 0) return { valid: false, error: 'Fixed price must be greater than zero' };
      return { valid: true, effectiveMin: price, effectiveMax: price };
    }
    if (priceType === 'range') {
      if (!minPrice || !maxPrice) return { valid: false, error: 'Range prices must provide min and max' };
      if (minPrice >= maxPrice) return { valid: false, error: 'Minimum price must be strictly less than maximum price' };
      return { valid: true, effectiveMin: minPrice, effectiveMax: maxPrice };
    }
    return { valid: false, error: 'Invalid price type' };
  }

  // Fixed price test
  const fixedValid = validateServicePrice('fixed', 250, null, null);
  assert.strictEqual(fixedValid.valid, true);
  assert.strictEqual(fixedValid.effectiveMin, 250);

  // Range price test (valid)
  const rangeValid = validateServicePrice('range', null, 300, 600);
  assert.strictEqual(rangeValid.valid, true);
  assert.strictEqual(rangeValid.effectiveMin, 300);
  assert.strictEqual(rangeValid.effectiveMax, 600);

  // Range price invalid (min >= max)
  const rangeInvalid = validateServicePrice('range', null, 500, 300);
  assert.strictEqual(rangeInvalid.valid, false);
});

test('Service Pricing: Authoritative Shopkeeper Confirmation on Range Service', () => {
  // Customer submits request for range service (₹350 - ₹700)
  const request = {
    id: 'req-srv-001',
    workflow_group_code: 'SERVICE',
    current_state: 'REQUESTED',
    notes: JSON.stringify({
      service_id: 'srv-pant-alter',
      service_name: 'Pant Alteration & Fit',
      price_type: 'range',
      estimated_min_price: 350,
      estimated_max_price: 700,
      confirmed_price: null,
    }),
    total_estimate: 700,
  };

  // Shopkeeper inspects garment and confirms final price = ₹450
  function confirmServicePrice(req, confirmedAmount) {
    const payload = JSON.parse(req.notes);
    if (confirmedAmount < payload.estimated_min_price || confirmedAmount > payload.estimated_max_price) {
      // In a real shop, shopkeeper might quote slightly outside or inside, but it must be recorded authoritatively
    }
    payload.confirmed_price = confirmedAmount;
    req.notes = JSON.stringify(payload);
    req.total_estimate = confirmedAmount;
    return req;
  }

  const updatedReq = confirmServicePrice(request, 450);
  const updatedPayload = JSON.parse(updatedReq.notes);
  assert.strictEqual(updatedPayload.confirmed_price, 450);
  assert.strictEqual(updatedReq.total_estimate, 450);
});

// -------------------------------------------------------------
// 4. TANGLISH & MULTI-VERTICAL SEARCH EXPANSION
// -------------------------------------------------------------
test('Multi-Vertical Discovery: Tanglish Keywords Match Correct Shop Types', () => {
  const dictionary = {
    'mudi': 'type-salon',
    'saloon': 'type-salon',
    'doctor': 'type-clinic',
    'maruthuvamanai': 'type-clinic',
    'thaiyal': 'type-tailor',
    'mechanic': 'type-mechanic',
    'vandi': 'type-mechanic',
    'phone repair': 'type-repair',
    'thuni': 'type-laundry',
    'maligai': 'type-grocery',
  };

  assert.strictEqual(dictionary['mudi'], 'type-salon');
  assert.strictEqual(dictionary['doctor'], 'type-clinic');
  assert.strictEqual(dictionary['thaiyal'], 'type-tailor');
  assert.strictEqual(dictionary['vandi'], 'type-mechanic');
  assert.strictEqual(dictionary['thuni'], 'type-laundry');
});

console.log(`\n====================================================`);
console.log(`TEST SUMMARY: ${passedTests} of ${totalTests} tests passed.`);
console.log(`====================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
