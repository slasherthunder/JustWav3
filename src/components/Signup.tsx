import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate, Link } from 'react-router-dom';
import { IconPasswordSelector } from './IconPasswordSelector';
import '../pages/Landing.css';
import './Auth.css';
import { MailIcon } from './MailIcon';
import { IconFeatureImage } from './IconFeatureImage';
import { FirebaseError } from 'firebase/app';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { validateSignupInput } from '../utils/validation';
import teacherProfileImage from '../assets/images/teacherprofile.png';
import parentProfileImage from '../assets/images/parentprofile.png';
import studentProfileImage from '../assets/images/studentprofile.png';
import logoImage from '../assets/images/logo.png';

// Convert icon array to password string with email for uniqueness
function iconsToPassword(icons: string[], email: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  const emailPrefix = normalizedEmail.split('@')[0] || '';
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

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  const { signup, login } = useAuth();
  const { setNavigating } = useNavigation();
  const navigate = useNavigate();

  const submitDisabled =
    loading ||
    !email ||
    !userRole ||
    (!useNormalPassword &&
      (passwordIcons.length < 3 ||
        confirmPasswordIcons.length < 3 ||
        passwordIcons.join('-') !== confirmPasswordIcons.join('-'))) ||
    (useNormalPassword &&
      (!normalPassword || normalPassword.length < 6 || normalPassword !== confirmNormalPassword));

  const canContinueEmail = Boolean(emailPrefix && emailValid && email && email.includes('@'));

  function handleGmailClick() {
    if (emailPrefix) {
      setEmail(`${emailPrefix}@gmail.com`);
      setEmailValid(true);
      setCurrentStep(3);
    } else {
      setEmail('@gmail.com');
    }
  }

  function handleEmailPrefixChange(e: React.ChangeEvent<HTMLInputElement>) {
    let sanitizedValue = e.target.value.toLowerCase().replace(/[^a-z0-9.]/g, '');
    sanitizedValue = sanitizedValue.replace(/\.{2,}/g, '.');
    sanitizedValue = sanitizedValue.replace(/^\./g, '');
    setEmailPrefix(sanitizedValue);

    if (sanitizedValue) {
      setEmail(`${sanitizedValue}@gmail.com`);
      setEmailValid(true);
    } else {
      setEmailValid(false);
    }
    setPasswordUnique(null);
  }

  function checkPasswordUniqueness(icons: string[], emailStr: string) {
    if (icons.length === 3 && emailStr && emailStr.includes('@')) {
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

    const signupData = {
      email,
      password: useNormalPassword ? normalPassword : undefined,
      passwordIcons: !useNormalPassword ? passwordIcons : undefined,
      confirmPassword: useNormalPassword ? confirmNormalPassword : undefined,
      confirmPasswordIcons: !useNormalPassword ? confirmPasswordIcons : undefined,
      role: userRole,
      useNormalPassword,
    };

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

    let passwordToUse = '';
    if (validatedData.useNormalPassword) {
      passwordToUse = validatedData.password || '';
    } else {
      passwordToUse = iconsToPassword(validatedData.passwordIcons || [], validatedData.email);
    }

    try {
      await signup(validatedData.email, passwordToUse, validatedData.role);
      setError('');
      setLoading(false);
      const verificationMessage = `✅ Account created successfully!\n\nPlease check your email (${validatedData.email}) to verify your account.\n\nWe've sent a verification link to your inbox.\n\n⚠️ If you don't see it, please check your spam/junk folder.\n\nYou can also resend the verification email from your home page.`;
      alert(verificationMessage);
      setNavigating(true);
      navigate('/home');
    } catch (err: unknown) {
      if (err instanceof FirebaseError) {
        if (err.code === 'auth/email-already-in-use') {
          try {
            await login(validatedData.email, passwordToUse);
            if (auth.currentUser && validatedData.role) {
              await setDoc(
                doc(db, 'users', auth.currentUser.uid),
                {
                  email: auth.currentUser.email,
                  role: validatedData.role,
                  createdAt: new Date().toISOString(),
                },
                { merge: true },
              );
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
    <div className="auth-page-wrapper brand-bg-light">
      <aside className="auth-sidebar" aria-label="Product information">
        <Link to="/" className="auth-logo-link">
          <img src={logoImage} alt="JustWav3" className="nav-logo" width={180} height={52} />
        </Link>
        <div className="auth-sidebar-content">
          <span className="landing-badge-cyan">Step {currentStep} of 3</span>
          <h2 className="hero-title-dark">
            Start your <br />
            adaptive journey.
          </h2>
          <p className="bento-text-muted">
            Your progress, preferences, and accessibility settings sync across all devices.
          </p>
        </div>
        <div className="auth-sidebar-footer">
          <p className="text-micro">WCAG 2.2 AA Compliant</p>
        </div>
      </aside>

      <main className="auth-main-canvas" id="main-content">
        <div className="auth-card-refined glass-nav-light">
          <header className="auth-card-header">
            <h1 className="friendly-header">Create Account</h1>
            <p className="bento-text-muted">Join the new wave of learning.</p>
          </header>

          {error && (
            <div className="error-message friendly-error" role="alert" aria-live="assertive">
              <span className="error-icon">❌</span>
              {error}
            </div>
          )}

          <form id="signup-form" onSubmit={handleSubmit} className="auth-form-flow" aria-label="Sign up form">
            <p className="visually-hidden" aria-live="polite">
              Step {currentStep} of 3
            </p>

            <div className="auth-progress-bar" aria-hidden="true">
              <div className={`progress-segment ${currentStep >= 1 ? 'active' : ''}`} />
              <div className={`progress-segment ${currentStep >= 2 ? 'active' : ''}`} />
              <div className={`progress-segment ${currentStep >= 3 ? 'active' : ''}`} />
            </div>

            <div className="step-content-area">
              {currentStep === 1 && (
                <div className="form-group child-friendly-group">
                  <h2 className="signup-step-title" id="signup-step1-title">
                    Who are you?
                  </h2>
                  <div
                    className="role-selection"
                    role="group"
                    aria-labelledby="signup-step1-title"
                  >
                    <button
                      type="button"
                      className={`role-button ${userRole === 'parent' ? 'selected' : ''}`}
                      onClick={() => {
                        setUserRole('parent');
                        setCurrentStep(2);
                      }}
                      aria-label="I am a parent"
                    >
                      <span className="role-icon">
                        <img src={parentProfileImage} alt="" className="role-icon-img" />
                      </span>
                      <span className="role-text">Parent</span>
                    </button>

                    <button
                      type="button"
                      className={`role-button ${userRole === 'student' ? 'selected' : ''}`}
                      onClick={() => {
                        setUserRole('student');
                        setCurrentStep(2);
                      }}
                      aria-label="I am a student"
                    >
                      <span className="role-icon">
                        <img src={studentProfileImage} alt="" className="role-icon-img" />
                      </span>
                      <span className="role-text">Student</span>
                    </button>

                    <button
                      type="button"
                      className={`role-button ${userRole === 'teacher' ? 'selected' : ''}`}
                      onClick={() => {
                        setUserRole('teacher');
                        setCurrentStep(2);
                      }}
                      aria-label="I am a teacher"
                    >
                      <span className="role-icon">
                        <img src={teacherProfileImage} alt="" className="role-icon-img" />
                      </span>
                      <span className="role-text">Teacher</span>
                    </button>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="form-group child-friendly-group">
                  <div className="signup-step-toolbar">
                    <button
                      type="button"
                      className="step-back-button"
                      onClick={() => setCurrentStep(1)}
                      aria-label="Go back to role selection"
                    >
                      ← Back
                    </button>
                    <h2 className="signup-step-title" id="signup-step2-title">
                      Email setup
                    </h2>
                  </div>
                  <label htmlFor="email-prefix" className="label-with-icon">
                    <span className="label-icon">
                      <MailIcon size={22} />
                    </span>
                    <span>Your Email</span>
                  </label>
                  <div className="email-input-group">
                    <input
                      type="text"
                      id="email-prefix"
                      name="email-prefix"
                      value={emailPrefix}
                      onChange={handleEmailPrefixChange}
                      onBlur={() => {
                        if (emailPrefix.endsWith('.')) {
                          const cleaned = emailPrefix.replace(/\.$/g, '');
                          setEmailPrefix(cleaned);
                          if (cleaned) {
                            setEmail(`${cleaned}@gmail.com`);
                          }
                        }
                      }}
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
                  <div className={`email-status-card ${emailValid ? 'is-valid' : ''}`}>
                    {emailPrefix ? (
                      <p>
                        Your login name will be: <strong>{emailPrefix}</strong>
                      </p>
                    ) : (
                      <p>Type your name to start! ✨</p>
                    )}
                  </div>
                  {email && emailValid && (
                    <div className="email-preview">
                      <span className="email-preview-label">Your email:</span>
                      <span className="email-preview-value">{email}</span>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 3 && (
                <div>
                  <div className="signup-step-toolbar">
                    <button
                      type="button"
                      className="step-back-button"
                      onClick={() => setCurrentStep(2)}
                      aria-label="Go back to email setup"
                    >
                      ← Back
                    </button>
                    <h2 className="signup-step-title" id="signup-step3-title">
                      Password creation
                    </h2>
                  </div>
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
                      <IconFeatureImage size={18} />
                      Icon Password
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
                      ⌨️ Typing Password
                    </button>
                  </div>

                  {!useNormalPassword ? (
                    <>
                      <IconPasswordSelector
                        selectedIcons={passwordIcons}
                        onIconSelect={(icon) => {
                          if (passwordIcons.includes(icon)) {
                            const newIcons = passwordIcons.filter((i) => i !== icon);
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
                      <label htmlFor="normal-password">Create Your Password</label>
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

                  {!useNormalPassword ? (
                    <>
                      <IconPasswordSelector
                        selectedIcons={confirmPasswordIcons}
                        onIconSelect={(icon) => {
                          if (confirmPasswordIcons.includes(icon)) {
                            setConfirmPasswordIcons(confirmPasswordIcons.filter((i) => i !== icon));
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
                        <>
                          {passwordIcons.join('-') === confirmPasswordIcons.join('-') ? (
                            <>
                              <div className="password-match-check">
                                <span className="match-success">✅ Passwords match! Great job!</span>
                              </div>
                              <div className="password-visual-comparison">
                                <div className="password-visual-section">
                                  <p className="password-visual-label">Your Password:</p>
                                  <div className="password-icons-display">
                                    {passwordIcons.map((icon, idx) => (
                                      <span key={idx} className="password-icon-large">
                                        {icon}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="password-visual-section">
                                  <p className="password-visual-label">Confirm Password:</p>
                                  <div className="password-icons-display">
                                    {confirmPasswordIcons.map((icon, idx) => (
                                      <span
                                        key={idx}
                                        className={`password-icon-large ${passwordIcons[idx] === icon ? 'match' : 'no-match'}`}
                                      >
                                        {icon}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="password-match-check">
                              <span className="match-error">❌ Icons don&apos;t match. Try again!</span>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="form-group child-friendly-group">
                        <label htmlFor="confirm-normal-password">Type Your Password Again</label>
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
                            <span className="match-error">❌ Passwords don&apos;t match. Try again!</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <footer className="auth-form-footer">
              {currentStep === 2 && (
                <button
                  type="button"
                  className="btn-cyan-solid-lg full-width"
                  disabled={!canContinueEmail}
                  onClick={() => setCurrentStep(3)}
                >
                  Continue
                </button>
              )}
              {currentStep === 3 && (
                <button
                  type="submit"
                  className="btn-cyan-solid-lg full-width auth-submit-cta"
                  disabled={submitDisabled}
                  aria-busy={loading}
                  aria-label={loading ? 'Setting up your account' : 'Create your account'}
                >
                  {loading ? 'Setting up...' : 'Create account'}
                </button>
              )}
              <p className="auth-footer-switch">
                Already a member?{' '}
                <Link to="/login" className="text-cyan-solid" aria-label="Go to sign in">
                  Sign In
                </Link>
              </p>
            </footer>
          </form>
        </div>
      </main>
    </div>
  );
}
