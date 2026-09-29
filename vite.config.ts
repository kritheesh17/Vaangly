import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Custom Vite plugin to stamp the unique build version into dist/sw.js
function pwaVersionPlugin(buildVersion: string) {
  return {
    name: 'pwa-version-stamper',
    closeBundle() {
      const swPath = path.resolve(__dirname, 'dist', 'sw.js');
      if (fs.existsSync(swPath)) {
        let swContent = fs.readFileSync(swPath, 'utf8');
        swContent = swContent.replace(
          /const VAANGLY_CACHE_VERSION = ['"][^'"]+['"];/,
          `const VAANGLY_CACHE_VERSION = 'vaangly-cache-${buildVersion}';`
        );
        fs.writeFileSync(swPath, swContent, 'utf8');
        console.log(`[PWA Plugin] Injected ${buildVersion} into dist/sw.js`);
      }
    },
  };
}

const buildTime = new Date().toISOString();
const buildId = Date.now().toString(36).toUpperCase();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), pwaVersionPlugin(buildId)],
  define: {
    __APP_VERSION__: JSON.stringify('1.0.0'),
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-icons': ['lucide-react'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
