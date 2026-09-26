import { validateWorkingHoursAndBreaks } from '../src/lib/appointmentValidation.ts';

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

console.log('=== TEST 1: Working Hours & Breaks Validation ===');

// 1. Break inside one shift (valid)
{
  const res = validateWorkingHoursAndBreaks(
    [{ start: '09:00 AM', end: '01:00 PM' }],
    [{ title: 'Tea Break', start: '12:00 PM', end: '12:30 PM' }]
  );
  assert(res.valid === true, 'Break inside one shift (09:00-13:00, break 12:00-12:30) is valid');
}

// 2. Break between two shifts (valid gap break)
{
  const res = validateWorkingHoursAndBreaks(
    [
      { start: '09:00 AM', end: '01:00 PM' },
      { start: '02:00 PM', end: '06:00 PM' }
    ],
    [{ title: 'Lunch Break', start: '01:01 PM', end: '01:59 PM' }]
  );
  assert(res.valid === true, 'Break in gap between shifts (13:01-13:59) is valid');
}

// 3. Break touching shift boundary - starts exactly when Shift 1 ends
{
  const res = validateWorkingHoursAndBreaks(
    [
      { start: '09:00 AM', end: '01:00 PM' },
      { start: '02:00 PM', end: '06:00 PM' }
    ],
    [{ title: 'Lunch Break', start: '01:00 PM', end: '01:30 PM' }]
  );
  assert(res.valid === true, 'Break touching shift boundary at start (13:00-13:30) is valid');
}

// 4. Break touching shift boundary - ends exactly when Shift 2 starts
{
  const res = validateWorkingHoursAndBreaks(
    [
      { start: '09:00 AM', end: '01:00 PM' },
      { start: '02:00 PM', end: '06:00 PM' }
    ],
    [{ title: 'Lunch Break', start: '01:30 PM', end: '02:00 PM' }]
  );
  assert(res.valid === true, 'Break touching shift boundary at end (13:30-14:00) is valid');
}

// 5. Break occupying entire gap between shifts
{
  const res = validateWorkingHoursAndBreaks(
    [
      { start: '09:00 AM', end: '01:00 PM' },
      { start: '02:00 PM', end: '06:00 PM' }
    ],
    [{ title: 'Lunch Break', start: '01:00 PM', end: '02:00 PM' }]
  );
  assert(res.valid === true, 'Break occupying entire gap (13:00-14:00) is valid');
}

// 6. Break partially overlapping shift boundary (invalid)
{
  const res = validateWorkingHoursAndBreaks(
    [{ start: '09:00 AM', end: '01:00 PM' }],
    [{ title: 'Invalid Break', start: '12:30 PM', end: '01:30 PM' }]
  );
  assert(res.valid === false, 'Break partially overlapping shift (12:30-13:30) is invalid');
}

// 7. Break partially overlapping shift start (invalid)
{
  const res = validateWorkingHoursAndBreaks(
    [{ start: '09:00 AM', end: '01:00 PM' }],
    [{ title: 'Invalid Break', start: '08:30 AM', end: '09:30 AM' }]
  );
  assert(res.valid === false, 'Break partially overlapping shift start (08:30-09:30) is invalid');
}

// 8. Break completely outside schedule (invalid)
{
  const res = validateWorkingHoursAndBreaks(
    [{ start: '09:00 AM', end: '01:00 PM' }],
    [{ title: 'Outside Break', start: '01:30 PM', end: '02:30 PM' }]
  );
  assert(res.valid === false, 'Break outside schedule (13:30-14:30) with no shift is invalid');
}

// 9. Zero duration break (invalid)
{
  const res = validateWorkingHoursAndBreaks(
    [{ start: '09:00 AM', end: '01:00 PM' }],
    [{ title: 'Zero Break', start: '01:00 PM', end: '01:00 PM' }]
  );
  assert(res.valid === false, 'Break with 0 duration (13:00-13:00) is invalid');
}

// 10. Multiple shifts with multiple breaks (both shift break and gap break)
{
  const res = validateWorkingHoursAndBreaks(
    [
      { start: '08:00 AM', end: '12:00 PM' },
      { start: '01:00 PM', end: '05:00 PM' },
      { start: '06:00 PM', end: '09:00 PM' }
    ],
    [
      { title: 'Morning Tea', start: '10:00 AM', end: '10:15 AM' },
      { title: 'Lunch', start: '12:00 PM', end: '01:00 PM' },
      { title: 'Evening Break', start: '05:00 PM', end: '06:00 PM' },
      { title: 'Night Tea', start: '07:30 PM', end: '07:45 PM' }
    ]
  );
  assert(res.valid === true, '3 shifts with 4 non-overlapping breaks (shift + gap) is valid');
}

