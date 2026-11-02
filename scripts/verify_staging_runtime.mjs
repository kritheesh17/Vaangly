import fs from 'fs';
import path from 'path';

// Read .env to obtain staging Supabase URL and Anon/Publishable Key
const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf-8');

let supabaseUrl = '';
let supabaseAnonKey = '';

for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed.startsWith('VITE_SUPABASE_URL=')) {
    supabaseUrl = trimmed.split('=')[1].trim();
  } else if (trimmed.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) {
    supabaseAnonKey = trimmed.split('=')[1].trim();
  }
}

console.log(`[Staging Verification] Target: ${supabaseUrl}`);
console.log(`[Staging Verification] Key Present: ${Boolean(supabaseAnonKey)}`);

async function testRpcAnonExecution() {
  console.log('\n--- Test 1: Staging RPC Anon Privilege Revocation (SEC-02) ---');
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/book_appointment_with_token`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_slot_id: '00000000-0000-0000-0000-000000000001',
        p_customer_id: '00000000-0000-0000-0000-000000000002',
        p_customer_name: 'Anonymous Hacker',
        p_customer_phone: '9999999999',
        p_service_id: '00000000-0000-0000-0000-000000000003',
        p_service_name: 'Test',
        p_price: 100,
        p_payment_method: 'cash',
      }),
    });

    const status = res.status;
    const body = await res.json().catch(() => ({}));
    console.log(`Status: ${status}`);
    console.log(`Response Code/Message:`, body.code || body.message || body.error || body);

    const isBlocked = status === 401 || status === 403 || status === 404 ||
      (body.code === '42501' || body.message?.includes('permission denied') || body.error?.includes('signed in'));

    if (isBlocked) {
      console.log('✓ PASS: Anonymous caller is strictly blocked from executing book_appointment_with_token on staging!');
    } else {
      console.error('✗ FAIL: Anonymous caller was not blocked by privilege revoke or auth guard!');
    }
    return isBlocked;
  } catch (err) {
    console.error('Exception testing RPC:', err.message);
    return false;
  }
}

async function testEdgeFunctionUnauthenticated() {
  console.log('\n--- Test 2: Staging Edge Function Unauthenticated Rejection (SEC-01) ---');
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: '00000000-0000-0000-0000-000000000001',
        title: 'Phishing Test',
        body: 'Click here',
        url: 'https://evil.com',
      }),
    });

    const status = res.status;
    const body = await res.json().catch(() => ({}));
    console.log(`Status: ${status}`);
    console.log(`Response:`, body);

    const isBlocked = status === 401 && body.error === 'Authorization required';
    if (isBlocked) {
      console.log('✓ PASS: Staging Edge Function rejected unauthenticated request with HTTP 401 "Authorization required"!');
    } else {
      console.error('✗ FAIL: Staging Edge Function did not return 401!');
    }
    return isBlocked;
  } catch (err) {
    console.error('Exception testing Edge Function:', err.message);
    return false;
  }
}

async function testEdgeFunctionInvalidJwt() {
  console.log('\n--- Test 3: Staging Edge Function Invalid JWT Rejection (SEC-01) ---');
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer fake.invalid.jwt.token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: '00000000-0000-0000-0000-000000000001',
        title: 'Spoofing Test',
        body: 'Click here',
        url: '/orders',
      }),
    });

    const status = res.status;
    const body = await res.json().catch(() => ({}));
    console.log(`Status: ${status}`);
    console.log(`Response:`, body);

    const isBlocked = status === 401 && body.error === 'Invalid or expired authentication token';
    if (isBlocked) {
      console.log('✓ PASS: Staging Edge Function rejected forged JWT with HTTP 401 "Invalid or expired authentication token"!');
    } else {
      console.error('✗ FAIL: Staging Edge Function did not properly reject invalid JWT!');
    }
    return isBlocked;
  } catch (err) {
    console.error('Exception testing Edge Function:', err.message);
    return false;
  }
}

async function run() {
  const rpcOk = await testRpcAnonExecution();
  const edgeNoAuthOk = await testEdgeFunctionUnauthenticated();
  const edgeInvalidJwtOk = await testEdgeFunctionInvalidJwt();

  console.log('\n========================================');
  console.log(`STAGING LIVE VERIFICATION SUMMARY:`);
  console.log(`- RPC Anon Privilege Revoke: ${rpcOk ? 'PASS' : 'FAIL'}`);
  console.log(`- Edge Function Auth Required: ${edgeNoAuthOk ? 'PASS' : 'FAIL'}`);
  console.log(`- Edge Function JWT Verification: ${edgeInvalidJwtOk ? 'PASS' : 'FAIL'}`);
  console.log('========================================\n');

  if (rpcOk && edgeNoAuthOk && edgeInvalidJwtOk) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run();
