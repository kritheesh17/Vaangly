import React, { useState } from 'react';
import './Avatar.css';

export interface AvatarProps {
  src?: string | null;
  alt: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  name,
  size = 'md',
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);

  // Generate fallback initials
  const getInitials = (n?: string) => {
    if (!n) return 'V';
    const parts = n.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return n.substring(0, 2).toUpperCase();
  };

  return (
    <div className={`vaango-avatar vaango-avatar--${size} ${className}`} title={alt}>
      {src && !hasError ? (
        <img
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
          className="vaango-avatar__image"
        />
      ) : (
        <span className="vaango-avatar__fallback" aria-hidden="true">
          {getInitials(name || alt)}
        </span>
      )}
    </div>
  );
};
