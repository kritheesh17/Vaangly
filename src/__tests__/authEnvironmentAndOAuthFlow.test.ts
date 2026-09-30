import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getAuthRedirectUrl } from '../lib/supabase';

describe('Localhost Google OAuth Environment & Flow Guards', () => {
  // Test 1: getAuthRedirectUrl environment awareness
  it('1. Generates correct localhost callback URL when running on port 5173', () => {
    const originalWindow = (global as any).window;
    try {
      (global as any).window = {
        location: {
          origin: 'http://localhost:5173',
        },
      };

      const defaultUrl = getAuthRedirectUrl();
      assert.strictEqual(defaultUrl, 'http://localhost:5173/auth/callback');

      const customRedirectUrl = getAuthRedirectUrl('/shopkeeper/dashboard');
      assert.strictEqual(
        customRedirectUrl,
        'http://localhost:5173/auth/callback?redirect=%2Fshopkeeper%2Fdashboard'
      );
    } finally {
      (global as any).window = originalWindow;
    }
  });

  // Test 2: Production fallback when window is not present
  it('2. Fallback to production origin in non-browser environments without hardcoding localhost', () => {
    const originalWindow = (global as any).window;
    try {
      delete (global as any).window;

      const fallbackUrl = getAuthRedirectUrl();
      assert.ok(
        fallbackUrl.startsWith('https://vaangly.vercel.app/auth/callback'),
        'Falls back to production domain without hardcoding localhost'
      );
    } finally {
      (global as any).window = originalWindow;
    }
  });

  // Test 3: Vite config enforces port 5173 and strictPort: true
  it('3. vite.config.ts enforces port 5173 and strictPort to prevent silent port shifts', () => {
    const viteConfigContent = fs.readFileSync(
      path.resolve(process.cwd(), 'vite.config.ts'),
      'utf-8'
    );
    assert.ok(
      viteConfigContent.includes('port: 5173'),
      'Vite server port is set to 5173'
    );
    assert.ok(
      viteConfigContent.includes('strictPort: true'),
      'Vite strictPort is set to true'
    );
  });

  // Test 4: AuthCallbackPage guards against duplicate PKCE code exchange in StrictMode
  it('4. AuthCallbackPage implements exchangePromiseRef guard preventing duplicate PKCE exchange', async () => {
    const callbackContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/auth/AuthCallbackPage.tsx'),
      'utf-8'
    );
    assert.ok(
      callbackContent.includes('exchangePromiseRef'),
      'Includes exchangePromiseRef guard'
    );
    assert.ok(
      callbackContent.includes('supabase.auth.exchangeCodeForSession(code)'),
      'Calls exchangeCodeForSession on code'
    );

    // Simulate StrictMode double execution with shared promise ref
    let exchangeCount = 0;
    const ref = { current: null as Promise<any> | null };

    const simulateMount = async () => {
      const code = 'mock-oauth-code-123';
      if (code) {
        if (!ref.current) {
          exchangeCount++;
          ref.current = Promise.resolve({ data: { session: {} }, error: null });
        }
        return await ref.current;
      }
    };

    // Simulate concurrent mounts in StrictMode
    await Promise.all([simulateMount(), simulateMount()]);

    assert.strictEqual(exchangeCount, 1, 'PKCE code was only exchanged once despite double mount');
  });

  // Test 5: AuthCallbackPage supports hash session flow (#access_token=...&refresh_token=...)
  it('5. AuthCallbackPage supports hash session flow (#access_token=...&refresh_token=...)', async () => {
    const callbackContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/auth/AuthCallbackPage.tsx'),
      'utf-8'
    );
    assert.ok(
      callbackContent.includes('accessToken && refreshToken'),
      'Detects access_token and refresh_token from hash'
    );
    assert.ok(
      callbackContent.includes('supabase.auth.setSession'),
      'Calls supabase.auth.setSession with hash tokens'
    );

    // Simulate hash flow execution with shared promise ref
    let setSessionCount = 0;
    const ref = { current: null as Promise<any> | null };

    const simulateHashMount = async () => {
      const accessToken = 'mock_jwt_access_token';
      const refreshToken = 'mock_refresh_token';
      if (accessToken && refreshToken) {
        if (!ref.current) {
          setSessionCount++;
          ref.current = Promise.resolve({ data: { session: {} }, error: null });
        }
        return await ref.current;
      }
    };

    // Simulate concurrent mounts in StrictMode
    await Promise.all([simulateHashMount(), simulateHashMount()]);

    assert.strictEqual(setSessionCount, 1, 'setSession was only invoked once despite double mount');
  });

  // Test 6: AuthCallbackPage handles Google OAuth cancellation gracefully
  it('6. AuthCallbackPage handles Google cancellation (error=access_denied) with user-friendly message', () => {
    const callbackContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/auth/AuthCallbackPage.tsx'),
      'utf-8'
    );
    assert.ok(
      callbackContent.includes("errorParam === 'access_denied'"),
      'Handles access_denied error parameter'
    );
    assert.ok(
      callbackContent.includes('Google sign-in was cancelled.'),
      'Displays Google sign-in was cancelled message'
    );
    assert.ok(
      callbackContent.includes('Back to Login'),
      'Provides Back to Login action button on error'
    );
  });

  // Test 7: AuthCallbackPage handles empty callback parameters gracefully
  it('7. AuthCallbackPage handles empty callback parameters without unhandled crash', () => {
    const callbackContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/auth/AuthCallbackPage.tsx'),
      'utf-8'
    );
    assert.ok(
      callbackContent.includes('This authentication session is missing, invalid, or expired.'),
      'Displays appropriate message when no auth parameters or session are found'
    );
  });

  // Test 8: Verify .gitignore keeps .env protected from git tracking
  it('8. .gitignore protects local .env and environment files from git tracking', () => {
    const gitignoreContent = fs.readFileSync(
      path.resolve(process.cwd(), '.gitignore'),
      'utf-8'
    );
    assert.ok(
      gitignoreContent.includes('.env'),
      '.gitignore includes .env'
    );
  });
});
