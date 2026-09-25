export interface AccuracyTier {
  meters: number;
  tier: 'excellent' | 'good' | 'coarse' | 'approximate';
  label: string;
  badgeClass: string;
  formatted: string;
  tip?: string;
}

export const getAccuracyTier = (meters: number): AccuracyTier => {
  const rounded = Math.round(meters);
  if (rounded <= 25) {
    return {
      meters: rounded,
      tier: 'excellent',
      label: 'Excellent',
      badgeClass: 'vaango-gps-badge--excellent',
      formatted: `±${rounded} m (High-precision GPS)`,
    };
  }
  if (rounded <= 100) {
    return {
      meters: rounded,
      tier: 'good',
      label: 'Good',
      badgeClass: 'vaango-gps-badge--good',
      formatted: `±${rounded} m (Standard accuracy)`,
      tip: 'Tip: For highest delivery precision, step near a storefront entrance or open window.',
    };
  }
  if (rounded <= 1000) {
    return {
      meters: rounded,
      tier: 'coarse',
      label: 'Coarse',
      badgeClass: 'vaango-gps-badge--coarse',
      formatted: `±${rounded} m (Estimated from Wi-Fi / Cell tower)`,
      tip: 'Notice: Location estimated from network towers. If indoors, stepping outside achieves satellite GPS lock.',
    };
  }
  return {
    meters: rounded,
    tier: 'approximate',
    label: 'Approximate',
    badgeClass: 'vaango-gps-badge--approximate',
    formatted: `±${(rounded / 1000).toFixed(1)} km (Network / IP estimate)`,
    tip: 'Notice: Wide margin of error. Please ensure your physical shop address below is accurate.',
  };
};
