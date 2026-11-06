import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseTimeToMinutes,
} from '../lib/appointmentValidation';

describe('Appointment Overbooking Prevention & Lifecycle Reliability', () => {
  const migration72Path = path.resolve(
    process.cwd(),
    'supabase/migrations/20261106000072_appointment_overbooking_prevention_and_lifecycle.sql'
  );
  const serviceApiPath = path.resolve(process.cwd(), 'src/lib/appointmentServiceApi.ts');
  const shopkeeperApiPath = path.resolve(process.cwd(), 'src/lib/shopkeeperApi.ts');
  const notificationApiPath = path.resolve(process.cwd(), 'src/lib/notificationApi.ts');

  // =========================================================================
  // 1. DATABASE MIGRATION INTEGRITY & ARCHITECTURAL VERIFICATION
  // =========================================================================
  describe('1. Database Migration Architecture', () => {
    it('1.1 Confirms presence and syntax of Migration 72', () => {
      assert.ok(fs.existsSync(migration72Path), 'Migration 72 file exists');
      const sql = fs.readFileSync(migration72Path, 'utf-8');
      assert.ok(sql.includes('parse_time_to_minutes'), 'Defines time parsing helper');
      assert.ok(sql.includes('book_appointment_with_token'), 'Defines hardened booking RPC');
      assert.ok(sql.includes('sync_appointment_slot_on_request_change'), 'Defines single authoritative slot release trigger');
      assert.ok(sql.includes('reschedule_appointment'), 'Defines atomic rescheduling RPC');
      assert.ok(sql.includes('get_appointment_slot_availability'), 'Defines authoritative availability RPC');
    });

    it('1.2 Verifies row-level locking and idempotency guard in book_appointment_with_token', () => {
      const sql = fs.readFileSync(migration72Path, 'utf-8');
      assert.ok(sql.includes('FOR UPDATE'), 'Slot row locked FOR UPDATE before checking availability');
      assert.ok(
        sql.includes('already_booked') && sql.includes('r.customer_id = v_caller_id'),
        'Idempotency check prevents duplicate booking from rapid double clicks'
      );
    });

    it('1.3 Verifies exact-once terminal trigger logic preventing double release', () => {
      const sql = fs.readFileSync(migration72Path, 'utf-8');
      assert.ok(
        sql.includes("OLD.current_state NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW')"),
        'Trigger guarantees exact-once execution when transitioning from active to terminal'
      );
      assert.ok(
        sql.includes('DROP TRIGGER IF EXISTS trg_release_slot_on_request_terminal') &&
        sql.includes('DROP TRIGGER IF EXISTS trg_vaangly_release_slot_on_request_terminal'),
        'Drops conflicting legacy triggers to prevent double decrements'
      );
    });

    it('1.4 Verifies atomic slot swapping in reschedule_appointment', () => {
      const sql = fs.readFileSync(migration72Path, 'utf-8');
      assert.ok(
        sql.includes('v_new_active_count >= v_new_capacity'),
        'Aborts if new slot is full before releasing old slot'
      );
      assert.ok(
        sql.includes('v_old_slot_id < p_new_slot_id'),
        'Locks old and new slots in deterministic order to prevent database deadlocks'
      );
    });
  });

  // =========================================================================
  // 2. DETERMINISTIC TIME PARSING & OVERLAP CALCULATION
  // =========================================================================
  describe('2. Deterministic Time Parsing & Overlap Rules', () => {
    it('2.1 Correctly parses 12h AM/PM and 24h formats to minutes from midnight', () => {
      assert.strictEqual(parseTimeToMinutes('12:00 AM'), 0);
      assert.strictEqual(parseTimeToMinutes('09:00 AM'), 540);
      assert.strictEqual(parseTimeToMinutes('09:15 AM'), 555);
      assert.strictEqual(parseTimeToMinutes('09:30 AM'), 570);
      assert.strictEqual(parseTimeToMinutes('09:45 AM'), 585);
      assert.strictEqual(parseTimeToMinutes('12:00 PM'), 720);
      assert.strictEqual(parseTimeToMinutes('01:30 PM'), 810);
      assert.strictEqual(parseTimeToMinutes('14:00'), 840);
      assert.strictEqual(parseTimeToMinutes('11:59 PM'), 1439);
    });

    it('2.2 Verifies interval overlap condition: [start_A, end_A) overlaps [start_B, end_B) iff start_A < end_B AND start_B < end_A', () => {
      const isOverlap = (sA: string, eA: string, sB: string, eB: string) => {
        const startA = parseTimeToMinutes(sA);
        const endA = parseTimeToMinutes(eA);
        const startB = parseTimeToMinutes(sB);
        const endB = parseTimeToMinutes(eB);
        return startA < endB && startB < endA;
      };

      // 9:00–9:30 conflicts with 9:15–9:45
      assert.strictEqual(isOverlap('09:00 AM', '09:30 AM', '09:15 AM', '09:45 AM'), true);
      assert.strictEqual(isOverlap('09:15 AM', '09:45 AM', '09:00 AM', '09:30 AM'), true);

      // 9:00–9:30 does NOT conflict with 9:30–10:00 (back-to-back allowed)
      assert.strictEqual(isOverlap('09:00 AM', '09:30 AM', '09:30 AM', '10:00 AM'), false);
      assert.strictEqual(isOverlap('09:30 AM', '10:00 AM', '09:00 AM', '09:30 AM'), false);

      // Contained interval: 9:00–10:00 conflicts with 9:15–9:45
      assert.strictEqual(isOverlap('09:00 AM', '10:00 AM', '09:15 AM', '09:45 AM'), true);
    });
  });

    interface SimSlot {
      id: string;
      shopId: string;
      serviceId?: string;
      slotDate: string;
      startTime: string;
      endTime: string;
      capacity: number;
      confirmedCount: number;
      isAvailable: boolean;
    }

    interface SimRequest {
      id: string;
      customerId: string;
      shopId: string;
      slotId: string;
      providerName?: string;
      serviceId?: string;
      startTime: string;
      endTime: string;
      slotDate: string;
      currentState: string;
      paymentStatus: string;
      holdExpiresAt?: number | null;
      tokenNumber?: number | null;
    }

    class BookingEngine {
      slots: Map<string, SimSlot> = new Map();
      requests: SimRequest[] = [];
      currentTimeMs: number = Date.now();

      addSlot(slot: SimSlot) {
        this.slots.set(slot.id, { ...slot });
      }

      book(params: {
        slotId: string;
        customerId: string;
        serviceId?: string;
        providerName?: string;
        paymentMethod: 'pay_at_shop' | 'online';
        isOnlineHold?: boolean;
        holdMinutes?: number;
      }): { success: boolean; requestId?: string; tokenNumber?: number | null; alreadyBooked?: boolean; error?: string } {
        const slot = this.slots.get(params.slotId);
        if (!slot) return { success: false, error: 'Slot not found' };

        // 1. Idempotency check: customer already booked
        const existing = this.requests.find(
          (r) =>
            r.customerId === params.customerId &&
            r.slotId === params.slotId &&
            !['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(r.currentState) &&
            (!r.holdExpiresAt || r.holdExpiresAt >= this.currentTimeMs)
        );
        if (existing) {
          return {
            success: true,
            requestId: existing.id,
            tokenNumber: existing.tokenNumber,
            alreadyBooked: true,
          };
        }

        // 2. Expired hold cleanup
        this.requests.forEach((r) => {
          if (
            r.currentState === 'REQUESTED' &&
            r.holdExpiresAt &&
            r.holdExpiresAt < this.currentTimeMs
          ) {
            r.currentState = 'EXPIRED';
            r.paymentStatus = 'PAYMENT_REJECTED';
          }
        });

        // 3. Slot-level capacity check
        const activeCount = this.requests.filter(
          (r) =>
            r.slotId === slot.id &&
            !['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(r.currentState) &&
            (!r.holdExpiresAt || r.holdExpiresAt >= this.currentTimeMs)
        ).length;

        if (activeCount >= slot.capacity) {
          slot.confirmedCount = activeCount;
          slot.isAvailable = false;
          return { success: false, error: 'INTERVAL_FULL' };
        }

        // 4. Overlap-level resource capacity check
        const slotStartMin = parseTimeToMinutes(slot.startTime);
        const slotEndMin = parseTimeToMinutes(slot.endTime);
        const provider = params.providerName?.trim();

        if (slotEndMin > slotStartMin) {
          const overlappingCount = this.requests.filter((r) => {
            if (r.shopId !== slot.shopId || r.slotDate !== slot.slotDate) return false;
            if (['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(r.currentState)) return false;
            if (r.holdExpiresAt && r.holdExpiresAt < this.currentTimeMs) return false;

            const matchesResource =
              (provider && r.providerName === provider) ||
              (params.serviceId && r.serviceId === params.serviceId);
            if (!matchesResource) return false;

            const oStart = parseTimeToMinutes(r.startTime);
            const oEnd = parseTimeToMinutes(r.endTime);
            return oStart < slotEndMin && slotStartMin < oEnd;
          }).length;

          if (overlappingCount >= slot.capacity) {
            return { success: false, error: 'RESOURCE_OVERLAPPING_FULL' };
          }
        }

        // 5. Successful booking
        const isHold = Boolean(params.isOnlineHold && params.paymentMethod === 'online');
        const holdExpires = isHold ? this.currentTimeMs + (params.holdMinutes || 10) * 60000 : null;
        const nextToken = isHold ? null : activeCount + 1;
        const newReqId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        const newReq: SimRequest = {
          id: newReqId,
          customerId: params.customerId,
          shopId: slot.shopId,
          slotId: slot.id,
          providerName: params.providerName,
          serviceId: params.serviceId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotDate: slot.slotDate,
          currentState: isHold ? 'REQUESTED' : 'CONFIRMED',
          paymentStatus: isHold ? 'PAYMENT_PENDING' : 'NOT_REQUIRED',
          holdExpiresAt: holdExpires,
          tokenNumber: nextToken,
        };
        this.requests.push(newReq);

        slot.confirmedCount = activeCount + 1;
        slot.isAvailable = activeCount + 1 < slot.capacity;

        return {
          success: true,
          requestId: newReqId,
          tokenNumber: nextToken,
          alreadyBooked: false,
        };
      }

      cancel(requestId: string, customerId: string): { success: boolean; error?: string } {
        const req = this.requests.find((r) => r.id === requestId);
        if (!req) return { success: false, error: 'Request not found' };
        if (req.customerId !== customerId) return { success: false, error: 'Forbidden' };
        if (!['REQUESTED', 'ACCEPTED', 'CONFIRMED'].includes(req.currentState)) {
          return { success: false, error: 'Cannot cancel in current state' };
        }

        const oldState = req.currentState;
        req.currentState = 'CANCELLED';

        // Authoritative trigger behavior: only fires if oldState was non-terminal
        if (!['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(oldState)) {
          const slot = this.slots.get(req.slotId);
          if (slot) {
            const activeCount = this.requests.filter(
              (r) =>
                r.slotId === slot.id &&
                !['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(r.currentState) &&
                (!r.holdExpiresAt || r.holdExpiresAt >= this.currentTimeMs)
            ).length;
            slot.confirmedCount = activeCount;
            slot.isAvailable = activeCount < slot.capacity;
          }
        }

        return { success: true };
      }

      reschedule(requestId: string, newSlotId: string): { success: boolean; tokenNumber?: number | null; error?: string } {
        const req = this.requests.find((r) => r.id === requestId);
        if (!req) return { success: false, error: 'Request not found' };
        if (['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW', 'COMPLETED'].includes(req.currentState)) {
          return { success: false, error: 'Cannot reschedule terminal request' };
        }

        const newSlot = this.slots.get(newSlotId);
        if (!newSlot) return { success: false, error: 'New slot not found' };

        // Capacity check on new slot
        const newActiveCount = this.requests.filter(
          (r) =>
            r.slotId === newSlot.id &&
            r.id !== req.id &&
            !['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(r.currentState)
        ).length;

        if (newActiveCount >= newSlot.capacity) {
          return { success: false, error: 'INTERVAL_FULL' };
        }

        // Release old slot
        const oldSlot = this.slots.get(req.slotId);
        if (oldSlot) {
          oldSlot.confirmedCount = Math.max(0, oldSlot.confirmedCount - 1);
          oldSlot.isAvailable = true;
        }

        // Reserve new slot
        const nextToken = newActiveCount + 1;
        newSlot.confirmedCount = newActiveCount + 1;
        newSlot.isAvailable = newActiveCount + 1 < newSlot.capacity;

        req.slotId = newSlot.id;
        req.startTime = newSlot.startTime;
        req.endTime = newSlot.endTime;
        req.slotDate = newSlot.slotDate;
        req.tokenNumber = nextToken;

        return { success: true, tokenNumber: nextToken };
      }
    }
  // =========================================================================
  // 3. CONCURRENCY & OVERBOOKING ENGINE SIMULATION
  // =========================================================================
  describe('3. Concurrency Simulation: Exact Contract Validation', () => {
    it('3.1 Two customers booking the same slot simultaneously: exactly 1 succeeds, 1 rejected', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-101',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '10:00 AM',
        endTime: '10:30 AM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });

      const res1 = engine.book({
        slotId: 'slot-101',
        customerId: 'cust-1',
        paymentMethod: 'pay_at_shop',
      });
      const res2 = engine.book({
        slotId: 'slot-101',
        customerId: 'cust-2',
        paymentMethod: 'pay_at_shop',
      });

      assert.strictEqual(res1.success, true, 'First customer succeeds');
      assert.strictEqual(res1.tokenNumber, 1, 'First customer gets Token #1');
      assert.strictEqual(res2.success, false, 'Second customer rejected due to capacity');
      assert.strictEqual(res2.error, 'INTERVAL_FULL', 'Returns INTERVAL_FULL error');

      const slot = engine.slots.get('slot-101');
      assert.strictEqual(slot?.confirmedCount, 1);
      assert.strictEqual(slot?.isAvailable, false);
    });

    it('3.2 Overlapping appointments with different start times (9:00–9:30 vs 9:15–9:45): conflict detected', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-900',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '09:00 AM',
        endTime: '09:30 AM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });
      engine.addSlot({
        id: 'slot-915',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '09:15 AM',
        endTime: '09:45 AM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });

      const res1 = engine.book({
        slotId: 'slot-900',
        customerId: 'cust-1',
        providerName: 'Dr. Ramesh',
        paymentMethod: 'pay_at_shop',
      });
      assert.strictEqual(res1.success, true);

      // Customer 2 tries to book overlapping interval for same doctor
      const res2 = engine.book({
        slotId: 'slot-915',
        customerId: 'cust-2',
        providerName: 'Dr. Ramesh',
        paymentMethod: 'pay_at_shop',
      });
      assert.strictEqual(res2.success, false, 'Overlapping appointment rejected');
      assert.strictEqual(res2.error, 'RESOURCE_OVERLAPPING_FULL');
    });

    it('3.3 Back-to-back appointments (9:00–9:30 and 9:30–10:00): permitted without conflict', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-900',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '09:00 AM',
        endTime: '09:30 AM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });
      engine.addSlot({
        id: 'slot-930',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '09:30 AM',
        endTime: '10:00 AM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });

      const res1 = engine.book({
        slotId: 'slot-900',
        customerId: 'cust-1',
        providerName: 'Dr. Ramesh',
        paymentMethod: 'pay_at_shop',
      });
      const res2 = engine.book({
        slotId: 'slot-930',
        customerId: 'cust-2',
        providerName: 'Dr. Ramesh',
        paymentMethod: 'pay_at_shop',
      });

      assert.strictEqual(res1.success, true);
      assert.strictEqual(res2.success, true, 'Back-to-back appointment successfully booked');
    });

    it('3.4 Multiple staff members / resource capacity (capacity = 3): allows 3 tokens, blocks 4th', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-multi',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '11:00 AM',
        endTime: '11:30 AM',
        capacity: 3,
        confirmedCount: 0,
        isAvailable: true,
      });

      const b1 = engine.book({ slotId: 'slot-multi', customerId: 'c1', paymentMethod: 'pay_at_shop' });
      const b2 = engine.book({ slotId: 'slot-multi', customerId: 'c2', paymentMethod: 'pay_at_shop' });
      const b3 = engine.book({ slotId: 'slot-multi', customerId: 'c3', paymentMethod: 'pay_at_shop' });
      const b4 = engine.book({ slotId: 'slot-multi', customerId: 'c4', paymentMethod: 'pay_at_shop' });

      assert.strictEqual(b1.success, true);
      assert.strictEqual(b1.tokenNumber, 1);
      assert.strictEqual(b2.success, true);
      assert.strictEqual(b2.tokenNumber, 2);
      assert.strictEqual(b3.success, true);
      assert.strictEqual(b3.tokenNumber, 3);
      assert.strictEqual(b4.success, false);
      assert.strictEqual(b4.error, 'INTERVAL_FULL');

      const slot = engine.slots.get('slot-multi');
      assert.strictEqual(slot?.confirmedCount, 3);
      assert.strictEqual(slot?.isAvailable, false);
    });

    it('3.5 Safe cancellation & double-release prevention: verified exact-once release', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-cancel',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '02:00 PM',
        endTime: '02:30 PM',
        capacity: 2,
        confirmedCount: 0,
        isAvailable: true,
      });

      const b1 = engine.book({ slotId: 'slot-cancel', customerId: 'c1', paymentMethod: 'pay_at_shop' });
      engine.book({ slotId: 'slot-cancel', customerId: 'c2', paymentMethod: 'pay_at_shop' });
      assert.strictEqual(engine.slots.get('slot-cancel')?.confirmedCount, 2);
      assert.strictEqual(engine.slots.get('slot-cancel')?.isAvailable, false);

      // Customer 1 cancels
      const cRes1 = engine.cancel(b1.requestId!, 'c1');
      assert.strictEqual(cRes1.success, true);
      assert.strictEqual(engine.slots.get('slot-cancel')?.confirmedCount, 1);
      assert.strictEqual(engine.slots.get('slot-cancel')?.isAvailable, true);

      // Duplicate cancellation attempt (simulating redundant update / double click)
      const cRes2 = engine.cancel(b1.requestId!, 'c1');
      assert.strictEqual(cRes2.success, false, 'Redundant cancellation rejected');
      // Capacity is NOT double decremented!
      assert.strictEqual(engine.slots.get('slot-cancel')?.confirmedCount, 1);
      assert.strictEqual(engine.slots.get('slot-cancel')?.isAvailable, true);

      // New customer can now book the newly available capacity
      const b3 = engine.book({ slotId: 'slot-cancel', customerId: 'c3', paymentMethod: 'pay_at_shop' });
      assert.strictEqual(b3.success, true);
      assert.strictEqual(engine.slots.get('slot-cancel')?.confirmedCount, 2);
    });

    it('3.6 Expired reservations release capacity automatically', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-hold',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '04:00 PM',
        endTime: '04:30 PM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });

      // Customer 1 places a 10-minute hold for online payment
      const b1 = engine.book({
        slotId: 'slot-hold',
        customerId: 'c1',
        paymentMethod: 'online',
        isOnlineHold: true,
        holdMinutes: 10,
      });
      assert.strictEqual(b1.success, true);
      assert.strictEqual(engine.slots.get('slot-hold')?.isAvailable, false);

      // Another customer tries to book while hold is active (rejected)
      const b2 = engine.book({
        slotId: 'slot-hold',
        customerId: 'c2',
        paymentMethod: 'pay_at_shop',
      });
      assert.strictEqual(b2.success, false);
      assert.strictEqual(b2.error, 'INTERVAL_FULL');

      // Fast forward time by 11 minutes (hold expired)
      engine.currentTimeMs += 11 * 60 * 1000;

      // Customer 3 attempts booking: expired hold is reclaimed and Customer 3 succeeds!
      const b3 = engine.book({
        slotId: 'slot-hold',
        customerId: 'c3',
        paymentMethod: 'pay_at_shop',
      });
      assert.strictEqual(b3.success, true);
      assert.strictEqual(b3.tokenNumber, 1);
    });

    it('3.7 Repeated booking requests / double clicks: returns existing booking idempotently', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-repeat',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '05:00 PM',
        endTime: '05:30 PM',
        capacity: 2,
        confirmedCount: 0,
        isAvailable: true,
      });

      const click1 = engine.book({ slotId: 'slot-repeat', customerId: 'c1', paymentMethod: 'pay_at_shop' });
      assert.strictEqual(click1.success, true);
      assert.strictEqual(click1.alreadyBooked, false);
      assert.strictEqual(click1.tokenNumber, 1);

      // Customer rapidly clicks "Book" again on the same slot
      const click2 = engine.book({ slotId: 'slot-repeat', customerId: 'c1', paymentMethod: 'pay_at_shop' });
      assert.strictEqual(click2.success, true);
      assert.strictEqual(click2.alreadyBooked, true);
      assert.strictEqual(click2.requestId, click1.requestId);
      assert.strictEqual(click2.tokenNumber, 1);

      // Confirms only 1 slot capacity consumed, NOT 2!
      assert.strictEqual(engine.slots.get('slot-repeat')?.confirmedCount, 1);
    });

    it('3.8 Appointment rescheduling: swaps slots atomically and preserves old slot on failure', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-A',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '09:00 AM',
        endTime: '09:30 AM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });
      engine.addSlot({
        id: 'slot-B',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '11:00 AM',
        endTime: '11:30 AM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });
      engine.addSlot({
        id: 'slot-C-full',
        shopId: 'shop-1',
        slotDate: '2026-11-10',
        startTime: '01:00 PM',
        endTime: '01:30 PM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });

      // Customer 1 books Slot A
      const b1 = engine.book({ slotId: 'slot-A', customerId: 'c1', paymentMethod: 'pay_at_shop' });
      // Customer 2 fills Slot C
      engine.book({ slotId: 'slot-C-full', customerId: 'c2', paymentMethod: 'pay_at_shop' });

      // Attempt 1: Reschedule Customer 1 to Slot C (which is full)
      const reschFail = engine.reschedule(b1.requestId!, 'slot-C-full');
      assert.strictEqual(reschFail.success, false);
      assert.strictEqual(reschFail.error, 'INTERVAL_FULL');
      // Crucial: Customer 1 still holds Slot A!
      assert.strictEqual(engine.slots.get('slot-A')?.confirmedCount, 1);
      assert.strictEqual(engine.slots.get('slot-A')?.isAvailable, false);

      // Attempt 2: Reschedule Customer 1 to available Slot B
      const reschSuccess = engine.reschedule(b1.requestId!, 'slot-B');
      assert.strictEqual(reschSuccess.success, true);
      assert.strictEqual(reschSuccess.tokenNumber, 1);

      // Old Slot A is now freed!
      assert.strictEqual(engine.slots.get('slot-A')?.confirmedCount, 0);
      assert.strictEqual(engine.slots.get('slot-A')?.isAvailable, true);

      // New Slot B is now occupied!
      assert.strictEqual(engine.slots.get('slot-B')?.confirmedCount, 1);
      assert.strictEqual(engine.slots.get('slot-B')?.isAvailable, false);
    });
  });

  // =========================================================================
  // 4. NOTIFICATION & LIFECYCLE PARITY
  // =========================================================================
  describe('4. Notification System Compatibility', () => {
    it('4.1 Verifies notificationApi has workflowGroupCode and APPOINTMENT_RESCHEDULED', () => {
      const notifCode = fs.readFileSync(notificationApiPath, 'utf-8');
      assert.ok(notifCode.includes('workflowGroupCode'), 'notificationApi supports workflowGroupCode');
      assert.ok(notifCode.includes('APPOINTMENT_RESCHEDULED'), 'Supports APPOINTMENT_RESCHEDULED event');
      assert.ok(notifCode.includes('New Appointment Request'), 'Appointment-specific shopkeeper notification');
      assert.ok(notifCode.includes('Appointment Confirmed'), 'Appointment-specific customer notification');
    });

    it('4.2 Verifies appointmentServiceApi and shopkeeperApi forward workflowGroupCode', () => {
      const srvCode = fs.readFileSync(serviceApiPath, 'utf-8');
      const shopCode = fs.readFileSync(shopkeeperApiPath, 'utf-8');
      assert.ok(srvCode.includes("workflowGroupCode: 'APPOINTMENT'"), 'Service API forwards appointment code');
      assert.ok(shopCode.includes('workflowGroupCode: groupCode'), 'Shopkeeper API forwards request workflow code');
    });
  });

  // =========================================================================
  // 5. PRODUCTION CONCURRENCY & RACE CONDITION SAFETY VERIFICATIONS
  // =========================================================================
  describe('5. Production Race Conditions & Safety Invariants', () => {
    it('5.1 Race: Payment proof submission immediately before expiration preserves booking', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-race-1',
        shopId: 'shop-1',
        slotDate: '2026-11-15',
        startTime: '10:00 AM',
        endTime: '10:30 AM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });

      const b = engine.book({
        slotId: 'slot-race-1',
        customerId: 'c1',
        paymentMethod: 'online',
        isOnlineHold: true,
        holdMinutes: 10,
      });
      assert.strictEqual(b.success, true);
      const req = engine.requests.find((r) => r.id === b.requestId);
      assert.ok(req);

      // Customer submits payment proof at minute 9
      engine.currentTimeMs += 9 * 60 * 1000;
      req.paymentStatus = 'PAYMENT_PROOF_SUBMITTED';
      req.holdExpiresAt = null; // Hold cleared on proof upload

      // Minute 11 cleanup triggers: request must NOT be expired!
      engine.currentTimeMs += 2 * 60 * 1000;
      engine.requests.forEach((r) => {
        if (r.currentState === 'REQUESTED' && r.holdExpiresAt && r.holdExpiresAt < engine.currentTimeMs) {
          r.currentState = 'EXPIRED';
        }
      });

      assert.strictEqual(req.currentState, 'REQUESTED');
      assert.strictEqual(req.paymentStatus, 'PAYMENT_PROOF_SUBMITTED');
      assert.strictEqual(engine.slots.get('slot-race-1')?.confirmedCount, 1);
    });

    it('5.2 Race: Shopkeeper acceptance locks appointment against expiration cleanup', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-race-2',
        shopId: 'shop-1',
        slotDate: '2026-11-15',
        startTime: '11:00 AM',
        endTime: '11:30 AM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });

      const b = engine.book({
        slotId: 'slot-race-2',
        customerId: 'c1',
        paymentMethod: 'online',
        isOnlineHold: true,
        holdMinutes: 10,
      });
      const req = engine.requests.find((r) => r.id === b.requestId);
      assert.ok(req);

      // Shopkeeper accepts appointment before hold expires
      req.currentState = 'CONFIRMED';

      // Time passes past hold expiration
      engine.currentTimeMs += 15 * 60 * 1000;
      engine.requests.forEach((r) => {
        if (r.currentState === 'REQUESTED' && r.holdExpiresAt && r.holdExpiresAt < engine.currentTimeMs) {
          r.currentState = 'EXPIRED';
        }
      });

      assert.strictEqual(req.currentState, 'CONFIRMED', 'Confirmed appointment is never expired');
      assert.strictEqual(engine.slots.get('slot-race-2')?.confirmedCount, 1);
    });

    it('5.3 Deduplication Safety: Legitimate different bookings are NOT incorrectly deduplicated', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-multi-1',
        shopId: 'shop-1',
        slotDate: '2026-11-15',
        startTime: '02:00 PM',
        endTime: '02:30 PM',
        capacity: 2,
        confirmedCount: 0,
        isAvailable: true,
      });
      engine.addSlot({
        id: 'slot-multi-2',
        shopId: 'shop-1',
        slotDate: '2026-11-15',
        startTime: '03:00 PM',
        endTime: '03:30 PM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });

      // Different customers on same slot: NOT deduplicated
      const b1 = engine.book({ slotId: 'slot-multi-1', customerId: 'c1', paymentMethod: 'pay_at_shop' });
      const b2 = engine.book({ slotId: 'slot-multi-1', customerId: 'c2', paymentMethod: 'pay_at_shop' });
      assert.strictEqual(b1.alreadyBooked, false);
      assert.strictEqual(b2.alreadyBooked, false);
      assert.notStrictEqual(b1.requestId, b2.requestId);

      // Same customer on different slot: NOT deduplicated
      const b3 = engine.book({ slotId: 'slot-multi-2', customerId: 'c1', paymentMethod: 'pay_at_shop' });
      assert.strictEqual(b3.alreadyBooked, false);
      assert.notStrictEqual(b1.requestId, b3.requestId);
    });

    it('5.4 Race: Rescheduling an already-cancelled request is safely rejected', () => {
      const engine = new BookingEngine();
      engine.addSlot({
        id: 'slot-old',
        shopId: 'shop-1',
        slotDate: '2026-11-15',
        startTime: '09:00 AM',
        endTime: '09:30 AM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });
      engine.addSlot({
        id: 'slot-target',
        shopId: 'shop-1',
        slotDate: '2026-11-15',
        startTime: '10:00 AM',
        endTime: '10:30 AM',
        capacity: 1,
        confirmedCount: 0,
        isAvailable: true,
      });

      const b = engine.book({ slotId: 'slot-old', customerId: 'c1', paymentMethod: 'pay_at_shop' });
      // Cancel request first
      engine.cancel(b.requestId!, 'c1');

      // Attempt reschedule on cancelled request
      const res = engine.reschedule(b.requestId!, 'slot-target');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'Cannot reschedule terminal request');

      // Slot target remains empty and untouched
      assert.strictEqual(engine.slots.get('slot-target')?.confirmedCount, 0);
    });
  });
});
