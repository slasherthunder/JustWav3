import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate, Link } from 'react-router-dom';
import { IconPasswordSelector } from './IconPasswordSelector';
import './Auth.css';
import { FirebaseError } from 'firebase/app';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';

// Convert icon array to password string with email for uniqueness
function iconsToPassword(icons: string[], email: string): string {
  // Combine icons with email prefix to ensure uniqueness
  const emailPrefix = email.split('@')[0] || '';
  // Create a unique password: emailPrefix-icon1-icon2-icon3
  return `${emailPrefix}-${icons.join('-')}`;
}


export function Signup() {
  const [email, setEmail] = useState('');
  const [emailPrefix, setEmailPrefix] = useState('');
  const [passwordIcons, setPasswordIcons] = useState<string[]>([]);
  const [confirmPasswordIcons, setConfirmPasswordIcons] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<'parent' | 'student' | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  const [passwordUnique, setPasswordUnique] = useState<boolean | null>(null);
  const { signup, login } = useAuth();
  const { setNavigating } = useNavigation();
  const navigate = useNavigate();

  function handleGmailClick() {
    if (emailPrefix) {
      setEmail(`${emailPrefix}@gmail.com`);
      setEmailValid(true);
    } else {
      setEmail('@gmail.com');
    }
  }

  function handleEmailPrefixChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setEmailPrefix(value);
    if (value && email.includes('@gmail.com')) {
      setEmail(`${value}@gmail.com`);
    }
    if (value.length > 0) {
      setEmailValid(value.length > 0);
    } else {
      setEmailValid(null);
    }
    // Reset password uniqueness when email changes
    setPasswordUnique(null);
  }

  // Check password uniqueness when icons or email change
  function checkPasswordUniqueness(icons: string[], email: string) {
    if (icons.length === 3 && email && email.includes('@')) {
      // Password is unique because it includes email prefix
      setPasswordUnique(true);
    } else {
      setPasswordUnique(null);
    }
  }

  function handlePasswordIconsChange(icons: string[]) {
    setPasswordIcons(icons);
    checkPasswordUniqueness(icons, email);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (passwordIcons.length < 3) {
      return setError('Please choose 3 icons for your password! 🌟');
    }

    if (passwordIcons.join('-') !== confirmPasswordIcons.join('-')) {
      return setError("Icons don't match. Try again! 💪");
    }

    if (!email || !email.includes('@')) {
      return setError('Please enter your email! 📧');
    }

    if (!userRole) {
      return setError('Please choose if you are a parent or student! 👨‍👩‍👧‍👦');
    }

    // Allow any icon selection as long as both entries match

    try {
      setError('');
      setLoading(true);
      // Convert icons to password string with email for uniqueness
      const password = iconsToPassword(passwordIcons, email);
      await signup(email, password, userRole);
      setNavigating(true);
      navigate('/');
    } catch (err: unknown) {
      if (err instanceof FirebaseError) {
        if (err.code === 'auth/email-already-in-use') {
          try {
            const password = iconsToPassword(passwordIcons, email);
            await login(email, password);
            if (auth.currentUser && userRole) {
              await setDoc(doc(db, 'users', auth.currentUser.uid), {
                email: auth.currentUser.email,
                role: userRole,
                createdAt: new Date().toISOString(),
              }, { merge: true });
            }
            setNavigating(true);
            navigate('/');
            return;
          } catch {
            setError('Account exists. Try logging in with your icons.');
          }
        } else if (err.code === 'auth/weak-password') {
          setError('Please choose a stronger password with different icons! 🔒');
        } else if (err.code === 'permission-denied') {
          setError('Sign up blocked by database rules. Please contact support.');
        } else if (err.code === 'unavailable' || err.code === 'deadline-exceeded') {
          setError('Network hiccup during sign up. Please try again.');
        } else {
          setError('Oops! Try again, you got this! 💪');
        }
      } else {
        setError('Oops! Try again, you got this! 💪');
      }
    } finally {
      setLoading(false);
    }
  }

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <motion.div
      className="auth-container child-friendly"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <a href="#signup-form" className="skip-link">
        Skip to signup form
      </a>

      {/* Friendly Mascot */}
      <motion.div
        className="mascot"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
      >
        <motion.span
          style={{ fontSize: '80px', display: 'block' }}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
        >
          🎉
        </motion.span>
      </motion.div>

      <motion.div
        className="auth-card child-friendly-card"
        variants={itemVariants}
      >
        <motion.h2
          variants={itemVariants}
          className="friendly-header"
        >
          Let's Get Started! 🚀
        </motion.h2>
        
        <motion.p
          className="friendly-subtitle"
          variants={itemVariants}
        >
          Join us to create learning that fits your needs!
        </motion.p>

        <AnimatePresence>
          {error && (
            <motion.div
              className="error-message friendly-error"
              role="alert"
              aria-live="assertive"
              initial={{ opacity: 0, x: -20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <span className="error-icon">❌</span>
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <form id="signup-form" onSubmit={handleSubmit} aria-label="Sign up form">
          <motion.div className="form-group child-friendly-group" variants={itemVariants}>
            <label htmlFor="email-prefix" className="label-with-icon">
              <span className="label-icon">📧</span>
              <span>Your Email</span>
            </label>
            <div className="email-input-group">
              <motion.input
                type="text"
                id="email-prefix"
                name="email-prefix"
                value={emailPrefix}
                onChange={handleEmailPrefixChange}
                required
                placeholder="Type your name here"
                className={emailValid === true ? 'input-valid' : emailValid === false ? 'input-invalid' : ''}
                whileFocus={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 400 }}
                style={{ flex: 1 }}
              />
              <motion.button
                type="button"
                className="gmail-button"
                onClick={handleGmailClick}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Add @gmail.com to email"
              >
                @gmail.com
              </motion.button>
            </div>
            {email && (
              <motion.div
                className="email-preview"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span className="email-preview-label">Your email:</span>
                <span className="email-preview-value">{email}</span>
                {emailValid && (
                  <motion.span
                    className="email-check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  >
                    ✅
                  </motion.span>
                )}
              </motion.div>
            )}
          </motion.div>

          <motion.div className="form-group child-friendly-group" variants={itemVariants}>
            <label className="label-with-icon">
              <span className="label-icon">👨‍👩‍👧‍👦</span>
              <span>Who are you?</span>
            </label>
            <div className="role-selection">
              <motion.button
                type="button"
                className={`role-button ${userRole === 'parent' ? 'selected' : ''}`}
                onClick={() => setUserRole('parent')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="I am a parent"
              >
                <span className="role-icon">👨‍👩‍👧‍👦</span>
                <span className="role-text">Parent</span>
                {userRole === 'parent' && (
                  <motion.span
                    className="role-check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  >
                    ✅
                  </motion.span>
                )}
              </motion.button>
              <motion.button
                type="button"
                className={`role-button ${userRole === 'student' ? 'selected' : ''}`}
                onClick={() => setUserRole('student')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="I am a student"
              >
                <span className="role-icon">🎓</span>
                <span className="role-text">Student</span>
                {userRole === 'student' && (
                  <motion.span
                    className="role-check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  >
                    ✅
                  </motion.span>
                )}
              </motion.button>
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            <IconPasswordSelector
              selectedIcons={passwordIcons}
              onIconSelect={(icon) => {
                if (passwordIcons.length < 3) {
                  const newIcons = [...passwordIcons, icon];
                  handlePasswordIconsChange(newIcons);
                }
              }}
              maxIcons={3}
              label="Create Your Password"
            />
            {passwordUnique && (
              <motion.div
                className="password-unique-badge"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <span className="unique-icon">🔒</span>
                <span>Your password is unique and secure!</span>
              </motion.div>
            )}
            {passwordIcons.length > 0 && (
              <motion.button
                type="button"
                className="clear-icons-button"
                onClick={() => {
                  setPasswordIcons([]);
                  setPasswordUnique(null);
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Clear and Start Over 🔄
              </motion.button>
            )}
          </motion.div>

          <motion.div variants={itemVariants}>
            <IconPasswordSelector
              selectedIcons={confirmPasswordIcons}
              onIconSelect={(icon) => {
                if (confirmPasswordIcons.length < 3) {
                  setConfirmPasswordIcons([...confirmPasswordIcons, icon]);
                }
              }}
              maxIcons={3}
              label="Type Your Password Again"
            />
            {confirmPasswordIcons.length > 0 && (
              <motion.button
                type="button"
                className="clear-icons-button"
                onClick={() => setConfirmPasswordIcons([])}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Clear and Start Over 🔄
              </motion.button>
            )}
            {passwordIcons.length === 3 && confirmPasswordIcons.length === 3 && (
              <motion.div
                className="password-match-check"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {passwordIcons.join('-') === confirmPasswordIcons.join('-') ? (
                  <span className="match-success">✅ Passwords match! Great job!</span>
                ) : (
                  <span className="match-error">❌ Icons don't match. Try again!</span>
                )}
              </motion.div>
            )}
          </motion.div>

          <motion.button
            type="submit"
            disabled={loading || !email || passwordIcons.length < 3 || confirmPasswordIcons.length < 3 || passwordIcons.join('-') !== confirmPasswordIcons.join('-')}
            className="auth-button child-friendly-button"
            aria-busy={loading}
            aria-label={loading ? 'Creating account, please wait' : 'Create your account'}
            variants={itemVariants}
            whileHover={{ scale: loading ? 1 : 1.05 }}
            whileTap={{ scale: loading ? 1 : 0.95 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            {loading ? (
              <>
                <span>Creating...</span>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  style={{ display: 'inline-block', marginLeft: '8px' }}
                >
                  ⏳
                </motion.span>
              </>
            ) : (
              <>
                <span>Start Here</span>
                <span style={{ marginLeft: '8px' }}>🎯</span>
              </>
            )}
          </motion.button>
        </form>

        <motion.p
          className="auth-switch friendly-switch"
          variants={itemVariants}
        >
          Already have an account?{' '}
          <Link to="/login" aria-label="Go to login page" className="friendly-link">
            Go In
          </Link>
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
