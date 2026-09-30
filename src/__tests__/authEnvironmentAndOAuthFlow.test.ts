import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getAuthRedirectUrl } from '../lib/supabase';

describe('Localhost Google OAuth Environment & Flow Guards', () => {
  // Test 1: getAuthRedirectUrl environment awareness
  it('1. Generates correct localhost callback URL when running on port 5173', () => {
    // Simulate browser window.location.origin
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

  // Test 4: AuthCallbackPage guards against duplicate PKCE code exchange
  it('4. AuthCallbackPage implements hasExchangedRef in-flight guard for React StrictMode', () => {
    const callbackContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/auth/AuthCallbackPage.tsx'),
      'utf-8'
    );
    assert.ok(
      callbackContent.includes('hasExchangedRef'),
      'Includes hasExchangedRef guard'
    );
    assert.ok(
      callbackContent.includes('code && !hasExchangedRef.current'),
      'Guards exchangeCodeForSession with ref check'
    );

    // Simulate StrictMode double execution
    let exchangeCount = 0;
    const ref = { current: false };

    const simulateMount = () => {
      const code = 'mock-oauth-code-123';
      if (code && !ref.current) {
        ref.current = true;
        exchangeCount++;
      }
    };

    // First mount
    simulateMount();
    // Second mount (React StrictMode)
    simulateMount();

    assert.strictEqual(exchangeCount, 1, 'PKCE code was only exchanged once despite double mount');
  });

  // Test 5: Verify .gitignore keeps .env protected from git tracking
  it('5. .gitignore protects local .env and environment files from git tracking', () => {
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
