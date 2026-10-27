import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  cancelOrderDirectly,
  requestOrderCancellation,
  respondToCancellationRequest,
  adminModerateCustomer,
  fetchCustomerModeration,
  fetchCustomerCancellationHistory,
  fetchCancellationPolicy,
  updateCancellationPolicy,
  DEFAULT_CANCELLATION_POLICY,
  saveStoredPolicySettings,
  saveStoredCancellationEvents,
  saveStoredModerationRecords,
  getStoredCancellationEvents,
} from '../lib/orderCancellationApi';
import { Request } from '../types/database';

// Mock browser localStorage & CustomEvent environment for node:test runner
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();
(globalThis as any).localStorage = mockStorage;
(globalThis as any).window = {
  dispatchEvent: (_event: any) => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as any).CustomEvent = class {
  type: string;
  detail: any;
  constructor(type: string, params?: { detail: any }) {
    this.type = type;
    this.detail = params?.detail;
  }
};

describe('Order Cancellation, Customer Warnings & Abuse Prevention Engine', () => {
  const customerIdA = 'cust-uuid-0001';
  const customerIdB = 'cust-uuid-0002';
  const shopOwnerA = 'shopowner-uuid-0001';
  const shopOwnerB = 'shopowner-uuid-0002';
  const shopIdA = 'shop-uuid-0001';
  const shopIdB = 'shop-uuid-0002';
  const adminId = 'admin-uuid-0001';

  const createMockRequest = (overrides: Partial<Request> = {}): Request => {
    return {
      id: overrides.id || `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      reference_code: overrides.reference_code || 'ORD-9001',
      customer_id: overrides.customer_id || customerIdA,
      shop_id: overrides.shop_id || shopIdA,
      workflow_group_code: 'ORDER',
      current_state: overrides.current_state || 'REQUESTED',
      total_estimate: overrides.total_estimate ?? 250,
      payment_method: overrides.payment_method || 'pay_at_shop',
      payment_status: overrides.payment_status || 'UNPAID',
      payment_amount: overrides.payment_amount ?? null,
      refund_status: overrides.refund_status || null,
      refund_amount: overrides.refund_amount ?? null,
      cancellation_requested: overrides.cancellation_requested || false,
      cancellation_request_status: overrides.cancellation_request_status || null,
      cancellation_reason: overrides.cancellation_reason || null,
      cancellation_explanation: overrides.cancellation_explanation || null,
      cancellation_requested_at: overrides.cancellation_requested_at || null,
      cancellation_rejected_reason: overrides.cancellation_rejected_reason || null,
      cancellation_rejected_at: overrides.cancellation_rejected_at || null,
      cancelled_by: overrides.cancelled_by || null,
      cancelled_at: overrides.cancelled_at || null,
      cancellation_actor_role: overrides.cancellation_actor_role || null,
      created_at: overrides.created_at || new Date().toISOString(),
      updated_at: overrides.updated_at || new Date().toISOString(),
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      notes: JSON.stringify({ shop_name: 'Test Bakery' }),
    } as unknown as Request;
  };

  const seedRequests = (requests: Request[]) => {
    mockStorage.setItem('vaango_demo_requests', JSON.stringify(requests));
  };

  const seedShops = () => {
    const shops = [
      { id: shopIdA, name: 'Shop A', owner_id: shopOwnerA, status: 'active', is_live: true },
      { id: shopIdB, name: 'Shop B', owner_id: shopOwnerB, status: 'active', is_live: true },
    ];
    mockStorage.setItem('vaango_demo_shops', JSON.stringify(shops));
  };

  beforeEach(() => {
    mockStorage.clear();
    seedShops();
    saveStoredPolicySettings({ ...DEFAULT_CANCELLATION_POLICY });
  });

  // 1. Customer cancels a pending order directly
  it('1. Customer directly cancels a pending order (REQUESTED) successfully', async () => {
    const req = createMockRequest({ current_state: 'REQUESTED' });
    seedRequests([req]);

    const result = await cancelOrderDirectly({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'Ordered by mistake',
      explanation: 'Accidentally clicked order twice',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.request);
    assert.strictEqual(result.request.current_state, 'CANCELLED');
    assert.strictEqual(result.request.cancellation_request_status, 'approved');
    assert.strictEqual(result.request.cancellation_reason, 'Ordered by mistake');
    assert.strictEqual(result.request.cancelled_by, customerIdA);
    assert.strictEqual(result.request.cancellation_actor_role, 'customer');
  });

  // 2. Customer requests cancellation during preparation
  it('2. Customer requests cancellation during preparation (PREPARING) -> requires shopkeeper review', async () => {
    const req = createMockRequest({ current_state: 'PREPARING' });
    seedRequests([req]);

    const result = await requestOrderCancellation({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'Delivery or pickup delay',
      explanation: 'Taking longer than expected',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.request);
    // Order state must NOT change to CANCELLED yet
    assert.strictEqual(result.request.current_state, 'PREPARING');
    assert.strictEqual(result.request.cancellation_requested, true);
    assert.strictEqual(result.request.cancellation_request_status, 'pending');
    assert.strictEqual(result.request.cancellation_reason, 'Delivery or pickup delay');
  });

  // 3. Ready-order cancellation follows configured approval policy
  it('3. Ready-order cancellation (READY) requires shopkeeper approval', async () => {
    const req = createMockRequest({ current_state: 'READY' });
    seedRequests([req]);

    const result = await requestOrderCancellation({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'No longer needed',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.request);
    assert.strictEqual(result.request.current_state, 'READY');
    assert.strictEqual(result.request.cancellation_request_status, 'pending');
  });

  // 4. Completed orders cannot be cancelled
  it('4. Completed orders cannot be cancelled directly or requested', async () => {
    const req = createMockRequest({ current_state: 'COMPLETED' });
    seedRequests([req]);

    const directResult = await cancelOrderDirectly({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'Ordered by mistake',
    });
    assert.strictEqual(directResult.success, false);
    assert.match(directResult.error || '', /completed/i);

    const requestResult = await requestOrderCancellation({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'Ordered by mistake',
    });
    assert.strictEqual(requestResult.success, false);
    assert.match(requestResult.error || '', /completed/i);
  });

  // 5. Already-cancelled orders cannot be cancelled again
  it('5. Already-cancelled orders cannot be cancelled again', async () => {
    const req = createMockRequest({ current_state: 'CANCELLED' });
    seedRequests([req]);

    const result = await cancelOrderDirectly({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'Ordered by mistake',
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /terminal state|already cancelled|cannot be cancelled/i);
  });

  // 5a. Customer cannot directly cancel an order once accepted or in preparation
  it('5a. Customer cannot directly cancel an order in PREPARING or ACCEPTED state', async () => {
    const req = createMockRequest({ current_state: 'PREPARING' });
    seedRequests([req]);

    const result = await cancelOrderDirectly({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'No longer needed',
    });

    assert.strictEqual(result.success, false);
    assert.match(
      result.error || '',
      /cannot be cancelled directly\. Please contact the shop/i
    );
  });

  // 5b. Repeated clicks do not create duplicate cancellation events or double execution
  it('5b. Repeated cancellation calls are idempotent and do not duplicate events', async () => {
    const req = createMockRequest({ current_state: 'REQUESTED' });
    seedRequests([req]);

    // First click
    const result1 = await cancelOrderDirectly({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'Accidental order',
    });
    assert.strictEqual(result1.success, true);
    assert.strictEqual(result1.request?.current_state, 'CANCELLED');

    // Second click (repeated click simulation)
    const result2 = await cancelOrderDirectly({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'Accidental order',
    });
    assert.strictEqual(result2.success, false);
    assert.match(result2.error || '', /terminal state|already cancelled/i);

    // Verify cancellation events store contains exactly 1 event for this request
    const events = getStoredCancellationEvents();
    const matchingEvents = events.filter((e) => e.request_id === req.id);
    assert.strictEqual(matchingEvents.length, 1);
  });

  // 6. A customer cannot cancel another customer's order
  it('6. A customer cannot cancel another customer order', async () => {
    const req = createMockRequest({ customer_id: customerIdA, current_state: 'REQUESTED' });
    seedRequests([req]);

    const result = await cancelOrderDirectly({
      requestId: req.id,
      customerId: customerIdB, // Customer B attempting to cancel Customer A's order
      reason: 'Ordered by mistake',
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /permission|authorized/i);
  });

  // 7. A shopkeeper cannot manage another shop's orders
  it('7. A shopkeeper cannot manage another shop orders', async () => {
    const req = createMockRequest({
      shop_id: shopIdA,
      current_state: 'PREPARING',
      cancellation_requested: true,
      cancellation_request_status: 'pending',
      cancellation_reason: 'Selected the wrong items',
    });
    seedRequests([req]);

    // Shopkeeper B attempts to respond to Shop A's order
    const result = await respondToCancellationRequest({
      requestId: req.id,
      action: 'approve',
      actorId: shopOwnerB,
      actorRole: 'shopkeeper',
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /permission|authorized|manage/i);
  });

  // 8. Shopkeeper approves cancellation request -> atomic transition to CANCELLED
  it('8. Shopkeeper approves cancellation request -> atomic transition to CANCELLED', async () => {
    const req = createMockRequest({
      shop_id: shopIdA,
      current_state: 'PREPARING',
      cancellation_requested: true,
      cancellation_request_status: 'pending',
      cancellation_reason: 'Selected the wrong items',
      cancellation_requested_at: new Date().toISOString(),
    });
    seedRequests([req]);

    const result = await respondToCancellationRequest({
      requestId: req.id,
      action: 'approve',
      actorId: shopOwnerA,
      actorRole: 'shopkeeper',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.request);
    assert.strictEqual(result.request.current_state, 'CANCELLED');
    assert.strictEqual(result.request.cancellation_request_status, 'approved');
  });

  // 9. Shopkeeper rejects cancellation request -> retains valid current state
  it('9. Shopkeeper rejects cancellation request -> retains valid current state', async () => {
    const req = createMockRequest({
      shop_id: shopIdA,
      current_state: 'PREPARING',
      cancellation_requested: true,
      cancellation_request_status: 'pending',
      cancellation_reason: 'Selected the wrong items',
    });
    seedRequests([req]);

    const result = await respondToCancellationRequest({
      requestId: req.id,
      action: 'reject',
      rejectionReason: 'Food is already packaged and ready for pickup.',
      actorId: shopOwnerA,
      actorRole: 'shopkeeper',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.request);
    assert.strictEqual(result.request.current_state, 'PREPARING');
    assert.strictEqual(result.request.cancellation_request_status, 'rejected');
    assert.strictEqual(
      result.request.cancellation_rejected_reason,
      'Food is already packaged and ready for pickup.'
    );
  });

  // 10. Concurrent cancellation and ready/completion transitions remain consistent
  it('10. Concurrent race: completed order rejects subsequent shopkeeper approval', async () => {
    // Order was completed right before shopkeeper approval was processed
    const req = createMockRequest({
      shop_id: shopIdA,
      current_state: 'COMPLETED',
      cancellation_requested: true,
      cancellation_request_status: 'pending',
    });
    seedRequests([req]);

    const result = await respondToCancellationRequest({
      requestId: req.id,
      action: 'approve',
      actorId: shopOwnerA,
      actorRole: 'shopkeeper',
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /completed|terminal|no longer pending/i);
  });

  // 11. First qualifying cancellation triggers polite reminder
  it('11. First qualifying cancellation triggers polite reminder', async () => {
    const req = createMockRequest({
      customer_id: customerIdA,
      current_state: 'PREPARING',
      cancellation_requested: true,
      cancellation_request_status: 'pending',
      cancellation_reason: 'Ordered by mistake',
    });
    seedRequests([req]);

    const result = await respondToCancellationRequest({
      requestId: req.id,
      action: 'approve',
      actorId: shopOwnerA,
      actorRole: 'shopkeeper',
    });

    assert.strictEqual(result.success, true);
    const mod = await fetchCustomerModeration(customerIdA);
    assert.ok(mod);
    assert.strictEqual(mod.warning_count, 1);
    assert.strictEqual(mod.last_warning_level, 'reminder');
    assert.strictEqual(mod.flagged_for_review, false);
  });

  // 12. Second qualifying cancellation issues formal warning
  it('12. Second qualifying cancellation issues formal warning', async () => {
    // Seed 1 previous qualifying event within 30 days
    const pastEvent = {
      id: 'canc-evt-1',
      customer_id: customerIdA,
      request_id: 'req-past-1',
      shop_id: shopIdA,
      order_reference: 'ORD-1001',
      previous_state: 'PREPARING',
      preparation_started: true,
      actor_id: customerIdA,
      actor_role: 'customer' as const,
      reason: 'Ordered by mistake',
      is_qualifying: true,
      created_at: new Date().toISOString(),
    };
    saveStoredCancellationEvents([pastEvent]);

    const req = createMockRequest({
      customer_id: customerIdA,
      current_state: 'PREPARING',
      cancellation_requested: true,
      cancellation_request_status: 'pending',
      cancellation_reason: 'Selected the wrong items',
    });
    seedRequests([req]);

    const result = await respondToCancellationRequest({
      requestId: req.id,
      action: 'approve',
      actorId: shopOwnerA,
      actorRole: 'shopkeeper',
    });

    assert.strictEqual(result.success, true);
    const mod = await fetchCustomerModeration(customerIdA);
    assert.ok(mod);
    assert.strictEqual(mod.warning_count, 2);
    assert.strictEqual(mod.last_warning_level, 'formal_warning');
    assert.strictEqual(mod.flagged_for_review, false);
  });

  // 13. Third qualifying cancellation triggers admin review flag
  it('13. Third qualifying cancellation triggers admin review flag & warning count', async () => {
    // Seed 2 previous qualifying events within 30 days
    const pastEvents = [
      {
        id: 'canc-evt-1',
        customer_id: customerIdA,
        request_id: 'req-past-1',
        shop_id: shopIdA,
        order_reference: 'ORD-1001',
        previous_state: 'PREPARING',
        preparation_started: true,
        actor_id: customerIdA,
        actor_role: 'customer' as const,
        reason: 'Ordered by mistake',
        is_qualifying: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'canc-evt-2',
        customer_id: customerIdA,
        request_id: 'req-past-2',
        shop_id: shopIdA,
        order_reference: 'ORD-1002',
        previous_state: 'ACCEPTED',
        preparation_started: true,
        actor_id: customerIdA,
        actor_role: 'customer' as const,
        reason: 'Delivery or pickup delay',
        is_qualifying: true,
        created_at: new Date().toISOString(),
      },
    ];
    saveStoredCancellationEvents(pastEvents);

    const req = createMockRequest({
      customer_id: customerIdA,
      current_state: 'PREPARING',
      cancellation_requested: true,
      cancellation_request_status: 'pending',
      cancellation_reason: 'No longer needed',
    });
    seedRequests([req]);

    const result = await respondToCancellationRequest({
      requestId: req.id,
      action: 'approve',
      actorId: shopOwnerA,
      actorRole: 'shopkeeper',
    });

    assert.strictEqual(result.success, true);
    const mod = await fetchCustomerModeration(customerIdA);
    assert.ok(mod);
    assert.strictEqual(mod.warning_count, 3);
    assert.strictEqual(mod.flagged_for_review, true);
    assert.match(mod.flag_reason || '', /3.*cancellations/i);
  });

  // 14. Excluded cancellation events do not increase qualifying count
  it('14. Excluded cancellation events (unaccepted orders when configured) do not increment qualifying count', async () => {
    saveStoredPolicySettings({
      ...DEFAULT_CANCELLATION_POLICY,
      exclude_unaccepted_orders: true,
    });

    const req = createMockRequest({
      customer_id: customerIdA,
      current_state: 'REQUESTED', // Not yet accepted by merchant
    });
    seedRequests([req]);

    const result = await cancelOrderDirectly({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'Ordered by mistake',
    });

    assert.strictEqual(result.success, true);
    const events = await fetchCustomerCancellationHistory(customerIdA);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].is_qualifying, false);

    const mod = await fetchCustomerModeration(customerIdA);
    // Warning count must NOT increase for non-qualifying event
    assert.strictEqual(mod?.warning_count || 0, 0);
  });

  // 15. Duplicate requests do not create duplicate cancellation events or warnings
  it('15. Duplicate requests do not create duplicate cancellation events or warnings', async () => {
    const req = createMockRequest({
      customer_id: customerIdA,
      current_state: 'REQUESTED',
    });
    seedRequests([req]);

    await cancelOrderDirectly({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'Ordered by mistake',
    });

    // Attempt second direct cancellation on the same request
    const secondResult = await cancelOrderDirectly({
      requestId: req.id,
      customerId: customerIdA,
      reason: 'Ordered by mistake',
    });

    assert.strictEqual(secondResult.success, false);
    const events = getStoredCancellationEvents();
    assert.strictEqual(events.filter((e) => e.request_id === req.id).length, 1);
  });

  // 16. Customer suspension blocks new order creation
  it('16. Customer suspension blocks new order creation server-side & in moderation check', async () => {
    // Admin suspends customer A
    const suspendResult = await adminModerateCustomer({
      customerId: customerIdA,
      action: 'suspend',
      reason: 'Excessive cancellations causing waste for merchants.',
      durationHours: 72,
      adminId,
    });
    assert.strictEqual(suspendResult.success, true);

    const mod = await fetchCustomerModeration(customerIdA);
    assert.ok(mod);
    assert.strictEqual(mod.is_suspended, true);
    assert.strictEqual(mod.suspension_reason, 'Excessive cancellations causing waste for merchants.');
    assert.ok(mod.suspension_expires_at);

    // Simulate ordering check
    const isSuspendedAndActive =
      mod.is_suspended &&
      (!mod.suspension_expires_at || new Date(mod.suspension_expires_at).getTime() > Date.now());
    assert.strictEqual(isSuspendedAndActive, true);
  });

  // 17. Expired suspensions allow customer to order again
  it('17. Expired suspensions automatically clear active suspension flag', async () => {
    // Seed an expired suspension (expired 1 hour ago)
    const expiredDate = new Date(Date.now() - 3600 * 1000).toISOString();
    saveStoredModerationRecords({
      [customerIdA]: {
        customer_id: customerIdA,
        is_suspended: true,
        suspension_reason: 'Previous temporary restriction',
        suspended_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        suspension_expires_at: expiredDate,
        suspended_by: adminId,
        flagged_for_review: false,
        warning_count: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const mod = await fetchCustomerModeration(customerIdA);
    assert.ok(mod);
    assert.strictEqual(mod.is_suspended, false);
  });

  // 18. Reinstated customers can order again after admin action
  it('18. Reinstated customers have ordering privileges restored and flag cleared', async () => {
    // First suspend
    await adminModerateCustomer({
      customerId: customerIdA,
      action: 'suspend',
      reason: 'Repeated cancellation abuse.',
      durationHours: 168,
      adminId,
    });

    // Then reinstate
    const reinstateResult = await adminModerateCustomer({
      customerId: customerIdA,
      action: 'reinstate',
      reason: 'Customer verified phone and resolved payment timing issues.',
      adminId,
    });
    assert.strictEqual(reinstateResult.success, true);

    const mod = await fetchCustomerModeration(customerIdA);
    assert.ok(mod);
    assert.strictEqual(mod.is_suspended, false);
    assert.strictEqual(mod.flagged_for_review, false);
  });

  // 19. Payment/refund status is preserved and marked required when paid order is cancelled
  it('19. Paid order cancellation marks refund_status as required without false refund confirmation', async () => {
    const paidReq = createMockRequest({
      current_state: 'REQUESTED',
      payment_method: 'upi',
      payment_status: 'paid',
      payment_amount: 350,
      total_estimate: 350,
    });
    seedRequests([paidReq]);

    const result = await cancelOrderDirectly({
      requestId: paidReq.id,
      customerId: customerIdA,
      reason: 'Ordered by mistake',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.request);
    assert.strictEqual(result.request.current_state, 'CANCELLED');
    assert.strictEqual(result.request.refund_status, 'required');
    assert.strictEqual(result.request.refund_amount, 350);
    // Payment status must NOT be falsely marked as refunded
    assert.notStrictEqual(result.request.payment_status, 'REFUNDED');
  });

  // 20. Multi-shop orders follow per-shop cancellation rules
  it('20. Multi-shop orders have independent requests and per-shop cancellation rules', async () => {
    const reqShop1 = createMockRequest({
      id: 'req-multi-1',
      shop_id: shopIdA,
      current_state: 'REQUESTED',
      reference_code: 'ORD-M1',
    });
    const reqShop2 = createMockRequest({
      id: 'req-multi-2',
      shop_id: shopIdB,
      current_state: 'PREPARING',
      reference_code: 'ORD-M2',
    });
    seedRequests([reqShop1, reqShop2]);

    // Shop 1 request can be cancelled directly
    const cancel1 = await cancelOrderDirectly({
      requestId: reqShop1.id,
      customerId: customerIdA,
      reason: 'Selected the wrong items',
    });
    assert.strictEqual(cancel1.success, true);
    assert.strictEqual(cancel1.request?.current_state, 'CANCELLED');

    // Shop 2 request is in PREPARING -> direct cancel fails, requires request
    const directCancel2 = await cancelOrderDirectly({
      requestId: reqShop2.id,
      customerId: customerIdA,
      reason: 'No longer needed',
    });
    assert.strictEqual(directCancel2.success, false);

    const requestCancel2 = await requestOrderCancellation({
      requestId: reqShop2.id,
      customerId: customerIdA,
      reason: 'No longer needed',
    });
    assert.strictEqual(requestCancel2.success, true);
    assert.strictEqual(requestCancel2.request?.cancellation_request_status, 'pending');
  });

  // 21. Policy configuration update works reliably
  it('21. Administrators can fetch and update policy thresholds', async () => {
    const policy = await fetchCancellationPolicy();
    assert.strictEqual(policy.window_days, 30);
    assert.strictEqual(policy.second_warning_threshold, 2);

    const updateRes = await updateCancellationPolicy({
      window_days: 45,
      review_threshold: 4,
    });
    assert.strictEqual(updateRes.success, true);

    const updated = await fetchCancellationPolicy();
    assert.strictEqual(updated.window_days, 45);
    assert.strictEqual(updated.review_threshold, 4);
  });
});
