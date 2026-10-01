import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  sortRequestsChronologicalDesc,
  mergeAndSortRequests,
} from '../lib/orderPickupUtils';
import type { Request } from '../types/database';

describe('Shopkeeper Request List Order & Realtime Deduplication Tests', () => {
  const baseRequest = (id: string, createdAt: string, state: string = 'REQUESTED', extra: Partial<Request> = {}): Request => ({
    id,
    customer_id: 'cust-101',
    shop_id: 'shop-chn-grocery-1',
    workflow_group_code: 'ORDER',
    current_state: state as any,
    reference_code: `ORD-${id}`,
    total_estimate: 500,
    customer_paid: false,
    notes: null,
    scheduled_for: null,
    created_at: createdAt,
    updated_at: createdAt,
    ...extra,
  });

  const mockRequests: Request[] = [
    baseRequest('req-1', '2026-10-01T10:10:00.000Z', 'REQUESTED'),
    baseRequest('req-2', '2026-10-01T10:30:00.000Z', 'ACCEPTED'),
    baseRequest('req-3', '2026-10-01T10:20:00.000Z', 'PREPARING'),
    baseRequest('req-4', '2026-10-01T09:00:00.000Z', 'COMPLETED'),
    baseRequest('req-5', '2026-10-01T11:00:00.000Z', 'REQUESTED'),
  ];

  it('1. Newest request appears first in chronological descending sort', () => {
    const sorted = sortRequestsChronologicalDesc(mockRequests);
    assert.strictEqual(sorted[0].id, 'req-5');
    assert.strictEqual(sorted[0].created_at, '2026-10-01T11:00:00.000Z');
  });

  it('2. Oldest request appears last in chronological descending sort', () => {
    const sorted = sortRequestsChronologicalDesc(mockRequests);
    assert.strictEqual(sorted[sorted.length - 1].id, 'req-4');
    assert.strictEqual(sorted[sorted.length - 1].created_at, '2026-10-01T09:00:00.000Z');
  });

  it('3. Newly received realtime request appears at top immediately', () => {
    const currentList = sortRequestsChronologicalDesc(mockRequests);
    const incomingNewRequest = baseRequest('req-new', '2026-10-01T11:35:00.000Z', 'REQUESTED');

    const updated = mergeAndSortRequests(currentList, incomingNewRequest);

    assert.strictEqual(updated[0].id, 'req-new');
    assert.strictEqual(updated[0].created_at, '2026-10-01T11:35:00.000Z');
    assert.strictEqual(updated.length, currentList.length + 1);
  });

  it('4. Updating an existing request does not duplicate it', () => {
    const currentList = sortRequestsChronologicalDesc(mockRequests);
    const initialCount = currentList.length;

    // Realtime update on req-2 (status changed to READY)
    const updatedReq2 = baseRequest('req-2', '2026-10-01T10:30:00.000Z', 'READY');
    const result = mergeAndSortRequests(currentList, updatedReq2);

    assert.strictEqual(result.length, initialCount, 'List length must remain identical after update');
    const req2Occurrences = result.filter((r) => r.id === 'req-2');
    assert.strictEqual(req2Occurrences.length, 1, 'There must be exactly one copy of req-2');
    assert.strictEqual(req2Occurrences[0].current_state, 'READY');
  });

  it('5. Updated request remains correctly positioned chronologically', () => {
    const currentList = sortRequestsChronologicalDesc(mockRequests);
    // req-3 is 10:20:00.000Z. Position should be between 10:30 (req-2) and 10:10 (req-1)
    const updatedReq3 = baseRequest('req-3', '2026-10-01T10:20:00.000Z', 'READY', { notes: 'Updated notes' });
    const result = mergeAndSortRequests(currentList, updatedReq3);

    const idsInOrder = result.map((r) => r.id);
    assert.deepStrictEqual(idsInOrder, ['req-5', 'req-2', 'req-3', 'req-1', 'req-4']);
    assert.strictEqual(result.find((r) => r.id === 'req-3')?.notes, 'Updated notes');
  });

  it('6. Pending (new) filter remains newest-first', () => {
    const pendingRequests = mockRequests.filter((r) => r.current_state === 'REQUESTED');
    const sortedPending = sortRequestsChronologicalDesc(pendingRequests);

    assert.strictEqual(sortedPending.length, 2);
    assert.strictEqual(sortedPending[0].id, 'req-5'); // 11:00
    assert.strictEqual(sortedPending[1].id, 'req-1'); // 10:10
    assert.ok(
      new Date(sortedPending[0].created_at).getTime() > new Date(sortedPending[1].created_at).getTime()
    );
  });

  it('7. All Requests filter remains newest-first', () => {
    const sortedAll = sortRequestsChronologicalDesc(mockRequests);
    const timestamps = sortedAll.map((r) => new Date(r.created_at).getTime());

    for (let i = 0; i < timestamps.length - 1; i++) {
      assert.ok(
        timestamps[i] >= timestamps[i + 1],
        `Item at index ${i} (${sortedAll[i].created_at}) must be newer or equal to index ${i + 1} (${sortedAll[i + 1].created_at})`
      );
    }
  });

  it('8. Other status filters (active, ready, completed, cancelled) remain newest-first', () => {
    const multiStageRequests: Request[] = [
      baseRequest('ord-act-1', '2026-10-01T09:15:00.000Z', 'ACCEPTED'),
      baseRequest('ord-act-2', '2026-10-01T10:45:00.000Z', 'PREPARING'),
      baseRequest('ord-act-3', '2026-10-01T10:00:00.000Z', 'IN_PROGRESS'),
      baseRequest('ord-rdy-1', '2026-10-01T08:00:00.000Z', 'READY'),
      baseRequest('ord-rdy-2', '2026-10-01T11:15:00.000Z', 'READY'),
      baseRequest('ord-comp-1', '2026-10-01T07:30:00.000Z', 'COMPLETED'),
      baseRequest('ord-comp-2', '2026-10-01T12:00:00.000Z', 'COMPLETED'),
      baseRequest('ord-canc-1', '2026-10-01T06:00:00.000Z', 'REJECTED'),
      baseRequest('ord-canc-2', '2026-10-01T09:30:00.000Z', 'CANCELLED'),
    ];

    // Active filter
    const active = sortRequestsChronologicalDesc(
      multiStageRequests.filter((r) => ['ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'DELAYED'].includes(r.current_state))
    );
    assert.deepStrictEqual(active.map((r) => r.id), ['ord-act-2', 'ord-act-3', 'ord-act-1']);

    // Ready filter
    const ready = sortRequestsChronologicalDesc(
      multiStageRequests.filter((r) => ['READY', 'IN_PROGRESS'].includes(r.current_state))
    );
    assert.deepStrictEqual(ready.map((r) => r.id), ['ord-rdy-2', 'ord-act-3', 'ord-rdy-1']);

    // Completed filter
    const completed = sortRequestsChronologicalDesc(
      multiStageRequests.filter((r) => r.current_state === 'COMPLETED')
    );
    assert.deepStrictEqual(completed.map((r) => r.id), ['ord-comp-2', 'ord-comp-1']);

    // Cancelled filter
    const cancelled = sortRequestsChronologicalDesc(
      multiStageRequests.filter((r) => ['REJECTED', 'CANCELLED', 'NO_SHOW'].includes(r.current_state))
    );
    assert.deepStrictEqual(cancelled.map((r) => r.id), ['ord-canc-2', 'ord-canc-1']);
  });

  it('9. Multiple requests with identical timestamps have deterministic ordering', () => {
    const identicalTimestamp = '2026-10-01T10:00:00.000Z';
    const reqAlpha = baseRequest('req-alpha', identicalTimestamp);
    const reqBeta = baseRequest('req-beta', identicalTimestamp);
    const reqGamma = baseRequest('req-gamma', identicalTimestamp);

    // Shuffle input orders and verify sorted result is 100% deterministic
    const result1 = sortRequestsChronologicalDesc([reqAlpha, reqBeta, reqGamma]);
    const result2 = sortRequestsChronologicalDesc([reqGamma, reqAlpha, reqBeta]);
    const result3 = sortRequestsChronologicalDesc([reqBeta, reqGamma, reqAlpha]);

    const expectedOrder = ['req-gamma', 'req-beta', 'req-alpha']; // based on localeCompare descending
    assert.deepStrictEqual(result1.map((r) => r.id), expectedOrder);
    assert.deepStrictEqual(result2.map((r) => r.id), expectedOrder);
    assert.deepStrictEqual(result3.map((r) => r.id), expectedOrder);
  });

  it('10. Existing request data and status are completely unchanged by sorting', () => {
    const originalReq = baseRequest('req-special', '2026-10-01T10:00:00.000Z', 'ACCEPTED', {
      total_estimate: 890,
      customer_paid: true,
      pickup_at: '2026-10-01T12:00:00.000Z',
      fulfillment_type: 'parcel',
      notes: JSON.stringify({ items: [{ product_id: 'p1', name: 'Item', quantity: 2 }] }),
    });

    const otherReq = baseRequest('req-other', '2026-10-01T11:00:00.000Z');

    const sorted = sortRequestsChronologicalDesc([originalReq, otherReq]);
    const retrieved = sorted.find((r) => r.id === 'req-special');

    assert.ok(retrieved);
    assert.strictEqual(retrieved.total_estimate, 890);
    assert.strictEqual(retrieved.customer_paid, true);
    assert.strictEqual(retrieved.pickup_at, '2026-10-01T12:00:00.000Z');
    assert.strictEqual(retrieved.fulfillment_type, 'parcel');
    assert.strictEqual(retrieved.current_state, 'ACCEPTED');
    assert.strictEqual(retrieved.customer_id, 'cust-101');
  });
});
