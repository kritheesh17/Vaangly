import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Development Supabase health check & window.checkSupabase binding
if (import.meta.env.DEV) {
  import('./lib/supabaseHealth');
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
