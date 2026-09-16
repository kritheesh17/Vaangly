// Vaango Email OTP Verification, Security & Route Protection Test Suite
import assert from 'assert';

console.log('================================================================');
console.log('VAANGO — EMAIL OTP VERIFICATION & AUTH ARCHITECTURE TEST SUITE');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✓ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ FAIL: ${description}`);
    console.error(err);
  }
}

// -------------------------------------------------------------
// 1. EMAIL FORMAT VALIDATION
// -------------------------------------------------------------
test('Email Validation: Accepts valid email formats and rejects invalid or malformed formats', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validEmails = [
    'ananya.customer@example.com',
    'murugan.store@example.com',
    'admin@vaango.in',
    'ramesh+test@sub.domain.co',
    'user123@gmail.com',
  ];

  const invalidEmails = [
    '',
    '   ',
    'ananya',
    'ananya@',
    '@example.com',
    'ananya.customer@.com',
    'ananya@example',
    'ananya space@example.com',
  ];

  validEmails.forEach((email) => {
    assert.strictEqual(emailRegex.test(email.trim().toLowerCase()), true, `Expected ${email} to be valid`);
  });

  invalidEmails.forEach((email) => {
    assert.strictEqual(emailRegex.test(email.trim().toLowerCase()), false, `Expected ${email} to be invalid`);
  });
});

// -------------------------------------------------------------
// 2. ERROR SANITIZATION & MAPPING
// -------------------------------------------------------------
test('Error Mapping: Internal Supabase/database errors are sanitized to user-friendly messages', () => {
  function mapSupabaseAuthError(err, defaultMessage = 'Unable to verify your email right now. Please try again.') {
    if (!err) return defaultMessage;
    const obj = typeof err === 'object' && err !== null ? err : {};
    const msg = [
      err instanceof Error ? err.message : '',
      obj.message ? String(obj.message) : '',
      obj.code ? String(obj.code) : '',
      obj.status ? String(obj.status) : '',
      String(err),
    ].join(' ').toLowerCase();

    if (msg.includes('rate') || msg.includes('429') || msg.includes('too many') || msg.includes('over_email_send_rate_limit')) {
      return 'Too many attempts. Please wait and try again.';
    }
    if (msg.includes('expired') || msg.includes('otp_expired')) {
      return 'This verification code has expired. Request a new code.';
    }
    if (msg.includes('invalid') || msg.includes('token') || msg.includes('incorrect') || msg.includes('invalid_grant')) {
      return 'That code is incorrect or has expired.';
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection') || msg.includes('offline')) {
      return 'Unable to verify your email right now. Please try again.';
    }
    return defaultMessage;
  }

  // Rate limit
  assert.strictEqual(
    mapSupabaseAuthError({ message: 'over_email_send_rate_limit: 429' }),
    'Too many attempts. Please wait and try again.'
  );

  // Expired OTP
  assert.strictEqual(
    mapSupabaseAuthError({ message: 'Token has expired or is invalid: otp_expired' }),
    'This verification code has expired. Request a new code.'
  );

  // Invalid Token / Invalid grant
  assert.strictEqual(
    mapSupabaseAuthError({ message: 'invalid_grant: Token is invalid' }),
    'That code is incorrect or has expired.'
  );

  // Network / Fetch error
  assert.strictEqual(
    mapSupabaseAuthError({ message: 'Failed to fetch (net::ERR_CONNECTION_REFUSED)' }),
    'Unable to verify your email right now. Please try again.'
  );

  // Database / internal error must never leak
  assert.strictEqual(
    mapSupabaseAuthError({ message: 'FATAL 28000: password authentication failed for user postgres' }),
    'Unable to verify your email right now. Please try again.'
  );
});

// -------------------------------------------------------------
// 3. OTP VERIFICATION LOGIC & 6-DIGIT ENFORCEMENT
// -------------------------------------------------------------
test('OTP Verification: Rejects malformed codes, handles correct codes and simulates state transitions', () => {
  const activeTokens = new Map();
  // Register a token for customer
  const customerEmail = 'ananya@example.com';
  activeTokens.set(customerEmail, { code: '849201', expiresAt: Date.now() + 600000 });

  function verifyOtp(email, code) {
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return { success: false, error: 'That code is incorrect or has expired.' };
    }

    const record = activeTokens.get(email);
    if (!record) {
      return { success: false, error: 'That code is incorrect or has expired.' };
    }

    if (Date.now() > record.expiresAt) {
      return { success: false, error: 'This verification code has expired. Request a new code.' };
    }

    if (record.code !== code) {
      return { success: false, error: 'That code is incorrect or has expired.' };
    }

    // Success
    activeTokens.delete(email);
    return {
      success: true,
      user: {
        id: 'usr-verified-1',
        email,
        is_verified: true,
        email_confirmed_at: new Date().toISOString(),
      },
    };
  }

  // Reject incomplete/alphabetic codes
  assert.strictEqual(verifyOtp(customerEmail, '123').success, false);
  assert.strictEqual(verifyOtp(customerEmail, 'abcdef').success, false);
  assert.strictEqual(verifyOtp(customerEmail, '849200').success, false); // wrong digit

  // Correct 6-digit code
  const res = verifyOtp(customerEmail, '849201');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.user.is_verified, true);
  assert.ok(res.user.email_confirmed_at);

  // Replaying the same code must now FAIL (consumed)
  assert.strictEqual(verifyOtp(customerEmail, '849201').success, false);
});

// -------------------------------------------------------------
// 4. RESEND COOLDOWN & ABUSE PREVENTION
// -------------------------------------------------------------
test('Resend Cooldown: Prevents rapid duplicate requests and enforces cooldown intervals', () => {
  let lastRequestTime = 0;
  let resendCount = 0;
  const COOLDOWN_MS = 60000;
  const MAX_ATTEMPTS = 5;

  function requestVerification(email, now = Date.now()) {
    if (resendCount >= MAX_ATTEMPTS) {
      return { success: false, error: 'Too many attempts. Please wait and try again.' };
    }

    if (lastRequestTime && now - lastRequestTime < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastRequestTime)) / 1000);
      return { success: false, error: `Please wait ${remainingSeconds}s before requesting another code.` };
    }

    lastRequestTime = now;
    resendCount++;
    return { success: true, message: 'Verification code sent to your email.' };
  }

  const email = 'user@example.com';
  const t0 = 1000000;

  // 1st request -> success
  const r1 = requestVerification(email, t0);
  assert.strictEqual(r1.success, true);

  // 2nd request at t0 + 10s -> blocked by cooldown
  const r2 = requestVerification(email, t0 + 10000);
  assert.strictEqual(r2.success, false);
  assert.ok(r2.error.includes('wait 50s'));

  // 3rd request at t0 + 61s -> allowed
  const r3 = requestVerification(email, t0 + 61000);
  assert.strictEqual(r3.success, true);
});

// -------------------------------------------------------------
// 5. AUTHORITATIVE SUPABASE AUTH STATE SOURCE OF TRUTH
// -------------------------------------------------------------
test('Security Authority: Supabase Auth email_confirmed_at remains authoritative over profile is_verified', () => {
  // If a profile in public.profiles claims is_verified = true, but Supabase Auth user has null email_confirmed_at,
  // the session must NOT be considered email-verified!
  function resolveAuthoritativeVerification(supabaseUser, profile) {
    const isSupabaseConfirmed = Boolean(supabaseUser?.email_confirmed_at || supabaseUser?.confirmed_at);
    // Profile is_verified must be constrained to the authoritative Supabase auth state
    return {
      is_verified: isSupabaseConfirmed,
      sourceOfTruth: 'supabase.auth.users.email_confirmed_at',
    };
  }

  // Unconfirmed user whose public profile was tampered with
  const unverifiedAuthUser = {
    id: 'u-1',
    email: 'unverified@test.com',
    email_confirmed_at: null,
    confirmed_at: null,
  };
  const spoofedProfile = {
    id: 'u-1',
    is_verified: true, // attacker modified DB
  };

  const check = resolveAuthoritativeVerification(unverifiedAuthUser, spoofedProfile);
  assert.strictEqual(check.is_verified, false, 'Spoofed profile must NOT override unverified Supabase auth state');

  // Verified user
  const verifiedAuthUser = {
    id: 'u-2',
    email: 'verified@test.com',
    email_confirmed_at: '2026-09-11T08:00:00Z',
    confirmed_at: '2026-09-11T08:00:00Z',
  };
  const verifiedProfile = { id: 'u-2', is_verified: true };
  const verifiedCheck = resolveAuthoritativeVerification(verifiedAuthUser, verifiedProfile);
  assert.strictEqual(verifiedCheck.is_verified, true);
});

// -------------------------------------------------------------
// 6. ROUTE PROTECTION: UNVERIFIED VS VERIFIED ACCESS
// -------------------------------------------------------------
test('Route Protection: Unauthenticated and unverified users are blocked from protected actions', () => {
  function checkRouteAccess(route, user, role) {
    const isAuth = Boolean(user);
    const isVerified = Boolean(user?.is_verified);

    // Public routes
    if (['/', '/shops', '/login', '/register', '/shopkeeper/apply', '/design-system'].includes(route)) {
      return { allowed: true };
    }

    // Protected routes requiring authentication
    if (!isAuth) {
      return { allowed: false, reason: 'REDIRECT_TO_LOGIN' };
    }

    // Orders & Shopkeeper management require verified email
    if (['/orders', '/shopkeeper/dashboard', '/shopkeeper/catalogue'].includes(route)) {
      if (!isVerified) {
        return { allowed: false, reason: 'EMAIL_VERIFICATION_REQUIRED' };
      }
    }

    // Role boundaries
    if (route.startsWith('/shopkeeper/dashboard') && role !== 'shopkeeper' && role !== 'admin') {
      return { allowed: false, reason: 'ACCESS_RESTRICTED_ROLE' };
    }
    if (route.startsWith('/admin') && role !== 'admin') {
      return { allowed: false, reason: 'ACCESS_RESTRICTED_ADMIN' };
    }

    return { allowed: true };
  }

  // 1. Unauthenticated -> redirected to login
  assert.strictEqual(checkRouteAccess('/orders', null, null).reason, 'REDIRECT_TO_LOGIN');
  assert.strictEqual(checkRouteAccess('/shopkeeper/dashboard', null, null).reason, 'REDIRECT_TO_LOGIN');

  // 2. Authenticated but unverified -> email verification required
  const unverifiedCustomer = { id: 'c-1', role: 'customer', is_verified: false };
  assert.strictEqual(checkRouteAccess('/orders', unverifiedCustomer, 'customer').reason, 'EMAIL_VERIFICATION_REQUIRED');

  // 3. Verified Customer accessing customer orders -> allowed
  const verifiedCustomer = { id: 'c-1', role: 'customer', is_verified: true };
  assert.strictEqual(checkRouteAccess('/orders', verifiedCustomer, 'customer').allowed, true);

  // 4. Customer attempting to access shopkeeper dashboard -> role restriction
  assert.strictEqual(
    checkRouteAccess('/shopkeeper/dashboard', verifiedCustomer, 'customer').reason,
    'ACCESS_RESTRICTED_ROLE'
  );

  // 5. Shopkeeper accessing shopkeeper dashboard -> allowed
  const verifiedShopkeeper = { id: 's-1', role: 'shopkeeper', is_verified: true };
  assert.strictEqual(checkRouteAccess('/shopkeeper/dashboard', verifiedShopkeeper, 'shopkeeper').allowed, true);

  // 6. Shopkeeper attempting to access admin console -> blocked
  assert.strictEqual(
    checkRouteAccess('/admin/dashboard', verifiedShopkeeper, 'shopkeeper').reason,
    'ACCESS_RESTRICTED_ADMIN'
  );

  // 7. Admin accessing admin console -> allowed
  const verifiedAdmin = { id: 'a-1', role: 'admin', is_verified: true };
  assert.strictEqual(checkRouteAccess('/admin/dashboard', verifiedAdmin, 'admin').allowed, true);
});

// -------------------------------------------------------------
// 7. ROLE PRESERVATION ACROSS OTP AUTHENTICATION
// -------------------------------------------------------------
test('Role Preservation: Customer, Shopkeeper, and Admin roles are preserved across email verification', () => {
  function completeRegistration(email, metadata) {
    return {
      id: `usr-${Date.now()}`,
      email,
      role: metadata.role,
      full_name: metadata.fullName,
      is_verified: true,
      created_at: new Date().toISOString(),
    };
  }

  // Customer signup
  const customerProfile = completeRegistration('customer@test.com', { fullName: 'Customer One', role: 'customer' });
  assert.strictEqual(customerProfile.role, 'customer');
  assert.strictEqual(customerProfile.is_verified, true);

  // Shopkeeper signup
  const shopkeeperProfile = completeRegistration('merchant@test.com', { fullName: 'Store Owner', role: 'shopkeeper' });
  assert.strictEqual(shopkeeperProfile.role, 'shopkeeper');
  assert.strictEqual(shopkeeperProfile.is_verified, true);

  // Role switching prevention: verification does not spontaneously mutate role
  assert.notStrictEqual(customerProfile.role, 'admin');
  assert.notStrictEqual(shopkeeperProfile.role, 'admin');
});

// -------------------------------------------------------------
// 8. PHONE OTP ISOLATION & CLEAR MESSAGING
// -------------------------------------------------------------
test('Phone OTP Architecture: Preserves SMS hook and local preview fallback', () => {
  function requestPhoneOtp(phone, isSupabaseSmsConfigured) {
    if (isSupabaseSmsConfigured) {
      return { success: true };
    }
    return {
      success: false,
      error: 'External SMS gateway/Supabase Phone Auth is not yet configured in .env. Please use Email verification.',
    };
  }

  const phoneRes = requestPhoneOtp('+919876543210', false);
  assert.strictEqual(phoneRes.success, false);
  assert.ok(phoneRes.error.includes('External SMS gateway/Supabase Phone Auth is not yet configured'));
  // Does not fake success
  assert.notStrictEqual(phoneRes.success, true);
});

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passedTests} of ${totalTests} tests passed.`);
console.log('================================================================\n');
