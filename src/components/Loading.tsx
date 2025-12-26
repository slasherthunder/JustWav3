import { motion } from 'framer-motion';
import './Loading.css';

export function Loading() {
  // Waving hand animation
  const waveVariants = {
    wave: {
      rotate: [0, 14, -8, 14, -8, 0],
      transition: {
        duration: 1,
        repeat: Infinity
      }
    }
  };

  // Love sign animation (two hands forming heart)
  const loveVariants = {
    initial: { scale: 0, opacity: 0 },
    animate: {
      scale: [0, 1.2, 1],
      opacity: [0, 1, 1],
      transition: {
        duration: 0.8,
        delay: 0.5
      }
    },
    pulse: {
      scale: [1, 1.1, 1],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        delay: 1.3
      }
    }
  };

  return (
    <div className="loading-container">
      <div className="loading-content">
        {/* Waving Hand Emoji */}
        <motion.div
          className="hand-container"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.span
            className="waving-hand-emoji"
            variants={waveVariants}
            animate="wave"
            style={{ fontSize: '120px', display: 'inline-block' }}
          >
            👋
          </motion.span>
        </motion.div>

        {/* Sign Language Love Symbol Emoji */}
        <motion.div
          className="love-sign-container"
          initial="initial"
          animate={["animate", "pulse"]}
          variants={loveVariants}
        >
          <span
            className="love-sign-emoji"
            style={{ fontSize: '140px', display: 'inline-block' }}
          >
            🤟
          </span>
        </motion.div>

        {/* Loading text */}
        <motion.div
          className="loading-text"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
          >
            JustWav3
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            Starting up your journey...
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
