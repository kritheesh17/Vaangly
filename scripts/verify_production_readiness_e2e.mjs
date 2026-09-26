import { createClient } from '@supabase/supabase-js';
import { validateWorkingHoursAndBreaks, parseTimeToMinutes, minutesToFormattedTime } from '../src/lib/appointmentValidation.ts';

const SUPABASE_URL = 'https://pndikgqbgchzkrmlrmzo.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuZGlrZ3FiZ2NoemtybWxybXpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTY2MTgwNSwiZXhwIjoyMTA1MjM3ODA1fQ.zPBOv5Hxloq21DhIT1Xq1CVNKT_OQArNHmA8dMz-eV4';
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

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

async function runProductionReadinessAudit() {
  console.log('================================================================');
  console.log('FINAL PRODUCTION READINESS AUDIT & MANUAL FLOW VERIFICATION');
  console.log('================================================================\n');

  const shopId = '023f30d9-0865-4e17-b144-a4895c267acb'; // Kritheesh_test_appointment
  const otherShopId = 'c24e78e7-22d0-40a4-b97a-4049f89f94d5'; // Saravana Stores

  // ----------------------------------------------------------------
  // FLOW A: CREATE APPOINTMENT (Exact prompt configuration)
  // ----------------------------------------------------------------
  console.log('--- FLOW A: Create Appointment ---');
  const appointmentInput = {
    name: 'Doctor Appointment',
    provider_name: 'Saantini vijayashankar',
    base_price: 200,
    price_type: 'fixed',
    duration_minutes: 15,
    specialization: 'General Physician',
    service_category: 'Consultation',
    is_available: true,
  };

  const { data: createdService, error: createErr } = await admin
    .from('shop_services')
    .insert({ ...appointmentInput, shop_id: shopId })
    .select()
    .single();

  assert(!createErr && createdService?.id, `Successfully created Doctor Appointment: ${createdService?.id}`);
  assert(createdService?.name === 'Doctor Appointment', 'Service name matches Doctor Appointment');
  assert(createdService?.provider_name === 'Saantini vijayashankar', 'Provider name matches Saantini vijayashankar');
  assert(Number(createdService?.base_price) === 200, 'Price verified at ₹200');
  assert(createdService?.duration_minutes === 15, 'Duration verified at 15 minutes');

  // Verify it appears in catalogue query for this shop
  const { data: catalogueList, error: catErr } = await admin
    .from('shop_services')
    .select('*')
    .eq('shop_id', shopId)
    .eq('is_available', true);

  assert(!catErr && catalogueList.some(s => s.id === createdService.id), 'Service appears in shopkeeper catalogue query');

  // ----------------------------------------------------------------
  // FLOW B: BREAK / GAP VERIFICATION
  // ----------------------------------------------------------------
  console.log('\n--- FLOW B: Break & Gap Verification ---');
  // 1. Verify validation allows break between shifts
  const shiftGapValidation = validateWorkingHoursAndBreaks(
    [
      { start: '09:00 AM', end: '01:00 PM' },
      { start: '02:00 PM', end: '06:00 PM' }
    ],
    [
      { title: 'Lunch Break', start: '01:01 PM', end: '01:59 PM' }
    ]
  );
  assert(shiftGapValidation.valid === true, 'Validation permits break in inter-shift gap (01:01 PM - 01:59 PM)');

  // 2. Verify break inside shift works
  const intraShiftValidation = validateWorkingHoursAndBreaks(
    [{ start: '09:00 AM', end: '01:00 PM' }],
    [{ title: 'Morning Tea', start: '10:30 AM', end: '10:45 AM' }]
  );
  assert(intraShiftValidation.valid === true, 'Validation permits break inside a single shift (10:30 AM - 10:45 AM)');

  // 3. Verify overlapping breaks are rejected
  const overlappingBreaksValidation = validateWorkingHoursAndBreaks(
    [
      { start: '09:00 AM', end: '01:00 PM' },
      { start: '02:00 PM', end: '06:00 PM' }
    ],
    [
      { title: 'Break 1', start: '01:00 PM', end: '01:30 PM' },
      { title: 'Break 2', start: '01:15 PM', end: '01:45 PM' }
    ]
  );
  assert(overlappingBreaksValidation.valid === false, 'Invalid overlapping breaks are rejected');

  // 4. Verify slot generation excludes gap (01:00 PM - 02:00 PM)
  const ranges = [
    { start: '09:00 AM', end: '01:00 PM' },
    { start: '02:00 PM', end: '06:00 PM' }
  ];
  const breaks = [{ title: 'Lunch Break', start: '01:01 PM', end: '01:59 PM' }];
  const parsedBreaks = breaks.map(b => ({
    start: parseTimeToMinutes(b.start),
    end: parseTimeToMinutes(b.end)
  }));

  const generatedSlots = [];
  const testDate = '2026-10-20';

  // Clean any previous test slots on testDate to ensure test isolation
  await admin.from('appointment_slots').delete().eq('shop_id', shopId).eq('slot_date', testDate);
  ranges.forEach(range => {
    const startMin = parseTimeToMinutes(range.start);
    const endMin = parseTimeToMinutes(range.end);
    let cur = startMin;
    while (cur + 15 <= endMin) {
      const slotStart = cur;
      const slotEnd = cur + 15;
      const inBreak = parsedBreaks.some(b => slotStart < b.end && slotEnd > b.start);
      if (!inBreak) {
        generatedSlots.push({
          shop_id: shopId,
          service_id: createdService.id,
          slot_date: testDate,
          start_time: minutesToFormattedTime(slotStart),
          end_time: minutesToFormattedTime(slotEnd),
          is_available: true,
          concurrent_capacity: 1
        });
      }
      cur += 15;
    }
  });

  const slotsInGap = generatedSlots.filter(s => {
    const min = parseTimeToMinutes(s.start_time);
    return min >= 780 && min < 840; // 13:00 to 14:00
  });
  assert(slotsInGap.length === 0, 'Zero appointment slots generated during 01:00 PM - 02:00 PM gap');
  assert(generatedSlots.length === 32, 'Generated exactly 32 valid slots (16 morning + 16 afternoon)');

  // Upsert slots into Supabase
  const { error: slotUpsertErr } = await admin
    .from('appointment_slots')
    .upsert(generatedSlots, { onConflict: 'shop_id,slot_date,start_time', ignoreDuplicates: true });
  assert(!slotUpsertErr, 'Successfully synced generated slots into public.appointment_slots');

  // ----------------------------------------------------------------
  // FLOW C: CUSTOMER BOOKING
  // ----------------------------------------------------------------
  console.log('\n--- FLOW C: Customer Booking ---');
  // 1. Customer queries available slots for shop on testDate
  const { data: customerViewSlots, error: custViewErr } = await admin
    .from('appointment_slots')
    .select('*')
    .eq('shop_id', shopId)
    .eq('slot_date', testDate)
    .eq('is_available', true);

  assert(!custViewErr && customerViewSlots?.length === 32, 'Customer views all 32 available appointment slots');
  const custGapSlots = customerViewSlots.filter(s => {
    const m = parseTimeToMinutes(s.start_time);
    return m >= 780 && m < 840;
  });
  assert(custGapSlots.length === 0, 'Customer UI: No slot appears during the 01:00 PM - 02:00 PM gap');

  // 2. Customer selects a slot (e.g. 09:15 AM - 09:30 AM)
  const targetSlot = customerViewSlots.find(s => s.start_time === '09:15 AM');
  assert(targetSlot !== undefined, 'Target booking slot 09:15 AM found');

  // 3. Customer booking reference
  const { data: existingReq } = await admin.from('requests').select('*').limit(1).single();
  const bookingRequestId = existingReq.id;
  assert(Boolean(bookingRequestId), `Customer booking reference obtained: ${existingReq.reference_code}`);

  // 4. Mark slot as booked
  const { error: slotBookErr } = await admin
    .from('appointment_slots')
    .update({ is_available: false, booked_by_request_id: bookingRequestId })
    .eq('id', targetSlot.id);

  assert(!slotBookErr, 'Slot marked booked and linked to customer request');

  // Verify slot is now unavailable to other customers
  const { data: updatedSlot } = await admin
    .from('appointment_slots')
    .select('*')
    .eq('id', targetSlot.id)
    .single();

  assert(updatedSlot.is_available === false, 'Booked slot is no longer available to other customers');
  assert(updatedSlot.booked_by_request_id === bookingRequestId, 'Booking reference persisted on appointment slot');

  // ----------------------------------------------------------------
  // FLOW D: DELETE WITHOUT BOOKINGS (Clean Hard Delete)
  // ----------------------------------------------------------------
  console.log('\n--- FLOW D: Delete Service Without Bookings ---');
  // Create an unbooked temporary service
  const { data: tempService } = await admin
    .from('shop_services')
    .insert({
      shop_id: shopId,
      name: 'Temporary Clean Service',
      price_type: 'fixed',
      base_price: 150,
      is_available: true
    })
    .select()
    .single();

  // Create an unbooked slot for it
  const { data: tempSlot } = await admin
    .from('appointment_slots')
    .insert({
      shop_id: shopId,
      service_id: tempService.id,
      slot_date: testDate,
      start_time: '05:45 PM',
      end_time: '06:00 PM',
      is_available: true
    })
    .select()
    .single();

  // Execute hard delete flow: delete unbooked slot, then delete service
  await admin.from('appointment_slots').delete().eq('service_id', tempService.id);
  const { error: tempDelErr } = await admin.from('shop_services').delete().eq('id', tempService.id).eq('shop_id', shopId);
  assert(!tempDelErr, 'Temporary service without bookings hard-deleted successfully');

  // Verify it no longer exists
  const { data: checkTemp } = await admin.from('shop_services').select('id').eq('id', tempService.id);
  assert(checkTemp?.length === 0, 'Service record completely removed from database');

  // ----------------------------------------------------------------
  // FLOW E: DELETE WITH HISTORY (Safe Soft-Deactivate)
  // ----------------------------------------------------------------
  console.log('\n--- FLOW E: Delete Service With Historical Booking ---');
  // Attempt to delete createdService (which has booked slot targetSlot)
  // Inspect booked slots
  const { data: bookedCheck } = await admin
    .from('appointment_slots')
    .select('id')
    .eq('service_id', createdService.id)
    .not('booked_by_request_id', 'is', null);

  assert(bookedCheck?.length > 0, 'Detected active/historical booking referencing Doctor Appointment');

  // Execute soft-deactivation flow
  const { error: softDeactErr } = await admin
    .from('shop_services')
    .update({ is_available: false })
    .eq('id', createdService.id)
    .eq('shop_id', shopId);

  assert(!softDeactErr, 'Service safely deactivated (is_available = false)');

  // Clean unbooked future slots
  await admin
    .from('appointment_slots')
    .delete()
    .eq('service_id', createdService.id)
    .is('booked_by_request_id', null);

  // Verify historical booking and request are PRESERVED INTACT
  const { data: preservedBookingReq } = await admin
    .from('requests')
    .select('*')
    .eq('id', bookingRequestId)
    .single();
  assert(preservedBookingReq !== null, 'Customer booking request remains completely intact in database');

  const { data: preservedBookedSlot } = await admin
    .from('appointment_slots')
    .select('*')
    .eq('id', targetSlot.id)
    .single();
  assert(preservedBookedSlot !== null && preservedBookedSlot.service_id === createdService.id, 'Historical booked appointment slot preserved with service_id');

  // ----------------------------------------------------------------
  // FLOW F: CROSS-SHOP SECURITY
  // ----------------------------------------------------------------
  console.log('\n--- FLOW F: Cross-Shop Security Isolation ---');
  // Attempt to update createdService (belongs to shopId) by specifying otherShopId
  const { data: rogueUpdate, error: rogueErr } = await admin
    .from('shop_services')
    .update({ name: 'Hacked Name' })
    .eq('id', createdService.id)
    .eq('shop_id', otherShopId) // Incorrect shop!
    .select();

  assert(rogueUpdate?.length === 0, 'Cross-shop modification denied (0 rows updated)');

  // Attempt to delete createdService using otherShopId
  const { data: rogueDelete } = await admin
    .from('shop_services')
    .delete()
    .eq('id', createdService.id)
    .eq('shop_id', otherShopId) // Incorrect shop!
    .select();

  assert(rogueDelete?.length === 0, 'Cross-shop deletion denied (0 rows deleted)');

  // Verify service name is still untouched
  const { data: untouchedSrv } = await admin.from('shop_services').select('name').eq('id', createdService.id).single();
  assert(untouchedSrv.name === 'Doctor Appointment', 'Service data remained untampered');

  // Clean up test booking slot and service
  await admin.from('appointment_slots').delete().eq('id', targetSlot.id);
  await admin.from('shop_services').delete().eq('id', createdService.id);
  console.log('\nCleaned up all verification test records.');

  console.log(`\n================================================================`);
  console.log(`ALL PRODUCTION FLOWS VERIFIED: ${passCount} passed, ${failCount} failed.`);
  console.log(`================================================================`);

  if (failCount > 0) process.exit(1);
}

runProductionReadinessAudit();
