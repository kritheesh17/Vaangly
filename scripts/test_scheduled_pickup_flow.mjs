import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getAvailablePickupDates,
  getAvailablePickupSlots,
  validateOrderPickupAt,
  formatPickupTime,
  sortOrdersByPickupPriority,
  buildShopIsoTimestamp,
} from '../src/lib/orderPickupUtils.ts';
import {
  DEFAULT_SHOP_TIMEZONE,
  getShopCurrentDateTime,
  parseTimeToMinutes,
} from '../src/lib/appointmentValidation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

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

console.log('========================================================================');
console.log('VAANGLY SCHEDULED PICKUP TIME FEATURE VERIFICATION SUITE');
console.log('========================================================================\n');

// Mock shop setup
const mockShop = {
  id: '33333333-3333-3333-3333-333333333333',
  owner_id: '11111111-1111-1111-1111-111111111111',
  name: 'Mylapore Heritage Provisions',
  shop_type_id: 'st-grocery',
  location_id: 'loc-chn-mylapore',
  address_line: '12 North Mada Street, Mylapore, Chennai',
  phone: '+91 98401 23456',
  opening_time: '08:00',
  closing_time: '21:00',
  is_open_today: true,
  status: 'active',
  is_live: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  slot_config: {
    ranges: [{ id: 'r1', start: '08:00', end: '21:00', concurrent: 5 }],
    slotDurationMinutes: 30,
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    breaks: [{ id: 'b1', title: 'Lunch Break', start: '13:00', end: '14:00' }],
    bufferMinutes: 15,
    advanceBookingDays: 5,
    timeZone: 'Asia/Kolkata',
  },
};

// --------------------------------------------------------------------------
// 1. ASAP order
// --------------------------------------------------------------------------
console.log('--- TEST 1: ASAP Order Semantics ---');
{
  const resNull = validateOrderPickupAt(mockShop, null);
  assert(resNull.valid === true, 'validateOrderPickupAt accepts null pickup_at as ASAP');

  const resUndefined = validateOrderPickupAt(mockShop, undefined);
  assert(resUndefined.valid === true, 'validateOrderPickupAt accepts undefined pickup_at as ASAP');

  assert(formatPickupTime(null) === 'ASAP', 'formatPickupTime(null) returns "ASAP"');
  assert(formatPickupTime(undefined) === 'ASAP', 'formatPickupTime(undefined) returns "ASAP"');
}

// --------------------------------------------------------------------------
// 2. Scheduled pickup today
// --------------------------------------------------------------------------
console.log('\n--- TEST 2: Scheduled Pickup Today ---');
{
  const testNow = new Date('2026-10-02T05:30:00.000Z'); // 11:00 AM IST
  const shopNow = getShopCurrentDateTime(DEFAULT_SHOP_TIMEZONE, testNow);
  const slotsToday = getAvailablePickupSlots(mockShop, shopNow.dateStr, DEFAULT_SHOP_TIMEZONE, testNow);

  assert(slotsToday.length > 0, `Generated ${slotsToday.length} available slots for today`);

  // Target 5:00 PM (17:00) today
  const validSlotToday = slotsToday.find((s) => s.timeStr === '17:00');
  assert(Boolean(validSlotToday), 'Found 05:00 PM slot for today');

  if (validSlotToday) {
    const res = validateOrderPickupAt(mockShop, validSlotToday.isoTimestamp, DEFAULT_SHOP_TIMEZONE, testNow);
    assert(res.valid === true, 'Future time slot for today (05:00 PM) is valid');
    assert(formatPickupTime(validSlotToday.isoTimestamp, DEFAULT_SHOP_TIMEZONE, testNow).startsWith('Today,'), 'Formatted string starts with "Today,"');
  }
}

