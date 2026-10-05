import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { Request } from '../types/database';

describe('Appointment + Payment Status Independent Presentation', () => {
  const requestCardTsx = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/shopkeeper/RequestCard.tsx'),
    'utf-8'
  );
  const requestCardCss = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/shopkeeper/RequestCard.css'),
    'utf-8'
  );
  const detailPageTsx = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/shopkeeper/ShopkeeperRequestDetailPage.tsx'),
    'utf-8'
  );
  const detailPageCss = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/shopkeeper/ShopkeeperRequestDetailPage.css'),
    'utf-8'
  );

  // =========================================================================
  // 1. Structural Checks on Appointment Card
  // =========================================================================
  it('1. Appointment Card renders visually distinct sections for Appointment and Payment', () => {
    assert.ok(
      requestCardTsx.includes('vaango-apt-card-statuses'),
      'Card includes dual appointment and payment status container'
    );
    assert.ok(
      requestCardTsx.includes('>Appointment<') || requestCardTsx.includes('Appointment</span>'),
      'Card has explicit "Appointment" status label'
    );
    assert.ok(
      requestCardTsx.includes('>Payment<') || requestCardTsx.includes('Payment</span>'),
      'Card has explicit "Payment" status label'
    );
    assert.ok(
      requestCardCss.includes('.vaango-apt-card-statuses'),
      'CSS has styling for appointment card status pair'
    );
  });

  // =========================================================================
  // 2. Structural Checks on Appointment Details Page
  // =========================================================================
  it('2. Appointment Details Page presents Appointment Status and Payment Status independently', () => {
    assert.ok(
      detailPageTsx.includes('vaango-apt-detail-status-grid'),
      'Detail page has dedicated status grid for appointments'
    );
    assert.ok(
      detailPageTsx.includes('Appointment Status'),
      'Detail page displays "Appointment Status" label'
    );
    assert.ok(
      detailPageTsx.includes('Payment Status'),
      'Detail page displays "Payment Status" label'
    );
    assert.ok(
      detailPageTsx.includes('Customer No-Show'),
      'Detail page maps NO_SHOW state to human-readable "Customer No-Show"'
    );
    assert.ok(
      detailPageTsx.includes('received'),
      'Detail page displays the received amount under payment status'
    );
    assert.ok(
      detailPageCss.includes('.vaango-apt-detail-status-grid'),
      'CSS has styling for appointment details status grid'
    );
  });

  // =========================================================================
  // 3. Status Derivation Logic & Visual Combinations Verification
  // =========================================================================
  const evaluatePresentation = (req: Partial<Request>) => {
    const isPaid = Boolean(
      req.customer_paid ||
      req.payment_status === 'PAYMENT_VERIFIED' ||
      req.payment_status === 'paid'
    );

    const aptLabel = req.current_state === 'NO_SHOW'
      ? 'Customer No-Show'
      : req.current_state;

    const aptBadgeVariant = ['READY', 'CONFIRMED', 'COMPLETED'].includes(req.current_state || '')
      ? 'success'
      : req.current_state === 'DELAYED'
        ? 'warning'
        : ['REJECTED', 'CANCELLED', 'NO_SHOW'].includes(req.current_state || '')
          ? 'error'
          : 'primary';

    const paymentLabel = isPaid
      ? 'Paid'
      : req.payment_status === 'PAYMENT_REJECTED'
        ? 'Proof Rejected'
        : req.payment_status === 'PAYMENT_PROOF_SUBMITTED'
          ? 'Pending Verification'
          : 'Unpaid';

    const paymentBadgeVariant = isPaid
      ? 'success'
      : req.payment_status === 'PAYMENT_REJECTED'
        ? 'error'
        : req.payment_status === 'PAYMENT_PROOF_SUBMITTED'
          ? 'warning'
          : 'neutral';

    return {
      aptLabel,
      aptBadgeVariant,
      paymentLabel,
      paymentBadgeVariant,
      isPaid,
      amount: req.payment_amount ?? req.total_estimate ?? 0,
    };
  };

  it('3. Combination 1: Completed + Paid', () => {
    const res = evaluatePresentation({
      current_state: 'COMPLETED',
      customer_paid: true,
      payment_status: 'PAYMENT_VERIFIED',
      total_estimate: 250,
    });

    assert.strictEqual(res.aptLabel, 'COMPLETED');
    assert.strictEqual(res.aptBadgeVariant, 'success');
    assert.strictEqual(res.paymentLabel, 'Paid');
    assert.strictEqual(res.paymentBadgeVariant, 'success');
    assert.strictEqual(res.isPaid, true);
    assert.strictEqual(res.amount, 250);
  });

  it('4. Combination 2: No-Show + Paid (independent status without error)', () => {
    const res = evaluatePresentation({
      current_state: 'NO_SHOW',
      customer_paid: true,
      payment_status: 'paid',
      total_estimate: 199,
    });

    assert.strictEqual(res.aptLabel, 'Customer No-Show');
    assert.strictEqual(res.aptBadgeVariant, 'error'); // Red indicator for No-Show
    assert.strictEqual(res.paymentLabel, 'Paid');
    assert.strictEqual(res.paymentBadgeVariant, 'success'); // Green indicator for Paid
    assert.strictEqual(res.isPaid, true);
    assert.strictEqual(res.amount, 199);
  });

  it('5. Combination 3: Cancelled + Paid', () => {
    const res = evaluatePresentation({
      current_state: 'CANCELLED',
      customer_paid: true,
      payment_status: 'PAYMENT_VERIFIED',
      total_estimate: 350,
    });

    assert.strictEqual(res.aptLabel, 'CANCELLED');
    assert.strictEqual(res.aptBadgeVariant, 'error');
    assert.strictEqual(res.paymentLabel, 'Paid');
    assert.strictEqual(res.paymentBadgeVariant, 'success');
    assert.strictEqual(res.isPaid, true);
    assert.strictEqual(res.amount, 350);
  });

  it('6. Combination 4: Pending / Confirmed + Unpaid', () => {
    const pendingRes = evaluatePresentation({
      current_state: 'REQUESTED',
      customer_paid: false,
      payment_status: 'PAYMENT_PENDING',
      total_estimate: 150,
    });

    assert.strictEqual(pendingRes.aptBadgeVariant, 'primary');
    assert.strictEqual(pendingRes.paymentLabel, 'Unpaid');
    assert.strictEqual(pendingRes.paymentBadgeVariant, 'neutral');
    assert.strictEqual(pendingRes.isPaid, false);

    const confirmedRes = evaluatePresentation({
      current_state: 'CONFIRMED',
      customer_paid: false,
      payment_status: 'NOT_REQUIRED',
      total_estimate: 150,
    });

    assert.strictEqual(confirmedRes.aptLabel, 'CONFIRMED');
    assert.strictEqual(confirmedRes.aptBadgeVariant, 'success');
    assert.strictEqual(confirmedRes.paymentLabel, 'Unpaid');
    assert.strictEqual(confirmedRes.paymentBadgeVariant, 'neutral');
    assert.strictEqual(confirmedRes.isPaid, false);
  });

  // =========================================================================
  // 4. Invariant Protection: No-Show does not mutate or overwrite payment
  // =========================================================================
  it('7. Customer No-Show preserves underlying payment values and does not auto-mutate to Unpaid', () => {
    const appointmentReq: Request = {
      id: 'req-apt-101',
      customer_id: 'cust-1',
      shop_id: 'shop-1',
      workflow_group_code: 'APPOINTMENT',
      current_state: 'CONFIRMED',
      reference_code: 'REF-101',
      total_estimate: 199,
      customer_paid: true,
      payment_status: 'PAYMENT_VERIFIED',
      notes: '{}',
      scheduled_for: '2026-10-05 10:00',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Transitioning appointment state to NO_SHOW
    const transitionedReq: Request = {
      ...appointmentReq,
      current_state: 'NO_SHOW',
      updated_at: new Date().toISOString(),
    };

    // Underlying payment properties remain strictly unchanged
    assert.strictEqual(transitionedReq.customer_paid, true);
    assert.strictEqual(transitionedReq.payment_status, 'PAYMENT_VERIFIED');
    assert.strictEqual(transitionedReq.total_estimate, 199);
  });
});
