import { useState } from 'react';
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
            className="error-message friendly-error"
            role="alert"
            aria-live="assertive"
          >
            <span className="error-icon">❌</span>
            {error}
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
            {email && (
              <div className="email-preview">
                <span className="email-preview-label">Your email:</span>
                <span className="email-preview-value">{email}</span>
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
                    if (passwordIcons.length < 3) {
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
                    onClick={() => setPasswordIcons([])}
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
                <span style={{ display: 'inline-block', marginLeft: '8px' }}>
                  ⏳
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