// --------------------------------------------------------------------------
// 3. Scheduled pickup future date
// --------------------------------------------------------------------------
console.log('\n--- TEST 3: Scheduled Pickup Future Date ---');
{
  const testNow = new Date('2026-10-02T10:00:00.000Z'); // 03:30 PM IST
  const tomorrow = new Date('2026-10-03T10:00:00.000Z');
  const tomorrowInfo = getShopCurrentDateTime(DEFAULT_SHOP_TIMEZONE, tomorrow);

  const tomorrowSlots = getAvailablePickupSlots(mockShop, tomorrowInfo.dateStr, DEFAULT_SHOP_TIMEZONE, testNow);
  assert(tomorrowSlots.length > 0, `Generated ${tomorrowSlots.length} slots for tomorrow`);

  // Tomorrow morning slot (09:00 AM) must NOT be filtered out even though current time is 03:30 PM
  const morningSlotTomorrow = tomorrowSlots.find((s) => s.timeStr === '09:00');
  assert(Boolean(morningSlotTomorrow), 'Tomorrow morning slot (09:00 AM) is available and NOT filtered by today current-time');

  if (morningSlotTomorrow) {
    const res = validateOrderPickupAt(mockShop, morningSlotTomorrow.isoTimestamp, DEFAULT_SHOP_TIMEZONE, testNow);
    assert(res.valid === true, 'Tomorrow morning slot passes validation');
    assert(formatPickupTime(morningSlotTomorrow.isoTimestamp, DEFAULT_SHOP_TIMEZONE, testNow).startsWith('Tomorrow,'), 'Formatted string starts with "Tomorrow,"');
  }
}

// --------------------------------------------------------------------------
// 4. Reject past pickup time
// --------------------------------------------------------------------------
console.log('\n--- TEST 4: Reject Past Pickup Time ---');
{
  const testNow = new Date('2026-10-02T07:00:00.000Z'); // 12:30 PM IST
  const pastIso = '2026-10-01T07:00:00.000Z'; // Yesterday

  const res = validateOrderPickupAt(mockShop, pastIso, DEFAULT_SHOP_TIMEZONE, testNow);
  assert(res.valid === false, 'Past date pickup is rejected');
  assert(res.error?.includes('past'), `Rejection message indicates past date: "${res.error}"`);
}

// --------------------------------------------------------------------------
// 5. Reject a currently-started pickup time
// --------------------------------------------------------------------------
console.log('\n--- TEST 5: Reject Currently-Started / Past Times for Today ---');
{
  // Current time is 12:30 PM IST
  const testNow = new Date('2026-10-02T07:00:00.000Z'); // 12:30 PM IST
  const todayStr = '2026-10-02';

  const slotsToday = getAvailablePickupSlots(mockShop, todayStr, DEFAULT_SHOP_TIMEZONE, testNow);

  // Check slots that must NOT appear: 10:30 AM, 11:00 AM, 12:00 PM, 12:30 PM
  const slot1030 = slotsToday.find((s) => s.timeStr === '10:30');
  const slot1100 = slotsToday.find((s) => s.timeStr === '11:00');
  const slot1200 = slotsToday.find((s) => s.timeStr === '12:00');
  const slot1230 = slotsToday.find((s) => s.timeStr === '12:30');

  assert(!slot1030, '10:30 AM is excluded when current time is 12:30 PM');
  assert(!slot1100, '11:00 AM is excluded when current time is 12:30 PM');
  assert(!slot1200, '12:00 PM is excluded when current time is 12:30 PM');
  assert(!slot1230, '12:30 PM (currently-started) is excluded when current time is 12:30 PM');

  // Attempting to validate 12:30 PM today must fail
  const iso1230 = buildShopIsoTimestamp(todayStr, '12:30', DEFAULT_SHOP_TIMEZONE);
  const res = validateOrderPickupAt(mockShop, iso1230, DEFAULT_SHOP_TIMEZONE, testNow);
  assert(res.valid === false, '12:30 PM pickup fails validation when current time is 12:30 PM');
}

