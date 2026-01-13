import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate, Link } from 'react-router-dom';
import { IconPasswordSelector } from './IconPasswordSelector';
import './Auth.css';
import { FirebaseError } from 'firebase/app';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { validateSignupInput } from '../utils/validation';

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
  const [normalPassword, setNormalPassword] = useState('');
  const [confirmNormalPassword, setConfirmNormalPassword] = useState('');
  const [useNormalPassword, setUseNormalPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [userRole, setUserRole] = useState<'parent' | 'student' | 'teacher' | null>(null);
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

    setError('');
    setLoading(true);
    
    // Prepare data for validation
    const signupData = {
      email,
      password: useNormalPassword ? normalPassword : undefined,
      passwordIcons: !useNormalPassword ? passwordIcons : undefined,
      confirmPassword: useNormalPassword ? confirmNormalPassword : undefined,
      confirmPasswordIcons: !useNormalPassword ? confirmPasswordIcons : undefined,
      role: userRole,
      useNormalPassword,
    };

    // Validate and sanitize input
    const validation = validateSignupInput(signupData);
    
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
    
    // Extract password from validated data
    let passwordToUse = '';
    if (validatedData.useNormalPassword) {
      passwordToUse = validatedData.password || '';
    } else {
      passwordToUse = iconsToPassword(validatedData.passwordIcons || [], validatedData.email);
    }

    try {
      await signup(validatedData.email, passwordToUse, validatedData.role);
      // Show success message about email verification
      setError('');
      setLoading(false);
      // Don't navigate immediately - show verification message
      const verificationMessage = `✅ Account created successfully!\n\nPlease check your email (${validatedData.email}) to verify your account.\n\n📧 We've sent a verification link to your inbox.\n\n⚠️ If you don't see it, please check your spam/junk folder.\n\nYou can also resend the verification email from your home page.`;
      alert(verificationMessage);
      setNavigating(true);
      navigate('/home');
    } catch (err: unknown) {
      if (err instanceof FirebaseError) {
        if (err.code === 'auth/email-already-in-use') {
          try {
            await login(validatedData.email, passwordToUse);
            if (auth.currentUser && validatedData.role) {
              await setDoc(doc(db, 'users', auth.currentUser.uid), {
                email: auth.currentUser.email,
                role: validatedData.role,
                createdAt: new Date().toISOString(),
              }, { merge: true });
            }
            setNavigating(true);
            navigate('/home');
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

  return (
    <div className="auth-container child-friendly">
      <a href="#signup-form" className="skip-link">
        Skip to signup form
      </a>

      <Link to="/" className="back-to-main-button">
        ← Back to Main
      </Link>

      <div className="mascot">
        <span style={{ fontSize: '80px', display: 'block' }}>
          🎉
        </span>
      </div>

      <div className="auth-card child-friendly-card">
        <h2 className="friendly-header">
          Let's Get Started! 🚀
        </h2>
        
        <p className="friendly-subtitle">
          Join us to create learning that fits your needs!
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

        <form id="signup-form" onSubmit={handleSubmit} aria-label="Sign up form">
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

          <div className="form-group child-friendly-group">
            <label className="label-with-icon">
              <span className="label-icon">👨‍👩‍👧‍👦</span>
              <span>Who are you?</span>
            </label>
            <div className="role-selection">
              <button
                type="button"
                className={`role-button ${userRole === 'parent' ? 'selected' : ''}`}
                onClick={() => setUserRole('parent')}
                aria-label="I am a parent"
              >
                <span className="role-icon">👨‍👩‍👧‍👦</span>
                <span className="role-text">Parent</span>
              </button>
              <button
                type="button"
                className={`role-button ${userRole === 'student' ? 'selected' : ''}`}
                onClick={() => setUserRole('student')}
                aria-label="I am a student"
              >
                <span className="role-icon">🎓</span>
                <span className="role-text">Student</span>
              </button>
              <button
                type="button"
                className={`role-button ${userRole === 'teacher' ? 'selected' : ''}`}
                onClick={() => setUserRole('teacher')}
                aria-label="I am a teacher"
              >
                <span className="role-icon">👩‍🏫</span>
                <span className="role-text">Teacher</span>
              </button>
            </div>
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
                  setConfirmNormalPassword('');
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
                  setConfirmPasswordIcons([]);
                  setPasswordUnique(null);
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
                    if (passwordIcons.includes(icon)) {
                      const newIcons = passwordIcons.filter(i => i !== icon);
                      handlePasswordIconsChange(newIcons);
                    } else if (passwordIcons.length < 3) {
                      const newIcons = [...passwordIcons, icon];
                      handlePasswordIconsChange(newIcons);
                    }
                  }}
                  maxIcons={3}
                  label="Create Your Password"
                />
                {passwordUnique && (
                  <div className="password-unique-badge">
                    <span className="unique-icon">🔒</span>
                    <span>Your password is unique and secure!</span>
                  </div>
                )}
                {passwordIcons.length > 0 && (
                  <button
                    type="button"
                    className="clear-icons-button"
                    onClick={() => {
                      setPasswordIcons([]);
                      setPasswordUnique(null);
                    }}
                  >
                    Clear and Start Over 🔄
                  </button>
                )}
              </>
            ) : (
              <div className="form-group child-friendly-group">
                <label htmlFor="normal-password">
                  Create Your Password
                </label>
                <div className="input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="normal-password"
                    value={normalPassword}
                    onChange={(e) => setNormalPassword(e.target.value)}
                    placeholder="Enter your password (min 6 characters)"
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

          <div>
            {!useNormalPassword ? (
              <>
                <IconPasswordSelector
                  selectedIcons={confirmPasswordIcons}
                  onIconSelect={(icon) => {
                    if (confirmPasswordIcons.includes(icon)) {
                      setConfirmPasswordIcons(confirmPasswordIcons.filter(i => i !== icon));
                    } else if (confirmPasswordIcons.length < 3) {
                      setConfirmPasswordIcons([...confirmPasswordIcons, icon]);
                    }
                  }}
                  maxIcons={3}
                  label="Type Your Password Again"
                />
                {confirmPasswordIcons.length > 0 && (
                  <button
                    type="button"
                    className="clear-icons-button"
                    onClick={() => setConfirmPasswordIcons([])}
                  >
                    Clear and Start Over 🔄
                  </button>
                )}
                {passwordIcons.length === 3 && confirmPasswordIcons.length === 3 && (
                  <div className="password-match-check">
                    {passwordIcons.join('-') === confirmPasswordIcons.join('-') ? (
                      <span className="match-success">✅ Passwords match! Great job!</span>
                    ) : (
                      <span className="match-error">❌ Icons don't match. Try again!</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="form-group child-friendly-group">
                  <label htmlFor="confirm-normal-password">
                    Type Your Password Again
                  </label>
                  <div className="input-wrapper">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      id="confirm-normal-password"
                      value={confirmNormalPassword}
                      onChange={(e) => setConfirmNormalPassword(e.target.value)}
                      placeholder="Confirm your password"
                      className="form-group input"
                      aria-label="Confirm password input"
                    />
                    <button
                      type="button"
                      className="password-toggle-button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                {normalPassword && confirmNormalPassword && (
                  <div className="password-match-check">
                    {normalPassword === confirmNormalPassword ? (
                      <span className="match-success">✅ Passwords match! Great job!</span>
                    ) : (
                      <span className="match-error">❌ Passwords don't match. Try again!</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={
              loading || 
              !email || 
              !userRole ||
              (!useNormalPassword && (passwordIcons.length < 3 || confirmPasswordIcons.length < 3 || passwordIcons.join('-') !== confirmPasswordIcons.join('-'))) ||
              (useNormalPassword && (!normalPassword || normalPassword.length < 6 || normalPassword !== confirmNormalPassword))
            }
            className="auth-button child-friendly-button"
            aria-busy={loading}
            aria-label={loading ? 'Creating account, please wait' : 'Create your account'}
          >
            {loading ? (
              <>
                <span>Creating...</span>
                <span style={{ display: 'inline-block', marginLeft: '8px' }}>
                  ⏳
                </span>
              </>
            ) : (
              <>
                <span>Start Here</span>
                <span style={{ marginLeft: '8px' }}>🎯</span>
              </>
            )}
          </button>
        </form>

        <p className="auth-switch friendly-switch">
          Already have an account?{' '}
          <Link to="/login" aria-label="Go to login page" className="friendly-link">
            Go In
          </Link>
        </p>
      </div>
    </div>
  );
}
