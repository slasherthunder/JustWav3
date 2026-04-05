import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { FirebaseError } from 'firebase/app';
import './EmailVerificationBanner.css';
import { MailIcon } from './MailIcon';

export function EmailVerificationBanner() {
  const { currentUser, sendVerificationEmail } = useAuth();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Don't show banner if email is already verified
  if (!currentUser || currentUser.emailVerified) {
    return null;
  }

  async function handleResendEmail() {
    setSending(true);
    setMessage(null);
    setError(null);

    try {
      console.log('Attempting to resend verification email...');
      await sendVerificationEmail();
      console.log('Verification email sent successfully');
      setMessage('Verification email sent! Please check your inbox (and spam folder).');
      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      console.error('Error resending verification email:', err);
      if (err instanceof FirebaseError) {
        console.error('Firebase error code:', err.code);
        console.error('Firebase error message:', err.message);
        if (err.code === 'auth/too-many-requests') {
          setError('Too many requests. Please wait a few minutes before trying again.');
        } else if (err.code === 'auth/user-not-found') {
          setError('User not found. Please log out and sign up again.');
        } else {
          setError(`Failed to send: ${err.message}. Check console for details.`);
        }
      } else if (err instanceof Error) {
        console.error('Error message:', err.message);
        setError(`Failed: ${err.message}. Check console for details.`);
      } else {
        setError('Failed to send verification email. Please check console for details.');
      }
      setTimeout(() => setError(null), 8000);
    } finally {
      setSending(false);
    }
  }

  return (
    <motion.div
      className="email-verification-banner"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="verification-content">
        <div className="verification-icon" aria-hidden="true">
          <MailIcon size={40} />
        </div>
        <div className="verification-text">
          <h4>Please verify your email address</h4>
          <p>
            We've sent a verification link to <strong>{currentUser.email}</strong>.
            Please check your inbox and click the link to verify your account.
          </p>
          {message && <p className="verification-success">{message}</p>}
          {error && <p className="verification-error">{error}</p>}
        </div>
        <button
          onClick={handleResendEmail}
          disabled={sending}
          className="resend-verification-button"
          aria-label="Resend verification email"
        >
          {sending ? 'Sending...' : 'Resend Email'}
        </button>
      </div>
    </motion.div>
  );
}

