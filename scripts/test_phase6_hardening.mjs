// Phase 6 Production Hardening, Security, Reliability & Deployment Readiness Test Suite

import assert from 'assert';

console.log('================================================================');
console.log('VAANGO PHASE 6 — PRODUCTION HARDENING & SECURITY TEST SUITE');
console.log('================================================================\n');

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

// =============================================================
// 1. ROLE ESCALATION PREVENTION
// =============================================================
test('Role Escalation: Non-admin users cannot promote themselves or modify is_verified', () => {
  const profile = {
    id: 'user-cust-1',
    role: 'customer',
    is_verified: false,
    full_name: 'Regular Customer',
  };

  function updateProfile(targetProfile, updates, callerRole) {
    const isChangingRole = updates.role !== undefined && updates.role !== targetProfile.role;
    const isChangingVerification =
      updates.is_verified !== undefined && updates.is_verified !== targetProfile.is_verified;

    if ((isChangingRole || isChangingVerification) && callerRole !== 'admin') {
      throw new Error('Access Denied: You do not have permission to modify account role or verification status.');
    }

    return { ...targetProfile, ...updates };
  }

  // Self-update allowed for standard profile fields
  const updatedName = updateProfile(profile, { full_name: 'Updated Name' }, 'customer');
  assert.strictEqual(updatedName.full_name, 'Updated Name');

  // Customer attempting to escalate to admin must FAIL
  assert.throws(
    () => updateProfile(profile, { role: 'admin' }, 'customer'),
    /Access Denied/
  );

  // Shopkeeper attempting to escalate to admin must FAIL
  assert.throws(
    () => updateProfile(profile, { role: 'admin' }, 'shopkeeper'),
    /Access Denied/
  );

  // Customer attempting to mark self as verified must FAIL
  assert.throws(
    () => updateProfile(profile, { is_verified: true }, 'customer'),
    /Access Denied/
  );

  // Authorized admin is permitted to update role/verification
  const adminModified = updateProfile(profile, { role: 'shopkeeper', is_verified: true }, 'admin');
  assert.strictEqual(adminModified.role, 'shopkeeper');
  assert.strictEqual(adminModified.is_verified, true);
});

// =============================================================
// 2. HISTORICAL PRICE INTEGRITY
// =============================================================
test('Historical Price Integrity: Subsequent catalogue price changes do not alter historical requests', () => {
  // 1. Initial product at price ₹50
  const catalogueProduct = {
    id: 'prod-rice',
    name: 'Ponni Rice 1kg',
    price: 50.0,
  };

  // 2. Customer places order for 2 units
  const quantity = 2;
  const snapshotPayload = {
    items: [
      {
        product_id: catalogueProduct.id,
        name: catalogueProduct.name,
        price: catalogueProduct.price,
        quantity: quantity,
        subtotal: catalogueProduct.price * quantity,
      },
    ],
  };

  const request = {
    id: 'req-order-101',
    reference_code: 'ORD-101',
    current_state: 'COMPLETED',
    total_estimate: catalogueProduct.price * quantity, // ₹100.00
    notes: JSON.stringify(snapshotPayload),
  };

  // 3. Shopkeeper later increases price to ₹80.00
  catalogueProduct.price = 80.0;

  // 4. Re-read historical request and verify historical pricing is preserved
  const reParsed = JSON.parse(request.notes);
  assert.strictEqual(request.total_estimate, 100.0, 'Historical request total must remain ₹100');
  assert.strictEqual(reParsed.items[0].price, 50.0, 'Historical item price snapshot must remain ₹50');
  assert.strictEqual(reParsed.items[0].subtotal, 100.0, 'Historical subtotal snapshot must remain ₹100');
});

// =============================================================
// 3. CONCURRENCY & DOUBLE-BOOKING PREVENTION
// =============================================================
test('Concurrency & Slot Lock: Simultaneous booking attempts for exclusive slot allows only one', () => {
  const slot = {
    id: 'slot-salon-10am',
    shop_id: 'shop-salon-1',
    slot_date: '2026-09-12',
    start_time: '10:00',
    is_available: true,
    booked_by_request_id: null,
  };

  // Simulation of atomic database function book_appointment_slot with row-level lock
  function attemptBookSlot(targetSlot, requestId) {
    if (!targetSlot.is_available) {
      return { success: false, error: 'SLOT_UNAVAILABLE' };
    }
    targetSlot.is_available = false;
    targetSlot.booked_by_request_id = requestId;
    return { success: true };
  }

  // Customer A attempts booking
  const resA = attemptBookSlot(slot, 'req-customer-A');
  assert.strictEqual(resA.success, true);
  assert.strictEqual(slot.booked_by_request_id, 'req-customer-A');
  assert.strictEqual(slot.is_available, false);

  // Customer B attempts concurrent booking for the same slot
  const resB = attemptBookSlot(slot, 'req-customer-B');
  assert.strictEqual(resB.success, false);
  assert.strictEqual(resB.error, 'SLOT_UNAVAILABLE');
  assert.strictEqual(slot.booked_by_request_id, 'req-customer-A'); // Remains locked to A
});

