import React from 'react';
import './NotificationBadge.css';

export interface NotificationBadgeProps {
  count?: number | string | null;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  position?: 'inline' | 'overlap';
  showZero?: boolean;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

/**
 * Standardized Red Notification Badge.
 * Renders the unread count INSIDE a red circular/pill badge in white bold text.
 * Never renders a separate red dot beside an external number.
 */
export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  count,
  max = 99,
  size = 'md',
  position = 'inline',
  showZero = false,
  className = '',
  style,
  ariaLabel,
}) => {
  if (count === undefined || count === null) return null;

  const num = typeof count === 'string' ? parseInt(count, 10) : count;
  if (isNaN(num)) return null;

  if (num <= 0 && !showZero) return null;

  const displayCount = num > max ? `${max}+` : `${num}`;
  const isSingle = displayCount.length === 1;

  return (
    <span
      className={`vaango-notification-badge vaango-notification-badge--${size} vaango-notification-badge--${position} ${
        isSingle ? 'vaango-notification-badge--single' : 'vaango-notification-badge--multi'
      } ${className}`}
      style={style}
      aria-label={ariaLabel || `${num} notifications`}
      role="status"
    >
      {displayCount}
    </span>
  );
};
