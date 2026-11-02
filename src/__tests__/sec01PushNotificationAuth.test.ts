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

  it('1. Current Implementation Inspection: Exposes unauthenticated CORS and lacks JWT verification', () => {
    assert.ok(fs.existsSync(edgeFunctionPath), 'Edge function file exists');
    const source = fs.readFileSync(edgeFunctionPath, 'utf-8');

    // Demonstrates current vulnerable pattern in source
    const hasWildcardCors = source.includes("'Access-Control-Allow-Origin': '*'");
    const hasAuthHeaderCheck = source.includes("request.headers.get('Authorization')") ||
      source.includes("request.headers.get('authorization')");
    const hasJwtVerification = source.includes('auth.getUser');

    assert.strictEqual(hasWildcardCors, true, 'VULNERABILITY CONFIRMED: Edge function uses wildcard CORS');
    assert.strictEqual(hasAuthHeaderCheck, false, 'VULNERABILITY CONFIRMED: No Authorization header inspection in current code');
    assert.strictEqual(hasJwtVerification, false, 'VULNERABILITY CONFIRMED: No JWT verification in current code');
  });

  it('2. Current Implementation Inspection: Leaks user existence via specific 404 response', () => {
    const source = fs.readFileSync(edgeFunctionPath, 'utf-8');
    // Current vulnerable code: returns status 404 with user_id echoing existence state
    const hasEnumerationLeak = source.includes('No subscription found for user') &&
      source.includes('status: 404');
    assert.strictEqual(hasEnumerationLeak, true, 'VULNERABILITY CONFIRMED: Returns 404 echoing user_id to unauthenticated callers');
  });

  it('3. Current Implementation Inspection: Does not sanitize destination URL against external phishing', () => {
    const source = fs.readFileSync(edgeFunctionPath, 'utf-8');
    const hasUrlSanitization = source.includes('new URL') || source.includes('startsWith') || source.includes('sanitize');
    assert.strictEqual(hasUrlSanitization, false, 'VULNERABILITY CONFIRMED: No destination URL sanitization against external phishing');
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
      } else if (sender.role === 'shopkeeper') {
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
});
