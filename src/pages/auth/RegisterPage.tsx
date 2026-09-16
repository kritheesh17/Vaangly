import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, User, Phone, AlertCircle, CheckCircle2, ArrowRight, RefreshCw, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import { Select } from '../../components/ui/Select';
import { OtpInput } from '../../components/auth/OtpInput';
import { UserRole } from '../../types/database';
import './Auth.css';

type RegisterStep = 'details' | 'verify';

const RESEND_COOLDOWN_SECONDS = 60;

export const RegisterPage: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('customer');

  // Step state
  const [step, setStep] = useState<RegisterStep>('details');
  const [otpCode, setOtpCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);

  const { signUpWithEmail, verifyEmailOtp, isSupabaseLive } = useAuth();
  const navigate = useNavigate();

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Step 1: Submit Details & Request OTP
  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = email.trim();
    const cleanName = fullName.trim();

    if (!cleanName) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!cleanEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Sending verification code...');

    const result = await signUpWithEmail(cleanEmail, cleanName, role, phone.trim() || undefined);
    setIsSubmitting(false);

    if (result.success) {
      setStep('verify');
      setStatusMessage('Verification code sent to your email.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setStatusMessage(null);
      setErrorMsg(result.error || 'Registration request failed. Please try again.');
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || otpCode).trim();
    setErrorMsg(null);

    if (code.length !== 6) {
      setErrorMsg('That code is incorrect or has expired.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Verifying...');

    const result = await verifyEmailOtp(email, code);

    if (result.success) {
      setStatusMessage('Email verified successfully.');
      setTimeout(() => {
        // Redirect according to persona
        if (role === 'shopkeeper') {
          navigate('/shopkeeper/apply', { replace: true });
        } else {
          navigate('/profile', { replace: true });
        }
      }, 700);
    } else {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMsg(result.error || 'That code is incorrect or has expired.');
    }
  };

  // Resend code handler
  const handleResend = async () => {
    if (cooldown > 0) return;
    setOtpCode('');
    setIsSubmitting(true);
    setStatusMessage('Sending verification code...');
    const result = await signUpWithEmail(email.trim(), fullName.trim(), role, phone.trim() || undefined);
    setIsSubmitting(false);

    if (result.success) {
      setStatusMessage('Verification code sent to your email.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setErrorMsg(result.error || 'Unable to verify your email right now. Please try again.');
    }
  };

  return (
    <div className="container vaango-auth-container">
      <Card variant="elevated" padding="lg" className="vaango-auth-card">
        <div className="vaango-auth-header">
          <div className="vaango-auth-logo">
            <span>V</span>
          </div>
          <h1 className="vaango-auth-title">Join Vaango</h1>
          <p className="vaango-auth-subtitle">
            Create an account to start exploring local shops or partner as a merchant in Kangeyam.
          </p>
        </div>

        {/* Status notification */}
        {statusMessage && (
          <div
            className={`vaango-auth-status-alert ${
              statusMessage.includes('successfully') ? 'vaango-auth-status-alert--success' : ''
            }`}
            role="status"
          >
            {statusMessage.includes('successfully') ? (
              <CheckCircle2 size={18} className="text-success" />
            ) : (
              <RefreshCw size={16} className="vaango-spin text-primary" />
            )}
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Error notification */}
        {errorMsg && (
          <div className="vaango-auth-error" role="alert">
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {step === 'details' ? (
          /* STEP 1: Registration Form */
          <form onSubmit={handleDetailsSubmit} className="vaango-auth-form">
            <FormField id="reg-name" label="Full Name" required>
              <Input
                id="reg-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                leftIcon={<User size={18} />}
              />
            </FormField>

            <FormField id="reg-email" label="Email Address" required>
              <Input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ramesh@example.com"
                leftIcon={<Mail size={18} />}
              />
            </FormField>

            <FormField id="reg-phone" label="Mobile Number" hint="Optional - used for order notifications (+91)">
              <Input
                id="reg-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                leftIcon={<Phone size={18} />}
              />
            </FormField>

            <FormField
              id="reg-role"
              label="I want to join as"
              hint="Shopkeeper accounts go through verified onboarding & catalogue setup"
              required
            >
              <Select
                id="reg-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                options={[
                  { value: 'customer', label: 'Customer (Discover shops, place requests)' },
                  { value: 'shopkeeper', label: 'Shopkeeper / Merchant (List my store)' },
                ]}
              />
            </FormField>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              rightIcon={<ArrowRight size={18} />}
            >
              Send Verification Code
            </Button>
          </form>
        ) : (
          /* STEP 2: Verify Registration Email */
          <div className="vaango-auth-otp-step">
            <div className="vaango-otp-dest-bar">
              <span className="vaango-otp-dest-label">Verifying:</span>
              <span className="vaango-otp-dest-email">{email}</span>
              <button
                type="button"
                onClick={() => {
                  setStep('details');
                  setErrorMsg(null);
                  setStatusMessage(null);
                }}
                className="vaango-link-btn text-xs vaango-otp-change-btn"
              >
                Edit Details
              </button>
            </div>

            <FormField
              id="reg-otp-input"
              label="Enter Verification Code"
              hint="Enter the 6-digit code sent to your email to activate your account"
              required
            >
              <OtpInput
                value={otpCode}
                onChange={setOtpCode}
                length={6}
                disabled={isSubmitting}
                hasError={Boolean(errorMsg)}
                autoFocus
                onComplete={(completedCode) => handleVerifyOtp(completedCode)}
              />
            </FormField>

            {isSupabaseLive && (
              <div className="vaango-auth-info-banner" style={{ marginTop: 'var(--space-3)' }}>
                <Info size={15} className="vaango-auth-info-icon" />
                <span>
                  Not receiving your code? Supabase development email is limited to 3/hour. Check your spam folder, or use code 123456 in local preview mode.
                </span>
              </div>
            )}

            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              disabled={otpCode.length !== 6 || isSubmitting}
              isLoading={isSubmitting}
              onClick={() => handleVerifyOtp()}
            >
              Verify & Complete Registration
            </Button>

            <div className="vaango-otp-resend-row">
              {cooldown > 0 ? (
                <span className="vaango-otp-cooldown-text">
                  Resend code in <strong>{cooldown}s</strong>
                </span>
              ) : (
                <button
                  type="button"
                  className="vaango-link-btn vaango-otp-resend-btn"
                  disabled={isSubmitting}
                  onClick={handleResend}
                >
                  Resend code
                </button>
              )}
            </div>
          </div>
        )}

        <div className="vaango-auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="vaango-auth-link">
              Sign in
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
};
