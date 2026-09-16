import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../ui/Button';

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="container" style={{ padding: '80px 16px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Verifying administrative permissions...</p>
      </div>
    );
  }

  // Not logged in -> Redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Logged in but not an admin -> Strict access restriction
  if (role !== 'admin') {
    return (
      <div
        className="container"
        style={{
          maxWidth: '540px',
          margin: '80px auto',
          textAlign: 'center',
          padding: '32px',
          background: 'var(--color-card-bg)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: 'var(--color-error)',
          }}
        >
          <ShieldAlert size={28} />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>
          Restricted Administrative Portal
        </h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px', lineHeight: 1.5 }}>
          You are currently signed in as a <strong>{role || 'standard customer'}</strong>. Access to this
          administrative surface is strictly restricted to platform operations personnel.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Button variant="outline" onClick={() => window.history.back()}>
            Go Back
          </Button>
          <Button variant="primary" onClick={() => (window.location.href = '/')}>
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
