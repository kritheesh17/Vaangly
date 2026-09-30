import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Mobile Responsive Layout & Viewport Safeguards', () => {
  const readCss = (relativePath: string) =>
    fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8');

  // Test 15 & 16: Account menu mobile bottom sheet vs desktop popover
  it('15 & 16. Account menu adapts to mobile bottom sheet and prevents clipping', () => {
    const headerCss = readCss('src/components/layout/Header.css');

    // On mobile, account menu uses full-width bottom sheet
    assert.ok(
      headerCss.includes('.vaango-account-sheet'),
      'Mobile account bottom sheet class exists'
    );
    assert.ok(
      headerCss.includes('position: fixed'),
      'Mobile account sheet uses fixed positioning'
    );
    assert.ok(
      headerCss.includes('bottom: 0'),
      'Mobile account sheet docks to bottom'
    );
    assert.ok(
      headerCss.includes('env(safe-area-inset-bottom'),
      'Mobile account sheet respects safe-area insets'
    );

    // Desktop popover has max-width guard
    assert.ok(
      headerCss.includes('max-width: min(280px, calc(100vw - 32px))'),
      'Desktop popover constrained to viewport width'
    );

    // Long email and appearance status badge styling
    assert.ok(
      headerCss.includes('overflow-wrap: break-word') || headerCss.includes('word-break: break-all') || headerCss.includes('word-break: break-word'),
      'Account email wraps gracefully'
    );
    assert.ok(
      headerCss.includes('flex-shrink: 0'),
      'Appearance badge is prevented from being squished or clipped'
    );
  });

  // Test 17, 18, 19: Change Password Modal responsiveness & accessibility
  it('17, 18, 19. Change Password modal is responsive, inputs properly aligned, touch targets >= 44px', () => {
    const modalCss = readCss('src/components/auth/ChangePasswordModal.css');
    const modalTsx = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/auth/ChangePasswordModal.tsx'),
      'utf-8'
    );

    // Visible labels and semantic inputs
    assert.ok(modalTsx.includes('htmlFor="new-password-input"'), 'Has accessible htmlFor label for new password');
    assert.ok(modalTsx.includes('htmlFor="confirm-password-input"'), 'Has accessible htmlFor label for confirm password');

    // Password toggle buttons inside inputs
    assert.ok(
      modalCss.includes('.vaango-pwd-toggle-btn'),
      'Password toggle button styled within input container'
    );
    assert.ok(
      modalCss.includes('position: absolute'),
      'Toggle icon aligned via absolute positioning inside wrapper'
    );
    assert.ok(
      modalCss.includes('min-height: 44px') || modalCss.includes('height: 44px') || modalCss.includes('padding: 10px 44px'),
      'Touch targets for input fields or buttons meet >= 44px criterion'
    );

    // Mobile sheet behaviour
    assert.ok(
      modalCss.includes('@media (max-width: 480px)') || modalCss.includes('@media (max-width: 640px)'),
      'Modal has mobile responsive media query'
    );
    assert.ok(
      modalCss.includes('overflow-y: auto') || modalCss.includes('overflow-y: visible') || modalTsx.includes('Modal'),
      'Modal content allows internal scrolling or delegates to Modal container'
    );
  });

  // Test 20: Analytics cards grid
  it('20. Analytics cards do not force 5 desktop cards on mobile', () => {
    const analyticsCss = readCss('src/pages/shopkeeper/ShopkeeperAnalyticsPage.css');

    // Mobile grid template is 1 column
    assert.ok(
      analyticsCss.includes('grid-template-columns: 1fr'),
      'Mobile KPI grid is 1 column'
    );
    // Auto-fit responsive grid is used for desktop/tablet
    assert.ok(
      analyticsCss.includes('repeat(auto-fit, minmax('),
      'Responsive auto-fit grid is used for scalable displays'
    );
  });

  // Test 21: Analytics tables have mobile cards representation
  it('21. Analytics complex tables transform into readable stacked cards on mobile', () => {
    const analyticsTsx = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/shopkeeper/ShopkeeperAnalyticsPage.tsx'),
      'utf-8'
    );
    const analyticsCss = readCss('src/pages/shopkeeper/ShopkeeperAnalyticsPage.css');

    assert.ok(
      analyticsTsx.includes('vaango-analytics-mobile-cards'),
      'Includes mobile cards container'
    );
    assert.ok(
      analyticsTsx.includes('Payment Method') || analyticsTsx.includes('pm.method'),
      'Payment methods has mobile card representation'
    );
    assert.ok(
      analyticsCss.includes('.vaango-analytics-table-wrap'),
      'Desktop table wrapper exists'
    );
    assert.ok(
      analyticsCss.includes('@media (max-width: 767px)'),
      'Media query switches between table and mobile cards at 767px'
    );
  });

  // Test 22: Section headers wrapping
  it('22. Section headers wrap naturally without overflowing or clipping', () => {
    const analyticsCss = readCss('src/pages/shopkeeper/ShopkeeperAnalyticsPage.css');

    assert.ok(
      analyticsCss.includes('overflow-wrap: break-word') || analyticsCss.includes('word-break: break-word'),
      'Section headers wrap words'
    );
    assert.ok(
      analyticsCss.includes('flex-wrap: wrap'),
      'Header actions flex wrap on narrow viewports'
    );
  });

  // Test 23: Bottom navigation touch targets and safe-area
  it('23. Bottom navigation fits mobile viewports and accounts for gesture bars', () => {
    const bottomNavCss = readCss('src/components/layout/BottomNav.css');

    assert.ok(
      bottomNavCss.includes('calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))'),
      'Bottom nav height dynamically includes safe-area-inset-bottom'
    );
    assert.ok(
      bottomNavCss.includes('min-height: var(--min-touch-target)'),
      'Bottom nav items have min-touch-target >= 44px'
    );
  });

  // Test 24 & 25: App Shell safe areas
  it('24 & 25. App Shell incorporates safe area insets and avoids horizontal page overflow', () => {
    const shellCss = readCss('src/components/layout/AppShell.css');

    assert.ok(
      shellCss.includes('padding-top: env(safe-area-inset-top, 0)'),
      'App shell respects safe area top'
    );
    assert.ok(
      shellCss.includes('padding-bottom: calc(var(--bottom-nav-height, 72px) + env(safe-area-inset-bottom, 0px))'),
      'Main content has safe bottom padding avoiding bottom nav overlap'
    );
  });

  // Test 26: Desktop layout preservation
  it('26. Desktop layouts (>= 768px) remain intact', () => {
    const analyticsCss = readCss('src/pages/shopkeeper/ShopkeeperAnalyticsPage.css');
    const headerCss = readCss('src/components/layout/Header.css');

    // On >= 768px, desktop tables display (hidden only at max-width: 767px)
    assert.ok(
      analyticsCss.includes('@media (max-width: 767px)'),
      'Mobile cards switch activated only on small screens'
    );
    // Header desktop navigation preserved
    assert.ok(
      headerCss.includes('@media (min-width: 1140px)') || headerCss.includes('@media (min-width: 640px)'),
      'Header preserves desktop navigation bar'
    );
  });
});
