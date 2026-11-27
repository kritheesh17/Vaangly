import React from 'react';
import './KartzoLogo.css';

export interface KartzoLogoProps {
  size?: number | string;
  variant?: 'icon' | 'symbol' | 'horizontal' | 'badge' | 'monogram';
  className?: string;
  ariaLabel?: string;
}

export const KartzoLogo: React.FC<KartzoLogoProps> = ({
  size = 36,
  variant = 'icon',
  className = '',
  ariaLabel = 'Kartzo Logo',
}) => {
  const pixelSize = typeof size === 'number' ? `${size}px` : size;

  if (variant === 'symbol' || variant === 'monogram') {
    // Standalone interlocking ribbon symbol (transparent background)
    return (
      <svg
        viewBox="0 0 120 120"
        width={pixelSize}
        height={pixelSize}
        className={`kartzo-logo kartzo-logo--symbol ${className}`}
        role="img"
        aria-label={ariaLabel}
      >
        <g>
          <path
            d="M22 18 H77 C82 18 85 23 82 28 L57 69 C54 74 49 77 43 77 H12 C7 77 4 72 7 67 L32 26 C35 21 28 18 22 18Z"
            fill="var(--brand-primary, #087F5B)"
          />
          <path
            d="M78 43 H108 C113 43 116 48 113 53 L88 94 C85 99 80 102 74 102 H43 C38 102 35 97 38 92 L63 51 C66 46 72 43 78 43Z"
            fill="var(--brand-accent, #B7E34A)"
          />
        </g>
      </svg>
    );
  }

  if (variant === 'horizontal') {
    // Official horizontal logo lockup from kartzo-horizontal.svg (4:1 aspect ratio)
    const heightVal = typeof size === 'number' ? size : 40;
    const widthVal = heightVal * 4;
    return (
      <svg
        viewBox="0 0 720 180"
        width={widthVal}
        height={heightVal}
        className={`kartzo-logo kartzo-logo--horizontal ${className}`}
        role="img"
        aria-label={ariaLabel}
      >
        <rect width="720" height="180" fill="none" />
        <g transform="translate(18 28) scale(1.15)">
          <path
            d="M22 18 H77 C82 18 85 23 82 28 L57 69 C54 74 49 77 43 77 H12 C7 77 4 72 7 67 L32 26 C35 21 28 18 22 18Z"
            fill="var(--brand-primary, #087F5B)"
          />
          <path
            d="M78 43 H108 C113 43 116 48 113 53 L88 94 C85 99 80 102 74 102 H43 C38 102 35 97 38 92 L63 51 C66 46 72 43 78 43Z"
            fill="var(--brand-accent, #B7E34A)"
          />
        </g>
        <text
          x="170"
          y="119"
          fontFamily="'Sora', -apple-system, sans-serif"
          fontSize="88"
          fontWeight="800"
          letterSpacing="-2"
          fill="var(--color-text-primary, #142B25)"
          className="kartzo-logo__text"
        >
          Kartzo
        </text>
      </svg>
    );
  }

  // Default 'icon' or 'badge': Official rounded squircle app icon (kartzo-app-icon.svg)
  return (
    <svg
      viewBox="0 0 512 512"
      width={pixelSize}
      height={pixelSize}
      className={`kartzo-logo kartzo-logo--icon ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      <rect x="0" y="0" width="512" height="512" rx="112" fill="var(--brand-primary, #087F5B)" />
      <g transform="translate(100 100) scale(2.6)">
        <path
          d="M22 18 H77 C82 18 85 23 82 28 L57 69 C54 74 49 77 43 77 H12 C7 77 4 72 7 67 L32 26 C35 21 28 18 22 18Z"
          fill="#FFFFFF"
        />
        <path
          d="M78 43 H108 C113 43 116 48 113 53 L88 94 C85 99 80 102 74 102 H43 C38 102 35 97 38 92 L63 51 C66 46 72 43 78 43Z"
          fill="var(--brand-accent, #B7E34A)"
        />
      </g>
    </svg>
  );
};
