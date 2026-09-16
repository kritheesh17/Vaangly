import React, { useState } from 'react';
import './StarRating.css';

interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const StarRating: React.FC<StarRatingProps> = ({ value, onChange, readonly = false, size = 'md' }) => {
  const [hover, setHover] = useState(0);
  const px = size === 'sm' ? 18 : size === 'lg' ? 36 : 26;

  return (
    <div className="vaango-stars" role="group" aria-label={`Rating: ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          className={`vaango-star ${(hover || value) >= star ? 'vaango-star--on' : ''}`}
          style={{ fontSize: px }}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          aria-label={`${star} star${star !== 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  );
};
