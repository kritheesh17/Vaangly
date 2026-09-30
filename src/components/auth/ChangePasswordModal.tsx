import React, { useState } from 'react';
import { Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import './ChangePasswordModal.css';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const { updatePassword } = useAuth();
  const { success, error: toastError } = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanPassword = password.trim();
    const cleanConfirm = confirmPassword.trim();

    if (!cleanPassword) {
      setErrorMsg('Please enter a new password.');
      return;
    }

    if (cleanPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (cleanPassword !== cleanConfirm) {
      setErrorMsg('Passwords do not match. Please verify both fields.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await updatePassword(cleanPassword);
      if (res.success) {
        setSuccessMsg('Your password has been updated successfully!');
        success('Password updated successfully.');
        setTimeout(() => {
          handleClose();
        }, 1200);
      } else {
        setErrorMsg(res.error || 'Failed to update password. Please try again.');
        toastError(res.error || 'Password update failed.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setErrorMsg(msg);
      toastError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Change Password"
      description="Enter a new secure password for your account."
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="vaango-pwd-form" noValidate>
        {errorMsg && (
          <div className="vaango-pwd-alert vaango-pwd-alert--error" role="alert">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="vaango-pwd-alert vaango-pwd-alert--success" role="status">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="vaango-pwd-field">
          <label htmlFor="new-password-input" className="vaango-pwd-label">
            New Password
          </label>
          <div className="vaango-pwd-input-wrap">
            <input
              id="new-password-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              disabled={isLoading || Boolean(successMsg)}
              autoComplete="new-password"
              className="vaango-pwd-input"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="vaango-pwd-toggle-btn"
              aria-label={showPassword ? 'Hide new password' : 'Show new password'}
              tabIndex={0}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="vaango-pwd-field">
          <label htmlFor="confirm-password-input" className="vaango-pwd-label">
            Confirm New Password
          </label>
          <div className="vaango-pwd-input-wrap">
            <input
              id="confirm-password-input"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              disabled={isLoading || Boolean(successMsg)}
              autoComplete="new-password"
              className="vaango-pwd-input"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="vaango-pwd-toggle-btn"
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              tabIndex={0}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="vaango-pwd-actions">
          <Button
            type="button"
            variant="outline"
            size="md"
            className="vaango-pwd-btn"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="vaango-pwd-btn"
            isLoading={isLoading}
            disabled={Boolean(successMsg)}
          >
            Update Password
          </Button>
        </div>
      </form>
    </Modal>
  );
};
