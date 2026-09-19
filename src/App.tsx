import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LocationProvider } from './context/LocationContext';
import { LanguageProvider } from './context/LanguageContext';
import { CartProvider } from './context/CartContext';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { AdInterstitialScreen } from './components/layout/AdInterstitialScreen';

import { HomePage } from './pages/HomePage';
import { BrowseShopsPage } from './pages/BrowseShopsPage';
import { ShopDetailPage } from './pages/ShopDetailPage';
import { CartPage } from './pages/CartPage';
import { RequestConfirmationPage } from './pages/RequestConfirmationPage';
import { RequestDetailPage } from './pages/RequestDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProfilePage } from './pages/ProfilePage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { CompleteProfilePage } from './pages/auth/CompleteProfilePage';
import { AuthCallbackPage } from './pages/auth/AuthCallbackPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Code-split Shopkeeper modules (lazy loaded on navigation)
const ShopkeeperDashboardPage = React.lazy(() =>
  import('./pages/shopkeeper/ShopkeeperDashboardPage').then((m) => ({ default: m.ShopkeeperDashboardPage }))
);
const ShopkeeperRequestsPage = React.lazy(() =>
  import('./pages/shopkeeper/ShopkeeperRequestsPage').then((m) => ({ default: m.ShopkeeperRequestsPage }))
);
const ShopkeeperRequestDetailPage = React.lazy(() =>
  import('./pages/shopkeeper/ShopkeeperRequestDetailPage').then((m) => ({ default: m.ShopkeeperRequestDetailPage }))
);
const ShopkeeperCataloguePage = React.lazy(() =>
  import('./pages/shopkeeper/ShopkeeperCataloguePage').then((m) => ({ default: m.ShopkeeperCataloguePage }))
);
const ShopkeeperProfilePage = React.lazy(() =>
  import('./pages/shopkeeper/ShopkeeperProfilePage').then((m) => ({ default: m.ShopkeeperProfilePage }))
);
const ShopkeeperOnboardingPage = React.lazy(() =>
  import('./pages/shopkeeper/ShopkeeperOnboardingPage').then((m) => ({ default: m.ShopkeeperOnboardingPage }))
);
const ShopkeeperAnalyticsPage = React.lazy(() =>
  import('./pages/shopkeeper/ShopkeeperAnalyticsPage').then((m) => ({ default: m.ShopkeeperAnalyticsPage }))
);

