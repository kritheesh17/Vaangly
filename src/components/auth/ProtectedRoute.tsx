import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types/database';
import { Skeleton } from '../ui/Skeleton';
import { ErrorState } from '../ui/ErrorState';
import { MailCheck } from 'lucide-react';
import { Button } from '../ui/Button';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requireVerified?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requireVerified = true,
}) => {
  const { user, role, isLoading, isAuthenticated, isEmailVerified } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="container" style={{ padding: 'var(--space-8) 0' }}>
        <Skeleton height={40} width="60%" style={{ marginBottom: 'var(--space-4)' }} />
        <Skeleton height={140} style={{ marginBottom: 'var(--space-4)' }} />
        <Skeleton height={80} />
      </div>
    );
  }

  // 1. Unauthenticated -> Redirect to login with explicit redirect query param
  if (!isAuthenticated || !user) {
    const redirectUrl = location.pathname + location.search;
    return <Navigate to={`/login?redirect=${redirectUrl}`} state={{ from: location }} replace />;
  }

  // 2. Authenticated but unverified check
  if (requireVerified && !isEmailVerified) {
    return (
      <div
        className="container"
        style={{
          maxWidth: '520px',
          margin: 'var(--space-10) auto',
          textAlign: 'center',
          padding: 'var(--space-8)',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--brand-primary-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto var(--space-4)',
            color: 'var(--brand-primary)',
          }}
        >
          <MailCheck size={28} />
        </div>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
          Email Verification Required
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', lineHeight: 1.5 }}>
          Your email address (<strong>{user.email || 'your account'}</strong>) is not yet verified.
          Please complete email verification to access this protected area.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
          <Link to="/login" state={{ from: location }}>
            <Button variant="primary">Verify Email Now</Button>
          </Link>
          <Button variant="outline" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // 3. Role authorization check
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return (
      <div className="container" style={{ padding: 'var(--space-10) 0' }}>
        <ErrorState
          title="Access Restricted"
          message={`This section requires a ${allowedRoles.join(' or ')} account. Your current active role is "${role}".`}
        />
      </div>
    );
  }

  return <>{children}</>;
};
