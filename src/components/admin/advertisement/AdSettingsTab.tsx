import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { FormField } from '../../ui/FormField';
import { Input } from '../../ui/Input';
import { Switch } from '../../ui/Switch';
import { ActionErrorBanner } from '../../ui/ActionErrorBanner';
import { useToast } from '../../../context/ToastContext';
import { SkipDuration, RotationStrategy } from '../../../types/advertisement';
import { fetchAdSettings, updateAdSettings } from '../../../lib/advertisementApi';

export const AdSettingsTab: React.FC = () => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [maxPerSession, setMaxPerSession] = useState<number>(1);
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(15);
  const [defaultSkipDuration, setDefaultSkipDuration] = useState<SkipDuration>(5);
  const [rotationStrategy, setRotationStrategy] = useState<RotationStrategy>('fair_round_robin');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const s = await fetchAdSettings();
        setIsEnabled(s.is_enabled);
        setMaxPerSession(s.max_ads_per_session);
        setCooldownMinutes(s.cooldown_minutes);
        setDefaultSkipDuration(s.default_skip_duration);
        setRotationStrategy(s.rotation_strategy);
      } catch (err) {
        console.error('Error loading ad settings:', err);
        setErrorMsg('Failed to load advertisement settings.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (maxPerSession < 1 || maxPerSession > 10) {
      setErrorMsg('Max ads per session must be between 1 and 10.');
      return;
    }
    if (cooldownMinutes < 0 || cooldownMinutes > 1440) {
      setErrorMsg('Cooldown minutes must be between 0 and 1440 (24 hours).');
      return;
    }

    setIsSaving(true);
    try {
      await updateAdSettings({
        is_enabled: isEnabled,
        max_ads_per_session: maxPerSession,
        cooldown_minutes: cooldownMinutes,
        default_skip_duration: defaultSkipDuration,
        rotation_strategy: rotationStrategy,
      });
      toastSuccess('Advertisement settings updated successfully.');
    } catch (err) {
      console.error('Error saving ad settings:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update settings.');
      toastError('Could not update advertisement settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card style={{ padding: '32px', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading advertisement settings...</p>
      </Card>
    );
  }

  return (
    <Card style={{ padding: '28px', maxWidth: '800px' }}>
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Global Advertisement Settings</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Configure platform-wide delivery rules, frequency cooldowns, and rotation behavior.
            </p>
          </div>

          <Button type="submit" variant="primary" isLoading={isSaving}>
            <Save size={16} style={{ marginRight: '6px' }} />
            Save Changes
          </Button>
        </div>

        {errorMsg && (
          <ActionErrorBanner
            message={errorMsg}
            variant="error"
            onDismiss={() => setErrorMsg(null)}
          />
        )}

        {/* Global Enable / Disable Toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px',
            background: isEnabled ? 'rgba(10, 123, 131, 0.06)' : 'rgba(239, 68, 68, 0.06)',
            borderRadius: '10px',
            border: `1px solid ${isEnabled ? 'rgba(10, 123, 131, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: isEnabled ? 'inherit' : 'var(--color-error)' }}>
              {isEnabled ? 'Opening Advertisements Enabled' : 'Opening Advertisements Disabled'}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {isEnabled
                ? 'Eligible customers will receive scheduled advertisements upon entering the application.'
                : 'All customer advertisements are paused platform-wide immediately.'}
            </div>
          </div>

          <Switch
            id="ad-global-toggle"
            label="Enable Ads"
            checked={isEnabled}
            onChange={(checked) => setIsEnabled(checked)}
            aria-label="Toggle opening advertisements"
          />
        </div>

        {/* Frequency & Cooldown Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <FormField
            id="ad-max-per-session"
            label="Maximum Opening Ads Per Session"
            required
            hint="Default: 1. Controls how many opening ads a single user session may experience."
          >
            <Input
              id="ad-max-per-session"
              type="number"
              min={1}
              max={10}
              value={maxPerSession}
              onChange={(e) => setMaxPerSession(parseInt(e.target.value, 10) || 1)}
              required
            />
          </FormField>

          <FormField
            id="ad-cooldown-minutes"
            label="Minimum Cooldown Duration (Minutes)"
            required
            hint="Default: 15. Minimum time elapsed before another opening ad can appear for a user."
          >
            <Input
              id="ad-cooldown-minutes"
              type="number"
              min={0}
              max={1440}
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(parseInt(e.target.value, 10) || 0)}
              required
            />
          </FormField>
        </div>

        {/* Default Skip Duration */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.92rem' }}>
            Platform Default Skip Duration
          </label>
          <p style={{ margin: '0 0 10px 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Used when a specific campaign does not configure an override.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {([5, 10, 30] as SkipDuration[]).map((dur) => (
              <label
                key={dur}
                style={{
                  border: `2px solid ${defaultSkipDuration === dur ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: defaultSkipDuration === dur ? 'rgba(10, 123, 131, 0.08)' : 'var(--color-card-bg)',
                  borderRadius: '8px',
                  padding: '12px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                <input
                  type="radio"
                  name="defaultSkip"
                  value={dur}
                  checked={defaultSkipDuration === dur}
                  onChange={() => setDefaultSkipDuration(dur)}
                  style={{ display: 'none' }}
                />
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: defaultSkipDuration === dur ? 'var(--color-primary)' : 'inherit' }}>
                  {dur} seconds
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Campaign Rotation Strategy */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.92rem' }}>
            Campaign Rotation Strategy
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            <label
              style={{
                border: `2px solid ${rotationStrategy === 'fair_round_robin' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: rotationStrategy === 'fair_round_robin' ? 'rgba(10, 123, 131, 0.08)' : 'var(--color-card-bg)',
                borderRadius: '10px',
                padding: '14px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>Fair Distribution (Round-Robin)</span>
                <input
                  type="radio"
                  name="rotation"
                  value="fair_round_robin"
                  checked={rotationStrategy === 'fair_round_robin'}
                  onChange={() => setRotationStrategy('fair_round_robin')}
                />
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Balances impression counts evenly among all active campaigns. Prevents consecutive advertiser repetition.
              </p>
            </label>

            <label
              style={{
                border: `2px solid ${rotationStrategy === 'priority_weighted' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: rotationStrategy === 'priority_weighted' ? 'rgba(10, 123, 131, 0.08)' : 'var(--color-card-bg)',
                borderRadius: '10px',
                padding: '14px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>Priority-Weighted Distribution</span>
                <input
                  type="radio"
                  name="rotation"
                  value="priority_weighted"
                  checked={rotationStrategy === 'priority_weighted'}
                  onChange={() => setRotationStrategy('priority_weighted')}
                />
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Campaigns with higher priority ratings (1-10) receive proportionally larger impression shares.
              </p>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px' }}>
          <Button type="submit" variant="primary" isLoading={isSaving}>
            <Save size={16} style={{ marginRight: '6px' }} />
            Save Settings
          </Button>
        </div>
      </form>
    </Card>
  );
};