// --------------------------------------------------------------------------
// 6. Respect shop opening hours
// --------------------------------------------------------------------------
console.log('\n--- TEST 6: Respect Shop Opening Hours ---');
{
  const testNow = new Date('2026-10-02T01:00:00.000Z'); // 06:30 AM IST
  const tomorrowStr = '2026-10-03';

  // 06:00 AM tomorrow (shop opens at 08:00 AM)
  const earlyIso = buildShopIsoTimestamp(tomorrowStr, '06:00', DEFAULT_SHOP_TIMEZONE);
  const earlyRes = validateOrderPickupAt(mockShop, earlyIso, DEFAULT_SHOP_TIMEZONE, testNow);
  assert(earlyRes.valid === false, '06:00 AM pickup is rejected (before 08:00 AM opening)');
  assert(earlyRes.error?.includes('operating hours'), `Error mentions operating hours: "${earlyRes.error}"`);

  // 10:30 PM tomorrow (shop closes at 09:00 PM)
  const lateIso = buildShopIsoTimestamp(tomorrowStr, '22:30', DEFAULT_SHOP_TIMEZONE);
  const lateRes = validateOrderPickupAt(mockShop, lateIso, DEFAULT_SHOP_TIMEZONE, testNow);
  assert(lateRes.valid === false, '10:30 PM pickup is rejected (after 09:00 PM closing)');
}

// --------------------------------------------------------------------------
// 7. Respect shop breaks
// --------------------------------------------------------------------------
console.log('\n--- TEST 7: Respect Shop Breaks ---');
{
  const testNow = new Date('2026-10-02T01:00:00.000Z'); // 06:30 AM IST
  const tomorrowStr = '2026-10-03';

  // Shop break is 13:00 to 14:00 (1:00 PM - 2:00 PM)
  const tomorrowSlots = getAvailablePickupSlots(mockShop, tomorrowStr, DEFAULT_SHOP_TIMEZONE, testNow);
  const breakSlot = tomorrowSlots.find((s) => s.timeStr === '13:00' || s.timeStr === '13:30');
  assert(!breakSlot, 'Slots during lunch break (01:00 PM - 02:00 PM) are excluded from available slots');

  const breakIso = buildShopIsoTimestamp(tomorrowStr, '13:30', DEFAULT_SHOP_TIMEZONE);
  const res = validateOrderPickupAt(mockShop, breakIso, DEFAULT_SHOP_TIMEZONE, testNow);
  assert(res.valid === false, '13:30 pickup during break is rejected by validateOrderPickupAt');
  assert(res.error?.includes('break'), `Error specifies break period: "${res.error}"`);
}

// --------------------------------------------------------------------------
// 8. Correct timezone conversion
// --------------------------------------------------------------------------
console.log('\n--- TEST 8: Correct Timezone Conversion ---');
{
  const isoStr = buildShopIsoTimestamp('2026-10-02', '19:00', 'Asia/Kolkata');
  assert(isoStr.includes('+05:30'), `Timestamp "${isoStr}" includes Asia/Kolkata (+05:30) offset`);

  const d = new Date(isoStr);
  const shopInfo = getShopCurrentDateTime('Asia/Kolkata', d);
  assert(shopInfo.dateStr === '2026-10-02', `Converted date matches 2026-10-02`);
  assert(shopInfo.formattedTime === '19:00', `Converted time matches 19:00 in Asia/Kolkata`);
}

// --------------------------------------------------------------------------
// 9. Customer sees requested pickup time
// --------------------------------------------------------------------------
console.log('\n--- TEST 9: Customer UX (RequestDetailPage & OrdersPage) ---');
{
  const reqDetailPath = path.join(ROOT, 'src', 'pages', 'RequestDetailPage.tsx');
  assert(fs.existsSync(reqDetailPath), 'RequestDetailPage.tsx exists');
  const reqDetailCode = fs.readFileSync(reqDetailPath, 'utf8');

  assert(reqDetailCode.includes('vaango-customer-pickup-card'), 'RequestDetailPage renders .vaango-customer-pickup-card');
  assert(reqDetailCode.includes('Pickup'), 'RequestDetailPage displays Pickup label');
  assert(reqDetailCode.includes('formatPickupTime'), 'RequestDetailPage uses formatPickupTime');

  const ordersPagePath = path.join(ROOT, 'src', 'pages', 'OrdersPage.tsx');
  assert(fs.existsSync(ordersPagePath), 'OrdersPage.tsx exists');
  const ordersCode = fs.readFileSync(ordersPagePath, 'utf8');

  assert(ordersCode.includes('Pickup:'), 'OrdersPage displays Pickup label in card list');
  assert(ordersCode.includes('formatPickupTime'), 'OrdersPage formats pickup time');
}

