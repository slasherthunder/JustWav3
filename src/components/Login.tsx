import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate, Link } from 'react-router-dom';
import { IconPasswordSelector } from './IconPasswordSelector';
import './Auth.css';
import { FirebaseError } from 'firebase/app';

// Convert icon array to password string with email for uniqueness
function iconsToPassword(icons: string[], email: string): string {
  // Combine icons with email prefix to ensure uniqueness
  const emailPrefix = email.split('@')[0] || '';
  // Create password: emailPrefix-icon1-icon2-icon3
  return `${emailPrefix}-${icons.join('-')}`;
}


export function Login() {
  const [email, setEmail] = useState('');
  const [emailPrefix, setEmailPrefix] = useState('');
  const [passwordIcons, setPasswordIcons] = useState<string[]>([]);
  const [normalPassword, setNormalPassword] = useState('');
  const [useNormalPassword, setUseNormalPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  const { login } = useAuth();
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
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!useNormalPassword && passwordIcons.length < 3) {
      return setError('Please choose your 3 password icons! 🌟');
    }

    if (useNormalPassword && !normalPassword) {
      return setError('Please enter your password! 🔒');
    }

    if (!email || !email.includes('@')) {
      return setError('Please enter your email! 📧');
    }

    try {
      setError('');
      setLoading(true);
      // Use normal password or convert icons to password string
      const password = useNormalPassword ? normalPassword : iconsToPassword(passwordIcons, email);
      await login(email, password);
      setNavigating(true);
      navigate('/home');
    } catch (err: unknown) {
      if (err instanceof FirebaseError) {
        if (err.code === 'auth/user-not-found') {
          setError('Email not found. Please sign up first! 📧');
        } else if (err.code === 'auth/wrong-password') {
          setError(useNormalPassword ? 'Wrong password. Try again! 💪' : 'Wrong password icons. Try again! 💪');
        } else if (err.code === 'auth/invalid-email') {
          setError('Please enter a valid email! 📧');
        } else {
          setError('Try again, you got this! 💪');
        }
      } else {
        setError('Try again, you got this! 💪');
      }
      if (!useNormalPassword) {
        setPasswordIcons([]);
      } else {
        setNormalPassword('');
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
      <a href="#login-form" className="skip-link">
        Skip to login form
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
          animate={{ rotate: [0, 10, -10, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
          👋
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
          Welcome Back! 👋
        </motion.h2>
        
        <motion.p
          className="friendly-subtitle"
          variants={itemVariants}
        >
          Let's go in together!
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

        <form id="login-form" onSubmit={handleSubmit} aria-label="Login form">
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

          <motion.div variants={itemVariants}>
            <div className="password-mode-toggle">
              <button
                type="button"
                className={`password-mode-button ${!useNormalPassword ? 'active' : ''}`}
                onClick={() => {
                  setUseNormalPassword(false);
                  setNormalPassword('');
                  setError('');
                }}
                aria-label="Use icon password"
              >
                🎨 Icon Password
              </button>
              <button
                type="button"
                className={`password-mode-button ${useNormalPassword ? 'active' : ''}`}
                onClick={() => {
                  setUseNormalPassword(true);
                  setPasswordIcons([]);
                  setError('');
                }}
                aria-label="Use normal password"
              >
                🔒 Normal Password
              </button>
            </div>

            {!useNormalPassword ? (
              <>
                <IconPasswordSelector
                  selectedIcons={passwordIcons}
                  onIconSelect={(icon) => {
                    if (passwordIcons.length < 3) {
                      setPasswordIcons([...passwordIcons, icon]);
                    }
                  }}
                  maxIcons={3}
                  label="Enter Your Password"
                />
                {passwordIcons.length > 0 && (
                  <motion.button
                    type="button"
                    className="clear-icons-button"
                    onClick={() => setPasswordIcons([])}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Clear and Start Over 🔄
                  </motion.button>
                )}
              </>
            ) : (
              <div className="form-group child-friendly-group">
                <label htmlFor="normal-password" className="label-with-icon">
                  <span className="label-icon">🔒</span>
                  Enter Your Password
                </label>
                <div className="input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="normal-password"
                    value={normalPassword}
                    onChange={(e) => setNormalPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="form-group input"
                    aria-label="Password input"
                  />
                  <button
                    type="button"
                    className="password-toggle-button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>

          <motion.button
            type="submit"
            disabled={loading || !email || (!useNormalPassword && passwordIcons.length < 3) || (useNormalPassword && !normalPassword)}
            className="auth-button child-friendly-button"
            aria-busy={loading}
            aria-label={loading ? 'Logging in, please wait' : 'Go in to your account'}
            variants={itemVariants}
            whileHover={{ scale: loading ? 1 : 1.05 }}
            whileTap={{ scale: loading ? 1 : 0.95 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            {loading ? (
              <>
                <span>Loading...</span>
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
                <span>Go In</span>
                <span style={{ marginLeft: '8px' }}>➡️</span>
              </>
            )}
          </motion.button>
        </form>

        <motion.p
          className="auth-switch friendly-switch"
          variants={itemVariants}
        >
          New here?{' '}
          <Link to="/signup" aria-label="Go to sign up page" className="friendly-link">
            Start Here
          </Link>
        </motion.p>

        <motion.p className="help-text" variants={itemVariants}>
          <Link to="/signup" className="help-link">
            Need help? 💡
          </Link>
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
