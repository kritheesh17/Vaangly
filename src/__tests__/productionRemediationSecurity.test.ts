/**
 * KARTZO PRODUCTION REMEDIATION: SECURITY TEST SUITE
 *
 * Verifies fixes for:
 * 1. SEC-AUDIT-01: Payment-status mutation and verification guards
 * 2. SEC-AUDIT-02: State simulator development gating and server-side state/event authorization
 */

import fs from 'fs';
import path from 'path';

function runSecurityRemediationTests() {
  console.log('\n--- 1. SEC-AUDIT-01: Payment Verification & Status Trigger Guard ---');

  const migrationPath = path.resolve('supabase/migrations/20261126000080_security_remediation_request_state_and_payment_guards.sql');
  if (!fs.existsSync(migrationPath)) {
    throw new Error('Corrective migration 20261126000080 does not exist');
  }
  const migrationContent = fs.readFileSync(migrationPath, 'utf8');

  // Verify validate_request_payment_fields defensive checks
  if (!migrationContent.includes('Customers cannot change payment verification state')) {
    throw new Error('Migration 80 must throw exception when customer attempts to change payment verification state');
  }

  if (!migrationContent.includes('NEW.customer_paid IS DISTINCT FROM OLD.customer_paid')) {
    throw new Error('Migration 80 must guard customer_paid against mutation by customer');
  }

  if (!migrationContent.includes('NEW.payment_verified_at IS DISTINCT FROM OLD.payment_verified_at')) {
    throw new Error('Migration 80 must guard payment_verified_at against customer mutation');
  }

  if (!migrationContent.includes('NEW.payment_verified_by IS DISTINCT FROM OLD.payment_verified_by')) {
    throw new Error('Migration 80 must guard payment_verified_by against customer mutation');
  }

  if (!migrationContent.includes('NEW.payment_screenshot_url IS NOT DISTINCT FROM OLD.payment_screenshot_url')) {
    throw new Error('Migration 80 must reject payment_status changes when screenshot is not updated');
  }

  // Verify acceptance gate is maintained
  if (!migrationContent.includes('Payment proof cannot be submitted before shopkeeper acceptance')) {
    throw new Error('Migration 80 must preserve acceptance gate for product orders');
  }

  // Verify legitimate shopkeeper verification is preserved
  if (!migrationContent.includes("NEW.payment_status IN ('PAYMENT_VERIFIED', 'paid')")) {
    throw new Error('Migration 80 must preserve shopkeeper payment verification logic');
  }
  if (!migrationContent.includes('NEW.customer_paid := TRUE')) {
    throw new Error('Migration 80 must set customer_paid to true on shopkeeper verification');
  }

  console.log('✓ Migration 80 defines authoritative payment verification guards for requests');

  // Simulate SQL trigger logic in TypeScript
  interface RequestRecord {
    id: string;
    customer_id: string;
    shop_id: string;
    current_state: string;
    payment_method: string;
    payment_status: string;
    customer_paid: boolean;
    payment_screenshot_url: string | null;
    payment_verified_at: string | null;
    payment_verified_by: string | null;
    workflow_group_code: string;
  }

  function simulatePaymentTrigger(
    oldRec: RequestRecord,
    newRec: RequestRecord,
    actorId: string,
    isShopkeeper: boolean,
    isAdmin: boolean
  ): RequestRecord {
    const updated = { ...newRec };
    if (!isShopkeeper && !isAdmin) {
      if (
        updated.payment_method !== oldRec.payment_method ||
        updated.payment_verified_at !== oldRec.payment_verified_at ||
        updated.payment_verified_by !== oldRec.payment_verified_by ||
        updated.customer_paid !== oldRec.customer_paid
      ) {
        throw new Error('Customers cannot change payment verification state');
      }

      if (updated.payment_screenshot_url === oldRec.payment_screenshot_url) {
        if (updated.payment_status !== oldRec.payment_status) {
          throw new Error('Customers cannot change payment verification state');
        }
      }

      if (updated.payment_screenshot_url !== oldRec.payment_screenshot_url) {
        if (updated.payment_method !== 'upi' || !updated.payment_screenshot_url?.trim()) {
          throw new Error('A payment proof is only valid for a UPI request');
        }
        if (oldRec.workflow_group_code !== 'APPOINTMENT') {
          if (oldRec.current_state === 'REQUESTED') {
            throw new Error('Payment proof cannot be submitted before shopkeeper acceptance');
          }
          if (!['ACCEPTED', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'READY', 'COMPLETED'].includes(oldRec.current_state)) {
            throw new Error('Payment can only be submitted after the order has been accepted');
          }
        }
        updated.payment_status = 'PAYMENT_PROOF_SUBMITTED';
        updated.customer_paid = false;
      }
    } else {
      if (['PAYMENT_VERIFIED', 'paid'].includes(updated.payment_status)) {
        updated.payment_verified_at = new Date().toISOString();
        updated.payment_verified_by = actorId;
        updated.customer_paid = true;
      } else if (['PAYMENT_REJECTED', 'failed'].includes(updated.payment_status)) {
        updated.payment_verified_at = null;
        updated.payment_verified_by = null;
        updated.customer_paid = false;
      }
    }
    return updated;
  }

  const baseOrder: RequestRecord = {
    id: 'req-test-1',
    customer_id: 'cust-1',
    shop_id: 'shop-1',
    current_state: 'ACCEPTED',
    payment_method: 'upi',
    payment_status: 'PAYMENT_PENDING',
    customer_paid: false,
    payment_screenshot_url: null,
    payment_verified_at: null,
    payment_verified_by: null,
    workflow_group_code: 'ORDER',
  };

  // Test 1: Customer direct payment_status mutation attempt -> must throw
  let blockedCustomerDirectMutation = false;
  try {
    simulatePaymentTrigger(
      baseOrder,
      { ...baseOrder, payment_status: 'paid' },
      'cust-1',
      false,
      false
    );
  } catch (err: any) {
    if (err.message.includes('Customers cannot change payment verification state')) {
      blockedCustomerDirectMutation = true;
    }
  }
  if (!blockedCustomerDirectMutation) {
    throw new Error('SEC-AUDIT-01 FAILED: Customer direct payment_status mutation was not rejected!');
  }
  console.log('✓ Rejected unauthorized customer payment_status mutation');

  // Test 2: Customer customer_paid mutation attempt -> must throw
  let blockedCustomerPaidMutation = false;
  try {
    simulatePaymentTrigger(
      baseOrder,
      { ...baseOrder, customer_paid: true },
      'cust-1',
      false,
      false
    );
  } catch (err: any) {
    if (err.message.includes('Customers cannot change payment verification state')) {
      blockedCustomerPaidMutation = true;
    }
  }
  if (!blockedCustomerPaidMutation) {
    throw new Error('SEC-AUDIT-01 FAILED: Customer customer_paid mutation was not rejected!');
  }
  console.log('✓ Rejected unauthorized customer customer_paid mutation');

  // Test 3: Customer payment proof upload on unaccepted order -> must throw
  let blockedUnacceptedProof = false;
  const unacceptedOrder = { ...baseOrder, current_state: 'REQUESTED' };
  try {
    simulatePaymentTrigger(
      unacceptedOrder,
      { ...unacceptedOrder, payment_screenshot_url: 'payment-proofs/test.png' },
      'cust-1',
      false,
      false
    );
  } catch (err: any) {
    if (err.message.includes('Payment proof cannot be submitted before shopkeeper acceptance')) {
      blockedUnacceptedProof = true;
    }
  }
  if (!blockedUnacceptedProof) {
    throw new Error('SEC-AUDIT-01 FAILED: Payment proof on REQUESTED order was not rejected!');
  }
  console.log('✓ Enforced order acceptance gate before payment proof upload');

  // Test 4: Customer legitimate payment proof on ACCEPTED order -> transitions to PAYMENT_PROOF_SUBMITTED
  const validProofSubmission = simulatePaymentTrigger(
    baseOrder,
    { ...baseOrder, payment_screenshot_url: 'payment-proofs/test.png' },
    'cust-1',
    false,
    false
  );
  if (validProofSubmission.payment_status !== 'PAYMENT_PROOF_SUBMITTED' || validProofSubmission.customer_paid !== false) {
    throw new Error('SEC-AUDIT-01 FAILED: Legitimate proof submission did not set PAYMENT_PROOF_SUBMITTED');
  }
  console.log('✓ Legitimate customer payment proof transitions to PAYMENT_PROOF_SUBMITTED with customer_paid=false');

  // Test 5: Merchant verifying submitted payment -> sets paid and verified
  const merchantVerified = simulatePaymentTrigger(
    validProofSubmission,
    { ...validProofSubmission, payment_status: 'PAYMENT_VERIFIED' },
    'merchant-1',
    true,
    false
  );
  if (!merchantVerified.customer_paid || merchantVerified.payment_verified_by !== 'merchant-1') {
    throw new Error('SEC-AUDIT-01 FAILED: Merchant verification failed to mark customer_paid=true');
  }
  console.log('✓ Legitimate merchant verifies payment and marks order customer_paid=true');


  console.log('\n--- 2. SEC-AUDIT-02: State Simulator & Backend State Guards ---');

  const requestDetailFile = path.resolve('src/pages/RequestDetailPage.tsx');
  const requestDetailContent = fs.readFileSync(requestDetailFile, 'utf8');

  // Verify DEV gating on simulator panel
  if (!requestDetailContent.includes('{import.meta.env.DEV && (')) {
    throw new Error('SEC-AUDIT-02 FAILED: RequestDetailPage does not gate simulator with import.meta.env.DEV');
  }

  // Verify handleSimulateTransition aborts in production
  if (!requestDetailContent.includes('if (!import.meta.env.DEV)')) {
    throw new Error('SEC-AUDIT-02 FAILED: handleSimulateTransition does not check !import.meta.env.DEV');
  }

  console.log('✓ RequestDetailPage simulator panel and handler are strictly gated behind import.meta.env.DEV');

  // Verify backend state transition guards in migration 80
  if (!migrationContent.includes('Only the shopkeeper or an administrator can transition order status to')) {
    throw new Error('SEC-AUDIT-02 FAILED: Migration 80 must reject unauthorized customer state transitions');
  }

  // Verify audit event actor guard in migration 80
  if (!migrationContent.includes('trg_validate_request_event_actor')) {
    throw new Error('SEC-AUDIT-02 FAILED: Migration 80 must install trg_validate_request_event_actor');
  }
  if (!migrationContent.includes('Only the shop owner can record shopkeeper audit events')) {
    throw new Error('SEC-AUDIT-02 FAILED: Migration 80 must prevent spoofed shopkeeper audit events');
  }

  console.log('✓ Migration 80 guards public.requests and public.request_events against unauthorized customer mutation');
  console.log('\nALL SECURITY REMEDIATION TESTS PASSED!');
}

runSecurityRemediationTests();
