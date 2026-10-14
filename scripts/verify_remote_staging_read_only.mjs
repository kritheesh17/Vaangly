import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://pndikgqbgchzkrmlrmzo.supabase.co',
  'sb_publishable_Ea-dHCdnXPqX0JGLknChig_uzJNwW50'
);

async function verify() {
  console.log('=== VERIFYING REMOTE STAGING POST-DEPLOYMENT SCHEMA (READ-ONLY) ===');

  // 1. Check free_delivery_above column on shops (Migration 68)
  const { data: shops, error: shopsErr } = await supabase
    .from('shops')
    .select('id, name, free_delivery_above')
    .limit(2);

  if (shopsErr) {
    console.error('FAIL 1: free_delivery_above column on shops:', shopsErr.message);
  } else {
    console.log('PASS 1: free_delivery_above column exists on shops:', shops);
  }

  // 2. Check appointment_slots capacity and concurrent_capacity columns (Migration 67)
  const { data: slots, error: slotsErr } = await supabase
    .from('appointment_slots')
    .select('id, capacity, concurrent_capacity')
    .limit(2);

  if (slotsErr) {
    console.error('FAIL 2: appointment_slots columns:', slotsErr.message);
  } else {
    console.log('PASS 2: appointment_slots columns verified:', slots);
  }

  // 3. Check shop_products schema with variants and is_available (Migration 69)
  const { data: prods, error: prodsErr } = await supabase
    .from('shop_products')
    .select('id, name, has_variants, variants, is_available')
    .limit(2);

  if (prodsErr) {
    console.error('FAIL 3: shop_products variants query:', prodsErr.message);
  } else {
    console.log('PASS 3: shop_products variants schema verified:', prods);
  }

  console.log('=== READ-ONLY VERIFICATION COMPLETE ===');
}

verify().catch((e) => {
  console.error(e);
  process.exit(1);
});
