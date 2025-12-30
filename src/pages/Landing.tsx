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
    return <div>Loading...</div>;
  }

  // Don't render if user is authenticated (will be redirected)
  if (currentUser) {
    return null;
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
                <p>Control your learning experience with simple hand gestures</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">🎯</span>
              <div className="feature-content">
                <h3>Adaptive Learning</h3>
                <p>Personalized content delivery that adapts to your learning style</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">📊</span>
              <div className="feature-content">
                <h3>Progress Tracking</h3>
                <p>Detailed reports on your learning progress and preferences</p>
              </div>
            </div>

            <div className="feature-item">
              <span className="feature-icon">🔊</span>
              <div className="feature-content">
                <h3>Multimodal Support</h3>
                <p>Audio, visual, icon-based, and gesture-driven learning modes</p>
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

