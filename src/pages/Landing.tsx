import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { useAuth } from '../contexts/AuthContext';
import './Landing.css';

export function Landing() {
  const navigate = useNavigate();
  const { setNavigating } = useNavigation();
  const { currentUser, loading } = useAuth();

  // Redirect authenticated users to their home page
  useEffect(() => {
    if (!loading && currentUser) {
      navigate('/home');
    }
  }, [currentUser, loading, navigate]);

  const handleSignIn = () => {
    setNavigating(true);
    navigate('/login');
  };

  const handleSignUp = () => {
    setNavigating(true);
    navigate('/signup');
  };

  // Show loading while checking authentication
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px'
      }}>
        Loading...
      </div>
    );
  }

  // Don't render if user is authenticated (will be redirected)
  if (currentUser) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px'
      }}>
        Redirecting...
      </div>
    );
  }

  return (
    <div className="landing-container">
      <div className="landing-header">
        <button 
          className="landing-auth-button sign-in-button"
          onClick={handleSignIn}
          aria-label="Sign in to your account"
        >
          Sign In
        </button>
        <button 
          className="landing-auth-button sign-up-button"
          onClick={handleSignUp}
          aria-label="Create a new account"
        >
          Sign Up
        </button>
      </div>

      <main className="landing-main">
        <div className="landing-content">
          <h1 className="landing-title">JustWav3</h1>
          <p className="landing-subtitle">
            Adaptive Multimodal Learning Interface with Real-Time Gesture Recognition
          </p>
          
          <div className="landing-description">
            <p>
              JustWav3 is an innovative accessibility-focused learning platform designed to help 
              students with diverse learning needs. Our adaptive system recognizes gestures in 
              real-time, providing multiple learning modes tailored to each student's unique way 
              of understanding.
            </p>
          </div>

          <div className="landing-features">
            <div className="feature-item">
              <span className="feature-icon">👋</span>
              <div className="feature-content">
                <h3>Real-Time Gesture Recognition</h3>
                <p>Control your learning experience with simple hand gestures - thumbs up, open hand, pointing, and more</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">🎯</span>
              <div className="feature-content">
                <h3>Adaptive Learning</h3>
                <p>Personalized content delivery that adapts to your learning style and performance</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">📊</span>
              <div className="feature-content">
                <h3>Progress Tracking</h3>
                <p>Detailed reports on your learning progress, preferences, and personalized recommendations</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">🔊</span>
              <div className="feature-content">
                <h3>Five Learning Modes</h3>
                <p>Audio, Image, Icons, Gesture, and Simple modes to match your learning style</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">💬</span>
              <div className="feature-content">
                <h3>Messages & Connect</h3>
                <p>Communicate with teachers, parents, and students through our integrated messaging system</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">👨‍👩‍👧‍👦</span>
              <div className="feature-content">
                <h3>Role-Based System</h3>
                <p>Dedicated dashboards for Students, Teachers, and Parents with role-specific features</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">🔐</span>
              <div className="feature-content">
                <h3>Flexible Authentication</h3>
                <p>Choose between traditional passwords or child-friendly icon-based passwords</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">🔗</span>
              <div className="feature-content">
                <h3>Connection System</h3>
                <p>Teachers and students can connect to share progress and collaborate on learning</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">♿</span>
              <div className="feature-content">
                <h3>Accessibility First</h3>
                <p>Text size controls, high contrast mode, keyboard navigation, and screen reader support</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">🛡️</span>
              <div className="feature-content">
                <h3>Secure & Protected</h3>
                <p>Rate limiting, input validation, email verification, and secure data handling</p>
              </div>
            </div>
          </div>

          <div className="landing-cta">
            <button 
              className="landing-primary-button"
              onClick={handleSignUp}
              aria-label="Get started with JustWav3"
            >
              Get Started
            </button>
            <button 
              className="landing-secondary-button"
              onClick={handleSignIn}
              aria-label="Sign in to existing account"
            >
              Already have an account? Sign In
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

