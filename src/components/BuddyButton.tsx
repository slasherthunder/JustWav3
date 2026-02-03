import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './BuddyButton.css';

type BuddyMode = 'none' | 'try-me' | 'practice' | 'help';

interface BuddyButtonProps {
  onModeChange?: (mode: BuddyMode) => void;
  onTryMeClick?: () => void;
  onPracticeClick?: () => void;
  onHelpClick?: () => void;
}

export function BuddyButton({ 
  onModeChange, 
  onTryMeClick, 
  onPracticeClick, 
  onHelpClick 
}: BuddyButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeMode, setActiveMode] = useState<BuddyMode>('none');
  const buttonRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  // Handle ESC key to exit modes
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeMode !== 'none') {
        setActiveMode('none');
        onModeChange?.('none');
        setIsExpanded(false);
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [activeMode, onModeChange]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const handleTryMe = () => {
    const newMode = activeMode === 'try-me' ? 'none' : 'try-me';
    setActiveMode(newMode);
    onModeChange?.(newMode);
    setIsExpanded(false);
    onTryMeClick?.();
  };

  const handlePractice = () => {
    setActiveMode('practice');
    onModeChange?.('practice');
    setIsExpanded(false);
    onPracticeClick?.();
  };

  const handleHelp = () => {
    setActiveMode('help');
    onModeChange?.('help');
    setIsExpanded(false);
    onHelpClick?.();
  };

  return (
    <>
      <div ref={buttonRef} className="buddy-button-container">
        <motion.button
          className={`buddy-button ${isExpanded ? 'expanded' : ''} ${activeMode !== 'none' ? 'active' : ''}`}
          onClick={toggleExpanded}
          aria-label="My Buddy - Learning Companion"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          animate={{
            y: [0, -5, 0],
          }}
          transition={{
            y: {
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }
          }}
        >
          <span className="buddy-icon">👤</span>
          <span className="buddy-label">My Buddy</span>
        </motion.button>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              className="buddy-dropdown"
              initial={{ opacity: 0, scale: 0.8, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <motion.button
                className={`buddy-menu-item try-me ${activeMode === 'try-me' ? 'active' : ''}`}
                onClick={handleTryMe}
                whileHover={{ scale: 1.05, x: 5 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="menu-icon">🎯</span>
                <span className="menu-text">Try Me</span>
                {activeMode === 'try-me' && <span className="active-indicator">●</span>}
              </motion.button>

              <motion.button
                className={`buddy-menu-item practice ${activeMode === 'practice' ? 'active' : ''}`}
                onClick={handlePractice}
                whileHover={{ scale: 1.05, x: 5 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="menu-icon">🎮</span>
                <span className="menu-text">Let's Practice</span>
                {activeMode === 'practice' && <span className="active-indicator">●</span>}
              </motion.button>

              <motion.button
                className={`buddy-menu-item help ${activeMode === 'help' ? 'active' : ''}`}
                onClick={handleHelp}
                whileHover={{ scale: 1.05, x: 5 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="menu-icon">❓</span>
                <span className="menu-text">Help Me</span>
                {activeMode === 'help' && <span className="active-indicator">●</span>}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Try Me Mode Indicator */}
      {activeMode === 'try-me' && (
        <motion.div
          className="try-me-indicator"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
        >
          <div className="indicator-content">
            <span className="indicator-icon">🎯</span>
            <span className="indicator-text">Try Me Mode Active - Hover over buttons to learn!</span>
            <button 
              className="indicator-close"
              onClick={() => {
                setActiveMode('none');
                onModeChange?.('none');
              }}
              aria-label="Exit Try Me mode"
            >
              Done
            </button>
          </div>
        </motion.div>
      )}
    </>
  );
}
