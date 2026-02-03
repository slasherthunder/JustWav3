import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate, Link } from 'react-router-dom';
import { IconPasswordSelector } from './IconPasswordSelector';
import './Auth.css';
import { FirebaseError } from 'firebase/app';
import { validateLoginInput } from '../utils/validation';

// Convert icon array to password string with email for uniqueness
function iconsToPassword(icons: string[], email: string): string {
  // Normalize email: lowercase and trim to ensure consistency
  const normalizedEmail = email.trim().toLowerCase();
  // Combine icons with email prefix to ensure uniqueness
  const emailPrefix = normalizedEmail.split('@')[0] || '';
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
  
  // "Did You Forget?" buffer - track failed attempts
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showShake, setShowShake] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  
  // Refs for focus management
  const emailInputRef = useRef<HTMLInputElement>(null);
  
  const { login } = useAuth();
  const { setNavigating } = useNavigation();
  const navigate = useNavigate();
  
  // Load persistent user preference from localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem('preferred_auth_mode');
    if (savedMode === 'icons') {
      setUseNormalPassword(false);
    } else if (savedMode === 'text') {
      setUseNormalPassword(true);
    }
  }, []);
  
  // Save preference when it changes
  useEffect(() => {
    localStorage.setItem('preferred_auth_mode', useNormalPassword ? 'text' : 'icons');
  }, [useNormalPassword]);

  function handleGmailClick() {
    if (!emailPrefix) {
      setError("Type your name first! ✏️");
      emailInputRef.current?.focus();
      return;
    }
    setEmail(`${emailPrefix}@gmail.com`);
    setEmailValid(true);
  }

  function handleEmailPrefixChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Remove spaces and special characters that Firebase/Emails don't like
    const sanitizedValue = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
    setEmailPrefix(sanitizedValue);
    if (sanitizedValue && email.includes('@gmail.com')) {
      setEmail(`${sanitizedValue}@gmail.com`);
    }
    if (sanitizedValue.length > 0) {
      setEmailValid(sanitizedValue.length > 0);
    } else {
      setEmailValid(null);
    }
    // Clear error when user starts typing
    if (error) setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    setError('');
    setLoading(true);

    // Prepare data for validation
    const loginData = {
      email,
      password: useNormalPassword ? normalPassword : undefined,
      passwordIcons: !useNormalPassword ? passwordIcons : undefined,
      useNormalPassword,
    };

    // Validate and sanitize input
    const validation = validateLoginInput(loginData);
    
    if (!validation.success) {
      setLoading(false);
      const errorMessage = validation.errorMessages?.join('. ') || 'Please check your input and try again.';
      return setError(`${errorMessage} 💪`);
    }

    if (!validation.data) {
      setLoading(false);
      return setError('Validation failed. Please try again. 💪');
    }

    const validatedData = validation.data;

    try {
      // Use normal password or convert icons to password string
      const password = validatedData.useNormalPassword 
        ? (validatedData.password || '') 
        : iconsToPassword(validatedData.passwordIcons || [], validatedData.email);
      await login(validatedData.email, password);
      setNavigating(true);
      navigate('/home');
    } catch (err: unknown) {
      if (err instanceof FirebaseError) {
        if (err.code === 'auth/user-not-found') {
          setError('Email not found. Maybe a typo in your name? Please check and try again! 📧');
        } else if (err.code === 'auth/wrong-password') {
          const newFailedAttempts = failedAttempts + 1;
          setFailedAttempts(newFailedAttempts);
          
          // Trigger shake animation
          setShowShake(true);
          setTimeout(() => setShowShake(false), 500);
          
          // Show gentle hints based on attempt count
          if (newFailedAttempts === 1) {
            setError(useNormalPassword 
              ? 'Wrong password. Try again! 💪' 
              : 'Wrong password icons. Try different icons! 💪');
          } else if (newFailedAttempts === 2) {
            setError(useNormalPassword
              ? 'Still not right. Double-check your password! 💪'
              : 'Still not right. Remember the order of your icons! 💪');
          } else if (newFailedAttempts >= 3) {
            setError(useNormalPassword
              ? 'Having trouble? Ask a parent or teacher for help! 💪'
              : 'Having trouble? Remember the 3 icons you picked when you signed up! 💪');
            setShowForgotHelp(true);
          }
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

  return (
    <div className="auth-container child-friendly">
      <a href="#login-form" className="skip-link">
        Skip to login form
      </a>
      
      <Link to="/" className="back-to-main-button">
        ← Back to Main
      </Link>
      
      <div className="mascot">
        <span style={{ fontSize: '80px', display: 'block' }}>
          👋
        </span>
      </div>

      <div className="auth-card child-friendly-card">
        <h2 className="friendly-header">
          Welcome Back! 👋
        </h2>
        
        <p className="friendly-subtitle">
          Let's go in together!
        </p>

        {error && (
          <div
            className={`error-message friendly-error ${showShake ? 'shake' : ''}`}
            role="alert"
            aria-live="assertive"
          >
            <span className="error-icon">❌</span>
            {error}
          </div>
        )}
        
        {showForgotHelp && (
          <div className="forgot-help-card">
            <p className="forgot-help-title">Need a reminder? 🤔</p>
            <p className="forgot-help-text">
              Ask a parent or teacher to help you reset your password. They can help you remember your icons!
            </p>
            <button
              type="button"
              className="forgot-help-button"
              onClick={() => {
                setShowForgotHelp(false);
                setFailedAttempts(0);
              }}
            >
              Got it! 👍
            </button>
          </div>
        )}

        <form id="login-form" onSubmit={handleSubmit} aria-label="Login form">
          <div className="form-group child-friendly-group">
            <label htmlFor="email-prefix" className="label-with-icon">
              <span className="label-icon">📧</span>
              <span>Your Email</span>
            </label>
            <div className="email-input-group">
              <input
                ref={emailInputRef}
                type="text"
                id="email-prefix"
                name="email-prefix"
                value={emailPrefix}
                onChange={handleEmailPrefixChange}
                required
                placeholder="Type your name here"
                className={emailValid === true ? 'input-valid' : emailValid === false ? 'input-invalid' : ''}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="gmail-button"
                onClick={handleGmailClick}
                aria-label="Add @gmail.com to email"
              >
                @gmail.com
              </button>
            </div>
            {emailPrefix && (
              <div className="email-id-card">
                <div className="id-card-header">
                  <span className="id-card-icon">🆔</span>
                  <span className="id-card-title">Your Login ID</span>
                </div>
                <div className="id-card-content">
                  <div className="id-card-field">
                    <span className="id-card-label">Name:</span>
                    <span className="id-card-value">{emailPrefix}</span>
                  </div>
                  <div className="id-card-field">
                    <span className="id-card-label">Email:</span>
                    <span className="id-card-value">{email}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="form-group child-friendly-group">
              <label className="label-with-icon" style={{ justifyContent: 'center' }}>
                <span>Please choose only one type of password:</span>
              </label>
            </div>
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
                Normal Password
              </button>
            </div>

            {!useNormalPassword ? (
              <>
                <IconPasswordSelector
                  selectedIcons={passwordIcons}
                  onIconSelect={(icon) => {
                    // Smart selection: allow deselecting by clicking again
                    if (passwordIcons.includes(icon)) {
                      setPasswordIcons(passwordIcons.filter(i => i !== icon));
                    } else if (passwordIcons.length < 3) {
                      setPasswordIcons([...passwordIcons, icon]);
                    }
                  }}
                  maxIcons={3}
                  label="Enter Your Password"
                />
                {passwordIcons.length > 0 && (
                  <button
                    type="button"
                    className="clear-icons-button"
                    onClick={() => {
                      setPasswordIcons([]);
                      // Focus management: move focus to first icon button after clearing
                      setTimeout(() => {
                        const firstButton = document.querySelector('.icon-button:not(.disabled)') as HTMLButtonElement;
                        firstButton?.focus();
                      }, 100);
                    }}
                  >
                    Clear and Start Over 🔄
                  </button>
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
          </div>

          <button
            type="submit"
            disabled={loading || !email || (!useNormalPassword && passwordIcons.length < 3) || (useNormalPassword && !normalPassword)}
            className="auth-button child-friendly-button"
            aria-busy={loading}
            aria-label={loading ? 'Logging in, please wait' : 'Go in to your account'}
          >
            {loading ? (
              <>
                <span>Loading...</span>
                <span className="loading-mascot" style={{ display: 'inline-block', marginLeft: '8px' }}>
                  🏃
                </span>
              </>
            ) : (
              <>
                <span>Go In</span>
                <span style={{ marginLeft: '8px' }}>➡️</span>
              </>
            )}
          </button>
        </form>

        <p className="auth-switch friendly-switch">
          New here?{' '}
          <Link to="/signup" aria-label="Go to sign up page" className="friendly-link">
            Start Here
          </Link>
        </p>

        <p className="help-text">
          <Link to="/signup" className="help-link">
            Need help? 💡
          </Link>
        </p>
      </div>
    </div>
  );
}
