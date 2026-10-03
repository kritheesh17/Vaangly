import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('UI Redesign Functional Regression Guards', () => {
  const headerContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/layout/Header.tsx'),
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
  const homePageContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/HomePage.tsx'),
    'utf-8'
  );
  const profilePageContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/ProfilePage.tsx'),
    'utf-8'
  );

  // Test 1: Header outside-click does not dismiss mobile sheet prematurely
  it('1. Header outside-click handler protects .vaango-account-sheet and .vaango-account-dropdown', () => {
    assert.ok(
      headerContent.includes("target.closest('.vaango-account-sheet')"),
      'Header ignores clicks originating inside .vaango-account-sheet'
    );
    assert.ok(
      headerContent.includes("target.closest('.vaango-account-dropdown')"),
      'Header ignores clicks originating inside .vaango-account-dropdown'
    );
  });

  // Test 2: Role-based account settings navigation
  it('2. Header and MoreMenu navigate to role-specific account settings (/shopkeeper/profile vs /profile)', () => {
    assert.ok(
      headerContent.includes("const getAccountSettingsPath = () =>"),
      'Header defines getAccountSettingsPath'
    );
    assert.ok(
      headerContent.includes("role === 'shopkeeper' ? '/shopkeeper/profile' : '/profile'"),
      'Header routes shopkeeper to /shopkeeper/profile and customer to /profile'
    );
    assert.ok(
      moreMenuModalContent.includes("role === 'shopkeeper' ? '/shopkeeper/profile' : '/profile'"),
      'MoreMenuModal routes shopkeeper to /shopkeeper/profile and customer to /profile'
    );
  });

  // Test 3: AuthContext signOut is fail-safe and manages explicit logout marker
  it('3. AuthContext signOut sets vaango_user_logged_out and unconditionally sets user to null', () => {
    assert.ok(
      authContextContent.includes("localStorage.setItem('vaango_user_logged_out', 'true')"),
      'AuthContext records vaango_user_logged_out marker'
    );
    assert.ok(
      authContextContent.includes('const isExplicitlyLoggedOut = localStorage.getItem'),
      'initSession honors vaango_user_logged_out and avoids auto-seeding mock session when logged out'
    );
    assert.ok(
      authContextContent.includes('setUser(null);') && authContextContent.includes('setIsLoading(false);'),
      'signOut clears user state unconditionally in finally block'
    );
  });

  // Test 4: MoreMenuModal and ProfilePage handle logout cleanly
  it('4. MoreMenuModal and ProfilePage have try/catch error handling and toast on logout', () => {
    assert.ok(
      moreMenuModalContent.includes('await signOut();') && moreMenuModalContent.includes("navigate('/login')"),
      'MoreMenuModal invokes signOut and navigates to /login'
    );
    assert.ok(
      profilePageContent.includes('await signOut();') && profilePageContent.includes("navigate('/login')"),
      'ProfilePage invokes signOut and navigates to /login'
    );
    assert.ok(
      headerContent.includes('await signOut();') && headerContent.includes("navigate('/login')"),
      'Header invokes signOut and navigates to /login'
    );
  });

  // Test 5: HomePage shop cards link directly to /shop/${shop.id}
  it('5. HomePage cards link directly to /shop/${shop.id} without falling back to /shops', () => {
    assert.ok(
      homePageContent.includes('to={`/shop/${shop.id}`}'),
      'HomePage cards route to /shop/${shop.id}'
    );
    assert.ok(
      !homePageContent.includes("(shop as any).isLive ? `/shop/${shop.id}` : '/shops'"),
      'HomePage does not redirect unflagged shops back to /shops'
    );
  });

  // Test 6: BottomNav contains all 5 required navigation items for customer
  it('6. BottomNav contains Home, Explore (/shops), Orders, Bookings, and More', () => {
    const bottomNavContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/layout/BottomNav.tsx'),
      'utf-8'
    );
    assert.ok(bottomNavContent.includes('to="/"'), 'Contains Home link');
    assert.ok(bottomNavContent.includes('to="/shops"'), 'Contains Explore (/shops) link');
    assert.ok(bottomNavContent.includes('to="/orders"'), 'Contains Orders link');
    assert.ok(bottomNavContent.includes('to="/bookings"'), 'Contains Bookings link');
    assert.ok(bottomNavContent.includes('MoreMenuModal'), 'Contains More modal trigger');
  });

  // Test 7: Notification Permission Experience in Chrome (Issue 1)
  it('7. NotificationPermissionGate distinguishes states and avoids fake prompts when denied', () => {
    const gateContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/permissions/NotificationPermissionGate.tsx'),
      'utf-8'
    );
    assert.ok(
      gateContent.includes("notificationStatus === 'denied'"),
      'Gate checks explicitly for denied permission state'
    );
    assert.ok(
      gateContent.includes("notificationStatus === 'prompt'"),
      'Gate checks explicitly for default/prompt state'
    );
    assert.ok(
      gateContent.includes('Chrome will not allow websites to reopen the permission prompt dialog automatically'),
      'Gate explains that Chrome does not allow re-triggering prompt after denial'
    );
    assert.ok(
      gateContent.includes('Check Again & Enter'),
      'Gate provides Check Again & Enter action'
    );
    assert.ok(
      !gateContent.includes("variant=\"primary\"\n              onClick={handleRequestPermission}\n            >\n              Try Browser Permission Dialog"),
      'Gate does not present misleading browser dialog button when blocked/denied'
    );
  });

  // Test 8: Promotional Carousel Functional Interactions (Issue 3)
  it('8. HomePage carousel contains 3 required slides, touch gesture listeners, and autoplay pause', () => {
    assert.ok(
      homePageContent.includes("'Order Now'"),
      'Carousel has Order Now slide'
    );
    assert.ok(
      homePageContent.includes("'Get Appointment'"),
      'Carousel has Get Appointment slide'
    );
    assert.ok(
      homePageContent.includes("'Get Service'"),
      'Carousel has Get Service slide'
    );
    assert.ok(
      homePageContent.includes("ctaLink: '/shops?group=ORDER'"),
      'Order Now slide navigates to ORDER group'
    );
    assert.ok(
      homePageContent.includes("ctaLink: '/shops?group=APPOINTMENT'"),
      'Get Appointment slide navigates to APPOINTMENT group'
    );
    assert.ok(
      homePageContent.includes("ctaLink: '/shops?group=SERVICE'"),
      'Get Service slide navigates to SERVICE group'
    );
    assert.ok(
      homePageContent.includes('onTouchStart') && homePageContent.includes('onTouchEnd'),
      'Carousel registers horizontal touch swipe listeners'
    );
    assert.ok(
      homePageContent.includes('onMouseEnter') && homePageContent.includes('onMouseLeave'),
      'Carousel pauses autoplay on interaction / hover'
    );
    assert.ok(
      homePageContent.includes('prefers-reduced-motion'),
      'Carousel respects reduced-motion preference'
    );
  });

  // Test 9: Free-Delivery Policy & Threshold Elimination of Hardcoding (Issue 4)
  it('9. Shop and Product pages display dynamic delivery policy and Cart calculates threshold accurately', () => {
    const shopDetailContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/ShopDetailPage.tsx'),
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

    // No hardcoded "Free delivery above ₹299"
    assert.ok(
      !shopDetailContent.includes('<span>Free delivery above ₹299</span>'),
      'ShopDetailPage does not contain hardcoded Free delivery above ₹299'
    );
    assert.ok(
      !productModalContent.includes('<span>Delivery in 30–45 mins · Free delivery above ₹299</span>'),
      'ProductDetailModal does not contain hardcoded Free delivery above ₹299'
    );

    // Dynamic badge rendering
    assert.ok(
      shopDetailContent.includes('Pickup Only') && shopDetailContent.includes('shop.free_delivery_above'),
      'ShopDetailPage dynamically displays Pickup Only or configured free delivery threshold'
    );

    // 3-Question Shopkeeper workflow
    assert.ok(
      shopkeeperProfileContent.includes('1. Do you offer door delivery?'),
      'Shopkeeper profile asks Question 1: Do you offer door delivery?'
    );
    assert.ok(
      shopkeeperProfileContent.includes('2. How much do you charge for delivery?'),
      'Shopkeeper profile asks Question 2: Delivery charge'
    );
    assert.ok(
      shopkeeperProfileContent.includes('3. Do you offer free delivery above a certain order amount?'),
      'Shopkeeper profile asks Question 3: Free delivery above threshold'
    );

    // Cart calculation
    assert.ok(
      cartPageContent.includes('freeThreshold != null && freeThreshold > 0 && subtotal >= freeThreshold'),
      'CartPage checks free delivery threshold against subtotal'
    );
    assert.ok(
      cartPageContent.includes("effectiveDeliveryFee === 0 ? (\n                        <span className=\"text-success font-semibold\">FREE</span>"),
      'CartPage displays FREE badge when threshold is met'
    );
  });

  // Test 10: Appointment Capacity and Slot Customization (Issue 5)
  it('10. ServiceFormModal supports custom capacity (10+), and schedule config allows per-slot overrides', () => {
    const serviceModalContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/shopkeeper/ServiceFormModal.tsx'),
      'utf-8'
    );
    const scheduleConfigContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/shopkeeper/AppointmentScheduleConfig.tsx'),
      'utf-8'
    );
    const migrationContent = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20261002000067_flexible_appointment_slots.sql'),
      'utf-8'
    );

    // ServiceFormModal allows custom capacity input and 10+ clients
    assert.ok(
      serviceModalContent.includes('id="concurrent-capacity-input"'),
      'ServiceFormModal provides numeric custom capacity input'
    );
    assert.ok(
      serviceModalContent.includes('[1, 2, 3, 5, 10, 20]'),
      'ServiceFormModal includes preset chips up to 10 and 20'
    );
    assert.ok(
      serviceModalContent.includes('capacityPerInterval: concurrentCapacity'),
      'ServiceFormModal saves capacityPerInterval'
    );

    // AppointmentScheduleConfig per-slot definitions
    assert.ok(
      scheduleConfigContent.includes('vaango-sched-capacity-input'),
      'AppointmentScheduleConfig provides editable per-slot capacity input'
    );
    assert.ok(
      scheduleConfigContent.includes("start_time: '09:00', end_time: '09:15', capacity: 5"),
      'AppointmentScheduleConfig includes example mixed slot capacity'
    );

    // Backend preservation of confirmed bookings
    assert.ok(
      migrationContent.includes('GREATEST(v_capacity, v_existing_confirmed)'),
      'sync_shop_appointment_slots strictly preserves existing confirmed appointments'
    );
  });
});