// --------------------------------------------------------------------------
// 10. Shopkeeper sees requested pickup time
// --------------------------------------------------------------------------
console.log('\n--- TEST 10: Shopkeeper UX (RequestCard & ShopkeeperRequestDetailPage) ---');
{
  const cardPath = path.join(ROOT, 'src', 'components', 'shopkeeper', 'RequestCard.tsx');
  assert(fs.existsSync(cardPath), 'RequestCard.tsx exists');
  const cardCode = fs.readFileSync(cardPath, 'utf8');

  assert(cardCode.includes('vaango-shop-req-card__pickup-badge'), 'RequestCard renders pickup badge');
  assert(cardCode.includes('Pickup:'), 'RequestCard displays Pickup label');

  const shopDetailPagePath = path.join(ROOT, 'src', 'pages', 'shopkeeper', 'ShopkeeperRequestDetailPage.tsx');
  assert(fs.existsSync(shopDetailPagePath), 'ShopkeeperRequestDetailPage.tsx exists');
  const shopDetailCode = fs.readFileSync(shopDetailPagePath, 'utf8');

  assert(shopDetailCode.includes('vaango-req-pickup-target-banner'), 'ShopkeeperRequestDetailPage renders Customer Collection Target banner');
  assert(shopDetailCode.includes('Customer Collection Target'), 'Banner displays "Customer Collection Target" title');
  assert(shopDetailCode.includes('This is not the order completion deadline'), 'Banner explains this is not completion deadline');
}

// --------------------------------------------------------------------------
// 11. Earlier pickup orders can be prioritized correctly
// --------------------------------------------------------------------------
console.log('\n--- TEST 11: Queue Prioritization by Pickup Urgency ---');
{
  // User scenario:
  // Order A: Created 7:00 AM, Pickup 7:00 PM
  // Order B: Created 10:00 AM, Pickup 11:00 AM
  // Order C: Created 10:30 AM, Pickup ASAP (immediate)
  const orderA = {
    id: 'ord-A',
    created_at: '2026-10-02T01:30:00.000Z', // 7:00 AM IST
    pickup_at: '2026-10-02T13:30:00.000Z',  // 7:00 PM IST
  };
  const orderB = {
    id: 'ord-B',
    created_at: '2026-10-02T04:30:00.000Z', // 10:00 AM IST
    pickup_at: '2026-10-02T05:30:00.000Z',  // 11:00 AM IST
  };
  const orderC = {
    id: 'ord-C',
    created_at: '2026-10-02T05:00:00.000Z', // 10:30 AM IST
    pickup_at: null, // ASAP
  };

  const prioritized = sortOrdersByPickupPriority([orderA, orderB, orderC]);

  assert(prioritized[0].id === 'ord-B' || prioritized[0].id === 'ord-C', 'Order B or C prioritized before Order A');
  assert(prioritized[2].id === 'ord-A', 'Order A (pickup at 7:00 PM) is ranked last behind earlier pickup requirements');

  // Verify tie-breaker when two orders have the same scheduled pickup time
  const orderA1 = {
    id: 'ord-A1',
    created_at: '2026-10-02T01:30:00.000Z', // 7:00 AM
    pickup_at: '2026-10-02T13:30:00.000Z',  // 7:00 PM
  };
  const orderA2 = {
    id: 'ord-A2',
    created_at: '2026-10-02T02:30:00.000Z', // 8:00 AM
    pickup_at: '2026-10-02T13:30:00.000Z',  // 7:00 PM
  };
  const tieBreakSorted = sortOrdersByPickupPriority([orderA2, orderA1]);
  assert(tieBreakSorted[0].id === 'ord-A1', 'Same pickup time breaks tie by earlier creation time');
}

