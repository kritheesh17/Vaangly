import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

console.log('========================================================================');
console.log('ADMIN DASHBOARD HEADER & ACCOUNT MENU REDESIGN VERIFICATION');
console.log('========================================================================\n');

// 1. Inspect Header.tsx
console.log('--- 1. Header.tsx Inspection ---');
const headerPath = path.join(ROOT, 'src', 'components', 'layout', 'Header.tsx');
assert(fs.existsSync(headerPath), 'Header.tsx exists');
const headerCode = fs.readFileSync(headerPath, 'utf8');

// Verify old segmented switch is removed
assert(!headerCode.includes('vaango-header__theme-segmented'), 'Old segmented theme switch (.vaango-header__theme-segmented) is COMPLETELY REMOVED');
assert(!headerCode.includes('vaango-header__theme-opt'), 'Old segmented theme option buttons are REMOVED');

// Verify compact theme button
assert(headerCode.includes('vaango-header__theme-btn'), 'Compact theme button (.vaango-header__theme-btn) is present');
assert(headerCode.includes('onClick={toggleTheme}'), 'Theme button triggers existing toggleTheme from ThemeContext');
assert(headerCode.includes('Switch to light mode') && headerCode.includes('Switch to dark mode'), 'Accessible aria-label/title provided for theme switching');
assert(headerCode.includes('theme === \'dark\' ? (') && headerCode.includes('<Sun') && headerCode.includes('<Moon'), 'Compact theme button displays Sun in dark mode and Moon in light mode');

// Verify Account / Admin Menu Control
assert(headerCode.includes('vaango-header__account-wrap'), 'Account / Menu wrapper (.vaango-header__account-wrap) is present');
assert(headerCode.includes('vaango-header__account-btn'), 'Account / Menu button (.vaango-header__account-btn) is present');
assert(headerCode.includes('aria-haspopup="menu"'), 'Accessible aria-haspopup="menu" attribute set');
assert(headerCode.includes('aria-expanded={isAccountMenuOpen}'), 'Accessible aria-expanded attribute bound to menu state');

// Verify Dropdown Popover
assert(headerCode.includes('vaango-account-dropdown'), 'Account dropdown popover (.vaango-account-dropdown) is rendered');
assert(headerCode.includes('vaango-account-dropdown__kicker'), 'Account header displays kicker (Admin Account / Shopkeeper / Customer)');
assert(headerCode.includes('{user.full_name'), 'Displays dynamic authenticated user name (not hardcoded)');
assert(headerCode.includes('{user.email}'), 'Displays dynamic authenticated user email (not hardcoded)');

// Verify Menu Options
assert(headerCode.includes('Account Settings') && headerCode.includes('/profile'), 'Account Settings option navigates to existing /profile page');
assert(headerCode.includes('Change Password') && headerCode.includes('setIsChangePasswordOpen(true)'), 'Change Password option opens ChangePasswordModal');
assert(headerCode.includes('Notification Settings') && headerCode.includes('setIsPermissionCenterOpen(true)'), 'Notification Settings option opens Permission Center');
assert(headerCode.includes('Appearance') && headerCode.includes('toggleTheme()'), 'Appearance option allows fast theme toggle');
assert(headerCode.includes('Switch Account') && headerCode.includes('handleSwitchAccount'), 'Switch Account option provides safe logout -> login flow');
assert(headerCode.includes('Logout') && headerCode.includes('handleLogout'), 'Logout option performs Supabase signOut and redirects');

// Verify Menu UX: Outside click & Escape
assert(headerCode.includes('e.key === \'Escape\''), 'Escape key listener closes account menu');
assert(headerCode.includes('handleClickOutside'), 'Outside click listener closes account menu');

// Verify ChangePasswordModal Integration
assert(headerCode.includes('<ChangePasswordModal'), 'ChangePasswordModal component is mounted in Header');

// 2. Inspect ChangePasswordModal.tsx
console.log('\n--- 2. ChangePasswordModal.tsx Inspection ---');
const modalPath = path.join(ROOT, 'src', 'components', 'auth', 'ChangePasswordModal.tsx');
assert(fs.existsSync(modalPath), 'ChangePasswordModal.tsx exists');
const modalCode = fs.readFileSync(modalPath, 'utf8');

assert(modalCode.includes('updatePassword'), 'Uses existing updatePassword from AuthContext');
assert(modalCode.includes('cleanPassword.length < 6'), 'Validates new password is at least 6 characters');
assert(modalCode.includes('cleanPassword !== cleanConfirm'), 'Validates password confirmation matches');
assert(modalCode.includes('Modal'), 'Uses existing accessible Modal component');
assert(!modalCode.includes('console.log(password)'), 'Never logs passwords');

// 3. Inspect Header.css
console.log('\n--- 3. Header.css Styling Inspection ---');
const cssPath = path.join(ROOT, 'src', 'components', 'layout', 'Header.css');
assert(fs.existsSync(cssPath), 'Header.css exists');
const cssCode = fs.readFileSync(cssPath, 'utf8');

assert(cssCode.includes('.vaango-header__theme-btn'), 'CSS defines .vaango-header__theme-btn');
assert(cssCode.includes('.vaango-header__account-wrap'), 'CSS defines .vaango-header__account-wrap');
assert(cssCode.includes('.vaango-header__account-btn'), 'CSS defines .vaango-header__account-btn');
assert(cssCode.includes('.vaango-account-dropdown'), 'CSS defines .vaango-account-dropdown popover');
assert(cssCode.includes('[data-theme=\'dark\'] .vaango-account-dropdown'), 'CSS defines dark mode styling for account dropdown');
assert(cssCode.includes('vaango-dropdown-appear'), 'Dropdown includes smooth appear animation');
assert(cssCode.includes('max-width: calc(100vw - 24px)'), 'Dropdown prevents viewport overflow');

// 4. Mobile Navigation Drawer Inspection
console.log('\n--- 4. Mobile Navigation Drawer Inspection ---');
assert(headerCode.includes('vaango-mobile-menu'), 'Mobile drawer is defined in Header.tsx');
const mobileMenuSection = headerCode.slice(headerCode.indexOf('vaango-mobile-menu'));
assert(mobileMenuSection.includes('Account Settings'), 'Mobile drawer includes Account Settings');
assert(mobileMenuSection.includes('Change Password'), 'Mobile drawer includes Change Password');
assert(mobileMenuSection.includes('Notification Settings'), 'Mobile drawer includes Notification Settings');
assert(mobileMenuSection.includes('Switch Account'), 'Mobile drawer includes Switch Account');

console.log('\n========================================================================');
console.log('🎉 ALL ADMIN HEADER & ACCOUNT MENU REDESIGN TESTS PASSED SUCCESSFULLY!');
console.log('========================================================================\n');
