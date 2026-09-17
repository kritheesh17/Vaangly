import React, { useState, useEffect } from 'react';
import { Database, ShieldCheck, Wifi, WifiOff, RefreshCw, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { testSupabaseConnection, SupabaseDiagnosticReport } from '../../lib/supabaseHealth';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

export const SupabaseDiagnosticPage: React.FC = () => {
  const navigate = useNavigate();
  const [report, setReport] = useState<SupabaseDiagnosticReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const runTest = async () => {
    setIsLoading(true);
    try {
      const res = await testSupabaseConnection();
      setReport(res);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runTest();
  }, []);

  return (
    <div className="container" style={{ maxWidth: '640px', padding: 'var(--spacing-xl) var(--spacing-md)' }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: 'none',
          border: 'none',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          marginBottom: 'var(--spacing-md)',
          fontSize: '0.9rem',
        }}
      >
        <ArrowLeft size={16} /> Back
      </button>

      <Card variant="default" padding="lg">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database size={24} style={{ color: 'var(--color-primary)' }} />
            <div>
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Supabase Connection Test</h1>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Development-only diagnostic &middot; No database tables queried
              </span>
            </div>
          </div>
          <Badge variant="neutral" size="sm">DEV MODE</Badge>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--color-text-secondary)' }}>
            <RefreshCw size={24} className="animate-spin" style={{ marginBottom: '8px' }} />
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Testing Supabase API reachability...</p>
          </div>
        ) : report ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Top Status Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: report.networkReachable ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${report.networkReachable ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              {report.networkReachable ? (
                <Wifi size={22} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
              ) : (
                <WifiOff size={22} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
              )}
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem' }}>
                  {report.networkReachable ? 'Supabase Project Reachable' : 'Connection Failed'}
                </strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  {report.networkReachable
                    ? `Successfully reached Supabase API in ${report.latencyMs}ms.`
                    : report.errorMessage || 'Unable to connect to Supabase.'}
                </span>
              </div>
            </div>

            {/* Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: '0.9rem' }}>Supabase URL configured</span>
                <Badge variant={report.supabaseUrlConfigured ? 'success' : 'error'} size="sm">
                  {report.supabaseUrlConfigured ? 'YES' : 'NO'}
                </Badge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: '0.9rem' }}>Publishable Key configured</span>
                <Badge variant={report.publishableKeyConfigured ? 'success' : 'error'} size="sm">
                  {report.publishableKeyConfigured ? 'YES' : 'NO'}
                </Badge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: '0.9rem' }}>Supabase client initialized</span>
                <Badge variant={report.clientInitialized ? 'success' : 'error'} size="sm">
                  {report.clientInitialized ? 'YES' : 'NO'}
                </Badge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: '0.9rem' }}>Auth Service Status</span>
                <Badge variant={report.authServiceStatus === 'HEALTHY' ? 'success' : 'error'} size="sm">
                  {report.authServiceStatus}
                </Badge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: '0.9rem' }}>Masked Publishable Key</span>
                <code style={{ fontSize: '0.8rem', background: 'var(--color-surface-hover)', padding: '2px 6px', borderRadius: '4px' }}>
                  {report.maskedPublishableKey}
                </code>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                <span style={{ fontSize: '0.9rem' }}>Project Host</span>
                <code style={{ fontSize: '0.8rem', background: 'var(--color-surface-hover)', padding: '2px 6px', borderRadius: '4px' }}>
                  {report.supabaseUrl}
                </code>
              </div>
            </div>

            {/* Error detail if any */}
            {report.errorMessage && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.08)',
                  color: 'var(--color-error)',
                  fontSize: '0.85rem',
                  marginTop: '4px',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{report.errorMessage}</span>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <Button
                variant="primary"
                size="sm"
                fullWidth
                leftIcon={<RefreshCw size={14} />}
                onClick={runTest}
              >
                Re-test Connection
              </Button>
            </div>

            <p style={{ margin: '12px 0 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              <ShieldCheck size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Safe initialization check using Supabase Auth endpoint. Database tables are NOT queried.
            </p>
          </div>
        ) : null}
      </Card>
    </div>
  );
};
