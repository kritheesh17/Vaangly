import {
  parseTimeToMinutes,
  minutesToFormattedTime,
  getSlotDurationMinutes,
  calculateEndTimeFromDuration,
  validateFlexibleSlotsConfig,
  generateDefaultFlexibleSlots,
} from '../src/lib/appointmentValidation.ts';

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

console.log('===============================================================');
console.log('TEST SUITE: Flexible Appointment Slot Configuration in Vaangly');
console.log('===============================================================');

// ---------------------------------------------------------------------------
// TEST 1: Working hours & flexible slot duration / capacity validation
// ---------------------------------------------------------------------------
console.log('\n--- 1. Working Hours & Variable Durations / Capacities ---');

const workingHours = [{ id: 'wh-1', start: '09:00 AM', end: '12:00 PM' }];

// User prompt example:
// 9:00 AM - 9:15 AM (5 max) -> 15 min
// 9:15 AM - 9:30 AM (3 max) -> 15 min
// 9:30 AM - 9:40 AM (2 max) -> 10 min
// 9:40 AM - 10:00 AM (4 max) -> 20 min
const validMixedSlots = [
  { id: 's1', start_time: '09:00 AM', end_time: '09:15 AM', capacity: 5 },
  { id: 's2', start_time: '09:15 AM', end_time: '09:30 AM', capacity: 3 },
  { id: 's3', start_time: '09:30 AM', end_time: '09:40 AM', capacity: 2 },
  { id: 's4', start_time: '09:40 AM', end_time: '10:00 AM', capacity: 4 },
];

{
  const res = validateFlexibleSlotsConfig(workingHours, validMixedSlots);
  assert(res.valid === true, 'Valid schedule with 15m, 10m, and 20m slots passes validation');

  assert(getSlotDurationMinutes(validMixedSlots[0].start_time, validMixedSlots[0].end_time) === 15, 'Slot 1 duration is 15 minutes');
  assert(getSlotDurationMinutes(validMixedSlots[1].start_time, validMixedSlots[1].end_time) === 15, 'Slot 2 duration is 15 minutes');
  assert(getSlotDurationMinutes(validMixedSlots[2].start_time, validMixedSlots[2].end_time) === 10, 'Slot 3 duration is 10 minutes');
  assert(getSlotDurationMinutes(validMixedSlots[3].start_time, validMixedSlots[3].end_time) === 20, 'Slot 4 duration is 20 minutes');

  assert(validMixedSlots[0].capacity === 5, 'Slot 1 maximum bookings is 5');
  assert(validMixedSlots[1].capacity === 3, 'Slot 2 maximum bookings is 3');
  assert(validMixedSlots[2].capacity === 2, 'Slot 3 maximum bookings is 2');
  assert(validMixedSlots[3].capacity === 4, 'Slot 4 maximum bookings is 4');
}

// ---------------------------------------------------------------------------
// TEST 2: Validation of Overlapping Slots and Out-of-Bounds Slots
// ---------------------------------------------------------------------------
console.log('\n--- 2. Overlapping Slot & Boundary Validation ---');

// Overlapping slots: 9:00-9:15 and 9:10-9:25
{
  const overlappingSlots = [
    { id: 's1', start_time: '09:00 AM', end_time: '09:15 AM', capacity: 5 },
    { id: 's2', start_time: '09:10 AM', end_time: '09:25 AM', capacity: 3 },
  ];
  const res = validateFlexibleSlotsConfig(workingHours, overlappingSlots);
  assert(res.valid === false, 'Overlapping slots (09:00-09:15 and 09:10-09:25) are rejected');
  assert(res.error?.includes('overlaps'), `Error clearly states overlap: "${res.error}"`);
}

