import React from 'react';
import { KartzoLogo } from './KartzoLogo';
import './KartzoLogo.css';

export interface KartzoBrandProps {
  logoSize?: number | string;
  showWordmark?: boolean;
  wordmarkSize?: 'sm' | 'md' | 'lg' | 'xl';
  subtitle?: string;
  className?: string;
}

export const KartzoBrand: React.FC<KartzoBrandProps> = ({
  logoSize = 36,
  showWordmark = true,
  wordmarkSize = 'md',
  subtitle,
  className = '',
}) => {
  return (
    <div className={`kartzo-brand-lockup ${className}`}>
      <KartzoLogo size={logoSize} />
      {showWordmark && (
        <div className="kartzo-brand-text-col">
          <span className={`kartzo-wordmark kartzo-wordmark--${wordmarkSize}`}>KARTZO</span>
          {subtitle && <span className="kartzo-brand-subtitle">{subtitle}</span>}
        </div>
      )}
    </div>
  );
};
