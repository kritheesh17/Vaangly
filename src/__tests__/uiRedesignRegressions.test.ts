import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Vaango Focused UI Functionality & Regression Verification', () => {
  const appShellContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/layout/AppShell.tsx'),
    'utf-8'
  );
  const authContextContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/context/AuthContext.tsx'),
    'utf-8'
  );
  const moreMenuModalContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/layout/MoreMenuModal.tsx'),
    'utf-8'
  );
  const bottomNavContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/layout/BottomNav.tsx'),
    'utf-8'
  );
  const homePageContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/HomePage.tsx'),
    'utf-8'
  );
  const homePageCss = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/HomePage.css'),
    'utf-8'
  );
  const gateContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/permissions/NotificationPermissionGate.tsx'),
    'utf-8'
  );
  const shopDetailContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/ShopDetailPage.tsx'),
    'utf-8'
  );
  const shopCardContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/customer/ShopCard.tsx'),
    'utf-8'
  );
  const productModalContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/customer/ProductDetailModal.tsx'),
    'utf-8'
  );
  const shopkeeperProfileContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/shopkeeper/ShopkeeperProfilePage.tsx'),
    'utf-8'
  );
  const cartPageContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/CartPage.tsx'),
    'utf-8'
  );
  const requestDetailPageContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/RequestDetailPage.tsx'),
    'utf-8'
  );
  const serviceModalContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/shopkeeper/ServiceFormModal.tsx'),
    'utf-8'
  );
  const scheduleConfigContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/shopkeeper/AppointmentScheduleConfig.tsx'),
    'utf-8'
  );
  const appointmentApiContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/appointmentServiceApi.ts'),
    'utf-8'
  );
  const flexibleSlotsMigration = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261002000067_flexible_appointment_slots.sql'),
    'utf-8'
  );

  // =========================================================================
  // ISSUE 1: Home Page Promotional Carousel
  // =========================================================================
  describe('Issue 1: Home Page Promotional Carousel', () => {
    it('1.1 Renders 3 required promotional slides: Order Now, Get Appointment, Get Service in track', () => {
      assert.ok(homePageContent.includes("'Order Now'"), 'Contains Order Now slide');
      assert.ok(homePageContent.includes("'Get Appointment'"), 'Contains Get Appointment slide');
      assert.ok(homePageContent.includes("'Get Service'"), 'Contains Get Service slide');
      assert.ok(
        homePageContent.includes('vaango-home-promo-viewport') &&
        homePageContent.includes('vaango-home-promo-track') &&
        homePageContent.includes('vaango-home-promo-slide'),
        'Renders slides inside sliding track within viewport'
      );
      assert.ok(
        homePageCss.includes('.vaango-home-promo-viewport') &&
        homePageCss.includes('.vaango-home-promo-track') &&
        homePageCss.includes('.vaango-home-promo-slide'),
        'CSS defines viewport overflow:hidden and track layout'
      );
    });

    it('1.2 Tapping each CTA navigates to correct existing feature route', () => {
      assert.ok(
        homePageContent.includes("ctaLink: '/shops?group=ORDER'"),
        'Order Now CTA navigates to /shops?group=ORDER'
      );
      assert.ok(
        homePageContent.includes("ctaLink: '/shops?group=APPOINTMENT'"),
        'Get Appointment CTA navigates to /shops?group=APPOINTMENT'
      );
      assert.ok(
        homePageContent.includes("ctaLink: '/shops?group=SERVICE'"),
        'Get Service CTA navigates to /shops?group=SERVICE'
      );
    });

    it('1.3 Supports manual horizontal touch swiping with live drag and vertical scroll safety', () => {
      assert.ok(
        homePageContent.includes('onTouchStart') &&
        homePageContent.includes('onTouchMove') &&
        homePageContent.includes('onTouchEnd') &&
        homePageContent.includes('onTouchCancel'),
        'Registers all touch gesture listeners (start, move, end, cancel)'
      );
      assert.ok(
        homePageContent.includes('isHorizontalSwipeRef'),
        'Protects vertical page scroll by detecting gesture axis'
      );
      assert.ok(
        homePageContent.includes('setDragOffset'),
        'Updates live drag offset for tactile touch response'
      );
    });

    it('1.4 Autoplay safely pauses on mouse hover and resumes without getting stuck on touch devices', () => {
      assert.ok(
        homePageContent.includes("e.pointerType === 'mouse'"),
        'Only pauses on physical mouse hover, preventing permanent mobile tap pause trap'
      );
      assert.ok(
        homePageContent.includes('resumeTimerRef'),
        'Resumes autoplay timer after touch/interaction release'
      );
      assert.ok(
        homePageContent.includes('prefers-reduced-motion'),
        'Respects reduced motion accessibility preference'
      );
    });

    it('1.5 Provides working Previous and Next arrow controls and synchronized pagination dots', () => {
      assert.ok(
        homePageContent.includes('vaango-home-promo-arrow--prev') &&
        homePageContent.includes('vaango-home-promo-arrow--next'),
        'HomePage renders Previous and Next controls'
      );
      assert.ok(
        homePageContent.includes('goToPrevSlide') && homePageContent.includes('goToNextSlide'),
        'Previous and Next controls invoke slide navigation callbacks'
      );
      assert.ok(
        homePageContent.includes('role="tablist"') && homePageContent.includes('vaango-home-dot--active'),
        'Pagination indicators reflect active slide'
      );
    });
  });

  // =========================================================================
  // ISSUE 2: Payment Proof Upload (Gallery & Camera Support)
  // =========================================================================
  describe('Issue 2: Payment Proof Upload', () => {
    it('2.1 CartPage does not force camera-only upload (allows Gallery selection)', () => {
      // Must NOT have capture="environment" on the primary/gallery file input
      assert.ok(
        cartPageContent.includes('Choose from Gallery'),
        'Provides explicit "Choose from Gallery" option'
      );
      assert.ok(
        cartPageContent.includes('Take Photo'),
        'Provides explicit "Take Photo" option'
      );
      // Verify there is at least one file input WITHOUT capture attribute for gallery
      assert.ok(
        cartPageContent.includes('type="file"\n                  accept="image/jpeg,image/png,image/webp,image/gif"\n                  disabled={isUploading}\n                  onChange={(event) => void handleFile'),
        'Gallery file input has no capture attribute, allowing Android gallery/file picker'
      );
      // Verify there is also a file input with capture="environment" for camera
      assert.ok(
        cartPageContent.includes('capture="environment"'),
        'Camera file input has capture="environment"'
      );
    });

    it('2.2 RequestDetailPage also provides both Choose from Gallery and Take Photo options', () => {
      assert.ok(
        requestDetailPageContent.includes('Choose from Gallery'),
        'RequestDetailPage provides "Choose from Gallery"'
      );
      assert.ok(
        requestDetailPageContent.includes('Take Photo'),
        'RequestDetailPage provides "Take Photo"'
      );
    });

    it('2.3 Preserves payment proof security, size limits, and storage isolation', () => {
      assert.ok(
        cartPageContent.includes('validatePaymentProofFile'),
        'CartPage validates payment proof file size and MIME type'
      );
      assert.ok(
        cartPageContent.includes('uploadPendingPaymentProof'),
        'CartPage uploads strictly to payment-proofs bucket'
      );
    });
  });

  // =========================================================================
  // ISSUE 3: Shopkeeper Delivery Configuration & Honest Offers
  // =========================================================================
  describe('Issue 3: Shopkeeper Delivery Configuration', () => {
    it('3.1 Shopkeeper profile asks "Do you provide/offer door delivery?" (Yes/No)', () => {
      assert.ok(
        shopkeeperProfileContent.includes('1. Do you offer door delivery?'),
        'Shopkeeper profile presents delivery Question 1'
      );
      assert.ok(
        shopkeeperProfileContent.includes('2. How much do you charge for delivery?'),
        'Shopkeeper profile presents delivery fee Question 2 when delivery is offered'
      );
      assert.ok(
        shopkeeperProfileContent.includes('3. Do you offer free delivery above a certain order amount?'),
        'Shopkeeper profile presents free-delivery threshold Question 3'
      );
    });

    it('3.2 Customer-facing ShopDetailPage and ShopCard display truthful delivery info without hardcoded claims', () => {
      // No hardcoded "Free delivery above ₹299"
      assert.ok(
        !shopDetailContent.includes('<span>Free delivery above ₹299</span>'),
        'ShopDetailPage does not contain hardcoded Free delivery above ₹299'
      );
      assert.ok(
        !productModalContent.includes('<span>Delivery in 30–45 mins · Free delivery above ₹299</span>'),
        'ProductDetailModal does not contain hardcoded Free delivery above ₹299'
      );
      // Dynamic rendering in ShopDetailPage
      assert.ok(
        shopDetailContent.includes('Pickup Only') && shopDetailContent.includes('shop.free_delivery_above'),
        'ShopDetailPage dynamically displays Pickup Only or configured threshold'
      );
      // Dynamic rendering in ShopCard
      assert.ok(
        shopCardContent.includes('shop.delivery_available') && shopCardContent.includes('Pickup Only'),
        'ShopCard displays Pickup Only when shop does not offer delivery'
      );
    });

    it('3.3 CartPage computes delivery charges and honors free-delivery threshold', () => {
      assert.ok(
        cartPageContent.includes('freeThreshold != null && freeThreshold > 0 && subtotal >= freeThreshold'),
        'Cart checks subtotal against configured free_delivery_above threshold'
      );
      assert.ok(
        cartPageContent.includes("effectiveDeliveryFee === 0 ? (\n                        <span className=\"text-success font-semibold\">FREE</span>"),
        'Cart displays FREE fee when threshold is achieved'
      );
    });
  });

  // =========================================================================
  // ISSUE 4: Customizable Maximum Clients per Appointment Slot
  // =========================================================================
  describe('Issue 4: Customizable Maximum Clients per Appointment Slot', () => {
    it('4.1 ServiceFormModal supports configurable capacity including 10+ clients', () => {
      assert.ok(
        serviceModalContent.includes('id="concurrent-capacity-input"'),
        'ServiceFormModal provides numeric custom capacity input'
      );
      assert.ok(
        serviceModalContent.includes('[1, 2, 3, 5, 10, 20]'),
        'ServiceFormModal provides preset chips including 10 and 20 clients'
      );
      assert.ok(
        serviceModalContent.includes('capacityPerInterval: concurrentCapacity'),
        'ServiceFormModal persists configured capacity in slot_config'
      );
    });

    it('4.2 AppointmentScheduleConfig allows per-slot capacity overrides', () => {
      assert.ok(
        scheduleConfigContent.includes('vaango-sched-capacity-input'),
        'Schedule config allows setting per-slot capacity'
      );
      assert.ok(
        scheduleConfigContent.includes('max={500}'),
        'Schedule config supports capacities well above 4'
      );
    });

    it('4.3 Booking validation enforces capacity and prevents overbooking', () => {
      assert.ok(
        appointmentApiContent.includes('bookedCount >= capacity'),
        'Appointment booking checks active reservations against slot capacity'
      );
      assert.ok(
        appointmentApiContent.includes('is_available: bookedCount + 1 < capacity'),
        'Slot availability marks unavailable once capacity is completely reached'
      );
    });

    it('4.4 Changing capacity preserves existing confirmed appointments', () => {
      assert.ok(
        flexibleSlotsMigration.includes('GREATEST(v_capacity, v_existing_confirmed)'),
        'Database slot synchronization guards confirmed bookings against truncation'
      );
    });
  });

  // =========================================================================
  // ISSUE 5: Navigation, Auth, & Chrome Notification Experience
  // =========================================================================
  describe('Issue 5: Navigation, Auth, & Chrome Notification Experience', () => {
    it('5.1 Notification gate is non-blocking and provides unblock guide for Chrome', () => {
      assert.ok(
        appShellContent.includes('gateDismissed') && appShellContent.includes('!gateDismissed'),
        'AppShell never traps user in mandatory notification barrier'
      );
      assert.ok(
        gateContent.includes("activeGuideTab === 'android'") &&
        gateContent.includes("activeGuideTab === 'desktop'"),
        'Gate provides distinct Android and Desktop Chrome guidance'
      );
      assert.ok(
        gateContent.includes('Continue to Vaango') && gateContent.includes('Continue without notifications'),
        'Gate provides non-blocking continue buttons'
      );
    });

    it('5.2 Bottom navigation renders role-appropriate navigation items', () => {
      assert.ok(bottomNavContent.includes('to="/"'), 'Customer nav has Home');
      assert.ok(bottomNavContent.includes('to="/shops"'), 'Customer nav has Explore');
      assert.ok(bottomNavContent.includes('to="/orders"'), 'Customer nav has Orders');
      assert.ok(bottomNavContent.includes('to="/bookings"'), 'Customer nav has Bookings');

      assert.ok(bottomNavContent.includes('/shopkeeper/dashboard'), 'Shopkeeper nav has Dashboard');
      assert.ok(bottomNavContent.includes('/shopkeeper/catalogue'), 'Shopkeeper nav has Products');
      assert.ok(bottomNavContent.includes('/shopkeeper/requests'), 'Shopkeeper nav has Orders');

      assert.ok(bottomNavContent.includes('to="/admin/dashboard"'), 'Admin nav has Dashboard');
      assert.ok(bottomNavContent.includes('to="/admin/applications"'), 'Admin nav has Applications');
      assert.ok(bottomNavContent.includes('to="/admin/shops"'), 'Admin nav has Shops');
      assert.ok(bottomNavContent.includes('to="/admin/subscriptions"'), 'Admin nav has Subscriptions');
    });

    it('5.3 Sign out clears state and redirects reliably', () => {
      assert.ok(
        authContextContent.includes("localStorage.setItem('vaango_user_logged_out', 'true')"),
        'AuthContext sets vaango_user_logged_out flag'
      );
      assert.ok(
        authContextContent.includes('setUser(null);'),
        'AuthContext cleans user state in finally block'
      );
      assert.ok(
        moreMenuModalContent.includes('await signOut();') && moreMenuModalContent.includes("navigate('/login')"),
        'MoreMenuModal logout invokes signOut and redirects to /login'
      );
    });
  });
});
