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

import { sanitizeRedirectUrl } from '../lib/authUtils';

describe('SEC-03: Redirect Sanitization & Post-Auth Phishing Prevention', () => {
  const authCallbackPath = path.resolve(
    process.cwd(),
    'src/pages/auth/AuthCallbackPage.tsx'
  );
  const loginPagePath = path.resolve(
    process.cwd(),
    'src/pages/auth/LoginPage.tsx'
  );

  it('1. Remediation Verification: Confirms presence of redirect sanitization in AuthCallbackPage', () => {
    assert.ok(fs.existsSync(authCallbackPath));
    const source = fs.readFileSync(authCallbackPath, 'utf-8');

    const hasSanitizerCall = source.includes('sanitizeRedirectUrl');
    const hasSanitizedAssignment = source.includes('const pendingRedirect = sanitizeRedirectUrl(');

    assert.strictEqual(
      hasSanitizerCall,
      true,
      'REMEDIATION VERIFIED: sanitizeRedirectUrl is imported in AuthCallbackPage'
    );
    assert.strictEqual(
      hasSanitizedAssignment,
      true,
      'REMEDIATION VERIFIED: pendingRedirect is sanitized before navigation'
    );
  });

  it('2. Remediation Verification: Confirms redirect parameter sanitization in LoginPage', () => {
    assert.ok(fs.existsSync(loginPagePath));
    const source = fs.readFileSync(loginPagePath, 'utf-8');

    const hasSanitizerCall = source.includes('sanitizeRedirectUrl');
    const hasSanitizedFrom = source.includes('const from = sanitizeRedirectUrl(');

    assert.strictEqual(
      hasSanitizerCall,
      true,
      'REMEDIATION VERIFIED: sanitizeRedirectUrl is imported in LoginPage'
    );
    assert.strictEqual(
      hasSanitizedFrom,
      true,
      'REMEDIATION VERIFIED: "from" destination is sanitized before persistence and navigation'
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

  it('9. Security Contract: Encoded separators and double-encoded bypasses are rejected', () => {
    const encodedBypasses = [
      '%2f%2fevil.com',
      '%2F%2Fevil.com',
      '/%5cevil.com',
      '/%5Cevil.com',
      '%252f%252fevil.com',
      '/path%2f%2fevil.com',
    ];

    for (const url of encodedBypasses) {
      const sanitized = sanitizeRedirectUrl(url);
      assert.strictEqual(
        sanitized,
        '/',
        `Encoded bypass attempt must be rejected: "${url}"`
      );
    }

    // Encoded safe path that doesn't bypass internal scope
    assert.strictEqual(sanitizeRedirectUrl('%2forders'), '/orders');
  });

  it('10. Security Contract: Control characters, newlines, tabs, and malformed URI sequences are rejected', () => {
    const malformedOrInjected = [
      '/\x00evil.com',
      '/\x1fevil.com',
      '/\x7fevil.com',
      '/orders\nhttps://evil.com',
      '/orders\r\nSet-Cookie:evil=1',
      '/test\tevil',
      '/%zz',
      '/%E0%A4%A',
    ];

    for (const url of malformedOrInjected) {
      const sanitized = sanitizeRedirectUrl(url);
      assert.strictEqual(
        sanitized,
        '/',
        `Control character or malformed URI must be rejected: "${url}"`
      );
    }
  });

  it('11. Security Contract: Redirects are sanitized both when stored in LoginPage and when consumed in AuthCallbackPage', () => {
    const loginSource = fs.readFileSync(loginPagePath, 'utf-8');
    const callbackSource = fs.readFileSync(authCallbackPath, 'utf-8');

    // LoginPage sanitizes before storing in sessionStorage and localStorage
    assert.ok(loginSource.includes('const from = sanitizeRedirectUrl('), 'LoginPage sanitizes from destination on parse');
    assert.ok(loginSource.includes("sessionStorage.setItem('vaangly_auth_redirect', from);"), 'LoginPage persists sanitized from in sessionStorage');
    assert.ok(loginSource.includes("localStorage.setItem('vaangly_auth_redirect', from);"), 'LoginPage persists sanitized from in localStorage');

    // AuthCallbackPage sanitizes when consuming before navigate()
    assert.ok(callbackSource.includes('const pendingRedirect = sanitizeRedirectUrl('), 'AuthCallbackPage sanitizes before consumption');
    assert.ok(callbackSource.includes('navigate(pendingRedirect, { replace: true });'), 'AuthCallbackPage only navigates to sanitized pendingRedirect');
  });
});

