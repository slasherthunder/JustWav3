import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigation } from '../contexts/NavigationContext';
import { useAuth } from '../contexts/AuthContext';
import './Landing.css';
import logoImage from '../assets/images/logo.png';

interface Slide {
  title: string;
  icon: string;
  desc: string;
  features: string[];
}

export function Landing() {
  const navigate = useNavigate();
  const { setNavigating } = useNavigation();
  const { currentUser, loading } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const slides: Slide[] = [
    {
      title: "Real-Time Gesture Recognition",
      icon: "👋",
      desc: "Control your learning experience with simple hand gestures",
      features: [
        "1 Finger = Answer A",
        "2 Fingers = Answer B", 
        "3 Fingers = Answer C",
        "4 Fingers = Answer D",
        "Thumbs Up = I understand",
        "Two Thumbs Down = I need help"
      ]
    },
    {
      title: "Adaptive Learning System",
      icon: "🎯",
      desc: "Personalized content delivery that adapts to your learning style",
      features: ["Tracks your progress", "Adjusts difficulty", "Personalized recommendations"]
    },
    {
      title: "Five Learning Modes",
      icon: "🔊",
      desc: "Choose the mode that works best for you",
      features: ["Audio Mode", "Image Mode", "Icons Mode", "Gesture Mode", "Simple Mode"]
    },
    {
      title: "Progress Tracking & Reports",
      icon: "📊",
      desc: "Detailed insights into your learning journey",
      features: ["Visual progress charts", "Performance analytics", "Learning recommendations"]
    },
    {
      title: "Connect & Collaborate",
      icon: "💬",
      desc: "Stay connected with teachers, parents, and students",
      features: ["Integrated messaging", "Share progress", "Get support"]
    },
    {
      title: "Role-Based Dashboards",
      icon: "👨‍👩‍👧‍👦",
      desc: "Tailored experience for every user type",
      features: ["Student Dashboard", "Teacher Dashboard", "Parent Dashboard"]
    },
    {
      title: "Flexible Authentication",
      icon: "🔐",
      desc: "Choose how you want to sign in",
      features: ["Traditional passwords", "Child-friendly icon passwords", "Secure & simple"]
    },
    {
      title: "Accessibility First",
      icon: "♿",
      desc: "Designed with accessibility in mind",
      features: ["Text size controls", "High contrast mode", "Keyboard navigation", "Screen reader support"]
    },
    {
      title: "Secure & Protected",
      icon: "🛡️",
      desc: "Your data and privacy are our priority",
      features: ["Rate limiting", "Input validation", "Email verification", "Secure data handling"]
    }
  ];

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

  const handleTryIt = () => {
    setNavigating(true);
    navigate('/learn-demo', { replace: true });
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  // Auto-play carousel (pauses on hover/focus)
  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isPaused, slides.length]);

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
          <div className="landing-header-section">
            <h1 className="landing-title">
              <img src={logoImage} alt="JustWav3" style={{ maxHeight: '120px', width: 'auto', height: 'auto' }} />
            </h1>
            <p className="landing-subtitle">
              Adaptive Multimodal Learning Interface with Real-Time Gesture Recognition
            </p>
          </div>

          <div 
            className="carousel-container"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
          >
            <button
              className="carousel-button carousel-button-prev"
              onClick={prevSlide}
              aria-label="Previous slide"
              onFocus={() => setIsPaused(true)}
            >
              ←
            </button>

            <div className="carousel-slide-wrapper">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={currentSlide}
                  className="carousel-slide"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 100 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -100 }}
                  transition={{ duration: shouldReduceMotion ? 0.1 : 0.3, ease: "easeInOut" }}
                >
                  <div className="slide-icon">{slides[currentSlide].icon}</div>
                  <h2 className="slide-title">{slides[currentSlide].title}</h2>
                  <p className="slide-description">{slides[currentSlide].desc}</p>
                  <ul className="slide-features">
                    {slides[currentSlide].features.map((feature, index) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
            </div>

            <button
              className="carousel-button carousel-button-next"
              onClick={nextSlide}
              aria-label="Next slide"
              onFocus={() => setIsPaused(true)}
            >
              →
            </button>
          </div>

          <div className="carousel-dots">
            {slides.map((_, index) => (
              <button
                key={index}
                className={`carousel-dot ${index === currentSlide ? 'active' : ''}`}
                onClick={() => goToSlide(index)}
                aria-label={`Go to slide ${index + 1}`}
                aria-current={index === currentSlide ? 'true' : 'false'}
              />
            ))}
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
              className="landing-try-button"
              onClick={handleTryIt}
              aria-label="Try out JustWav3 without signing up"
            >
              Try It Out
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

