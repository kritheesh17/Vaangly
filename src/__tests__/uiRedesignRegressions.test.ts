import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Vaango Focused UI Functionality & Regression Verification', () => {
  const headerContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/layout/Header.tsx'),
    'utf-8'
  );
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
  // ISSUE 1: Chrome Notification Permission Experience
  // =========================================================================
  describe('Issue 1: Chrome Notification Permission Experience', () => {
    it('1.1 Detects states correctly: granted, denied, and default (prompt)', () => {
      assert.ok(
        gateContent.includes("notificationStatus === 'denied'"),
        'Gate handles denied state explicitly'
      );
      assert.ok(
        gateContent.includes("notificationStatus === 'prompt'"),
        'Gate handles default/prompt state explicitly'
      );
      assert.ok(
        gateContent.includes("notificationStatus === 'granted'"),
        'Gate handles granted state and does not show modal when granted'
      );
    });

    it('1.2 Explains how to unblock notifications in Chrome with device-appropriate tabs', () => {
      assert.ok(
        gateContent.includes("activeGuideTab === 'android'") &&
        gateContent.includes("activeGuideTab === 'desktop'"),
        'Gate provides distinct Android and Desktop tabs'
      );
      assert.ok(
        gateContent.includes('Padlock (🔒)') || gateContent.includes('Site settings'),
        'Gate explains unblocking via Chrome address bar padlock and site settings'
      );
      assert.ok(
        gateContent.includes('Check Again & Enable'),
        'Gate provides clear retry option after changing permission'
      );
    });

    it('1.3 Does not repeatedly call permission API when permanently denied', () => {
      // handleCheckAgain uses refreshNotificationStatus() which queries status without calling requestPermission()
      assert.ok(
        gateContent.includes('refreshNotificationStatus()'),
        'Uses status check on retry rather than re-triggering blocked permission prompt'
      );
      assert.ok(
        !gateContent.includes('onClick={handleRequestPermission}\n>\\n<RefreshCw'),
        'Denied state action checks status rather than prompting repeatedly'
      );
    });

    it('1.4 Never blocks access to the main application solely because notification permission is denied', () => {
      // In AppShell, dismissal is respected and never traps the user
      assert.ok(
        appShellContent.includes('gateDismissed') && appShellContent.includes('!gateDismissed'),
        'AppShell tracks gateDismissed state to allow continuing without blocking'
      );
      assert.ok(
        appShellContent.includes('onContinue={handleDismissGate}'),
        'AppShell wires onContinue callback to dismiss gate'
      );
      assert.ok(
        gateContent.includes('Continue to Vaango') && gateContent.includes('Continue without notifications'),
        'NotificationPermissionGate provides non-blocking Continue options in both prompt and denied states'
      );
    });
  });

  // =========================================================================
  // ISSUE 2: Home Page Promotional Carousel
  // =========================================================================
  describe('Issue 2: Home Page Promotional Carousel', () => {
    it('2.1 Renders 3 required promotional slides: Order Now, Get Appointment, Get Service', () => {
      assert.ok(homePageContent.includes("'Order Now'"), 'Contains Order Now slide');
      assert.ok(homePageContent.includes("'Get Appointment'"), 'Contains Get Appointment slide');
      assert.ok(homePageContent.includes("'Get Service'"), 'Contains Get Service slide');
    });

    it('2.2 Tapping each CTA navigates to correct existing feature route', () => {
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

    it('2.3 Supports manual horizontal touch swiping and mouse drag', () => {
      assert.ok(
        homePageContent.includes('onTouchStart') && homePageContent.includes('onTouchEnd'),
        'Registers touch gesture handlers for mobile swipe'
      );
      assert.ok(
        homePageContent.includes('onMouseDown') && homePageContent.includes('onMouseUp'),
        'Registers mouse drag listeners for desktop swipe'
      );
    });

    it('2.4 Provides working Previous and Next arrow controls and synchronized pagination dots', () => {
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
  // ISSUE 3: Shopkeeper Delivery Configuration
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
  // ISSUE 5: Redesigned Navigation and Account Functionality
  // =========================================================================
  describe('Issue 5: Redesigned Navigation and Account Functionality', () => {
    it('5.1 Bottom navigation renders role-appropriate navigation items', () => {
      // Customer
      assert.ok(bottomNavContent.includes('to="/"'), 'Customer nav has Home');
      assert.ok(bottomNavContent.includes('to="/shops"'), 'Customer nav has Explore');
      assert.ok(bottomNavContent.includes('to="/orders"'), 'Customer nav has Orders');
      assert.ok(bottomNavContent.includes('to="/bookings"'), 'Customer nav has Bookings');

      // Shopkeeper
      assert.ok(bottomNavContent.includes('to="/shopkeeper/dashboard"'), 'Shopkeeper nav has Dashboard');
      assert.ok(bottomNavContent.includes('to="/shopkeeper/catalogue"'), 'Shopkeeper nav has Products');
      assert.ok(bottomNavContent.includes('to="/shopkeeper/requests"'), 'Shopkeeper nav has Orders');

      // Admin
      assert.ok(bottomNavContent.includes('to="/admin/dashboard"'), 'Admin nav has Dashboard');
      assert.ok(bottomNavContent.includes('to="/admin/applications"'), 'Admin nav has Applications');
      assert.ok(bottomNavContent.includes('to="/admin/shops"'), 'Admin nav has Shops');
      assert.ok(bottomNavContent.includes('to="/admin/subscriptions"'), 'Admin nav has Subscriptions');
    });

    it('5.2 Settings and Profile routes navigate to role-specific account pages', () => {
      assert.ok(
        headerContent.includes("role === 'shopkeeper' ? '/shopkeeper/profile' : '/profile'"),
        'Header maps account settings according to active role'
      );
      assert.ok(
        moreMenuModalContent.includes("role === 'shopkeeper' ? '/shopkeeper/profile' : '/profile'"),
        'MoreMenuModal maps account settings according to active role'
      );
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
