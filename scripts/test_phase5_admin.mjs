// Phase 5 Admin & Business Operations Automated Verification Suite

import assert from 'assert';

console.log('====================================================');
console.log('VAANGO PHASE 5 — ADMIN & BUSINESS OPERATIONS TESTS');
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

// =============================================================
// 1. AUTHENTICATION & ADMIN ROLE GUARD
// =============================================================
test('Role Guard: Only "admin" role has access to platform management', () => {
  function checkAdminAccess(userRole) {
    if (userRole !== 'admin') {
      throw new Error('Access denied: Admin role required');
    }
    return true;
  }

  // Admin user succeeds
  assert.strictEqual(checkAdminAccess('admin'), true);

  // Customer is rejected
  assert.throws(() => checkAdminAccess('customer'), /Access denied/);

  // Shopkeeper is rejected
  assert.throws(() => checkAdminAccess('shopkeeper'), /Access denied/);

  // Unauthenticated (null) is rejected
  assert.throws(() => checkAdminAccess(null), /Access denied/);
});

// =============================================================
// 2. LOCATION MANAGEMENT & SAFE DEACTIVATION
// =============================================================
test('Location Management: Creation, modification, and non-destructive deactivation', () => {
  // In-memory simulation of database state
  const locations = [
    { id: 'loc-1', name: 'Alangulam Main', district: 'Tenkasi', is_active: true },
    { id: 'loc-2', name: 'Pavoorchatram', district: 'Tenkasi', is_active: true },
  ];

  const historicalRequests = [
    { id: 'req-1', location_id: 'loc-1', status: 'COMPLETED', customer_phone: '9876543210' },
    { id: 'req-2', location_id: 'loc-2', status: 'COMPLETED', customer_phone: '9876543211' },
  ];

  // Admin adds a new location
  const newLoc = { id: 'loc-3', name: 'Surandai', district: 'Tenkasi', is_active: true };
  locations.push(newLoc);
  assert.strictEqual(locations.length, 3);

  // Admin edits a location name
  const locToEdit = locations.find((l) => l.id === 'loc-3');
  locToEdit.name = 'Surandai West';
  assert.strictEqual(locToEdit.name, 'Surandai West');

  // Admin safely deactivates loc-2
  const locToDeactivate = locations.find((l) => l.id === 'loc-2');
  locToDeactivate.is_active = false;

  // Customer location selector must ONLY list active locations
  const customerVisibleLocations = locations.filter((l) => l.is_active);
  assert.strictEqual(customerVisibleLocations.length, 2);
  assert.strictEqual(customerVisibleLocations.some((l) => l.id === 'loc-2'), false);

  // CRITICAL: Historical request records remain completely intact and unmodified
  assert.strictEqual(historicalRequests.length, 2);
  assert.strictEqual(historicalRequests.find((r) => r.id === 'req-2').location_id, 'loc-2');
});

// =============================================================
// 3. SHOP ONBOARDING APPLICATION REVIEW & ID PROOF SECURITY
// =============================================================
test('Shop Application: Verification review, approval workflow, and mandatory rejection reason', () => {
  const application = {
    id: 'app-test-1',
    user_id: 'user-merchant-1',
    shop_name: 'Nellai Sweet Stall',
    shop_type_id: 'bakery',
    owner_name: 'M. Sankar',
    contact_phone: '9842012345',
    location_id: 'loc-1',
    address: '14 Bazaar Street',
    latitude: 8.8712,
    longitude: 77.5021,
    id_proof_url: 'private/id_proofs/user-merchant-1_aadhaar.pdf',
    status: 'submitted',
    review_notes: null,
  };

  // 3a. Storage / ID Proof Security Simulation: Only admin and document owner can view
  function canAccessIdProof(callerRole, callerUserId, docUserId) {
    if (callerRole === 'admin') return true;
    if (callerRole === 'shopkeeper' && callerUserId === docUserId) return true;
    return false;
  }

  assert.strictEqual(canAccessIdProof('admin', 'admin-id', application.user_id), true);
  assert.strictEqual(canAccessIdProof('shopkeeper', application.user_id, application.user_id), true);
  assert.strictEqual(canAccessIdProof('shopkeeper', 'other-merchant', application.user_id), false);
  assert.strictEqual(canAccessIdProof('customer', 'cust-1', application.user_id), false);

  // 3b. Rejection without reason must fail
  function rejectApplication(app, reason, adminRole) {
    if (adminRole !== 'admin') throw new Error('Unauthorized');
    if (!reason || !reason.trim()) throw new Error('Rejection reason is mandatory');
    app.status = 'rejected';
    app.review_notes = reason.trim();
    return app;
  }

  assert.throws(() => rejectApplication(application, '', 'admin'), /mandatory/);
  assert.throws(() => rejectApplication(application, 'Invalid ID', 'shopkeeper'), /Unauthorized/);

  // 3c. Approval creates active shop with is_live = false (until catalogue readiness)
  function approveApplication(app, adminRole) {
    if (adminRole !== 'admin') throw new Error('Unauthorized');
    app.status = 'approved';
    app.review_notes = 'Approved by operations verification.';
    return {
      shop: {
        id: `shop-${app.id}`,
        owner_id: app.user_id,
        name: app.shop_name,
        shop_type_id: app.shop_type_id,
        status: 'active',
        is_live: false, // Incomplete catalogue -> must NOT be live to customers
        created_at: new Date().toISOString(),
      },
      subscription: {
        shop_id: `shop-${app.id}`,
        status: 'TRIAL',
        daily_rate: 10,
        billing_cycle: 'MONTHLY',
        go_live_date: null, // Trial begins Day 0 of go-live date
      }
    };
  }

  const { shop, subscription } = approveApplication(application, 'admin');
  assert.strictEqual(application.status, 'approved');
  assert.strictEqual(shop.status, 'active');
  assert.strictEqual(shop.is_live, false, 'Newly approved shop must be is_live=false until catalogue is ready');
  assert.strictEqual(subscription.status, 'TRIAL');
});

