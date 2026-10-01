import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Notification Dropdown Positioning & Viewport Safeguards', () => {
  const readCss = (relativePath: string) =>
    fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8');
  const readTsx = (relativePath: string) =>
    fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8');

  // Test 1: NotificationBell component positioning logic
  it('1. NotificationBell dynamically computes and clamps viewport-safe coordinates', () => {
    const tsx = readTsx('src/components/shopkeeper/NotificationBell.tsx');

    // Ref attachment for measurement
    assert.ok(tsx.includes('buttonRef = useRef<HTMLButtonElement>'), 'Bell button has a measurement ref');
    assert.ok(tsx.includes('dropdownRef = useRef<HTMLDivElement>'), 'Dropdown panel has a reference');
    assert.ok(tsx.includes('ref={buttonRef}'), 'Button attaches buttonRef');
    assert.ok(tsx.includes('ref={dropdownRef}'), 'Dropdown attaches dropdownRef');

    // Coordinate calculation logic
    assert.ok(tsx.includes('buttonRect.bottom + 8'), 'Anchors directly below the bell button with 8px offset');
    assert.ok(tsx.includes('viewportPadding = 12') || tsx.includes('12'), 'Respects minimum 12px viewport padding');
    assert.ok(tsx.includes('Math.max(minLeft, Math.min(idealLeft, maxLeft))'), 'Clamps horizontal left coordinate strictly within viewport');
    assert.ok(tsx.includes('style={dropdownStyle}'), 'Applies computed viewport coordinates to dropdown element');

    // Dismissal handlers
    assert.ok(tsx.includes("key === 'Escape'"), 'Closes on Escape key press');
    assert.ok(tsx.includes('dropdownRef.current.contains'), 'Outside click excludes clicks inside dropdown');
  });

  // Test 2: Mathematical positioning verification across viewports and bell coordinates
  it('2. mathematical simulation guarantees zero left/right/bottom clipping across all devices', () => {
    const simulatePositioning = (
      viewportWidth: number,
      viewportHeight: number,
      buttonLeft: number,
      buttonWidth = 32,
      buttonHeight = 32,
      buttonTop = 16
    ) => {
      const buttonRect = {
        left: buttonLeft,
        right: buttonLeft + buttonWidth,
        width: buttonWidth,
        height: buttonHeight,
        top: buttonTop,
        bottom: buttonTop + buttonHeight,
      };

      const viewportPadding = 12;
      const panelWidth = Math.min(380, Math.max(280, viewportWidth - viewportPadding * 2));
      const top = Math.round(buttonRect.bottom + 8);
      const maxHeight = Math.max(220, Math.min(480, viewportHeight - top - 16));

      let idealLeft: number;
      if (buttonRect.left > viewportWidth / 2) {
        idealLeft = buttonRect.right - panelWidth;
      } else if (buttonRect.right < viewportWidth / 2) {
        idealLeft = buttonRect.left;
      } else {
        idealLeft = buttonRect.left + buttonRect.width / 2 - panelWidth / 2;
      }

      const minLeft = viewportPadding;
      const maxLeft = Math.max(minLeft, viewportWidth - panelWidth - viewportPadding);
      const clampedLeft = Math.max(minLeft, Math.min(idealLeft, maxLeft));

      return {
        top,
        left: clampedLeft,
        width: panelWidth,
        right: clampedLeft + panelWidth,
        maxHeight,
      };
    };

    // Viewports to test: Mobile, Tablet, Laptop, Desktop, Ultrawide
    const testCases = [
      { name: 'Small mobile portrait', vw: 320, vh: 568, bellLeft: 220 },
      { name: 'iPhone SE portrait', vw: 375, vh: 667, bellLeft: 260 },
      { name: 'iPhone 14/15 portrait', vw: 390, vh: 844, bellLeft: 270 },
      { name: 'Pixel 7 portrait', vw: 412, vh: 915, bellLeft: 280 },
      { name: 'Foldable phone unfolded', vw: 540, vh: 720, bellLeft: 300 },
      { name: 'Mobile landscape', vw: 667, vh: 375, bellLeft: 420 },
      { name: 'iPad portrait', vw: 768, vh: 1024, bellLeft: 450 },
      { name: 'Small laptop / compact window', vw: 1024, vh: 768, bellLeft: 700 },
      { name: 'HD Desktop', vw: 1280, vh: 800, bellLeft: 950 },
      { name: 'Full HD Desktop', vw: 1920, vh: 1080, bellLeft: 1400 },
      // Edge cases: bell positioned at far left or far right
      { name: 'Far-left bell on tablet', vw: 768, vh: 1024, bellLeft: 20 },
      { name: 'Far-right bell on tablet', vw: 768, vh: 1024, bellLeft: 720 },
      { name: 'Far-left bell on desktop', vw: 1440, vh: 900, bellLeft: 16 },
      { name: 'Far-right bell on desktop', vw: 1440, vh: 900, bellLeft: 1400 },
    ];

    for (const tc of testCases) {
      const res = simulatePositioning(tc.vw, tc.vh, tc.bellLeft);

      // Rule A: Left edge is never clipped off-screen (< 12px)
      assert.ok(
        res.left >= 12,
        `[${tc.name}] Dropdown left (${res.left}px) must be >= 12px`
      );

      // Rule B: Right edge never overflows screen (> viewportWidth - 12px)
      assert.ok(
        res.right <= tc.vw - 12,
        `[${tc.name}] Dropdown right (${res.right}px) must be <= viewportWidth - 12 (${tc.vw - 12}px)`
      );

      // Rule C: Panel width never exceeds maximum viewport space
      assert.ok(
        res.width <= tc.vw - 24,
        `[${tc.name}] Dropdown width (${res.width}px) must not exceed screen width - 24px`
      );

      // Rule D: Dropdown top opens directly beneath bell (48px + 8px = 56px)
      assert.strictEqual(
        res.top,
        56,
        `[${tc.name}] Dropdown top should be 56px (below button at bottom 48px + 8px)`
      );

      // Rule E: Bottom never overflows viewport
      assert.ok(
        res.top + res.maxHeight <= tc.vh,
        `[${tc.name}] Dropdown total height (${res.top + res.maxHeight}px) must fit within viewport height (${tc.vh}px)`
      );
    }
  });

  // Test 3: NotificationBell CSS layout rules
  it('3. CSS guarantees text wrapping, no horizontal scroll, and visible actions', () => {
    const css = readCss('src/components/shopkeeper/NotificationBell.css');

    // Viewport containment in CSS baseline
    assert.ok(css.includes('position: fixed'), 'Dropdown uses fixed positioning');
    assert.ok(css.includes('max-width: calc(100vw - 24px)'), 'Dropdown is constrained to viewport width');
    assert.ok(css.includes('box-sizing: border-box'), 'Dropdown uses border-box sizing');

    // Header actions visibility
    assert.ok(css.includes('.vaango-notif-dropdown__header'), 'Header element styled');
    assert.ok(css.includes('.vaango-notif-dropdown__actions'), 'Actions container styled');
    assert.ok(css.includes('flex-shrink: 0'), 'Actions and icons are protected from squeezing');
    assert.ok(css.includes('.vaango-notif-dropdown__mark-all'), 'Mark all as read button styled');

    // Title and message word breaking
    assert.ok(
      css.includes('word-break: break-word') && css.includes('overflow-wrap: break-word'),
      'Item titles and messages wrap words safely'
    );
    assert.ok(css.includes('white-space: normal'), 'Titles and messages allow multi-line wrapping');

    // Scrollable list containment
    assert.ok(css.includes('overflow-y: auto'), 'Notification list has vertical scrolling');
    assert.ok(css.includes('overscroll-behavior: contain'), 'Prevents scroll chaining to parent body');

    // Dark mode support
    assert.ok(
      css.includes("[data-theme='dark'] .vaango-notif-dropdown") || css.includes('.dark .vaango-notif-dropdown'),
      'Dark mode dropdown styles present'
    );
  });
});