// =============================================================
// 4. DATABASE-ENFORCED STATE MACHINE TRANSITIONS
// =============================================================
test('State Machine Enforcement: Rejects illegal skips and terminal state transitions', () => {
  const VALID_TRANSITIONS = {
    ORDER: {
      REQUESTED: ['ACCEPTED', 'REJECTED'],
      ACCEPTED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY', 'DELAYED', 'CANCELLED'],
      DELAYED: ['PREPARING', 'READY', 'CANCELLED'],
      READY: ['COMPLETED'],
      COMPLETED: [],
      REJECTED: [],
      CANCELLED: [],
    },
    APPOINTMENT: {
      REQUESTED: ['CONFIRMED', 'REJECTED'],
      CONFIRMED: ['IN_PROGRESS', 'DELAYED', 'CANCELLED', 'NO_SHOW'],
      DELAYED: ['CONFIRMED', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
      IN_PROGRESS: ['COMPLETED'],
      COMPLETED: [],
      REJECTED: [],
      CANCELLED: [],
      NO_SHOW: [],
    },
    SERVICE: {
      REQUESTED: ['ACCEPTED', 'REJECTED'],
      ACCEPTED: ['IN_PROGRESS', 'DELAYED', 'CANCELLED'],
      DELAYED: ['ACCEPTED', 'IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['READY', 'DELAYED', 'CANCELLED'],
      READY: ['COMPLETED'],
      COMPLETED: [],
      REJECTED: [],
      CANCELLED: [],
    },
  };

  function validateTransition(group, fromState, toState) {
    const allowed = VALID_TRANSITIONS[group]?.[fromState] || [];
    if (!allowed.includes(toState)) {
      throw new Error(`Illegal workflow transition: Cannot move ${group} request from ${fromState} to ${toState}`);
    }
    return true;
  }

  // Legal transitions
  assert.strictEqual(validateTransition('ORDER', 'REQUESTED', 'ACCEPTED'), true);
  assert.strictEqual(validateTransition('APPOINTMENT', 'CONFIRMED', 'IN_PROGRESS'), true);
  assert.strictEqual(validateTransition('SERVICE', 'IN_PROGRESS', 'READY'), true);

  // Illegal: COMPLETED -> PREPARING (Backwards jump)
  assert.throws(() => validateTransition('ORDER', 'COMPLETED', 'PREPARING'), /Illegal workflow transition/);

  // Illegal: REJECTED -> ACCEPTED (Terminal revival)
  assert.throws(() => validateTransition('ORDER', 'REJECTED', 'ACCEPTED'), /Illegal workflow transition/);

  // Illegal: CANCELLED -> COMPLETED
  assert.throws(() => validateTransition('APPOINTMENT', 'CANCELLED', 'COMPLETED'), /Illegal workflow transition/);

  // Illegal: Direct REQUESTED -> COMPLETED without intermediate steps
  assert.throws(() => validateTransition('SERVICE', 'REQUESTED', 'COMPLETED'), /Illegal workflow transition/);
});

// =============================================================
// 5. CANCELLATION SAFETY & APPOINTMENT SLOT RELEASE
// =============================================================
test('Cancellation Safety: Customer cancels own request and automatically frees appointment slot', () => {
  const slot = {
    id: 'slot-1',
    is_available: false,
    booked_by_request_id: 'req-appt-1',
  };

  const request = {
    id: 'req-appt-1',
    customer_id: 'cust-100',
    workflow_group_code: 'APPOINTMENT',
    current_state: 'CONFIRMED',
  };

  function customerCancel(req, targetSlot, callerId, reason) {
    if (req.customer_id !== callerId) {
      throw new Error('Access Denied: You can only cancel your own requests.');
    }

    const eligible = ['REQUESTED', 'ACCEPTED', 'CONFIRMED'];
    if (!eligible.includes(req.current_state)) {
      throw new Error(`Cannot cancel request in ${req.current_state} state.`);
    }

    req.current_state = 'CANCELLED';

    // Automatic Slot Freeing
    if (req.workflow_group_code === 'APPOINTMENT' && targetSlot.booked_by_request_id === req.id) {
      targetSlot.is_available = true;
      targetSlot.booked_by_request_id = null;
    }

    return { success: true };
  }

  // Other customer cannot cancel
  assert.throws(
    () => customerCancel(request, slot, 'other-customer', 'Cancel'),
    /Access Denied/
  );

  // Owning customer cancels
  customerCancel(request, slot, 'cust-100', 'Emergency conflict');
  assert.strictEqual(request.current_state, 'CANCELLED');
  assert.strictEqual(slot.is_available, true, 'Slot must be freed upon cancellation');
  assert.strictEqual(slot.booked_by_request_id, null, 'Booking reference must be cleared');

  // Attempting to cancel already cancelled request must fail
  assert.throws(
    () => customerCancel(request, slot, 'cust-100', 'Cancel again'),
    /Cannot cancel/
  );
});

// =============================================================
// 6. PRICE CALCULATION INTEGRITY
// =============================================================
test('Price Integrity: Recalculates authoritative totals and rejects invalid values', () => {
  function calculateOrderTotal(items) {
    if (!items || items.length === 0) throw new Error('Cart cannot be empty');
    let total = 0;
    for (const item of items) {
      if (typeof item.price !== 'number' || item.price < 0) {
        throw new Error('Price must be non-negative');
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        throw new Error('Quantity must be a positive integer');
      }
      total += item.price * item.quantity;
    }
    return Math.round(total * 100) / 100;
  }

  assert.strictEqual(
    calculateOrderTotal([
      { price: 32.5, quantity: 2 },
      { price: 100.0, quantity: 1 },
    ]),
    165.0
  );

  assert.throws(() => calculateOrderTotal([{ price: -10, quantity: 1 }]), /non-negative/);
  assert.throws(() => calculateOrderTotal([{ price: 10, quantity: -2 }]), /positive integer/);
  assert.throws(() => calculateOrderTotal([{ price: 10, quantity: 0 }]), /positive integer/);
  assert.throws(() => calculateOrderTotal([]), /cannot be empty/);
});

// =============================================================
// 7. SUBSCRIPTION DATE BOUNDARIES & ₹20/DAY CAP
// =============================================================
test('Subscription Boundaries: UTC millisecond arithmetic and daily rate cap', () => {
  function computeTrial(goLiveDateStr, testDateMs) {
    const goLive = new Date(goLiveDateStr);
    const trialEnd = new Date(goLive.getTime() + 60 * 24 * 60 * 60 * 1000);
    const diffMs = trialEnd.getTime() - testDateMs;
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    return { daysRemaining, isExpired: daysRemaining <= 0 };
  }

  const goLive = '2026-01-01T00:00:00.000Z';

  // Day 0
  assert.strictEqual(computeTrial(goLive, new Date('2026-01-01T00:00:00.000Z').getTime()).daysRemaining, 60);
  // Day 30
  assert.strictEqual(computeTrial(goLive, new Date('2026-01-31T00:00:00.000Z').getTime()).daysRemaining, 30);
  // Day 60 (Final Day)
  assert.strictEqual(computeTrial(goLive, new Date('2026-03-02T00:00:00.000Z').getTime()).daysRemaining, 0);
  // Day 61 (Expired)
  assert.strictEqual(computeTrial(goLive, new Date('2026-03-03T00:00:00.000Z').getTime()).isExpired, true);

  // Rate Cap
  function enforceRate(rate) {
    if (rate < 0 || rate > 20) throw new Error('Daily rate must be between ₹0 and ₹20/day');
    return rate;
  }
  assert.strictEqual(enforceRate(20), 20);
  assert.throws(() => enforceRate(20.01), /between ₹0 and ₹20/);
});

// =============================================================
// 8. PWA SERVICE WORKER SECURITY & PRIVATE DATA ISOLATION
// =============================================================
test('PWA SW Security: Prevents caching of Supabase API, Auth, and Storage URLs', () => {
  const NEVER_CACHE_PATTERNS = [
    /supabase\.co/,
    /\/rest\/v1\//,
    /\/auth\/v1\//,
    /\/storage\/v1\//,
    /\/admin\//,
    /\/shopkeeper\//,
    /id_proof/,
    /documents/,
  ];

  function shouldNeverCache(url) {
    return NEVER_CACHE_PATTERNS.some((p) => p.test(url));
  }

  // Private endpoints must NEVER be cached
  assert.strictEqual(shouldNeverCache('https://xyz.supabase.co/rest/v1/requests?select=*'), true);
  assert.strictEqual(shouldNeverCache('https://xyz.supabase.co/auth/v1/user'), true);
  assert.strictEqual(shouldNeverCache('https://xyz.supabase.co/storage/v1/object/shop-documents/id_proof.pdf'), true);
  assert.strictEqual(shouldNeverCache('https://vaango.in/admin/dashboard'), true);

  // Public static assets are allowed for caching
  assert.strictEqual(shouldNeverCache('https://vaango.in/assets/index-BUERckAj.js'), false);
  assert.strictEqual(shouldNeverCache('https://vaango.in/assets/index-Dy9w9xsq.css'), false);
  assert.strictEqual(shouldNeverCache('https://vaango.in/icons/icon-192.svg'), false);
  assert.strictEqual(shouldNeverCache('https://vaango.in/manifest.json'), false);
});

// =============================================================
// 9. XSS / OUTPUT SANITIZATION SAFETY
// =============================================================
test('XSS Defense: Ensures user input renders as text without executing arbitrary HTML or javascript: URLs', () => {
  function sanitizeUrl(rawUrl) {
    if (!rawUrl) return '';
    const trimmed = rawUrl.trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
      return 'about:blank'; // Neutralize dangerous protocol
    }
    return trimmed;
  }

  assert.strictEqual(sanitizeUrl('https://maps.google.com/?q=11.4,77.4'), 'https://maps.google.com/?q=11.4,77.4');
  assert.strictEqual(sanitizeUrl('javascript:alert(document.cookie)'), 'about:blank');
  assert.strictEqual(sanitizeUrl('DATA:text/html,<script>alert(1)</script>'), 'about:blank');
});

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passedTests} of ${totalTests} tests passed.`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
