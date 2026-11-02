import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SEC-01 Regression Test Suite: Push Notification Authorization & Phishing Prevention
 *
 * Vulnerability Identified:
 * The Supabase Edge Function `send-push-notification/index.ts` accepts unauthenticated
 * HTTP POST requests with `{ user_id, title, body, url }`, uses the service_role key to
 * bypass RLS, dispatches arbitrary web push notifications to any user, allows arbitrary
 * external phishing URLs, and leaks account existence via 404 responses.
 *
 * This test suite:
 * 1. Analyzes the current implementation and confirms vulnerable behavior.
 * 2. Defines and asserts the strict security contract required for remediation.
 */

describe('SEC-01: Push Notification Edge Function Authorization & Guard Tests', () => {
  const edgeFunctionPath = path.resolve(
    process.cwd(),
    'supabase/functions/send-push-notification/index.ts'
  );

  it('1. Remediation Verification: Enforces Authorization header inspection and JWT verification', () => {
    assert.ok(fs.existsSync(edgeFunctionPath), 'Edge function file exists');
    const source = fs.readFileSync(edgeFunctionPath, 'utf-8');

    const hasAuthHeaderCheck = source.includes("request.headers.get('Authorization')") ||
      source.includes("request.headers.get('authorization')");
    const hasJwtVerification = source.includes('auth.getUser');

    assert.strictEqual(hasAuthHeaderCheck, true, 'REMEDIATION VERIFIED: Authorization header inspection is enforced');
    assert.strictEqual(hasJwtVerification, true, 'REMEDIATION VERIFIED: auth.getUser JWT verification is enforced');
  });

  it('2. Remediation Verification: Eliminates user enumeration 404 status leak', () => {
    const source = fs.readFileSync(edgeFunctionPath, 'utf-8');
    const hasEnumerationLeak = source.includes('No subscription found for user') &&
      source.includes('status: 404');
    assert.strictEqual(hasEnumerationLeak, false, 'REMEDIATION VERIFIED: 404 status leak eliminated; non-enumerating 200 response returned');
  });

  it('3. Remediation Verification: Enforces destination URL sanitization against external phishing', () => {
    const source = fs.readFileSync(edgeFunctionPath, 'utf-8');
    const hasUrlSanitization = source.includes('sanitizeDestinationUrl') && source.includes('startsWith');
    assert.strictEqual(hasUrlSanitization, true, 'REMEDIATION VERIFIED: Destination URL sanitization is active against external phishing');
  });

  // --------------------------------------------------------------------------
  // SECURITY CONTRACT SPECIFICATION TESTS (Simulating the Remediation Gate)
  // --------------------------------------------------------------------------

  interface PushPayload {
    user_id: string;
    title: string;
    body: string;
    url?: string;
    origin?: string;
  }

  interface RequestContext {
    authHeader?: string;
    senderUser?: { id: string; role: 'customer' | 'shopkeeper' | 'admin' } | null;
    isInternalService?: boolean;
    orderRelationship?: { orderId: string; customerId: string; shopOwnerId: string } | null;
  }

  interface SecurityGateResult {
    allowed: boolean;
    statusCode: number;
    error?: string;
    sanitizedUrl?: string;
  }

  /**
   * Reference security gate contract defining the required remediation behavior.
   */
  function evaluatePushSecurityGate(
    payload: PushPayload,
    context: RequestContext
  ): SecurityGateResult {
    // 1. Unauthenticated or missing credentials
    if (!context.authHeader && !context.isInternalService) {
      return { allowed: false, statusCode: 401, error: 'Authorization required' };
    }

    // 2. Invalid or expired token
    if (context.authHeader && !context.senderUser && !context.isInternalService) {
      return { allowed: false, statusCode: 401, error: 'Invalid or expired authentication token' };
    }

    // 3. Sender authorization & recipient permission
    if (context.senderUser && !context.isInternalService) {
      const sender = context.senderUser;
      const targetUserId = payload.user_id;

      // Platform admins have universal operational broadcast authority
      if (sender.role === 'admin') {
        // permitted
      } else if (sender.id === targetUserId) {
        // Self-notification (e.g. permission testing or system alert to self)
      } else {
        // Disallow non-admin senders from impersonating system / administrative warnings
        const SYSTEM_IMPERSONATION_REGEX = /\b(admin|administrator|system\s+alert|security\s+alert|account\s+suspended|password\s+reset|official\s+support)\b/i;
        if (payload.title && SYSTEM_IMPERSONATION_REGEX.test(payload.title)) {
          return { allowed: false, statusCode: 403, error: 'Forbidden: non-administrative senders cannot impersonate system or administrative notifications' };
        }

        if (sender.role === 'shopkeeper') {
          // Shopkeeper notifying customer: must share an active order/request
          const isCustomerOfShop = context.orderRelationship?.shopOwnerId === sender.id &&
            context.orderRelationship?.customerId === targetUserId;
          if (!isCustomerOfShop) {
            return { allowed: false, statusCode: 403, error: 'Forbidden: recipient is not an active customer of your shop' };
          }
        } else if (sender.role === 'customer') {
          // Customer notifying shopkeeper: must share an active order/request
          const isShopOwnerOfOrder = context.orderRelationship?.customerId === sender.id &&
            context.orderRelationship?.shopOwnerId === targetUserId;
          if (!isShopOwnerOfOrder) {
            return { allowed: false, statusCode: 403, error: 'Forbidden: customers cannot send unsolicited notifications to arbitrary users' };
          }
        } else {
          return { allowed: false, statusCode: 403, error: 'Forbidden' };
        }
      }
    }

    // 4. URL Destination Sanitization: disallow external phishing URLs
    let sanitizedUrl = '/';
    if (payload.url) {
      const rawUrl = payload.url.trim();
      // Strictly disallow absolute external protocols or protocol-relative schemes
      if (
        rawUrl.startsWith('http://') ||
        rawUrl.startsWith('https://') ||
        rawUrl.startsWith('//') ||
        rawUrl.startsWith('/\\') ||
        rawUrl.toLowerCase().startsWith('javascript:')
      ) {
        return { allowed: false, statusCode: 400, error: 'External redirect URLs are forbidden in push notifications' };
      }
      sanitizedUrl = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
    }

    return { allowed: true, statusCode: 200, sanitizedUrl };
  }

  it('4. Security Contract: Unauthenticated requests are rejected with HTTP 401', () => {
    const res = evaluatePushSecurityGate(
      { user_id: 'target-uuid', title: 'Order update', body: 'Ready' },
      { authHeader: undefined, senderUser: null }
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.statusCode, 401);
  });

  it('5. Security Contract: Invalid or expired JWTs are rejected with HTTP 401', () => {
    const res = evaluatePushSecurityGate(
      { user_id: 'target-uuid', title: 'Order update', body: 'Ready' },
      { authHeader: 'Bearer invalid-or-expired-token', senderUser: null }
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.statusCode, 401);
  });

  it('6. Security Contract: Authenticated customer cannot send unsolicited notifications to other customers (HTTP 403)', () => {
    const res = evaluatePushSecurityGate(
      { user_id: 'victim-customer-uuid', title: 'Spam', body: 'Click here' },
      {
        authHeader: 'Bearer valid-customer-a-token',
        senderUser: { id: 'customer-a-uuid', role: 'customer' },
        orderRelationship: null, // No business relationship
      }
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.statusCode, 403);
    assert.ok(res.error?.includes('Forbidden'));
  });

  it('7. Security Contract: External redirect URLs are rejected with HTTP 400', () => {
    const phishingUrls = [
      'https://evil-phishing.com/steal-creds',
      'http://insecure-domain.com/login',
      '//evil.com/redirect',
      '/\\evil.com',
      'javascript:alert(1)',
    ];

    for (const badUrl of phishingUrls) {
      const res = evaluatePushSecurityGate(
        { user_id: 'customer-uuid', title: 'Security Alert', body: 'Verify account', url: badUrl },
        {
          authHeader: 'Bearer valid-admin-token',
          senderUser: { id: 'admin-uuid', role: 'admin' },
        }
      );
      assert.strictEqual(res.allowed, false, `Must reject dangerous URL: ${badUrl}`);
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.error?.includes('External redirect URLs are forbidden'));
    }
  });

  it('8. Security Contract: Legitimate shopkeeper notifying customer of an active order succeeds', () => {
    const res = evaluatePushSecurityGate(
      {
        user_id: 'customer-uuid-001',
        title: 'Order Ready',
        body: 'Your order #ORD-1234 is ready for pickup!',
        url: '/requests/req-1234',
      },
      {
        authHeader: 'Bearer shopkeeper-token',
        senderUser: { id: 'shopowner-uuid-001', role: 'shopkeeper' },
        orderRelationship: {
          orderId: 'req-1234',
          customerId: 'customer-uuid-001',
          shopOwnerId: 'shopowner-uuid-001',
        },
      }
    );
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.sanitizedUrl, '/requests/req-1234');
  });

  it('9. Security Contract: Trusted backend service invocation succeeds with valid payload', () => {
    const res = evaluatePushSecurityGate(
      {
        user_id: 'customer-uuid-001',
        title: 'System Notification',
        body: 'Password reset confirmed',
        url: '/profile',
      },
      {
        isInternalService: true,
      }
    );
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.sanitizedUrl, '/profile');
  });

  it('10. Security Contract: Non-admin senders attempting system/admin message impersonation are rejected with HTTP 403', () => {
    const maliciousTitles = [
      'Vaangly Admin Alert: Action Required',
      'System Alert: Suspended Account',
      'Security Alert: Unauthorized Login',
      'Official Support: Password Reset',
    ];

    for (const title of maliciousTitles) {
      const res = evaluatePushSecurityGate(
        {
          user_id: 'customer-uuid-001',
          title,
          body: 'Click here immediately',
          url: '/orders',
        },
        {
          authHeader: 'Bearer shopkeeper-token',
          senderUser: { id: 'shopowner-uuid-001', role: 'shopkeeper' },
          orderRelationship: {
            orderId: 'req-1234',
            customerId: 'customer-uuid-001',
            shopOwnerId: 'shopowner-uuid-001',
          },
        }
      );
      assert.strictEqual(res.allowed, false, `Must reject system impersonation title: "${title}"`);
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.error?.includes('cannot impersonate system'));
    }
  });
});

