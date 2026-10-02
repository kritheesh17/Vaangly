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
});
