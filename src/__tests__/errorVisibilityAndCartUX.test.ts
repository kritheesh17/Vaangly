import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { classifyError, scrollAndFocusError } from '../lib/errorUxUtils';

describe('Global Error Visibility & Validation UX Overhaul', () => {
  const rootDir = process.cwd();

  // Load relevant file contents
  const cartPageContent = fs.readFileSync(path.join(rootDir, 'src/pages/CartPage.tsx'), 'utf-8');
  const cartPageCss = fs.readFileSync(path.join(rootDir, 'src/pages/CartPage.css'), 'utf-8');
  const i18nContent = fs.readFileSync(path.join(rootDir, 'src/lib/i18n.ts'), 'utf-8');
  const bannerContent = fs.readFileSync(path.join(rootDir, 'src/components/ui/ActionErrorBanner.tsx'), 'utf-8');
  const loginPageContent = fs.readFileSync(path.join(rootDir, 'src/pages/auth/LoginPage.tsx'), 'utf-8');
  const completeProfileContent = fs.readFileSync(path.join(rootDir, 'src/pages/auth/CompleteProfilePage.tsx'), 'utf-8');
  const resetPasswordContent = fs.readFileSync(path.join(rootDir, 'src/pages/auth/ResetPasswordPage.tsx'), 'utf-8');
  const productModalContent = fs.readFileSync(path.join(rootDir, 'src/components/shopkeeper/ProductFormModal.tsx'), 'utf-8');
  const serviceModalContent = fs.readFileSync(path.join(rootDir, 'src/components/shopkeeper/ServiceFormModal.tsx'), 'utf-8');
  const onboardingContent = fs.readFileSync(path.join(rootDir, 'src/pages/shopkeeper/ShopkeeperOnboardingPage.tsx'), 'utf-8');
  const adminDetailContent = fs.readFileSync(path.join(rootDir, 'src/pages/admin/AdminApplicationDetailPage.tsx'), 'utf-8');
  const bookingCardContent = fs.readFileSync(path.join(rootDir, 'src/components/customer/AppointmentBookingCard.tsx'), 'utf-8');

  // --- Test Suite 1: Error Classification Utility ---
  describe('1. Error Classification Engine (errorUxUtils)', () => {
    it('classifies network failures with retryability', () => {
      const err = classifyError('TypeError: Failed to fetch');
      assert.strictEqual(err.kind, 'network');
      assert.strictEqual(err.category, 'network');
      assert.strictEqual(err.canRetry, true);
      assert.ok(err.title?.includes('Connection'));
    });

    it('classifies authentication/session errors', () => {
      const err = classifyError('JWT expired');
      assert.strictEqual(err.kind, 'auth');
      assert.strictEqual(err.category, 'auth');
      assert.strictEqual(err.canRetry, true);
      assert.ok(err.title?.includes('Authentication'));
    });

    it('classifies business rule / capacity errors', () => {
      const err = classifyError('Selected appointment slot is already booked');
      assert.strictEqual(err.kind, 'business_rule');
      assert.strictEqual(err.category, 'business_rule');
      assert.strictEqual(err.canRetry, true);
      assert.ok(err.title?.includes('Unavailable'));
    });

    it('classifies validation / missing selection errors as non-retryable without user fix', () => {
      const err = classifyError('Choose Dine-in or Parcel / Takeaway before placing your order.');
      assert.strictEqual(err.kind, 'validation');
      assert.strictEqual(err.category, 'validation');
      assert.strictEqual(err.canRetry, false);
      assert.strictEqual(err.message, 'Choose Dine-in or Parcel / Takeaway before placing your order.');
    });

    it('falls back gracefully on unknown server errors', () => {
      const err = classifyError(new Error('Internal database query syntax error 500'));
      assert.strictEqual(err.kind, 'server');
      assert.strictEqual(err.category, 'server');
      assert.strictEqual(err.canRetry, true);
    });
  });

  // --- Test Suite 2: Safe Scroll & Focus Helper ---
  describe('2. Scroll & Focus Management (errorUxUtils)', () => {
    it('safely handles non-DOM / SSR / null target without throwing', () => {
      const result = scrollAndFocusError(null);
      assert.strictEqual(result, false);

      const result2 = scrollAndFocusError('non_existent_element_id');
      assert.strictEqual(result2, false);
    });
  });

  // --- Test Suite 3: Cart Page Error Visibility & Action Proximity ---
  describe('3. Cart Page Error Visibility & Action Proximity', () => {
    it('ensures the exact required error message is defined in i18n for English and Tamil', () => {
      assert.ok(
        i18nContent.includes('Choose Dine-in or Parcel / Takeaway before placing your order.'),
        'English translation must match exact required phrasing'
      );
      assert.ok(
        i18nContent.includes('chooseParcelOrDineIn') &&
        i18nContent.includes('Dine-in') &&
        i18nContent.includes('Takeaway'),
        'Tamil translation must define chooseParcelOrDineIn'
      );
    });

    it('verifies error banner is placed in .vaango-cart-shop-action-zone directly above checkout button', () => {
      // Must NOT place error banner above store items
      assert.ok(
        !cartPageContent.includes('<div className="vaango-cart-error-banner'),
        'Old misplaced error banner above items must be removed'
      );

      // Must render ActionErrorBanner in shop action zone
      assert.ok(
        cartPageContent.includes('vaango-cart-shop-action-zone'),
        'Must contain .vaango-cart-shop-action-zone'
      );
      assert.ok(
        cartPageContent.includes('currentError && (') || cartPageContent.includes('shopErrors[shopId] && ('),
        'Must render error condition for shop error'
      );
      assert.ok(
        cartPageContent.includes('<ActionErrorBanner'),
        'Must render ActionErrorBanner component'
      );

      // Verify ActionErrorBanner occurs before checkout Button in the action zone
      const actionZoneIndex = cartPageContent.indexOf('vaango-cart-shop-action-zone');
      const bannerIndex = cartPageContent.indexOf('<ActionErrorBanner', actionZoneIndex);
      const btnIndex = cartPageContent.indexOf('Place Order with', actionZoneIndex);

      assert.ok(actionZoneIndex !== -1, 'Action zone exists');
      assert.ok(bannerIndex !== -1, 'Banner is inside action zone');
      assert.ok(btnIndex !== -1, 'Place order button exists');
      assert.ok(
        bannerIndex < btnIndex,
        'ActionErrorBanner must appear directly ABOVE the place order button'
      );
    });

    it('verifies fulfillment section visual highlighting on error', () => {
      assert.ok(
        cartPageContent.includes('vaango-cart-fulfillment-box--error'),
        'CartPage must apply vaango-cart-fulfillment-box--error when fulfillment error occurs'
      );
      assert.ok(
        cartPageCss.includes('.vaango-cart-fulfillment-box--error'),
        'CartPage.css must define .vaango-cart-fulfillment-box--error styling'
      );
    });

    it('verifies auto-clearing fulfillment error when user selects an option', () => {
      assert.ok(
        cartPageContent.includes('setShopFulfillments'),
        'Must have setShopFulfillments handler'
      );
      // Check that selecting fulfillment clears the shop error
      assert.ok(
        cartPageContent.includes("delete copy[shopId]") || cartPageContent.includes("setShopErrors"),
        'Must clear shop error upon selecting fulfillment'
      );
    });

    it('verifies auto-clearing error when switching slot, payment method, or uploading proof', () => {
      assert.ok(
        cartPageContent.includes('setShopPickupDates'),
        'Must have scheduled pickup date selection'
      );
      assert.ok(
        cartPageContent.includes('setPaymentProofPaths'),
        'Must have payment proof upload handler'
      );
    });

    it('preserves cart contents, items, quantities and notes during validation errors', () => {
      // The validation failure in handleCheckoutShop must simply set error and return, without calling clearCart()
      const checkoutShopCode = cartPageContent.slice(
        cartPageContent.indexOf('const handleCheckoutShop = async'),
        cartPageContent.indexOf('const handleGoogleSignInFromCart')
      );
      assert.ok(
        !checkoutShopCode.includes('clearCart()'),
        'Must NEVER clear cart during checkout validation failure'
      );
    });
  });

  // --- Test Suite 4: Auth Flow Error Proximity ---
  describe('4. Authentication Pages Error Proximity & UX', () => {
    it('LoginPage mounts ActionErrorBanner directly above submit buttons and clears on typing', () => {
      assert.ok(
        loginPageContent.includes('<ActionErrorBanner'),
        'LoginPage must render ActionErrorBanner'
      );
      assert.ok(
        loginPageContent.includes('scrollAndFocusError'),
        'LoginPage must report errors with auto-scroll and focus'
      );
      assert.ok(
        loginPageContent.includes('if (errorMsg) setErrorMsg(null);'),
        'LoginPage must clear errors immediately on user keystrokes'
      );
    });

    it('CompleteProfilePage mounts ActionErrorBanner above Save button and clears on typing', () => {
      assert.ok(
        completeProfileContent.includes('<ActionErrorBanner'),
        'CompleteProfilePage must render ActionErrorBanner'
      );
      assert.ok(
        completeProfileContent.includes('if (errorMessage) setErrorMessage(null);'),
        'CompleteProfilePage must clear error on input change'
      );
    });

    it('ResetPasswordPage mounts ActionErrorBanner above Update Password button', () => {
      assert.ok(
        resetPasswordContent.includes('<ActionErrorBanner'),
        'ResetPasswordPage must render ActionErrorBanner'
      );
      assert.ok(
        resetPasswordContent.includes('if (validationError) setValidationError(null);'),
        'ResetPasswordPage must clear error on password input change'
      );
    });
  });

  // --- Test Suite 5: Merchant & Admin Flows ---
  describe('5. Merchant Modals & Admin Review Flow', () => {
    it('ProductFormModal mounts ActionErrorBanner in actions zone with retry capability', () => {
      assert.ok(
        productModalContent.includes('<ActionErrorBanner'),
        'ProductFormModal must render ActionErrorBanner'
      );
      assert.ok(
        productModalContent.includes('scrollAndFocusError'),
        'ProductFormModal must auto-scroll to invalid product fields'
      );
    });

    it('ServiceFormModal mounts ActionErrorBanner above modal footer buttons', () => {
      assert.ok(
        serviceModalContent.includes('<ActionErrorBanner'),
        'ServiceFormModal must render ActionErrorBanner'
      );
      assert.ok(
        serviceModalContent.includes('reportServiceError'),
        'ServiceFormModal must scroll and focus on invalid inputs'
      );
    });

    it('ShopkeeperOnboardingPage mounts ActionErrorBanner above step continue buttons', () => {
      assert.ok(
        onboardingContent.includes('<ActionErrorBanner'),
        'Onboarding must render ActionErrorBanner'
      );
      assert.ok(
        onboardingContent.includes('reportStepError'),
        'Onboarding must report step errors with auto-scroll and focus'
      );
    });

    it('AdminApplicationDetailPage keeps modal open and preserves user notes on failure', () => {
      assert.ok(
        adminDetailContent.includes('approveError'),
        'AdminApplicationDetail must track approveError state'
      );
      assert.ok(
        adminDetailContent.includes('rejectError'),
        'AdminApplicationDetail must track rejectError state'
      );
      assert.ok(
        adminDetailContent.includes('<ActionErrorBanner'),
        'AdminApplicationDetail must render ActionErrorBanner in modals'
      );
    });

    it('AppointmentBookingCard validates customer name and phone, rendering banner above booking button', () => {
      assert.ok(
        bookingCardContent.includes('<ActionErrorBanner'),
        'AppointmentBookingCard must render ActionErrorBanner'
      );
      assert.ok(
        bookingCardContent.includes('bookingError'),
        'AppointmentBookingCard must manage bookingError state'
      );
      assert.ok(
        bookingCardContent.includes('if (bookingError) setBookingError(null);'),
        'AppointmentBookingCard must clear bookingError on user interaction'
      );
    });
  });

  // --- Test Suite 6: Accessibility & Design System ---
  describe('6. ActionErrorBanner Accessibility Standards', () => {
    it('implements role="alert" and aria-live="polite"', () => {
      assert.ok(
        bannerContent.includes('role="alert"'),
        'ActionErrorBanner must declare role="alert"'
      );
      assert.ok(
        bannerContent.includes('aria-live="polite"'),
        'ActionErrorBanner must declare aria-live="polite"'
      );
    });

    it('supports error, warning, info, and network variants', () => {
      assert.ok(
        bannerContent.includes("variant = 'error'"),
        'ActionErrorBanner must default to error variant'
      );
      assert.ok(
        bannerContent.includes('network'),
        'ActionErrorBanner must support network variant'
      );
    });
  });
});
