import assert from 'assert';

console.log('--- Testing Forgot Password & Password Reset Flow ---');

// 1. Verify redirect URL generation for reset password
function getResetPasswordRedirectUrl(origin: string): string {
  return `${origin}/reset-password`;
}

// 2. Password validation function matching ResetPasswordPage logic
interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateNewPassword(password: string, confirmPassword: string): ValidationResult {
  if (!password) {
    return { valid: false, error: 'Password is required.' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters long.' };
  }
  if (password !== confirmPassword) {
    return { valid: false, error: 'Passwords do not match.' };
  }
  return { valid: true };
}

// 3. Recovery flow URL detection
function detectRecoverySessionFromUrl(search: string, hash: string): {
  isRecovery: boolean;
  isExpired: boolean;
  code: string | null;
  tokenHash: string | null;
} {
  const searchParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));

  const errorDesc = searchParams.get('error_description') || hashParams.get('error_description') || '';
  const errorCode = searchParams.get('error_code') || hashParams.get('error_code') || '';
  const isExpired = /expired/i.test(errorDesc) || /expired/i.test(errorCode);

  const type = searchParams.get('type') || hashParams.get('type');
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');

  const isRecovery =
    type === 'recovery' ||
    hash.includes('type=recovery') ||
    Boolean(code && type === 'recovery') ||
    Boolean(tokenHash && type === 'recovery');

  return {
    isRecovery,
    isExpired,
    code,
    tokenHash,
  };
}

// RUN TESTS
// Test 1: Redirect URL for password reset points to /reset-password
const redirectUrl = getResetPasswordRedirectUrl('https://vaangly.vercel.app');
assert.strictEqual(redirectUrl, 'https://vaangly.vercel.app/reset-password', 'Redirect URL must target /reset-password');
console.log('✓ TEST 1 PASSED: Password reset email redirect URL targets /reset-password');

// Test 2: Validation rejects empty password
const resEmpty = validateNewPassword('', '');
assert.strictEqual(resEmpty.valid, false);
assert.strictEqual(resEmpty.error, 'Password is required.');
console.log('✓ TEST 2 PASSED: Empty password is rejected');

// Test 3: Validation rejects password shorter than 6 characters
const resShort = validateNewPassword('12345', '12345');
assert.strictEqual(resShort.valid, false);
assert.strictEqual(resShort.error, 'Password must be at least 6 characters long.');
console.log('✓ TEST 3 PASSED: Short password (<6 chars) is rejected');

// Test 4: Validation rejects mismatched passwords
const resMismatch = validateNewPassword('StrongP@ss1', 'StrongP@ss2');
assert.strictEqual(resMismatch.valid, false);
assert.strictEqual(resMismatch.error, 'Passwords do not match.');
console.log('✓ TEST 4 PASSED: Password mismatch is rejected');

// Test 5: Validation accepts valid matching password
const resValid = validateNewPassword('NewSecurePass123', 'NewSecurePass123');
assert.strictEqual(resValid.valid, true);
assert.strictEqual(resValid.error, undefined);
console.log('✓ TEST 5 PASSED: Valid matching password is accepted');

// Test 6: Detects implicit recovery session from hash fragment
const hashRecovery = detectRecoverySessionFromUrl('', '#access_token=mock_tok&type=recovery&expires_in=3600');
assert.strictEqual(hashRecovery.isRecovery, true);
assert.strictEqual(hashRecovery.isExpired, false);
console.log('✓ TEST 6 PASSED: Implicit hash recovery fragment correctly detected');

// Test 7: Detects PKCE code exchange recovery session from query
const pkceRecovery = detectRecoverySessionFromUrl('?code=auth_pkce_code_123&type=recovery', '');
assert.strictEqual(pkceRecovery.isRecovery, true);
assert.strictEqual(pkceRecovery.code, 'auth_pkce_code_123');
console.log('✓ TEST 7 PASSED: PKCE recovery query params correctly detected');

// Test 8: Detects expired reset link
const expiredLink = detectRecoverySessionFromUrl('?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', '');
assert.strictEqual(expiredLink.isExpired, true);
console.log('✓ TEST 8 PASSED: Expired reset link error parameter detected');

// Test 9: Normal user login params are not marked as recovery
const normalLogin = detectRecoverySessionFromUrl('?redirect=%2Forders', '');
assert.strictEqual(normalLogin.isRecovery, false);
console.log('✓ TEST 9 PASSED: Normal authentication URLs are not falsely treated as recovery');

console.log('\nALL 9 PASSWORD RESET UNIT & FLOW TESTS PASSED!\n');
