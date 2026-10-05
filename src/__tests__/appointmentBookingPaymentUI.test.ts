import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Appointment Booking Payment-Method UI & Responsive UPI QR', () => {
  const bookingTsx = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/customer/AppointmentBookingCard.tsx'),
    'utf-8'
  );
  const bookingCss = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/customer/AppointmentBookingCard.css'),
    'utf-8'
  );

  // =========================================================================
  // ISSUE 1: Payment Method Selection UI
  // =========================================================================
  describe('Issue 1: Payment Method Selection', () => {
    it('1.1 Renders accessible interactive buttons for Pay at Shop and Pay Online (UPI)', () => {
      assert.ok(
        bookingTsx.includes('role="radiogroup"') && bookingTsx.includes('role="radio"'),
        'Payment methods container and options have proper accessibility roles'
      );
      assert.ok(
        bookingTsx.includes("aria-checked={paymentMethod === 'pay_at_shop'}"),
        'Pay at shop communicates selected state via aria-checked'
      );
      assert.ok(
        bookingTsx.includes("aria-checked={paymentMethod === 'online'}"),
        'Pay online communicates selected state via aria-checked'
      );
      assert.ok(
        bookingTsx.includes("onClick={() => setPaymentMethod('pay_at_shop')}"),
        'Entire Pay at Shop option is clickable'
      );
      assert.ok(
        bookingTsx.includes("onClick={() => setPaymentMethod('online')}"),
        'Entire Pay Online option is clickable'
      );
    });

    it('1.2 Selected method has Vaangly green border, subtle light-green background, and clear checkmark', () => {
      // TSX conditional class
      assert.ok(
        bookingTsx.includes("paymentMethod === 'pay_at_shop' ? 'vaango-payment-method-card--selected' : ''") &&
        bookingTsx.includes("paymentMethod === 'online' ? 'vaango-payment-method-card--selected' : ''"),
        'Only the currently selected method receives the --selected modifier class'
      );

      // Checkmark icon rendered conditionally when selected
      assert.ok(
        bookingTsx.includes('CheckCircle2') &&
        bookingTsx.includes('vaango-payment-method-card__check-icon') &&
        bookingTsx.includes('vaango-payment-method-card__check-placeholder'),
        'Selected state renders CheckCircle2 icon and unselected renders neutral placeholder'
      );

      // CSS styles for selected state
      assert.ok(
        bookingCss.includes('.vaango-payment-method-card--selected'),
        'CSS defines selected state'
      );
      assert.ok(
        bookingCss.includes('border: 2px solid #15803D') || bookingCss.includes('border-color: #15803D'),
        'Selected state uses Vaangly green border'
      );
      assert.ok(
        bookingCss.includes('background: #F0FDF4') || bookingCss.includes('background-color: #F0FDF4'),
        'Selected state uses subtle light-green background'
      );
    });

    it('1.3 Unselected method has neutral border and background', () => {
      assert.ok(
        bookingCss.includes('.vaango-payment-method-card {') &&
        bookingCss.includes('border: 1.5px solid #E2E8F0'),
        'Unselected state uses neutral border'
      );
      assert.ok(
        bookingCss.includes('background: #FFFFFF'),
        'Unselected state uses clean neutral surface'
      );
    });

    it('1.4 Preserves existing labels and descriptions', () => {
      assert.ok(
        bookingTsx.includes("t('payAtShop')"),
        'Preserves Pay at Shop label'
      );
      assert.ok(
        bookingTsx.includes('Get queue token immediately. Pay cash/UPI at counter.'),
        'Preserves Pay at Shop description'
      );
      assert.ok(
        bookingTsx.includes('Pay Online (UPI)'),
        'Preserves Pay Online (UPI) label'
      );
      assert.ok(
        bookingTsx.includes('Reserve a 10-min hold while uploading payment proof.') &&
        bookingTsx.includes('Online payment is unavailable until this shop adds its UPI QR.'),
        'Preserves Pay Online dynamic descriptions'
      );
    });
  });

  // =========================================================================
  // ISSUE 2: Responsive UPI QR Code
  // =========================================================================
  describe('Issue 2: UPI QR Code Sizing & Responsiveness', () => {
    it('2.1 UPI QR code is square, undistorted, and centered horizontally', () => {
      assert.ok(
        bookingCss.includes('.vaango-appointment-upi-qr-wrapper'),
        'QR image is wrapped in dedicated centered wrapper'
      );
      assert.ok(
        bookingCss.includes('justify-content: center') &&
        bookingCss.includes('align-items: center'),
        'Wrapper centers QR horizontally and vertically'
      );
      assert.ok(
        bookingCss.includes('aspect-ratio: 1 / 1') || bookingCss.includes('aspect-ratio: 1'),
        'QR image enforces square aspect ratio'
      );
      assert.ok(
        bookingCss.includes('object-fit: contain'),
        'QR image enforces contain to prevent distortion'
      );
    });

    it('2.2 Desktop size is constrained to 320px–360px without overflowing', () => {
      assert.ok(
        bookingCss.includes('max-width: 320px') || bookingCss.includes('max-width: 360px'),
        'Desktop QR size is constrained to a reasonable 320px–360px'
      );
      assert.ok(
        bookingCss.includes('box-sizing: border-box'),
        'Card and wrapper use box-sizing border-box to prevent overflow'
      );
    });

    it('2.3 Mobile sizes (320px, 375px, 430px) constrain QR to 220px–280px', () => {
      assert.ok(
        bookingCss.includes('@media (max-width: 640px)'),
        'Includes mobile responsive breakpoint for QR'
      );
      assert.ok(
        bookingCss.includes('max-width: min(260px, calc(100vw - 64px))') ||
        bookingCss.includes('max-width: 260px') ||
        bookingCss.includes('max-width: 280px'),
        'Mobile QR is constrained to approximately 260px'
      );
      assert.ok(
        bookingCss.includes('@media (max-width: 360px)') &&
        bookingCss.includes('max-width: 220px'),
        'Narrow mobile viewport (320px) constrains QR to 220px'
      );
    });

    it('2.4 Merchant UPI information remains readable and formatted below QR', () => {
      assert.ok(
        bookingTsx.includes('vaango-appointment-upi-card__details') &&
        bookingTsx.includes('UPI ID') &&
        bookingTsx.includes('Amount'),
        'Merchant details (UPI ID and Amount) are cleanly formatted in details box'
      );
      assert.ok(
        bookingCss.includes('word-break: break-all'),
        'Long UPI IDs break naturally without overflowing container'
      );
      assert.ok(
        bookingTsx.includes('copyMerchantUpiId'),
        'Retains working Copy UPI ID action'
      );
    });
  });
});
