/**
 * @deprecated Mobile OTP has been decommissioned in favor of Google OAuth.
 * Phone numbers are now operational contact attributes only and do not use OTP verification.
 */
import React from 'react';

export interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
}

export const OtpInput: React.FC<OtpInputProps> = () => {
  return null;
};
