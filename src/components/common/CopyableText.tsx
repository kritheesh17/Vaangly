import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import './CopyableText.css';

interface CopyableTextProps {
  text: string;
  displayValue?: string;
  label?: string;
  truncate?: boolean;
  className?: string;
}

export const CopyableText: React.FC<CopyableTextProps> = ({
  text,
  displayValue,
  label = 'Copy reference',
  truncate = false,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Failed to copy text:', err);
    }
  };

  const shownText = displayValue || text;

  return (
    <span className={`vaango-copyable ${className}`}>
      <code
        className={`vaango-copyable__code ${truncate ? 'vaango-copyable__code--truncate' : ''}`}
        title={text}
      >
        {shownText}
      </code>
      <button
        type="button"
        className={`vaango-copyable__btn ${copied ? 'vaango-copyable__btn--copied' : ''}`}
        onClick={handleCopy}
        aria-label={copied ? 'Copied to clipboard' : label}
        title={copied ? 'Copied!' : label}
      >
        {copied ? <Check size={13} className="vaango-copyable__icon-check" /> : <Copy size={13} />}
        {copied && <span className="vaango-copyable__tooltip">Copied!</span>}
      </button>
    </span>
  );
};