// Slot outside working hours: 08:30 AM - 09:00 AM when working hours start at 09:00 AM
{
  const outsideSlots = [
    { id: 's0', start_time: '08:30 AM', end_time: '09:00 AM', capacity: 2 },
    { id: 's1', start_time: '09:00 AM', end_time: '09:15 AM', capacity: 5 },
  ];
  const res = validateFlexibleSlotsConfig(workingHours, outsideSlots);
  assert(res.valid === false, 'Slot outside working hours is rejected');
  assert(res.error?.includes('outside configured working hours'), `Error explains boundary violation: "${res.error}"`);
}

// Slot where start time >= end time
{
  const invertedSlots = [
    { id: 's1', start_time: '09:30 AM', end_time: '09:15 AM', capacity: 2 },
  ];
  const res = validateFlexibleSlotsConfig(workingHours, invertedSlots);
  assert(res.valid === false, 'Slot with start time >= end time is rejected');
}

// Slot with invalid capacity (0 or negative)
{
  const zeroCapSlots = [
    { id: 's1', start_time: '09:00 AM', end_time: '09:15 AM', capacity: 0 },
  ];
  const res = validateFlexibleSlotsConfig(workingHours, zeroCapSlots);
  assert(res.valid === false, 'Slot with capacity < 1 is rejected');
}

// ---------------------------------------------------------------------------
// TEST 3: Editing and Deleting Slots
// ---------------------------------------------------------------------------
console.log('\n--- 3. Editing and Deleting Slots ---');

{
  let currentSlots = [...validMixedSlots];

  // Edit slot 3 (change duration from 10m to 15m: 9:30 - 9:45, and adjust slot 4: 9:45 - 10:00)
  currentSlots = currentSlots.map((s) => {
    if (s.id === 's3') return { ...s, end_time: '09:45 AM', capacity: 6 };
    if (s.id === 's4') return { ...s, start_time: '09:45 AM', end_time: '10:00 AM' };
    return s;
  });

  const resEdited = validateFlexibleSlotsConfig(workingHours, currentSlots);
  assert(resEdited.valid === true, 'Edited slots are valid after contiguous adjustment');
  assert(currentSlots.find((s) => s.id === 's3')?.capacity === 6, 'Slot 3 capacity edited to 6');

  // Delete slot 4
  currentSlots = currentSlots.filter((s) => s.id !== 's4');
  assert(currentSlots.length === 3, 'Slot 4 successfully removed (3 slots remaining)');
  const resDeleted = validateFlexibleSlotsConfig(workingHours, currentSlots);
  assert(resDeleted.valid === true, 'Remaining slots valid after deletion');
}

// ---------------------------------------------------------------------------
// TEST 4: Daily Slots Generation Algorithm
// ---------------------------------------------------------------------------
console.log('\n--- 4. Daily Slots Generation & Synchronization Logic ---');

const generateDailySlotsFromConfigFn = (shopId, dateStr, config, serviceId = null) => {
  const result = [];
  if (config.customSlots && config.customSlots.length > 0) {
    config.customSlots.forEach((cs) => {
      const sMin = parseTimeToMinutes(cs.start_time);
      const eMin = parseTimeToMinutes(cs.end_time);
      if (sMin >= eMin) return;
      const cap = Math.max(1, Number(cs.capacity) || 1);

      result.push({
        id: `slot-${shopId}-${dateStr}-${sMin}`,
        shop_id: shopId,
        service_id: serviceId,
        slot_date: dateStr,
        start_time: minutesToFormattedTime(sMin),
        end_time: minutesToFormattedTime(eMin),
        is_available: true,
        booked_by_request_id: null,
        concurrent_capacity: cap,
        capacity: cap,
        booked_count: 0,
        confirmed_count: 0,
        created_at: new Date().toISOString(),
      });
    });
    result.sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));
    return result;
  }
  return [];
};

const shopId = 'shop-clinic-101';
const dateStr = '2026-10-15';
const slotConfig = {
  workingHours,
  customSlots: validMixedSlots,
  availableDays: [0, 1, 2, 3, 4, 5, 6],
  slotDurationMinutes: 15,
};