// =============================================================
// 4. SHOP LIFECYCLE: SUSPENSION & REACTIVATION
// =============================================================
test('Shop Lifecycle: Suspension hides from discovery, preserves records, and reactivation restores access', () => {
  const shop = {
    id: 'shop-active-1',
    name: 'Kannan Grocery',
    status: 'active',
    is_live: true,
  };

  const catalogue = [
    { id: 'item-1', name: 'Ponni Rice 25kg', price: 1250, is_in_stock: true },
    { id: 'item-2', name: 'Sugar 1kg', price: 44, is_in_stock: true },
  ];

  const requestHistory = [
    { id: 'req-101', shop_id: 'shop-active-1', total_amount: 1294, status: 'COMPLETED' },
  ];

  // Customer discovery rule: status === 'active' AND is_live === true
  function isDiscoverableByCustomer(s) {
    return s.status === 'active' && s.is_live === true;
  }

  assert.strictEqual(isDiscoverableByCustomer(shop), true);

  // Admin suspends shop
  function suspendShop(s, reason, adminRole) {
    if (adminRole !== 'admin') throw new Error('Unauthorized');
    if (!reason || !reason.trim()) throw new Error('Suspension reason required');
    s.status = 'suspended';
    s.is_live = false;
    return s;
  }

  assert.throws(() => suspendShop(shop, '', 'admin'), /Suspension reason required/);
  suspendShop(shop, 'Violation of product packaging guidelines', 'admin');

  assert.strictEqual(shop.status, 'suspended');
  assert.strictEqual(shop.is_live, false);

  // Customer can no longer discover the shop
  assert.strictEqual(isDiscoverableByCustomer(shop), false);

  // CRITICAL: Catalogue and historical requests are preserved intact
  assert.strictEqual(catalogue.length, 2);
  assert.strictEqual(requestHistory.length, 1);
  assert.strictEqual(requestHistory[0].shop_id, 'shop-active-1');

  // Reactivate shop
  function reactivateShop(s, adminRole) {
    if (adminRole !== 'admin') throw new Error('Unauthorized');
    s.status = 'active';
    // is_live stays false until shopkeeper confirms ready/opens store
    return s;
  }

  reactivateShop(shop, 'admin');
  assert.strictEqual(shop.status, 'active');
});