// Code-split Admin modules (lazy loaded on navigation)
const AdminDashboardPage = React.lazy(() =>
  import('./pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage }))
);
const AdminLocationsPage = React.lazy(() =>
  import('./pages/admin/AdminLocationsPage').then((m) => ({ default: m.AdminLocationsPage }))
);
const AdminApplicationsPage = React.lazy(() =>
  import('./pages/admin/AdminApplicationsPage').then((m) => ({ default: m.AdminApplicationsPage }))
);
const AdminApplicationDetailPage = React.lazy(() =>
  import('./pages/admin/AdminApplicationDetailPage').then((m) => ({ default: m.AdminApplicationDetailPage }))
);
const AdminShopsPage = React.lazy(() =>
  import('./pages/admin/AdminShopsPage').then((m) => ({ default: m.AdminShopsPage }))
);
const AdminShopDetailPage = React.lazy(() =>
  import('./pages/admin/AdminShopDetailPage').then((m) => ({ default: m.AdminShopDetailPage }))
);
const AdminSubscriptionsPage = React.lazy(() =>
  import('./pages/admin/AdminSubscriptionsPage').then((m) => ({ default: m.AdminSubscriptionsPage }))
);
const AdminAuditPage = React.lazy(() =>
  import('./pages/admin/AdminAuditPage').then((m) => ({ default: m.AdminAuditPage }))
);
const DesignSystemShowcasePage = React.lazy(() =>
  import('./pages/DesignSystemShowcasePage').then((m) => ({ default: m.DesignSystemShowcasePage }))
);
const SupabaseDiagnosticPage = React.lazy(() =>
  import('./pages/dev/SupabaseDiagnosticPage').then((m) => ({ default: m.SupabaseDiagnosticPage }))
);

import { AdminRoute } from './components/admin/AdminRoute';
import { AdminLayout } from './components/admin/AdminLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <LocationProvider>
            <LanguageProvider>
              <CartProvider>
                <ToastProvider>
                  <BrowserRouter>
                    <AdInterstitialScreen />
                    <React.Suspense
                      fallback={
                        <div className="container" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                          <div style={{ display: 'inline-block', width: 32, height: 32, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                          <div style={{ marginTop: 12, fontSize: '0.9rem' }}>Loading view...</div>
                        </div>
                      }
                    >
                      <Routes>
                        {/* Routes wrapped in responsive navigation shell */}
                        <Route element={<AppShell />}>
                          <Route path="/" element={<HomePage />} />
                          <Route path="/shops" element={<BrowseShopsPage />} />
                          <Route path="/explore" element={<Navigate to="/shops" replace />} />
                          <Route path="/shop/:shopId" element={<ShopDetailPage />} />
                          <Route path="/cart" element={<CartPage />} />
                          <Route
                            path="/request-confirmation/:requestId"
                            element={<RequestConfirmationPage />}
                          />
                          <Route path="/request/:requestId" element={<RequestDetailPage />} />
                          <Route path="/requests/:requestId" element={<RequestDetailPage />} />
                          <Route
                            path="/orders"
                            element={
                              <ProtectedRoute requireVerified={true}>
                                <OrdersPage />
                              </ProtectedRoute>
                            }
                          />
                          <Route path="/requests" element={<Navigate to="/orders" replace />} />
                          <Route
                            path="/profile"
                            element={
                              <ProtectedRoute requireVerified={false}>
                                <ProfilePage />
                              </ProtectedRoute>
                            }
                          />

                          {/* Shopkeeper MVP Routes */}
                          <Route path="/shopkeeper" element={<Navigate to="/shopkeeper/dashboard" replace />} />
                          <Route
                            path="/shopkeeper/dashboard"
                            element={
                              <ProtectedRoute allowedRoles={['shopkeeper']} requireVerified={true}>
                                <ShopkeeperDashboardPage />
                              </ProtectedRoute>
                            }
                          />
                          <Route
                            path="/shopkeeper/requests"
                            element={
                              <ProtectedRoute allowedRoles={['shopkeeper']} requireVerified={true}>
                                <ShopkeeperRequestsPage />
                              </ProtectedRoute>
                            }
                          />
                          <Route
                            path="/shopkeeper/requests/:requestId"
                            element={
                              <ProtectedRoute allowedRoles={['shopkeeper']} requireVerified={true}>
                                <ShopkeeperRequestDetailPage />
                              </ProtectedRoute>
                            }
                          />
                          <Route
                            path="/shopkeeper/catalogue"
                            element={
                              <ProtectedRoute allowedRoles={['shopkeeper']} requireVerified={true}>
                                <ShopkeeperCataloguePage />
                              </ProtectedRoute>
                            }
                          />
                          <Route
                            path="/shopkeeper/profile"
                            element={
                              <ProtectedRoute allowedRoles={['shopkeeper']} requireVerified={true}>
                                <ShopkeeperProfilePage />
                              </ProtectedRoute>
                            }
                          />
                          <Route
                            path="/shopkeeper/analytics"
                            element={
                              <ProtectedRoute allowedRoles={['shopkeeper', 'admin']} requireVerified={true}>
                                <ShopkeeperAnalyticsPage />
                              </ProtectedRoute>
                            }
                          />
                          <Route path="/shopkeeper/settings" element={<Navigate to="/shopkeeper/profile" replace />} />
                          <Route
                            path="/shopkeeper/apply"
                            element={
                              <ProtectedRoute requireVerified={true}>
                                <ShopkeeperOnboardingPage />
                              </ProtectedRoute>
                            }
                          />

                          {/* Admin & Business Operations Routes (Phase 5) */}
                          <Route
                            path="/admin"
                            element={
                              <AdminRoute>
                                <AdminLayout />
                              </AdminRoute>
                            }
                          >
                            <Route index element={<Navigate to="/admin/dashboard" replace />} />
                            <Route path="dashboard" element={<AdminDashboardPage />} />
                            <Route path="locations" element={<AdminLocationsPage />} />
                            <Route path="applications" element={<AdminApplicationsPage />} />
                            <Route path="applications/:applicationId" element={<AdminApplicationDetailPage />} />
                            <Route path="shops" element={<AdminShopsPage />} />
                            <Route path="shops/:shopId" element={<AdminShopDetailPage />} />
                            <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
                            <Route path="audit" element={<AdminAuditPage />} />
                          </Route>

                          {/* Public Design System Showcase & Dev Diagnostics */}
                          {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystemShowcasePage />} />}
                          {import.meta.env.DEV && <Route path="/dev/supabase-test" element={<SupabaseDiagnosticPage />} />}

                          {/* Fallback 404 */}
                          <Route path="*" element={<NotFoundPage />} />
                        </Route>

                        {/* Standalone Auth Routes */}
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route path="/complete-profile" element={<CompleteProfilePage />} />
                        <Route path="/auth/callback" element={<AuthCallbackPage />} />
                      </Routes>
                    </React.Suspense>
                  </BrowserRouter>
                </ToastProvider>
              </CartProvider>
            </LanguageProvider>
          </LocationProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
