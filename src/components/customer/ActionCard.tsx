import React from 'react';
import { Badge } from '../ui/Badge';
import { ArrowRight } from 'lucide-react';
import './ActionCard.css';

export interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badgeText?: string;
  isComingSoon?: boolean;
  onClick: () => void;
  accentColor?: string;
}

export const ActionCard: React.FC<ActionCardProps> = ({
  icon,
  title,
  subtitle,
  badgeText,
  isComingSoon = false,
  onClick,
}) => {
  return (
    <button
      type="button"
      className={`vaango-action-card ${isComingSoon ? 'vaango-action-card--disabled' : ''}`}
      onClick={onClick}
      aria-disabled={isComingSoon}
    >
      <div className="vaango-action-card__icon-box" aria-hidden="true">
        {icon}
      </div>

      <div className="vaango-action-card__content">
        <div className="vaango-action-card__title-row">
          <h2 className="vaango-action-card__title">{title}</h2>
          {badgeText && (
            <Badge variant={isComingSoon ? 'neutral' : 'accent'} size="sm">
              {badgeText}
            </Badge>
          )}
        </div>
        <p className="vaango-action-card__subtitle">{subtitle}</p>
      </div>

      <div className="vaango-action-card__arrow" aria-hidden="true">
        <ArrowRight size={22} />
      </div>
    </button>
  );
};