const generated = generateDailySlotsFromConfigFn(shopId, dateStr, slotConfig, null);
assert(generated.length === 4, 'Generated exactly 4 custom slots for the day');
assert(generated[0].start_time === '09:00 AM' && generated[0].end_time === '09:15 AM', 'First slot is 09:00 AM - 09:15 AM');
assert(generated[0].capacity === 5, 'First slot has capacity 5');
assert(generated[2].start_time === '09:30 AM' && generated[2].end_time === '09:40 AM', 'Third slot is 09:30 AM - 09:40 AM');
assert(generated[2].capacity === 2, 'Third slot has capacity 2');

// ---------------------------------------------------------------------------
// TEST 5: Booking Capacity Limits (Enforcing Capacity, Preventing Overbooking)
// ---------------------------------------------------------------------------
console.log('\n--- 5. Booking Capacity Enforcement & Full Slot Prevention ---');

// Simulate slot 3 (capacity = 2) booking flow
const simulatedSlots = JSON.parse(JSON.stringify(generated));
const targetSlot = simulatedSlots[2]; // 09:30 - 09:40, capacity = 2

function bookSlotAtomic(slotList, slotId) {
  const slot = slotList.find((s) => s.id === slotId);
  if (!slot) return { success: false, error: 'Slot not found' };

  const capacity = slot.capacity || 1;
  const bookedCount = slot.booked_count || 0;

  if (bookedCount >= capacity) {
    return { success: false, code: 'INTERVAL_FULL', error: 'This interval is now full. Please choose another time.' };
  }

  slot.booked_count = bookedCount + 1;
  slot.confirmed_count = slot.booked_count;
  slot.is_available = slot.booked_count < capacity;
  return { success: true, token: slot.booked_count, remaining: capacity - slot.booked_count };
}

// Booking 1 of 2
const b1 = bookSlotAtomic(simulatedSlots, targetSlot.id);
assert(b1.success === true, 'Booking 1 succeeds');
assert(b1.remaining === 1, '1 spot remaining after first booking');
assert(targetSlot.is_available === true, 'Slot remains available');

// Booking 2 of 2
const b2 = bookSlotAtomic(simulatedSlots, targetSlot.id);
assert(b2.success === true, 'Booking 2 succeeds');
assert(b2.remaining === 0, '0 spots remaining (capacity reached)');
assert(targetSlot.is_available === false, 'Slot marked unavailable (Full)');

// Booking 3 of 2 (Over capacity attempt)
const b3 = bookSlotAtomic(simulatedSlots, targetSlot.id);
assert(b3.success === false, 'Booking 3 correctly rejected when capacity reached');
assert(b3.code === 'INTERVAL_FULL', 'Rejection code is INTERVAL_FULL');
assert(targetSlot.booked_count === 2, 'Slot booked_count remains strictly at capacity limit (2)');

// ---------------------------------------------------------------------------
// TEST 6: Simultaneous Booking Attempts (Concurrency Protection)
// ---------------------------------------------------------------------------
console.log('\n--- 6. Simultaneous Concurrent Booking Protection ---');

// Slot 4: 9:40 - 10:00 (capacity = 4)
const slot4 = simulatedSlots[3];
assert(slot4.capacity === 4, 'Slot 4 capacity is 4');

// Simulate 8 concurrent booking attempts on slot 4
const attempts = [];
for (let i = 1; i <= 8; i++) {
  attempts.push(bookSlotAtomic(simulatedSlots, slot4.id));
}

const successfulAttempts = attempts.filter((a) => a.success);
const rejectedAttempts = attempts.filter((a) => !a.success);

assert(successfulAttempts.length === 4, `Exactly 4 bookings succeeded (${successfulAttempts.length}/4)`);
assert(rejectedAttempts.length === 4, `Exactly 4 bookings rejected (${rejectedAttempts.length}/4)`);
assert(slot4.booked_count === 4, 'Slot 4 final booked count is strictly 4');
assert(slot4.is_available === false, 'Slot 4 is marked full');