// 11. Overlapping breaks in gap (invalid)
{
  const res = validateWorkingHoursAndBreaks(
    [
      { start: '09:00 AM', end: '01:00 PM' },
      { start: '02:00 PM', end: '06:00 PM' }
    ],
    [
      { title: 'Break 1', start: '01:00 PM', end: '01:40 PM' },
      { title: 'Break 2', start: '01:30 PM', end: '02:00 PM' }
    ]
  );
  assert(res.valid === false, 'Overlapping breaks in gap are rejected');
}

// 12. Overlapping working shifts (invalid)
{
  const res = validateWorkingHoursAndBreaks(
    [
      { start: '09:00 AM', end: '02:00 PM' },
      { start: '01:00 PM', end: '05:00 PM' }
    ]
  );
  assert(res.valid === false, 'Overlapping working shifts (09:00-14:00 & 13:00-17:00) are rejected');
}

console.log('\n=== TEST 2: Appointment Slot Generation During Gaps & Breaks ===');
import { parseTimeToMinutes, minutesToFormattedTime } from '../src/lib/appointmentValidation.ts';

// Emulate slot generation algorithm as in appointmentServiceApi.ts
function generateSlots(ranges, breaks, slotDuration = 15) {
  const parsedBreaks = breaks.map((b) => ({
    start: parseTimeToMinutes(b.start),
    end: parseTimeToMinutes(b.end),
  }));

  const slots = [];
  ranges.forEach((range) => {
    const startMin = parseTimeToMinutes(range.start);
    const endMin = parseTimeToMinutes(range.end);
    let cur = startMin;
    while (cur + slotDuration <= endMin) {
      const slotStart = cur;
      const slotEnd = cur + slotDuration;
      const inBreak = parsedBreaks.some((b) => slotStart < b.end && slotEnd > b.start);
      if (!inBreak) {
        slots.push({
          start: minutesToFormattedTime(slotStart),
          end: minutesToFormattedTime(slotEnd),
          startMin: slotStart,
          endMin: slotEnd,
        });
      }
      cur += slotDuration;
    }
  });
  return slots;
}

// Configuration from user prompt:
// Shift 1: 09:00 AM → 01:00 PM (540 → 780)
// Shift 2: 02:00 PM → 06:00 PM (840 → 1080)
// Break: 01:01 PM → 01:59 PM (781 → 839)
// Duration: 15 mins
{
  const ranges = [
    { start: '09:00 AM', end: '01:00 PM' },
    { start: '02:00 PM', end: '06:00 PM' },
  ];
  const breaks = [{ title: 'Lunch Break', start: '01:01 PM', end: '01:59 PM' }];
  const slots = generateSlots(ranges, breaks, 15);

  // 1. Verify no slot starts or ends within the 13:00 - 14:00 gap
  const gapSlots = slots.filter((s) => s.startMin >= 780 && s.endMin <= 840);
  assert(gapSlots.length === 0, 'Zero appointment slots generated in the inter-shift gap (01:00 PM - 02:00 PM)');

  // 2. Verify slots before gap end exactly at 01:00 PM
  const morningSlots = slots.filter((s) => s.endMin <= 780);
  assert(morningSlots.length === 16, `Generated 16 morning slots (4 hours * 4 slots/hr)`);
  assert(morningSlots[morningSlots.length - 1].end === '01:00 PM', 'Last morning slot ends exactly at 01:00 PM');

  // 3. Verify slots after gap start exactly at 02:00 PM
  const afternoonSlots = slots.filter((s) => s.startMin >= 840);
  assert(afternoonSlots.length === 16, `Generated 16 afternoon slots (4 hours * 4 slots/hr)`);
  assert(afternoonSlots[0].start === '02:00 PM', 'First afternoon slot starts exactly at 02:00 PM');
}

// Configuration with intra-shift break:
// Shift 1: 09:00 AM → 01:00 PM
// Break: 12:00 PM → 12:30 PM
{
  const ranges = [{ start: '09:00 AM', end: '01:00 PM' }];
  const breaks = [{ title: 'Tea Break', start: '12:00 PM', end: '12:30 PM' }];
  const slots = generateSlots(ranges, breaks, 15);

  const breakSlots = slots.filter((s) => s.startMin < 750 && s.endMin > 720);
  assert(breakSlots.length === 0, 'Zero appointment slots generated during intra-shift break (12:00 PM - 12:30 PM)');
  assert(slots.length === 14, 'Generated exactly 14 slots (16 total - 2 break slots)');
}

console.log(`\nValidation & Slot Generation Tests Summary: ${passCount} passed, ${failCount} failed.`);
if (failCount > 0) process.exit(1);
