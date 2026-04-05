import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useNavigation } from '../contexts/NavigationContext';
import { useAuth } from '../contexts/AuthContext';
import './Landing.css';
import logoImage from '../assets/images/logo.png';
import gestureEngineImage from '../assets/images/gesturerecognitionengineimg.png';
import gestureIcon from '../assets/images/gestureicon.png';
import audioIcon from '../assets/images/audioicon.png';
import simplifyImage from '../assets/images/simplifyimage.png';
import iconFeatureImage from '../assets/images/iconimage.png';
import teacherProfileImage from '../assets/images/teacherprofile.png';
import parentProfileImage from '../assets/images/parentprofile.png';
import studentProfileImage from '../assets/images/studentprofile.png';

export function Landing() {
  const navigate = useNavigate();
  const { setNavigating } = useNavigation();
  const { currentUser } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (currentUser) navigate('/home');
  }, [currentUser, navigate]);

  const handleAction = (path: string) => {
    setNavigating(true);
    navigate(path);
  };

  if (currentUser) {
    return null;
  }

  const heroTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className="landing-wrapper brand-bg-light">
      <nav className="glass-nav glass-nav-light" aria-label="Primary">
        <img src={logoImage} alt="JustWav3" className="nav-logo" width={196} height={56} />
        <div className="nav-actions">
          <button type="button" onClick={() => handleAction('/login')} className="btn-ghost-dark">
            Sign In
          </button>
          <button type="button" onClick={() => handleAction('/signup')} className="btn-cyan-solid">
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
            <span className="landing-badge-cyan">Designed for WCAG 2.2</span>
            <h1 id="hero-heading" className="hero-title-dark">
              New wave of <span className="text-cyan-solid">learning.</span>
            </h1>
            <p className="hero-subtitle-dark">
              An adaptive multimodal web app built with parents and accessibility experts, designed to
              fill the gaps traditional tools miss for kids with learning disabilities.
            </p>
            <div className="hero-cta-group">
              <button
                type="button"
                onClick={() => handleAction('/signup')}
                className="btn-cyan-solid-lg"
              >
                Start Learning Free
              </button>
              <button
                type="button"
                onClick={() => handleAction('/learn-demo')}
                className="btn-outline-dark-lg"
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
            <article className="bento-card bento-card-main">
              <div className="bento-content">
                <h3 className="bento-heading-cyan">Gesture Engine</h3>
                <p className="bento-text-muted">
                  1–4 fingers for answers. Thumbs up to confirm. Zero latency.
                </p>
                <p className="bento-text-muted gesture-mediapipe-note">
                  Made with Google&apos;s MediaPipe library.
                </p>
              </div>
              <div className="gesture-viz gesture-viz-light">
                <img
                  src={gestureEngineImage}
                  alt=""
                  className="gesture-engine-img"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </article>

            <article className="bento-card bento-card-learning-modes">
              <h3 className="bento-heading-dark bento-heading-learning-modes">4 Learning Modes</h3>
              <div className="mode-pills mode-pills-light mode-pills-learning-modes">
                <span className="mode-pill mode-pill-with-icon">
                  <img src={audioIcon} alt="" className="mode-pill-icon" width={24} height={24} />
                  Audio
                </span>
                <span className="mode-pill mode-pill-with-icon">
                  <img src={iconFeatureImage} alt="" className="mode-pill-icon" width={24} height={24} />
                  Icons
                </span>
                <span className="mode-pill mode-pill-with-icon">
                  <img src={gestureIcon} alt="" className="mode-pill-icon" width={24} height={24} />
                  Gesture
                </span>
                <span className="mode-pill mode-pill-with-icon">
                  <img src={simplifyImage} alt="" className="mode-pill-icon" width={24} height={24} />
                  Simple
                </span>
              </div>
            </article>

            <article
              className="bento-card bento-card-wide"
              id="role-pathways"
              aria-labelledby="role-pathways-heading"
            >
              <div className="bento-content">
                <h3 id="role-pathways-heading" className="bento-heading-dark">
                  Role-Based Dashboards
                </h3>
                <p className="bento-text-muted">
                  Seamless sync between Students, Teachers, and Parents.
                </p>
              </div>
              <div className="dashboard-preview dashboard-preview-light" aria-hidden="true">
                <div className="dash-sidebar dash-sidebar-roles">
                  <div className="dash-role-row dash-role-row--active">
                    <img
                      src={teacherProfileImage}
                      alt=""
                      className="dash-teacher-avatar"
                      width={44}
                      height={44}
                    />
                    <span className="dash-role-label">Teacher</span>
                  </div>
                  <div className="dash-role-row">
                    <img
                      src={studentProfileImage}
                      alt=""
                      className="dash-student-avatar"
                      width={44}
                      height={44}
                    />
                    <span className="dash-role-label">Student</span>
                  </div>
                  <div className="dash-role-row">
                    <img
                      src={parentProfileImage}
                      alt=""
                      className="dash-parent-avatar"
                      width={44}
                      height={44}
                    />
                    <span className="dash-role-label">Parent</span>
                  </div>
                </div>
                <div className="dash-main">
                  <div className="dash-row dash-header dash-header-cyan" />
                  <div className="dash-row" />
                  <div className="dash-row" />
                  <div className="dash-cards">
                    <div className="dash-card dash-card-light" />
                    <div className="dash-card dash-card-light" />
                    <div className="dash-card dash-card-light" />
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>
      </main>

      <footer className="landing-footer landing-footer-light">
        <img
          src={logoImage}
          alt="JustWav3"
          className="landing-footer-logo"
          width={154}
          height={44}
        />
      </footer>
    </div>
  );
}