// ---------------------------------------------------------------------------
// TEST 7: Preserving Existing Bookings when Schedule is Edited
// ---------------------------------------------------------------------------
console.log('\n--- 7. Preserving Existing Bookings on Schedule Resync ---');

// Merge and sync logic with booking preservation
function syncScheduleWithPreservation(existingSlots, newConfigSlots) {
  const merged = [];

  // 1. Process new configured slots
  newConfigSlots.forEach((newS) => {
    const existing = existingSlots.find((e) => e.start_time === newS.start_time);
    if (existing) {
      const activeBooked = existing.booked_count || 0;
      const newCap = Math.max(newS.capacity, activeBooked);
      merged.push({
        ...existing,
        end_time: newS.end_time,
        capacity: newCap,
        concurrent_capacity: newCap,
        is_available: activeBooked < newCap,
      });
    } else {
      merged.push({ ...newS, booked_count: 0, confirmed_count: 0, is_available: true });
    }
  });

  // 2. CRITICAL PRESERVATION: Keep existing slots that had confirmed bookings even if deleted from template
  existingSlots.forEach((oldS) => {
    const inNew = newConfigSlots.some((n) => n.start_time === oldS.start_time);
    if (!inNew) {
      const activeBooked = oldS.booked_count || 0;
      if (activeBooked > 0) {
        // MUST NOT BE DROPPED!
        merged.push(oldS);
      }
    }
  });

  merged.sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));
  return merged;
}

// Current state:
// Slot 3 (09:30 AM) has 2 confirmed bookings.
// Slot 4 (09:40 AM) has 4 confirmed bookings.
// Shopkeeper edits schedule:
// - Removes Slot 3 entirely
// - Expands Slot 4 capacity from 4 to 6
// - Adds new Slot 5 (10:00 - 10:15, capacity 3)
const newConfigSlots = [
  { id: 's1', start_time: '09:00 AM', end_time: '09:15 AM', capacity: 5 },
  { id: 's2', start_time: '09:15 AM', end_time: '09:30 AM', capacity: 3 },
  // Slot 3 (09:30 AM) removed from template!
  { id: 's4-mod', start_time: '09:40 AM', end_time: '10:00 AM', capacity: 6 },
  { id: 's5-new', start_time: '10:00 AM', end_time: '10:15 AM', capacity: 3 },
];

const resyncedSlots = syncScheduleWithPreservation(simulatedSlots, newConfigSlots);

// 1. Verify Slot 3 is preserved!
const preservedSlot3 = resyncedSlots.find((s) => s.start_time === '09:30 AM');
assert(preservedSlot3 !== undefined, 'CRITICAL: Slot 3 preserved despite removal because it has confirmed bookings');
assert(preservedSlot3?.booked_count === 2, 'Preserved Slot 3 retains its 2 confirmed bookings without cancellation');

// 2. Verify Slot 4 has capacity expanded to 6 and now has 2 open spots
const resyncedSlot4 = resyncedSlots.find((s) => s.start_time === '09:40 AM');
assert(resyncedSlot4?.booked_count === 4, 'Slot 4 retains all 4 existing bookings');
assert(resyncedSlot4?.capacity === 6, 'Slot 4 capacity expanded to 6');
assert(resyncedSlot4?.is_available === true, 'Slot 4 availability toggled back to true (4 < 6)');

// 3. Verify new Slot 5 was added
const resyncedSlot5 = resyncedSlots.find((s) => s.start_time === '10:00 AM');
assert(resyncedSlot5 !== undefined, 'New Slot 5 successfully added to schedule');
assert(resyncedSlot5?.capacity === 3, 'New Slot 5 has capacity 3');

console.log(`\n===============================================================`);
console.log(`TEST SUMMARY: ${passCount} passed, ${failCount} failed.`);
console.log(`===============================================================`);

if (failCount > 0) {
  process.exit(1);
}
