import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useNavigation } from '../contexts/NavigationContext';
import { useAuth } from '../contexts/AuthContext';
import './Landing.css';
import logoImage from '../assets/images/logo.png';

export function Landing() {
  const navigate = useNavigate();
  const { setNavigating } = useNavigation();
  const { currentUser, loading } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!loading && currentUser) navigate('/home');
  }, [currentUser, loading, navigate]);

  const handleAction = (path: string) => {
    setNavigating(true);
    navigate(path);
  };

  if (loading || currentUser) {
    return (
      <div className="landing-loading-screen" role="status" aria-live="polite">
        JustWav3…
      </div>
    );
  }

  const heroTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className="landing-wrapper">
      <nav className="glass-nav" aria-label="Primary">
        <img src={logoImage} alt="JustWav3" className="nav-logo" width={140} height={40} />
        <div className="nav-actions">
          <button type="button" onClick={() => handleAction('/login')} className="btn-ghost">
            Sign In
          </button>
          <button type="button" onClick={() => handleAction('/signup')} className="btn-primary-sm">
            Get Started
          </button>
        </div>
      </nav>

      <main className="landing-container" id="main-content">
        <section className="hero-section" aria-labelledby="hero-heading">
          <motion.div
            className="hero-inner"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={heroTransition}
          >
            <span className="landing-badge">v2.0 Now Live</span>
            <h1 id="hero-heading" className="hero-title">
              Learning at the <br />
              <span className="text-gradient">Speed of Gesture.</span>
            </h1>
            <p className="hero-subtitle">
              The world’s first adaptive multimodal interface. Control your progress with a wave, a
              touch, or a glance.
            </p>
            <div className="hero-cta-group">
              <button
                type="button"
                onClick={() => handleAction('/signup')}
                className="btn-primary-lg"
              >
                Start Learning Free
              </button>
              <button
                type="button"
                onClick={() => handleAction('/learn-demo')}
                className="btn-secondary-lg"
              >
                Watch Demo
              </button>
            </div>
          </motion.div>
        </section>

        <section className="bento-section" aria-labelledby="bento-heading">
          <h2 id="bento-heading" className="visually-hidden">
            Product capabilities
          </h2>
          <div className="bento-grid">
            <article className="bento-item main-feature">
              <div className="bento-content">
                <h3>Gesture Engine</h3>
                <p>1–4 fingers for answers. Thumbs up to confirm. Zero latency.</p>
              </div>
              <div className="gesture-viz" aria-hidden="true">
                <div className="gesture-track">
                  <span className="gesture-finger" data-n="1" />
                  <span className="gesture-finger" data-n="2" />
                  <span className="gesture-finger" data-n="3" />
                  <span className="gesture-finger" data-n="4" />
                </div>
                <div className="gesture-pulse" />
              </div>
            </article>

            <article className="bento-item accent-1">
              <h3>Adaptive Paths</h3>
              <p>Difficulty that breathes with you.</p>
            </article>

            <article className="bento-item accent-2">
              <h3>5 Learning Modes</h3>
              <div className="mode-pills">
                <span>Audio</span>
                <span>Visual</span>
                <span>Icons</span>
              </div>
            </article>

            <article className="bento-item wide">
              <div className="bento-content">
                <h3>Role-Based Dashboards</h3>
                <p>Seamless sync between Students, Teachers, and Parents.</p>
              </div>
              <div className="dashboard-preview" aria-hidden="true">
                <div className="dash-sidebar" />
                <div className="dash-main">
                  <div className="dash-row dash-header" />
                  <div className="dash-row" />
                  <div className="dash-row" />
                  <div className="dash-cards">
                    <div className="dash-card" />
                    <div className="dash-card" />
                    <div className="dash-card" />
                  </div>
                </div>
              </div>
            </article>

            <article className="bento-item small">
              <h3>100% Accessible</h3>
              <p>WCAG 2.2 compliant.</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
