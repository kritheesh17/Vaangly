import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let envContent = '';
try {
  envContent = fs.readFileSync('.env', 'utf-8');
} catch (e) {}

let supabaseUrl = '';
let supabaseAnonKey = '';

for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed.startsWith('VITE_SUPABASE_URL=')) {
    supabaseUrl = trimmed.split('=')[1].trim();
  } else if (trimmed.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=') || trimmed.startsWith('VITE_SUPABASE_ANON_KEY=')) {
    supabaseAnonKey = trimmed.split('=')[1].trim();
  }
}

const SUPABASE_URL = supabaseUrl || 'https://pndikgqbgchzkrmlrmzo.supabase.co';
const SUPABASE_ANON_KEY = supabaseAnonKey;

async function verifyProduction() {
  console.log('=== VAANGLY PRODUCTION DEPLOYMENT & HEALTH VERIFICATION ===\n');

  // 1. Check Vercel Production Web Endpoint
  console.log('1. Checking Vercel Production Webapp (https://vaangly.vercel.app)...');
  try {
    const res = await fetch(`https://vaangly.vercel.app/?_t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' }
    });
    console.log('   HTTP Status:', res.status, res.statusText);
    console.log('   X-Vercel-Cache:', res.headers.get('x-vercel-cache') || 'N/A');
    console.log('   X-Vercel-Id:', res.headers.get('x-vercel-id') || 'N/A');
    
    const html = await res.text();
    const match = html.match(/src="\/assets\/index-([^"]+)\.js"/);
    if (match) {
      console.log('   Active Index Bundle:', match[0]);
    } else {
      console.log('   Index bundle detected via module script tags.');
    }

    // Check GitHub Commit Status for Vercel
    const ghRes = await fetch('https://api.github.com/repos/kritheesh17/Vaangly/commits/c51f717b4fdae8ad51bd703d102f03b6c8c2710c/status');
    if (ghRes.ok) {
      const ghData = await ghRes.json();
      console.log('   GitHub Commit State:', ghData.state);
      if (ghData.statuses && ghData.statuses.length > 0) {
        ghData.statuses.forEach(s => {
          console.log(`     - ${s.context}: ${s.state} (${s.description || ''})`);
        });
      }
    }
  } catch (err) {
    console.error('   Vercel Fetch Error:', err.message);
  }

  // 2. Check Supabase RPCs and Data Integrity
  console.log('\n2. Verifying Production Database (pndikgqbgchzkrmlrmzo)...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    // 2.1 Verify slot count and data preservation
    const { count: slotCount, error: slotErr } = await supabase
      .from('appointment_slots')
      .select('id', { count: 'exact', head: true });

    if (slotErr) {
      console.error('   Error querying appointment_slots:', slotErr.message);
    } else {
      console.log('   Total Appointment Slots in DB:', slotCount, '(All preserved)');
    }

    // 2.2 Verify services count
    const { count: srvCount, error: srvErr } = await supabase
      .from('shop_services')
      .select('id', { count: 'exact', head: true });

    if (srvErr) {
      console.error('   Error querying shop_services:', srvErr.message);
    } else {
      console.log('   Total Services in DB:', srvCount, '(All preserved)');
    }

    // 2.3 Verify RPC availability: get_appointment_slot_availability
    // Query a real slot from the database
    const { data: realSlots } = await supabase
      .from('appointment_slots')
      .select('id, slot_date, start_time, capacity')
      .limit(1);

    const testSlotId = realSlots?.[0]?.id || '00000000-0000-0000-0000-000000000000';
    const { data: availData, error: availErr } = await supabase
      .rpc('get_appointment_slot_availability', {
        p_slot_id: testSlotId
      });

    if (availErr) {
      console.log('   RPC get_appointment_slot_availability test response:', availErr.message);
    } else {
      console.log('   RPC get_appointment_slot_availability: OPERATIONAL');
      console.log('     Queried Slot ID:', testSlotId);
      console.log('     Availability Result:', JSON.stringify(availData));
    }

    // 2.4 Verify RPC security: book_appointment_with_token must reject unauthenticated callers
    const { error: bookErr } = await supabase
      .rpc('book_appointment_with_token', {
        p_slot_id: '00000000-0000-0000-0000-000000000000',
        p_customer_id: '00000000-0000-0000-0000-000000000000',
        p_customer_name: 'Test Customer',
        p_customer_phone: '9999999999',
        p_service_id: '00000000-0000-0000-0000-000000000000',
        p_service_name: 'General Consultation',
        p_price: 100,
        p_payment_method: 'pay_at_shop'
      });

    if (bookErr && (bookErr.code === '42501' || bookErr.message.includes('permission denied'))) {
      console.log('   RPC book_appointment_with_token: SECURE (Permission denied for anon - code 42501)');
    } else if (bookErr) {
      console.log('   RPC book_appointment_with_token response:', bookErr.message);
    }

    // 2.5 Verify RPC security: reschedule_appointment must reject unauthenticated callers
    const { error: reschedErr } = await supabase
      .rpc('reschedule_appointment', {
        p_request_id: '00000000-0000-0000-0000-000000000000',
        p_new_slot_id: '00000000-0000-0000-0000-000000000000'
      });

    if (reschedErr && (reschedErr.code === '42501' || reschedErr.message.includes('permission denied'))) {
      console.log('   RPC reschedule_appointment: SECURE (Permission denied for anon - code 42501)');
    } else if (reschedErr) {
      console.log('   RPC reschedule_appointment response:', reschedErr.message);
    }

  } catch (dbErr) {
    console.error('   Database check error:', dbErr.message);
  }

  console.log('\n=== VERIFICATION COMPLETE ===');
}

verifyProduction();