// --------------------------------------------------------------------------
// 12. Existing ASAP orders continue working
// --------------------------------------------------------------------------
console.log('\n--- TEST 12: Existing ASAP Orders Continue Working ---');
{
  const cartContextPath = path.join(ROOT, 'src', 'context', 'CartContext.tsx');
  const cartCode = fs.readFileSync(cartContextPath, 'utf8');

  assert(cartCode.includes('submitShopRequest'), 'submitShopRequest exists in CartContext');
  assert(cartCode.includes('pickup_at: pickupAt || null'), 'CartContext sets pickup_at to null for ASAP orders');

  const cartPagePath = path.join(ROOT, 'src', 'pages', 'CartPage.tsx');
  const cartPageCode = fs.readFileSync(cartPagePath, 'utf8');

  assert(cartPageCode.includes('currentPickupMode === \'ASAP\''), 'ASAP is the default pickup mode in CartPage');
  assert(cartPageCode.includes('⚡ ASAP'), 'CartPage renders ASAP choice button');
}

// --------------------------------------------------------------------------
// 13. Existing payment flow remains unchanged
// --------------------------------------------------------------------------
console.log('\n--- TEST 13: Existing Payment Flow Remains Unchanged ---');
{
  const cartPagePath = path.join(ROOT, 'src', 'pages', 'CartPage.tsx');
  const cartPageCode = fs.readFileSync(cartPagePath, 'utf8');

  assert(cartPageCode.includes('UpiPaymentPanel'), 'UpiPaymentPanel is preserved in CartPage');
  assert(cartPageCode.includes('Pay at Shop'), 'Pay at Shop label is used in CartPage');
  assert(cartPageCode.includes("'pay_at_shop'"), 'Canonical pay_at_shop method is used in CartPage');

  const shopDetailPagePath = path.join(ROOT, 'src', 'pages', 'shopkeeper', 'ShopkeeperRequestDetailPage.tsx');
  const shopDetailCode = fs.readFileSync(shopDetailPagePath, 'utf8');

  assert(shopDetailCode.includes('renderPaymentSection'), 'renderPaymentSection is preserved');
  assert(shopDetailCode.includes('markRequestCustomerPaid'), 'markRequestCustomerPaid action is preserved');
  assert(shopDetailCode.includes('recordPayAtShopRefund'), 'recordPayAtShopRefund action is preserved');
}

// --------------------------------------------------------------------------
// 14. Existing appointment scheduling remains unchanged
// --------------------------------------------------------------------------
console.log('\n--- TEST 14: Existing Appointment Scheduling Remains Unchanged ---');
{
  const aptValidationPath = path.join(ROOT, 'src', 'lib', 'appointmentValidation.ts');
  const aptCode = fs.readFileSync(aptValidationPath, 'utf8');

  assert(aptCode.includes('validateWorkingHoursAndBreaks'), 'validateWorkingHoursAndBreaks is intact in appointmentValidation.ts');
  assert(aptCode.includes('filterFutureSlots'), 'filterFutureSlots is intact in appointmentValidation.ts');

  const migrationFile = path.join(ROOT, 'supabase', 'migrations', '20261002000065_order_scheduled_pickup.sql');
  assert(fs.existsSync(migrationFile), 'Migration 20261002000065_order_scheduled_pickup.sql exists');
  const migrationSql = fs.readFileSync(migrationFile, 'utf8');

  assert(migrationSql.includes("NEW.workflow_group_code = 'ORDER'"), 'DB validation trigger strictly targets ORDER workflows');
  assert(migrationSql.includes('ALTER TABLE public.requests'), 'Adds pickup_at column to requests table');
  assert(migrationSql.includes('idx_requests_pickup_at'), 'Creates index on requests(shop_id, pickup_at)');
}

console.log(`\n========================================================================`);
console.log(`TEST SUITE FINISHED: ${passCount} passed, ${failCount} failed.`);
console.log(`========================================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