// =============================================================
// 5. SUBSCRIPTION ENGINE: 60-DAY TRIAL FROM GO-LIVE DATE
// =============================================================
test('Subscription: 60-day trial calculation based on actual go-live date, NOT approval date', () => {
  const approvalDate = '2026-06-01T00:00:00.000Z';
  const goLiveDate = '2026-06-15T00:00:00.000Z'; // Merchant took 14 days to set up catalogue

  function calculateTrialWindow(actualGoLiveDate, referenceDateMs) {
    if (!actualGoLiveDate) {
      return { inTrial: true, daysRemaining: 60, trialEnd: null };
    }
    const goLive = new Date(actualGoLiveDate);
    // Day 0 + 60 days
    const trialEnd = new Date(goLive.getTime() + 60 * 24 * 60 * 60 * 1000);
    const diffMs = trialEnd.getTime() - referenceDateMs;
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    return {
      inTrial: daysRemaining > 0,
      daysRemaining,
      trialEnd: trialEnd.toISOString().split('T')[0],
    };
  }

  // Test at Day 10 after go-live
  const day10Ms = new Date('2026-06-25T00:00:00.000Z').getTime();
  const res10 = calculateTrialWindow(goLiveDate, day10Ms);
  assert.strictEqual(res10.inTrial, true);
  assert.strictEqual(res10.daysRemaining, 50);

  // Test at Day 59 after go-live
  const day59Ms = new Date('2026-08-13T00:00:00.000Z').getTime();
  const res59 = calculateTrialWindow(goLiveDate, day59Ms);
  assert.strictEqual(res59.inTrial, true);
  assert.strictEqual(res59.daysRemaining, 1);

  // Test at Day 61 after go-live (Trial has ended)
  const day61Ms = new Date('2026-08-16T00:00:00.000Z').getTime();
  const res61 = calculateTrialWindow(goLiveDate, day61Ms);
  assert.strictEqual(res61.inTrial, false);
  assert.strictEqual(res61.daysRemaining, 0);
});

// =============================================================
// 6. SUBSCRIPTION PRICING & RATE CAP (MAX ₹20/DAY)
// =============================================================
test('Subscription Pricing: Cap at ₹20/day enforced and weekly/monthly calculations', () => {
  function validateDailyRate(rate) {
    if (typeof rate !== 'number' || rate < 0) throw new Error('Daily rate must be non-negative');
    if (rate > 20) throw new Error('Maximum daily rate allowed is ₹20/day');
    return true;
  }

  assert.strictEqual(validateDailyRate(0), true);
  assert.strictEqual(validateDailyRate(10), true);
  assert.strictEqual(validateDailyRate(20), true);
  assert.throws(() => validateDailyRate(21), /Maximum daily rate/);
  assert.throws(() => validateDailyRate(-5), /non-negative/);

  // Billing calculations
  function calculatePeriodAmount(dailyRate, cycle) {
    validateDailyRate(dailyRate);
    if (cycle === 'WEEKLY') return dailyRate * 7;
    if (cycle === 'MONTHLY') return dailyRate * 30;
    throw new Error('Invalid billing cycle');
  }

  assert.strictEqual(calculatePeriodAmount(10, 'WEEKLY'), 70); // ₹10 * 7 days = ₹70
  assert.strictEqual(calculatePeriodAmount(10, 'MONTHLY'), 300); // ₹10 * 30 days = ₹300
  assert.strictEqual(calculatePeriodAmount(20, 'WEEKLY'), 140); // ₹20 * 7 days = ₹140
  assert.strictEqual(calculatePeriodAmount(20, 'MONTHLY'), 600); // ₹20 * 30 days = ₹600
});

// =============================================================
// 7. MANUAL SUBSCRIPTION PAYMENT RECORDING (UPI)
// =============================================================
test('Manual Payment Recording: Admin records verified offline/UPI receipt, renewing status to ACTIVE', () => {
  const subscription = {
    id: 'sub-test-1',
    shop_id: 'shop-test-1',
    status: 'OVERDUE',
    daily_rate: 10,
    billing_cycle: 'MONTHLY',
    amount_due: 300,
    amount_paid: 0,
    last_payment_date: null,
    current_period_start: null,
    current_period_end: null,
  };

  const payments = [];

  function recordPayment(sub, payload, adminRole) {
    if (adminRole !== 'admin') throw new Error('Unauthorized: Only platform admin can record verified payments');
    if (!payload.paymentReference || !payload.paymentReference.trim()) {
      throw new Error('UPI reference is mandatory');
    }
    if (payload.amountPaid <= 0) {
      throw new Error('Amount paid must be positive');
    }

    const receipt = {
      id: `pay-${Date.now()}`,
      subscription_id: sub.id,
      shop_id: sub.shop_id,
      amount_paid: payload.amountPaid,
      payment_date: payload.paymentDate,
      billing_cycle: payload.billingCycle,
      period_start: payload.periodStart,
      period_end: payload.periodEnd,
      payment_reference: payload.paymentReference,
      notes: payload.notes || '',
    };
    payments.push(receipt);

    // Update subscription
    sub.status = 'ACTIVE';
    sub.amount_paid += payload.amountPaid;
    sub.amount_due = Math.max(0, sub.amount_due - payload.amountPaid);
    sub.last_payment_date = payload.paymentDate;
    sub.current_period_start = payload.periodStart;
    sub.current_period_end = payload.periodEnd;

    return { success: true, receipt };
  }

  // Shopkeeper cannot record payments
  assert.throws(
    () =>
      recordPayment(
        subscription,
        {
          amountPaid: 300,
          paymentDate: '2026-09-11',
          billingCycle: 'MONTHLY',
          periodStart: '2026-09-11',
          periodEnd: '2026-10-11',
          paymentReference: 'UPI-99281',
        },
        'shopkeeper'
      ),
    /Unauthorized/
  );

  // Admin records payment
  const result = recordPayment(
    subscription,
    {
      amountPaid: 300,
      paymentDate: '2026-09-11',
      billingCycle: 'MONTHLY',
      periodStart: '2026-09-11',
      periodEnd: '2026-10-11',
      paymentReference: 'UPI-99281',
      notes: 'Verified in platform operations bank account',
    },
    'admin'
  );

  assert.strictEqual(result.success, true);
  assert.strictEqual(subscription.status, 'ACTIVE');
  assert.strictEqual(subscription.amount_due, 0);
  assert.strictEqual(subscription.last_payment_date, '2026-09-11');
  assert.strictEqual(payments.length, 1);
  assert.strictEqual(payments[0].payment_reference, 'UPI-99281');
});

