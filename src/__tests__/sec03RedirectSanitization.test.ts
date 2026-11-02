import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SEC-03 Regression Test Suite: Authentication Redirect URL Sanitization & Phishing Prevention
 *
 * Vulnerability Identified:
 * `src/pages/auth/AuthCallbackPage.tsx` and `src/pages/auth/LoginPage.tsx` extract
 * `query.get('redirect')` and `localStorage.getItem('vaangly_auth_redirect')` without
 * validating or sanitizing the path before calling `navigate(pendingRedirect)`.
 *
 * Attackers can supply protocol-relative (`//evil.com`) or external HTTPS URLs (`https://phish.com`)
 * to hijack post-login / OAuth navigation and conduct credential harvesting.
 */

/**
 * Security Reference Specification:
 * Canonical redirect sanitization function that will be implemented in the remediation phase.
 */
export function sanitizeRedirectUrl(rawUrl: string | null | undefined, fallback = '/'): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return fallback;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return fallback;
  }

  // 1. Strictly forbid leading double slash (protocol-relative URLs)
  if (trimmed.startsWith('//')) {
    return fallback;
  }

  // 2. Strictly forbid backslashes (CVE-2025-68470 bypasses, /\evil.com, /\\evil.com, etc.)
  if (trimmed.includes('\\')) {
    return fallback;
  }

  // 3. Forbid any URI scheme (http:, https:, javascript:, data:, vbscript:)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  // 4. Must start with a single slash
  if (!trimmed.startsWith('/')) {
    return fallback;
  }

  // 5. Reject control characters or newlines
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

describe('SEC-03: Redirect Sanitization & Post-Auth Phishing Prevention', () => {
  const authCallbackPath = path.resolve(
    process.cwd(),
    'src/pages/auth/AuthCallbackPage.tsx'
  );
  const loginPagePath = path.resolve(
    process.cwd(),
    'src/pages/auth/LoginPage.tsx'
  );

  it('1. Current Implementation Inspection: Confirms absence of redirect sanitization in AuthCallbackPage', () => {
    assert.ok(fs.existsSync(authCallbackPath));
    const source = fs.readFileSync(authCallbackPath, 'utf-8');

    // Currently takes query.get('redirect') directly into navigate(...)
    const hasUnsanitizedNavigate = source.includes('const queryRedirect = query.get(\'redirect\');') &&
      source.includes('navigate(pendingRedirect, { replace: true });');
    const hasSanitizerCall = source.includes('sanitizeRedirect');

    assert.strictEqual(
      hasUnsanitizedNavigate,
      true,
      'VULNERABILITY CONFIRMED: AuthCallbackPage navigates directly to unvalidated pendingRedirect'
    );
    assert.strictEqual(
      hasSanitizerCall,
      false,
      'VULNERABILITY CONFIRMED: No sanitizer currently invoked on pendingRedirect'
    );
  });

  it('2. Current Implementation Inspection: Confirms raw redirect parameter persistence in LoginPage', () => {
    assert.ok(fs.existsSync(loginPagePath));
    const source = fs.readFileSync(loginPagePath, 'utf-8');

    const hasRawStorage = source.includes("localStorage.setItem('vaangly_auth_redirect', from);");
    const hasSanitizerCall = source.includes('sanitizeRedirect');

    assert.strictEqual(
      hasRawStorage,
      true,
      'VULNERABILITY CONFIRMED: LoginPage stores unvalidated redirect in localStorage'
    );
    assert.strictEqual(
      hasSanitizerCall,
      false,
      'VULNERABILITY CONFIRMED: LoginPage lacks sanitizer before persistence'
    );
  });

  // --------------------------------------------------------------------------
  // SECURITY SPECIFICATION TEST VECTORS
  // --------------------------------------------------------------------------

  it('3. Security Contract: External HTTPS and HTTP URLs are rejected and fallback to /', () => {
    const externalUrls = [
      'https://evil.com',
      'https://evil.com/login',
      'http://attacker.example.org/phish',
      'https://subdomain.target.evil.com/auth',
      'HTTPS://EVIL.COM',
      'HTTP://EVIL.COM',
    ];

    for (const url of externalUrls) {
      const sanitized = sanitizeRedirectUrl(url);
      assert.strictEqual(
        sanitized,
        '/',
        `External URL must be rejected and safely fallback to /: "${url}"`
      );
    }
  });

  it('4. Security Contract: Protocol-relative URLs (//attacker.com) are rejected', () => {
    const protocolRelativeUrls = [
      '//evil.com',
      '//evil.com/phish',
      '///evil.com',
      '////attacker.com',
      '//vaangly.evil.com',
    ];

    for (const url of protocolRelativeUrls) {
      const sanitized = sanitizeRedirectUrl(url);
      assert.strictEqual(
        sanitized,
        '/',
        `Protocol-relative URL must be rejected: "${url}"`
      );
    }
  });

  it('5. Security Contract: javascript: and dangerous URI schemes are rejected', () => {
    const dangerousSchemes = [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(document.cookie)',
      'javascript:void(0)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ];

    for (const url of dangerousSchemes) {
      const sanitized = sanitizeRedirectUrl(url);
      assert.strictEqual(
        sanitized,
        '/',
        `Dangerous URI scheme must be rejected: "${url}"`
      );
    }
  });

  it('6. Security Contract: Backslash URL tricks (CVE-2025-68470 bypasses) are rejected', () => {
    const backslashTricks = [
      '/\\evil.com',
      '/\\evil.com/test',
      '/\\\\evil.com',
      '\\evil.com',
      '\\\\evil.com',
      '/path\\..\\evil.com',
      '/orders\\@evil.com',
    ];

    for (const url of backslashTricks) {
      const sanitized = sanitizeRedirectUrl(url);
      assert.strictEqual(
        sanitized,
        '/',
        `Backslash trick must be rejected: "${url}"`
      );
    }
  });

  it('7. Security Contract: Valid internal routes, query params, and hashes are preserved', () => {
    const legitimatePaths = [
      '/',
      '/orders',
      '/cart',
      '/cart?shop_id=shop-001&item=prod-101',
      '/profile',
      '/profile#settings',
      '/shopkeeper/dashboard',
      '/shopkeeper/catalogue?category=groceries',
      '/shopkeeper/apply',
      '/admin/applications/app-12345',
      '/reset-password?token_hash=test',
    ];

    for (const validPath of legitimatePaths) {
      const sanitized = sanitizeRedirectUrl(validPath);
      assert.strictEqual(
        sanitized,
        validPath,
        `Legitimate internal route must be preserved: "${validPath}"`
      );
    }
  });

  it('8. Security Contract: Null, undefined, empty, or whitespace-only inputs fallback to /', () => {
    assert.strictEqual(sanitizeRedirectUrl(null), '/');
    assert.strictEqual(sanitizeRedirectUrl(undefined), '/');
    assert.strictEqual(sanitizeRedirectUrl(''), '/');
    assert.strictEqual(sanitizeRedirectUrl('   '), '/');
    assert.strictEqual(sanitizeRedirectUrl(null, '/login'), '/login');
  });
});
