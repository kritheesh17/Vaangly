import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

function createUserClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function createTestUser(role = 'customer') {
  const email = `audit_${Date.now()}_${Math.random().toString(36).substring(7)}@vaangly.test`;
  const password = 'Password@123';
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Test ' + role }
  });
  if (error) throw error;
  const user = data.user;

  // Ensure profile has correct role
  await adminClient.from('profiles').upsert({
    id: user.id,
    role,
    full_name: 'Test ' + role,
    email,
    phone: '9876543210',
    is_verified: true
  });

  const client = createUserClient();
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  return { user, client, email, password };
}

async function getAdminUser() {
  const email = 'admin@vaangly.test';
  const password = 'Password@123';

  // Check if exists or create
  const { data: userList } = await adminClient.auth.admin.listUsers();
  let user = userList?.users?.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Platform Administrator' }
    });
    if (error) throw error;
    user = data.user;
  } else {
    await adminClient.auth.admin.updateUserById(user.id, { password });
  }

  // Call bootstrap procedure
  const { data: bootRes, error: bootErr } = await adminClient.rpc('bootstrap_staging_admin');
  if (bootErr) throw bootErr;

  const client = createUserClient();
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  return { user, client, email, password };
}

async function runComprehensiveAudit() {
  console.log('====================================================');
  console.log('VAANGLY FULL SYSTEM PRODUCTION AUDIT TEST SUITE');
  console.log('====================================================\n');

  const results = {
    customer: [],
    shopkeeper: [],
    admin: [],
    security: []
  };

  // 1. Fetch baseline location and shop types
  const { data: locations } = await adminClient.from('locations').select('id, name').limit(1);
  const location = locations[0];
  console.log(`Using test location: ${location.name} (${location.id})`);

  const { data: shopTypes } = await adminClient.from('shop_types').select('id, code, workflow_group_code');
  const restaurantType = shopTypes.find((t) => t.code === 'restaurant');
  const groceryType = shopTypes.find((t) => t.code === 'grocery');
  const salonType = shopTypes.find((t) => t.code === 'salon');
  const tailorType = shopTypes.find((t) => t.code === 'tailor');

  // --- SECTION 1: ADMIN WORKFLOW AUDIT ---
  console.log('\n--- TESTING ADMIN WORKFLOWS ---');
  let adminUser;
  try {
    adminUser = await getAdminUser();
    console.log('✅ Admin user created & authenticated');
    results.admin.push({ test: 'Admin Authentication', passed: true });
  } catch (e) {
    console.error('❌ Admin auth failed:', e.message);
    results.admin.push({ test: 'Admin Authentication', passed: false, error: e.message });
  }

  // Admin application approval test
  let approvedShopId = null;
  let applicantUser = null;
  try {
    applicantUser = await createTestUser('customer');
    
    // Submit onboarding application
    const { data: appData, error: appErr } = await adminClient.from('shop_applications').insert({
      applicant_id: applicantUser.user.id,
      shop_name: 'Kangeyam Biryani House',
      owner_name: 'Chef Kumar',
      shop_type_id: restaurantType.id,
      location_id: location.id,
      contact_phone: '9876543210',
      address_line: '22 Chennimalai Road, Kangeyam',
      gps_lat: 11.0055,
      gps_lng: 77.5599,
      status: 'submitted'
    }).select().single();
    if (appErr) throw appErr;

    // Admin approves via approve_shop_application RPC
    const { data: approveRes, error: approveErr } = await adminUser.client.rpc('approve_shop_application', {
      p_application_id: appData.id,
      p_admin_id: adminUser.user.id,
      p_review_notes: 'Verified physically and approved.'
    });
    if (approveErr) throw approveErr;

    if (approveRes && approveRes.success && approveRes.shop_id) {
      approvedShopId = approveRes.shop_id;
      // Verify subscription created
      const { data: sub } = await adminClient.from('shop_subscriptions').select('id, status, daily_rate').eq('shop_id', approvedShopId).single();
      // Verify profile upgraded
      const { data: profile } = await adminClient.from('profiles').select('role').eq('id', applicantUser.user.id).single();
      
      if (sub && sub.status === 'TRIAL' && profile.role === 'shopkeeper') {
        console.log('✅ Admin Application Approval & Storefront Creation: PASSED (Shop ID: ' + approvedShopId + ')');
        results.admin.push({ test: 'Application Approval & Provisioning', passed: true });
      } else {
        throw new Error(`State mismatch: sub=${JSON.stringify(sub)}, role=${profile?.role}`);
      }
    } else {
      throw new Error('Approve RPC did not return success: ' + JSON.stringify(approveRes));
    }
  } catch (e) {
    console.error('❌ Admin Application Approval failed:', e.message);
    results.admin.push({ test: 'Application Approval & Provisioning', passed: false, error: e.message });
  }

  // Admin rejection test
  try {
    const dummyApplicant = await createTestUser('customer');
    const { data: rejApp } = await adminClient.from('shop_applications').insert({
      applicant_id: dummyApplicant.user.id,
      shop_name: 'Incomplete Shop',
      shop_type_id: groceryType.id,
      location_id: location.id,
      contact_phone: '9876543210',
      address_line: 'Missing documents',
      gps_lat: 11.0,
      gps_lng: 77.0,
      status: 'submitted'
    }).select().single();

    const { data: rejRes, error: rejErr } = await adminUser.client.rpc('reject_shop_application', {
      p_application_id: rejApp.id,
      p_admin_id: adminUser.user.id,
      p_rejection_reason: 'Storefront signage photo missing'
    });
    if (rejErr) throw rejErr;

    const { data: checkedApp } = await adminClient.from('shop_applications').select('status, review_notes').eq('id', rejApp.id).single();
    if (checkedApp.status === 'rejected' && checkedApp.review_notes.includes('Storefront signage photo missing')) {
      console.log('✅ Admin Application Rejection: PASSED');
      results.admin.push({ test: 'Application Rejection', passed: true });
    } else {
      throw new Error(`Unexpected app state: ${JSON.stringify(checkedApp)}`);
    }
  } catch (e) {
    console.error('❌ Admin Rejection failed:', e.message);
    results.admin.push({ test: 'Application Rejection', passed: false, error: e.message });
  }

  // --- SECTION 2: SHOPKEEPER WORKFLOW AUDIT ---
  console.log('\n--- TESTING SHOPKEEPER WORKFLOWS ---');
  let shopkeeperUser = applicantUser;
  let testProduct = null;
  try {
    // 1. Re-login shopkeeper client
    const { error: reloginErr } = await shopkeeperUser.client.auth.signInWithPassword({
      email: shopkeeperUser.email,
      password: shopkeeperUser.password
    });
    if (reloginErr) throw reloginErr;

    // 2. Add product with variants to catalogue
    const { data: prod, error: prodErr } = await shopkeeperUser.client.from('shop_products').insert({
      shop_id: approvedShopId,
      name: 'Special Chicken Biryani',
      description: 'Basmati rice cooked with authentic Kangeyam masala',
      price: 220.00,
      unit: 'plate',
      is_available: true,
      variants: [
        { id: 'v1', label: 'Family Pack (Serves 4)', price: 750, is_available: true, in_stock: true }
      ]
    }).select().single();
    if (prodErr) throw prodErr;
    testProduct = prod;
    console.log('✅ Shopkeeper Product & Universal Variants Addition: PASSED');
    results.shopkeeper.push({ test: 'Product & Variants Addition', passed: true });

    // 4. Test Go Live via toggle_shop_live RPC
    const { data: liveData, error: liveErr } = await shopkeeperUser.client.rpc('toggle_shop_live', {
      p_shop_id: approvedShopId,
      p_is_live: true
    });
    if (liveErr) throw liveErr;

    const { data: liveShop } = await adminClient.from('shops').select('is_live, status').eq('id', approvedShopId).single();
    if (liveShop.is_live === true && liveShop.status === 'active') {
      console.log('✅ Shopkeeper Go Live: PASSED (Shop is LIVE and active)');
      results.shopkeeper.push({ test: 'Go Live Flow', passed: true });
    } else {
      throw new Error(`Shop live state incorrect: ${JSON.stringify(liveShop)}`);
    }

  } catch (e) {
    console.error('❌ Shopkeeper workflow failed:', e.message);
    results.shopkeeper.push({ test: 'Shopkeeper Core Workflows', passed: false, error: e.message });
  }

  // --- SECTION 3: CUSTOMER WORKFLOW AUDIT ---
  console.log('\n--- TESTING CUSTOMER WORKFLOWS ---');
  let customerUser = null;
  let createdOrderId = null;
  try {
    customerUser = await createTestUser('customer');

    // 1. Customer discovers live shop in location
    const { data: liveShops, error: browseErr } = await customerUser.client
      .from('shops')
      .select('id, name, is_live, status')
      .eq('location_id', location.id)
      .eq('is_live', true)
      .eq('status', 'active');
    if (browseErr) throw browseErr;

    const foundShop = liveShops.find((s) => s.id === approvedShopId);
    if (!foundShop) throw new Error('Live shop not found in customer browse query');
    console.log('✅ Customer Shop Discovery: PASSED');
    results.customer.push({ test: 'Shop Discovery', passed: true });

    // 2. Customer places restaurant food order (DINE_IN vs TAKEAWAY)
    // First test: omitting fulfillment_type on restaurant order should FAIL due to trigger
    const { data: badOrder, error: badOrderErr } = await customerUser.client.from('requests').insert({
      reference_code: 'ORD-BAD',
      customer_id: customerUser.user.id,
      shop_id: approvedShopId,
      workflow_group_code: 'ORDER',
      current_state: 'REQUESTED',
      total_estimate: 220.00,
      payment_method: 'cash',
      fulfillment_type: null // invalid for restaurant!
    });
    if (badOrderErr && badOrderErr.message.includes('Food orders require order type DINE_IN or TAKEAWAY')) {
      console.log('✅ Food Order Fulfillment Validation (Missing Type Blocked): PASSED');
      results.customer.push({ test: 'Food Order Type Validation Guard', passed: true });
    } else {
      throw new Error('Expected food order trigger error, got: ' + (badOrderErr?.message || 'success'));
    }

    // Second test: placing order with fulfillment_type = 'TAKEAWAY' -> SUCCESS
    const { data: goodOrder, error: goodOrderErr } = await customerUser.client.from('requests').insert({
      reference_code: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
      customer_id: customerUser.user.id,
      shop_id: approvedShopId,
      workflow_group_code: 'ORDER',
      current_state: 'REQUESTED',
      total_estimate: 220.00,
      payment_method: 'cash',
      fulfillment_type: 'TAKEAWAY',
      notes: JSON.stringify({
        items: [{ product_id: testProduct.id, name: testProduct.name, quantity: 1, price: 220 }],
        customer_name: 'Test Customer',
        fulfillment_type: 'TAKEAWAY'
      })
    }).select().single();
    if (goodOrderErr) throw goodOrderErr;
    createdOrderId = goodOrder.id;

    console.log('✅ Customer Food Order Submission (TAKEAWAY): PASSED (Order ID: ' + createdOrderId + ')');
    results.customer.push({ test: 'Order Placement', passed: true });

    // 3. Shopkeeper transitions order to COMPLETED
    const states = ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];
    for (const nextState of states) {
      const { error: transErr } = await shopkeeperUser.client.from('requests').update({
        current_state: nextState,
        updated_at: new Date().toISOString()
      }).eq('id', createdOrderId);
      if (transErr) throw transErr;
    }
    console.log('✅ Shopkeeper Order Transitions (REQUESTED -> COMPLETED): PASSED');
    results.shopkeeper.push({ test: 'Order State Lifecycle', passed: true });

    // 4. Customer submits rating for COMPLETED order
    const { error: rateErr } = await customerUser.client.from('shop_ratings').upsert({
      shop_id: approvedShopId,
      customer_id: customerUser.user.id,
      request_id: createdOrderId,
      rating: 5,
      review: 'Exceptional biryani! Fresh spices and fast preparation.'
    }, { onConflict: 'request_id' });
    if (rateErr) throw rateErr;

    console.log('✅ Customer Rating & Review Submission: PASSED');
    results.customer.push({ test: 'Completed Order Rating', passed: true });

  } catch (e) {
    console.error('❌ Customer workflow failed:', e.message);
    results.customer.push({ test: 'Customer Core Workflows', passed: false, error: e.message });
  }

  // --- SECTION 4: SECURITY & RLS AUDIT ---
  console.log('\n--- TESTING SECURITY & PERMISSION BOUNDARIES ---');
  try {
    // 1. Rogue user cannot alter another shop's products
    const rogueUser = await createTestUser('customer');
    const { error: rogueEditErr } = await rogueUser.client
      .from('shop_products')
      .update({ price: 1.00 })
      .eq('id', testProduct.id);
    // In Supabase RLS, UPDATE on unauthorized rows returns affected count 0 or error
    const { data: checkProd } = await adminClient.from('shop_products').select('price').eq('id', testProduct.id).single();
    if (Number(checkProd.price) === 220.00) {
      console.log('✅ RLS: Unauthorized product modification blocked: PASSED');
      results.security.push({ test: 'Product Edit RLS', passed: true });
    } else {
      throw new Error('Rogue user succeeded in modifying product price!');
    }

    // 2. Regular user cannot call approve_shop_application
    const { error: unauthApproveErr } = await rogueUser.client.rpc('approve_shop_application', {
      p_application_id: '00000000-0000-0000-0000-000000000000',
      p_admin_id: rogueUser.user.id
    });
    if (unauthApproveErr && (unauthApproveErr.message.includes('Access Denied') || unauthApproveErr.message.includes('administrators'))) {
      console.log('✅ Security: Non-admin approval RPC rejected: PASSED');
      results.security.push({ test: 'Admin Approval Authorization', passed: true });
    } else {
      throw new Error('Non-admin was not rejected from approve RPC: ' + unauthApproveErr?.message);
    }

    // 3. Customer cannot rate an uncompleted request
    const { data: pendingReq, error: pendingReqErr } = await customerUser.client.from('requests').insert({
      reference_code: 'ORD-PENDING',
      customer_id: customerUser.user.id,
      shop_id: approvedShopId,
      workflow_group_code: 'ORDER',
      current_state: 'REQUESTED',
      total_estimate: 220.00,
      payment_method: 'cash',
      fulfillment_type: 'TAKEAWAY',
      notes: JSON.stringify({
        items: [{ product_id: testProduct.id, name: testProduct.name, quantity: 1, price: 220 }],
        customer_name: 'Test Customer',
        fulfillment_type: 'TAKEAWAY'
      })
    }).select().single();
    if (pendingReqErr) throw pendingReqErr;

    const { error: badRatingErr } = await customerUser.client.from('shop_ratings').insert({
      shop_id: approvedShopId,
      customer_id: customerUser.user.id,
      request_id: pendingReq.id,
      rating: 1
    });
    if (badRatingErr) {
      console.log('✅ Security: Rating uncompleted order rejected by RLS: PASSED');
      results.security.push({ test: 'Rating Completed-Only Guard', passed: true });
    } else {
      throw new Error('RLS allowed rating an uncompleted order!');
    }

  } catch (e) {
    console.error('❌ Security check failed:', e.message);
    results.security.push({ test: 'Security Boundaries', passed: false, error: e.message });
  }

  console.log('\n====================================================');
  console.log('AUDIT SUMMARY');
  console.log('====================================================');
  let totalTests = 0;
  let passedTests = 0;
  for (const [category, tests] of Object.entries(results)) {
    console.log(`\n[${category.toUpperCase()}]`);
    for (const t of tests) {
      totalTests++;
      if (t.passed) {
        passedTests++;
        console.log(`  ✓ ${t.test}`);
      } else {
        console.log(`  ✗ ${t.test} - ERROR: ${t.error}`);
      }
    }
  }

  console.log(`\nTotal: ${passedTests} / ${totalTests} tests passed.`);
  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runComprehensiveAudit().catch((err) => {
  console.error('Audit fatal error:', err);
  process.exit(1);
});