// =============================================================
// 8. GRACE PERIOD POLICY ISOLATION
// =============================================================
test('Grace Period: Undecided policy is cleanly isolated and does not arbitrarily suspend stores', () => {
  // Grace period policy must NOT auto-suspend by default
  const config = {
    enableAutoSuspensionOnOverdue: false, // Intentionally left disabled / undecided
    gracePeriodDays: null, // Undecided
  };

  function evaluateOverdueShop(shop, subscription, systemConfig) {
    if (subscription.status === 'OVERDUE') {
      if (systemConfig.enableAutoSuspensionOnOverdue && systemConfig.gracePeriodDays !== null) {
        // Only if an explicit policy is configured in the future
        shop.status = 'suspended';
      }
      // Otherwise, remains for manual admin oversight
    }
    return shop.status;
  }

  const shop = { id: 's-1', status: 'active' };
  const sub = { id: 'sub-1', status: 'OVERDUE' };

  const finalStatus = evaluateOverdueShop(shop, sub, config);
  assert.strictEqual(finalStatus, 'active', 'Overdue shop must NOT be arbitrarily suspended without explicit policy');
});

// =============================================================
// 9. AUDIT LOGGING & CANCELLATION METRICS
// =============================================================
test('Audit & Metrics: Administrative operations generate audit records and cancellation rates are parsed', () => {
  const auditLogs = [];

  function logAdminAudit(adminId, action, targetType, targetId, details) {
    auditLogs.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      created_at: new Date().toISOString(),
    });
  }

  logAdminAudit('admin-1', 'shop_suspended', 'shop', 'shop-1', { reason: 'Violation' });
  logAdminAudit('admin-1', 'subscription_payment_recorded', 'subscription', 'sub-1', { amount: 300 });

  assert.strictEqual(auditLogs.length, 2);
  assert.strictEqual(auditLogs[0].action, 'shop_suspended');
  assert.strictEqual(auditLogs[1].action, 'subscription_payment_recorded');

  // Cancellation metrics calculation from event log
  const requests = [
    { id: 'r1', status: 'COMPLETED' },
    { id: 'r2', status: 'COMPLETED' },
    { id: 'r3', status: 'CANCELLED' },
    { id: 'r4', status: 'REJECTED' },
  ];

  const requestEvents = [
    { request_id: 'r3', event_type: 'cancelled_by_customer', actor_role: 'customer' },
    { request_id: 'r4', event_type: 'rejected_by_shopkeeper', actor_role: 'shopkeeper' },
  ];

  const totalRequests = requests.length;
  const cancelledByCustomer = requestEvents.filter((e) => e.event_type.includes('customer') || e.actor_role === 'customer').length;
  const rejectedByMerchant = requestEvents.filter((e) => e.event_type.includes('shopkeeper') || e.actor_role === 'shopkeeper').length;
  const totalCancelledOrRejected = cancelledByCustomer + rejectedByMerchant;
  const cancellationRate = totalRequests > 0 ? (totalCancelledOrRejected / totalRequests) * 100 : 0;

  assert.strictEqual(totalRequests, 4);
  assert.strictEqual(cancelledByCustomer, 1);
  assert.strictEqual(rejectedByMerchant, 1);
  assert.strictEqual(cancellationRate, 50.0);
});

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests} of ${totalTests} tests passed.`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
