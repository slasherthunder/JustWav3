import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useNavigate } from 'react-router-dom';
import './Home.css';

export function StudentHome() {
  const { currentUser, logout } = useAuth();
  const { setNavigating } = useNavigation();
  const navigate = useNavigate();
  const [textSize, setTextSize] = useState(1);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--text-size-multiplier', textSize.toString());
    
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [textSize, highContrast]);

  async function handleLogout() {
    try {
      setNavigating(true);
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.4
      }
    }
  };

  return (
    <motion.div
      className="home-container"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <motion.header
        className="home-header"
        role="banner"
        variants={itemVariants}
      >
        <motion.h1
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
        >
          JustWav3 🎓
        </motion.h1>
        <motion.button
          onClick={handleLogout}
          className="logout-button"
          aria-label="Log out of your account"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400 }}
        >
          Logout
        </motion.button>
      </motion.header>
      <main id="main-content" className="home-main" role="main">
        <motion.div
          className="welcome-card"
          variants={cardVariants}
          whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <motion.h2
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            Welcome, Student! 🎓
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            You are logged in as:
          </motion.p>
          <motion.p
            className="user-email"
            aria-label={`User email: ${currentUser?.email}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
          >
            {currentUser?.email}
          </motion.p>
          <motion.p
            className="welcome-message"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            Ready to learn? Let's start your learning adventure! 🌟
          </motion.p>
          <motion.button
            onClick={() => { setNavigating(true); navigate('/learn'); }}
            className="logout-button"
            aria-label="Start your learning"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400 }}
            style={{ marginTop: '0.75rem' }}
          >
            Start Your Learning
          </motion.button>
        </motion.div>

        

        <motion.section
          className="accessibility-controls"
          aria-labelledby="accessibility-heading"
          variants={itemVariants}
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <h3 id="accessibility-heading">Accessibility Settings</h3>
          
          <div className="control-group">
            <label htmlFor="text-size">
              <motion.input
                type="range"
                id="text-size"
                min="0.875"
                max="1.5"
                step="0.125"
                value={textSize}
                onChange={(e) => setTextSize(parseFloat(e.target.value))}
                aria-label="Text size adjustment"
                aria-valuemin={0.875}
                aria-valuemax={1.5}
                aria-valuenow={textSize}
                whileFocus={{ scale: 1.05 }}
              />
              <span>Text Size: {Math.round(textSize * 100)}%</span>
            </label>
            <motion.span
              className="range-label"
              aria-live="polite"
              key={textSize}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              Current size: {Math.round(textSize * 100)}% ({textSize < 1 ? 'Smaller' : textSize > 1 ? 'Larger' : 'Default'})
            </motion.span>
          </div>

          <div className="control-group">
            <label htmlFor="high-contrast">
              <motion.input
                type="checkbox"
                id="high-contrast"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                aria-label="Enable high contrast mode"
                whileTap={{ scale: 0.95 }}
              />
              <span>High Contrast Mode</span>
            </label>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Increases contrast for better visibility
            </p>
          </div>
        </motion.section>
      </main>
    </motion.div>
  );
}

