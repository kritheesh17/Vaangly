import React from 'react';

/**
 * FirstVisitPermissionModal is superseded by the mandatory NotificationPermissionGate.
 * Location is strictly on-demand when features require it, and notifications are gated before app entry.
 * Kept as a no-op component for backward-compatibility with tests.
 */
export const FirstVisitPermissionModal: React.FC = () => {
  return null;
};
