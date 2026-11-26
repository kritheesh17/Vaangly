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
    port: 5173,
    strictPort: true,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('leaflet')) {
              return 'vendor-leaflet';
            }
          }
          if (id.includes('/lib/uuid') || id.includes('\\lib\\uuid') || id.includes('/lib/shopTypes') || id.includes('\\lib\\shopTypes')) {
            return 'app-types';
          }
          if (id.includes('/data/mockData') || id.includes('\\data\\mockData')) {
            return 'mock-data';
          }
          if (id.includes('/lib/i18n') || id.includes('\\lib\\i18n')) {
            return 'i18n-data';
          }
        },
      },
    },
  },
});
