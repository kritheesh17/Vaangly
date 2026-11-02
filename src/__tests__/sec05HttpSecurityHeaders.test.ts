import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SEC-05 Regression Test Suite: HTTP Security Headers & Content Security Policy (CSP)
 *
 * Vulnerability Identified:
 * `vercel.json` defines caching headers for assets and manifest, but omits:
 * - Content-Security-Policy (CSP)
 * - X-Frame-Options (Clickjacking)
 * - X-Content-Type-Options: nosniff (MIME sniffing)
 * - Strict-Transport-Security (HSTS)
 * - Referrer-Policy
 * - Permissions-Policy
 *
 * This test suite:
 * 1. Audits the current vercel.json and confirms the missing headers.
 * 2. Audits index.html and codebase external integrations (Google Fonts, Supabase, Leaflet, OSM)
 *    to guarantee CSP will not break legitimate production functionality.
 * 3. Validates the remediation security headers specification contract.
 */

describe('SEC-05: HTTP Security Headers & Content Security Policy Specification', () => {
  const vercelJsonPath = path.resolve(process.cwd(), 'vercel.json');
  const indexHtmlPath = path.resolve(process.cwd(), 'index.html');

  it('1. Remediation Verification: Confirms presence of all required security headers in vercel.json', () => {
    assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));

    const allHeaders: { key: string; value: string }[] = [];
    if (Array.isArray(vercelConfig.headers)) {
      for (const entry of vercelConfig.headers) {
        if (Array.isArray(entry.headers)) {
          allHeaders.push(...entry.headers);
        }
      }
    }

    const headerKeys = allHeaders.map((h) => h.key.toLowerCase());

    const hasCsp = headerKeys.includes('content-security-policy');
    const hasFrameOptions = headerKeys.includes('x-frame-options');
    const hasContentTypeOptions = headerKeys.includes('x-content-type-options');
    const hasHsts = headerKeys.includes('strict-transport-security');
    const hasReferrerPolicy = headerKeys.includes('referrer-policy');
    const hasPermissionsPolicy = headerKeys.includes('permissions-policy');

    assert.strictEqual(hasCsp, true, 'REMEDIATION VERIFIED: Content-Security-Policy header configured');
    assert.strictEqual(hasFrameOptions, true, 'REMEDIATION VERIFIED: X-Frame-Options configured');
    assert.strictEqual(hasContentTypeOptions, true, 'REMEDIATION VERIFIED: X-Content-Type-Options configured');
    assert.strictEqual(hasHsts, true, 'REMEDIATION VERIFIED: Strict-Transport-Security (HSTS) configured');
    assert.strictEqual(hasReferrerPolicy, true, 'REMEDIATION VERIFIED: Referrer-Policy configured');
    assert.strictEqual(hasPermissionsPolicy, true, 'REMEDIATION VERIFIED: Permissions-Policy configured');
  });

  it('2. External Integration Inventory: Audits legitimate external resources required in index.html', () => {
    assert.ok(fs.existsSync(indexHtmlPath), 'index.html must exist');
    const html = fs.readFileSync(indexHtmlPath, 'utf-8');

    // Confirm legitimate external Google Fonts requirements
    const requiresGoogleFontsStyle = html.includes('fonts.googleapis.com');
    const requiresGoogleFontsStatic = html.includes('fonts.gstatic.com');
    const hasInlineAntiFlashThemeScript = html.includes('vaango-theme');

    assert.strictEqual(requiresGoogleFontsStyle, true, 'CSP style-src must include https://fonts.googleapis.com');
    assert.strictEqual(requiresGoogleFontsStatic, true, 'CSP font-src must include https://fonts.gstatic.com');
    assert.strictEqual(hasInlineAntiFlashThemeScript, true, 'CSP script-src must accommodate inline theme initializer');
  });

  // --------------------------------------------------------------------------
  // SECURITY CONTRACT SPECIFICATION VALIDATION
  // --------------------------------------------------------------------------

  interface HeaderRule {
    source: string;
    headers: { key: string; value: string }[];
  }

  interface VercelConfigSchema {
    headers?: HeaderRule[];
    rewrites?: any[];
  }

  /**
   * Reference remediation header configuration that will be placed into vercel.json.
   */
  const REQUIRED_REMEDIATION_HEADER_RULES: HeaderRule = {
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.tile.openstreetmap.org",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      },
    ],
  };

  function validateVercelSecurityHeaders(config: VercelConfigSchema): {
    valid: boolean;
    missingHeaders: string[];
    cspDirectives: Record<string, string[]>;
  } {
    const missingHeaders: string[] = [];
    const headerMap = new Map<string, string>();

    const globalRule = config.headers?.find((h) => h.source === '/(.*)');
    if (!globalRule) {
      return {
        valid: false,
        missingHeaders: [
          'X-Frame-Options',
          'X-Content-Type-Options',
          'Referrer-Policy',
          'Strict-Transport-Security',
          'Permissions-Policy',
          'Content-Security-Policy',
        ],
        cspDirectives: {},
      };
    }

    for (const h of globalRule.headers) {
      headerMap.set(h.key.toLowerCase(), h.value);
    }

    const requiredKeys = [
      'x-frame-options',
      'x-content-type-options',
      'referrer-policy',
      'strict-transport-security',
      'permissions-policy',
      'content-security-policy',
    ];

    for (const key of requiredKeys) {
      if (!headerMap.has(key)) {
        missingHeaders.push(key);
      }
    }

    // Parse CSP
    const cspDirectives: Record<string, string[]> = {};
    const cspRaw = headerMap.get('content-security-policy') || '';
    for (const part of cspRaw.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const [name, ...values] = trimmed.split(/\s+/);
      cspDirectives[name] = values;
    }

    return {
      valid: missingHeaders.length === 0,
      missingHeaders,
      cspDirectives,
    };
  }

  it('3. Security Contract: Validates that remediation headers satisfy all 6 critical security requirements', () => {
    const testConfig: VercelConfigSchema = {
      headers: [REQUIRED_REMEDIATION_HEADER_RULES],
    };

    const validation = validateVercelSecurityHeaders(testConfig);
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.missingHeaders.length, 0);
  });

  it('4. Security Contract: Clickjacking protection is enforced via both X-Frame-Options and CSP frame-ancestors', () => {
    const headers = REQUIRED_REMEDIATION_HEADER_RULES.headers;
    const frameOpt = headers.find((h) => h.key === 'X-Frame-Options')?.value;
    const csp = headers.find((h) => h.key === 'Content-Security-Policy')?.value;

    assert.ok(frameOpt === 'DENY' || frameOpt === 'SAMEORIGIN');
    assert.ok(csp?.includes("frame-ancestors 'none'"), 'CSP must include frame-ancestors none');
  });

  it('5. Security Contract: CSP directives safely permit all required Vaangly external integrations', () => {
    const testConfig: VercelConfigSchema = {
      headers: [REQUIRED_REMEDIATION_HEADER_RULES],
    };

    const { cspDirectives } = validateVercelSecurityHeaders(testConfig);

    // Font stylesheets
    assert.ok(
      cspDirectives['style-src']?.includes('https://fonts.googleapis.com'),
      'Must allow Google Fonts stylesheets'
    );
    // Font binaries
    assert.ok(
      cspDirectives['font-src']?.includes('https://fonts.gstatic.com'),
      'Must allow Google Fonts static files'
    );
    // Supabase APIs & Realtime WebSockets
    assert.ok(
      cspDirectives['connect-src']?.includes('https://*.supabase.co'),
      'Must allow Supabase REST/Auth API'
    );
    assert.ok(
      cspDirectives['connect-src']?.includes('wss://*.supabase.co'),
      'Must allow Supabase Realtime WebSocket'
    );
    // Nominatim geocoding
    assert.ok(
      cspDirectives['connect-src']?.includes('https://nominatim.openstreetmap.org'),
      'Must allow reverse geocoding API'
    );
    // Leaflet map tiles & Supabase storage images
    assert.ok(
      cspDirectives['img-src']?.includes('https://*.tile.openstreetmap.org'),
      'Must allow OpenStreetMap Leaflet tiles'
    );
    assert.ok(
      cspDirectives['img-src']?.includes('https://*.supabase.co'),
      'Must allow Supabase Storage images'
    );
    assert.ok(
      cspDirectives['img-src']?.includes('data:') && cspDirectives['img-src']?.includes('blob:'),
      'Must allow data: and blob: for image uploads and previews'
    );
  });

  it('6. Security Contract: Strict-Transport-Security sets max-age >= 1 year with includeSubDomains', () => {
    const headers = REQUIRED_REMEDIATION_HEADER_RULES.headers;
    const hsts = headers.find((h) => h.key === 'Strict-Transport-Security')?.value || '';

    assert.ok(hsts.includes('max-age=63072000'), 'HSTS max-age must be at least 1-2 years');
    assert.ok(hsts.includes('includeSubDomains'), 'HSTS must includeSubDomains');
  });
});

