import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Development Supabase health check & window.checkSupabase binding
if (import.meta.env.DEV) {
  import('./lib/supabaseHealth');
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[Vaango PWA] Service worker registered successfully:', reg.scope);
      })
      .catch((err) => {
        console.warn('[Vaango PWA] Service worker registration failed:', err);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
