import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SEC-02 Regression Test Suite: Appointment Booking Authorization & Capacity Guard
 *
 * Vulnerability Identified:
 * In `20261002000058_cast_appointment_scheduled_for.sql`:
 * Line 35: `v_caller_id := COALESCE(auth.uid(), p_customer_id);`
 * And no `REVOKE EXECUTE ... FROM PUBLIC, anon;` exists in migrations 56-58.
 * This allows unauthenticated anonymous visitors to execute `book_appointment_with_token`
 * via PostgREST, book appointments in the name of arbitrary customers, exhaust slot capacity,
 * and lock out legitimate users.
 */

describe('SEC-02: Appointment Booking RPC Authorization & Capacity Guard', () => {
  const migration56Path = path.resolve(
    process.cwd(),
    'supabase/migrations/20261002000056_appointment_capacity_queue_and_tokens.sql'
  );
  const migration58Path = path.resolve(
    process.cwd(),
    'supabase/migrations/20261002000058_cast_appointment_scheduled_for.sql'
  );

  it('1. Database Migration Audit: Confirms presence of vulnerable COALESCE(auth.uid(), p_customer_id)', () => {
    assert.ok(fs.existsSync(migration58Path), 'Migration 58 file exists');
    const source58 = fs.readFileSync(migration58Path, 'utf-8');

    // Confirms vulnerable assignment in migration 58
    const hasVulnerableCoalesce = source58.includes('v_caller_id := COALESCE(auth.uid(), p_customer_id);');
    assert.strictEqual(
      hasVulnerableCoalesce,
      true,
      'VULNERABILITY CONFIRMED: Migration 58 accepts client-supplied p_customer_id when auth.uid() is null'
    );
  });

  it('2. Database Migration Audit: Confirms missing REVOKE EXECUTE from anon on book_appointment_with_token', () => {
    const source56 = fs.readFileSync(migration56Path, 'utf-8');
    const source58 = fs.readFileSync(migration58Path, 'utf-8');

    // Check for explicit execution privilege restrictions
    const hasRevokePublic56 = source56.includes('REVOKE') && source56.includes('book_appointment_with_token');
    const hasRevokePublic58 = source58.includes('REVOKE') && source58.includes('book_appointment_with_token');

    assert.strictEqual(
      hasRevokePublic56,
      false,
      'VULNERABILITY CONFIRMED: Migration 56 lacks REVOKE EXECUTE on book_appointment_with_token'
    );
    assert.strictEqual(
      hasRevokePublic58,
      false,
      'VULNERABILITY CONFIRMED: Migration 58 lacks REVOKE EXECUTE on book_appointment_with_token'
    );
  });

  // --------------------------------------------------------------------------
  // RPC SIMULATION & SECURITY SPECIFICATION CONTRACT
  // --------------------------------------------------------------------------

  interface SlotState {
    id: string;
    shopId: string;
    capacity: number;
    confirmedCount: number;
    isAvailable: boolean;
  }

  interface RequestRecord {
    id: string;
    customerId: string;
    shopId: string;
    slotId: string;
    currentState: string;
    paymentStatus: string;
    tokenNumber?: number;
  }

  interface BookingParams {
    slotId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    serviceId: string;
    serviceName: string;
    price: number;
    paymentMethod: 'cash' | 'upi';
    isOnlineHold?: boolean;
    holdMinutes?: number;
  }

  interface RPCExecutionResult {
    success: boolean;
    error?: string;
    code?: string;
    requestId?: string;
    tokenNumber?: number;
    state?: string;
    paymentStatus?: string;
  }

  /**
   * Reference implementation comparing:
   * - mode: 'CURRENT_VULNERABLE' (as in migration 58)
   * - mode: 'REMEDIATED' (with strict auth.uid() enforcement and impersonation guard)
   */
  function simulateBookAppointmentRPC(
    params: BookingParams,
    callerAuthUid: string | null,
    slot: SlotState,
    existingBookings: RequestRecord[],
    mode: 'CURRENT_VULNERABLE' | 'REMEDIATED'
  ): { result: RPCExecutionResult; updatedSlot: SlotState; newBooking?: RequestRecord } {
    let callerId: string | null;

    if (mode === 'CURRENT_VULNERABLE') {
      // Insecure migration 58 logic:
      callerId = callerAuthUid || params.customerId;
      if (!callerId) {
        return {
          result: { success: false, error: 'You must be signed in to book an appointment.' },
          updatedSlot: { ...slot },
        };
      }
    } else {
      // Hardened remediation logic:
      if (!callerAuthUid) {
        return {
          result: { success: false, error: 'Authentication required. Anonymous bookings are forbidden.' },
          updatedSlot: { ...slot },
        };
      }
      // Anti-impersonation: customer can only book for their own authenticated identity
      if (callerAuthUid !== params.customerId) {
        return {
          result: { success: false, error: 'Impersonation forbidden: caller UID does not match customer ID.' },
          updatedSlot: { ...slot },
        };
      }
      callerId = callerAuthUid;
    }

    // Capacity Check
    const activeCount = existingBookings.filter(
      (b) => b.slotId === slot.id && !['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(b.currentState)
    ).length;

    if (activeCount >= slot.capacity) {
      return {
        result: {
          success: false,
          code: 'INTERVAL_FULL',
          error: 'This interval is now full. Please choose another time.',
        },
        updatedSlot: { ...slot, isAvailable: false, confirmedCount: activeCount },
      };
    }

    // State transitions
    let currentState: string;
    let paymentStatus: string;
    let tokenNumber: number | undefined;

    if (params.paymentMethod === 'cash') {
      currentState = 'CONFIRMED';
      paymentStatus = 'NOT_REQUIRED';
      tokenNumber = activeCount + 1;
    } else if (params.isOnlineHold) {
      currentState = 'REQUESTED';
      paymentStatus = 'PAYMENT_PENDING';
      tokenNumber = undefined;
    } else {
      currentState = 'REQUESTED';
      paymentStatus = 'PAYMENT_PROOF_SUBMITTED';
      tokenNumber = activeCount + 1;
    }

    const newBooking: RequestRecord = {
      id: `req-apt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: callerId,
      shopId: slot.shopId,
      slotId: slot.id,
      currentState,
      paymentStatus,
      tokenNumber,
    };

    const nextCount = activeCount + 1;
    const updatedSlot: SlotState = {
      ...slot,
      confirmedCount: nextCount,
      isAvailable: nextCount < slot.capacity,
    };

    return {
      result: {
        success: true,
        requestId: newBooking.id,
        tokenNumber,
        state: currentState,
        paymentStatus,
      },
      updatedSlot,
      newBooking,
    };
  }

  it('3. Current Vulnerability Demonstration: Unauthenticated anonymous caller successfully books appointment in current code', () => {
    const slot: SlotState = {
      id: 'slot-101',
      shopId: 'shop-001',
      capacity: 3,
      confirmedCount: 0,
      isAvailable: true,
    };

    const params: BookingParams = {
      slotId: 'slot-101',
      customerId: 'innocent-victim-uuid',
      customerName: 'Victim Customer',
      customerPhone: '+91 98765 43210',
      serviceId: 'srv-001',
      serviceName: 'Hair Styling',
      price: 250,
      paymentMethod: 'cash',
    };

    // Anonymous caller (null auth.uid()) calling CURRENT_VULNERABLE mode
    const { result, newBooking, updatedSlot } = simulateBookAppointmentRPC(
      params,
      null, // auth.uid() is null!
      slot,
      [],
      'CURRENT_VULNERABLE'
    );

    // Shows that migration 58 allows anonymous booking
    assert.strictEqual(result.success, true, 'Current code vulnerably succeeds without auth');
    assert.strictEqual(newBooking?.customerId, 'innocent-victim-uuid');
    assert.strictEqual(newBooking?.currentState, 'CONFIRMED');
    assert.strictEqual(updatedSlot.confirmedCount, 1, 'Current code consumes capacity for forged booking');
  });

  it('4. Security Contract: Anonymous booking requests are rejected with Authentication required', () => {
    const slot: SlotState = {
      id: 'slot-101',
      shopId: 'shop-001',
      capacity: 3,
      confirmedCount: 0,
      isAvailable: true,
    };

    const params: BookingParams = {
      slotId: 'slot-101',
      customerId: 'innocent-victim-uuid',
      customerName: 'Victim Customer',
      customerPhone: '+91 98765 43210',
      serviceId: 'srv-001',
      serviceName: 'Hair Styling',
      price: 250,
      paymentMethod: 'cash',
    };

    // Remediated mode rejects anonymous caller
    const { result, updatedSlot } = simulateBookAppointmentRPC(
      params,
      null, // anonymous
      slot,
      [],
      'REMEDIATED'
    );

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Authentication required'));
    assert.strictEqual(updatedSlot.confirmedCount, 0, 'Capacity is NOT consumed on rejected booking');
  });

  it('5. Security Contract: Authenticated customer cannot impersonate another customer ID', () => {
    const slot: SlotState = {
      id: 'slot-101',
      shopId: 'shop-001',
      capacity: 3,
      confirmedCount: 0,
      isAvailable: true,
    };

    const params: BookingParams = {
      slotId: 'slot-101',
      customerId: 'target-victim-uuid', // Attempting to book in victim's name
      customerName: 'Target Victim',
      customerPhone: '+91 98765 43210',
      serviceId: 'srv-001',
      serviceName: 'Hair Styling',
      price: 250,
      paymentMethod: 'cash',
    };

    // Caller is authenticated as attacker-uuid
    const { result, updatedSlot } = simulateBookAppointmentRPC(
      params,
      'attacker-uuid',
      slot,
      [],
      'REMEDIATED'
    );

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Impersonation forbidden'));
    assert.strictEqual(updatedSlot.confirmedCount, 0, 'Capacity must remain untouched');
  });

  it('6. Security Contract: Legitimate authenticated booking succeeds and sets correct state transitions', () => {
    const slot: SlotState = {
      id: 'slot-101',
      shopId: 'shop-001',
      capacity: 2,
      confirmedCount: 0,
      isAvailable: true,
    };

    const legitimateCustomer = 'real-customer-uuid';
    const params: BookingParams = {
      slotId: 'slot-101',
      customerId: legitimateCustomer,
      customerName: 'Real Customer',
      customerPhone: '+91 98765 43210',
      serviceId: 'srv-001',
      serviceName: 'Hair Styling',
      price: 250,
      paymentMethod: 'cash',
    };

    const { result, newBooking, updatedSlot } = simulateBookAppointmentRPC(
      params,
      legitimateCustomer,
      slot,
      [],
      'REMEDIATED'
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.state, 'CONFIRMED');
    assert.strictEqual(result.paymentStatus, 'NOT_REQUIRED');
    assert.strictEqual(result.tokenNumber, 1);
    assert.strictEqual(newBooking?.customerId, legitimateCustomer);
    assert.strictEqual(updatedSlot.confirmedCount, 1);
    assert.strictEqual(updatedSlot.isAvailable, true);
  });

  it('7. Security Contract: Concurrent booking capacity limits are strictly enforced', () => {
    const slot: SlotState = {
      id: 'slot-101',
      shopId: 'shop-001',
      capacity: 2, // Maximum 2 concurrent appointments
      confirmedCount: 0,
      isAvailable: true,
    };

    const bookings: RequestRecord[] = [];

    // Booking 1: User A
    const res1 = simulateBookAppointmentRPC(
      {
        slotId: 'slot-101',
        customerId: 'user-a',
        customerName: 'User A',
        customerPhone: '+91 90000 00001',
        serviceId: 'srv-001',
        serviceName: 'Consultation',
        price: 100,
        paymentMethod: 'cash',
      },
      'user-a',
      slot,
      bookings,
      'REMEDIATED'
    );
    assert.strictEqual(res1.result.success, true);
    if (res1.newBooking) bookings.push(res1.newBooking);

    // Booking 2: User B
    const res2 = simulateBookAppointmentRPC(
      {
        slotId: 'slot-101',
        customerId: 'user-b',
        customerName: 'User B',
        customerPhone: '+91 90000 00002',
        serviceId: 'srv-001',
        serviceName: 'Consultation',
        price: 100,
        paymentMethod: 'cash',
      },
      'user-b',
      res1.updatedSlot,
      bookings,
      'REMEDIATED'
    );
    assert.strictEqual(res2.result.success, true);
    if (res2.newBooking) bookings.push(res2.newBooking);
    assert.strictEqual(res2.updatedSlot.isAvailable, false, 'Slot marked unavailable at max capacity');

    // Booking 3: User C (Exceeds capacity of 2)
    const res3 = simulateBookAppointmentRPC(
      {
        slotId: 'slot-101',
        customerId: 'user-c',
        customerName: 'User C',
        customerPhone: '+91 90000 00003',
        serviceId: 'srv-001',
        serviceName: 'Consultation',
        price: 100,
        paymentMethod: 'cash',
      },
      'user-c',
      res2.updatedSlot,
      bookings,
      'REMEDIATED'
    );
    assert.strictEqual(res3.result.success, false);
    assert.strictEqual(res3.result.code, 'INTERVAL_FULL');
    assert.strictEqual(bookings.length, 2, 'Total bookings strictly bounded by capacity');
  });
});
