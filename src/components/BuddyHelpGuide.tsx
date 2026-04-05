import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './BuddyHelpGuide.css';
import audioIcon from '../assets/images/audioicon.png';

interface HelpItem {
  gesture: string;
  meaning: string;
  emoji: string;
  description: string;
}

const helpItems: HelpItem[] = [
  {
    gesture: '1 finger',
    meaning: 'Answer A',
    emoji: '👆',
    description: 'Hold up just your index finger'
  },
  {
    gesture: '2 fingers',
    meaning: 'Answer B',
    emoji: '✌️',
    description: 'Hold up your index and middle fingers'
  },
  {
    gesture: '3 fingers',
    meaning: 'Answer C',
    emoji: '🤟',
    description: 'Hold up three fingers'
  },
  {
    gesture: '4 fingers',
    meaning: 'Answer D',
    emoji: '🖐️',
    description: 'Hold up four fingers'
  },
  {
    gesture: 'Thumbs Up',
    meaning: 'I understand',
    emoji: '👍',
    description: 'Stick your thumb up to show you understand'
  },
  {
    gesture: 'Thumbs Down',
    meaning: 'I need help',
    emoji: '👎',
    description: 'Point your thumb down to ask for help'
  },
];

interface BuddyHelpGuideProps {
  onClose: () => void;
}

export function BuddyHelpGuide({ onClose }: BuddyHelpGuideProps) {
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const speakText = (text: string) => {
    if (audioEnabled && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.85;
      utterance.pitch = 1.1;
      speechSynthesis.speak(utterance);
    }
  };

  const handleItemClick = (item: HelpItem, index: number) => {
    setSelectedItem(selectedItem === index ? null : index);
    const fullText = `${item.gesture} means ${item.meaning}. ${item.description}`;
    speakText(fullText);
  };

  return (
    <motion.div
      className="help-guide-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="help-guide-container"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="help-guide-header">
          <h2>❓ Help Me - Quick Guide</h2>
          <div className="header-controls">
            <button
              className={`audio-toggle ${audioEnabled ? 'enabled' : 'disabled'}`}
              onClick={() => {
                setAudioEnabled(!audioEnabled);
                if (audioEnabled) {
                  speechSynthesis.cancel();
                }
              }}
              aria-label={audioEnabled ? 'Disable audio' : 'Enable audio'}
            >
              <img
                src={audioIcon}
                alt=""
                className={audioEnabled ? 'help-audio-icon' : 'help-audio-icon help-audio-icon--muted'}
                width={22}
                height={22}
              />
            </button>
            <button className="close-button" onClick={onClose} aria-label="Close help guide">
              ✕
            </button>
          </div>
        </div>

        <div className="help-guide-content">
          <p className="help-intro">
            Click on any gesture below to learn what it means and hear an explanation!
          </p>

          <div className="help-items-grid">
            {helpItems.map((item, index) => (
              <motion.div
                key={index}
                className={`help-item ${selectedItem === index ? 'selected' : ''}`}
                onClick={() => handleItemClick(item, index)}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="help-item-icon">{item.emoji}</div>
                <div className="help-item-content">
                  <h3 className="help-item-gesture">{item.gesture}</h3>
                  <p className="help-item-meaning">{item.meaning}</p>
                </div>
                <AnimatePresence>
                  {selectedItem === index && (
                    <motion.div
                      className="help-item-description"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <p>{item.description}</p>
                      <button
                        className="demo-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          speakText(`${item.gesture} means ${item.meaning}. ${item.description}`);
                        }}
                      >
                        <span className="demo-button-inner">
                          <img src={audioIcon} alt="" className="help-audio-icon-inline" width={16} height={16} />
                          Hear Again
                        </span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

          <div className="help-tips">
            <h3>💡 Tips</h3>
            <ul>
              <li>Hold gestures steady for 1-2 seconds</li>
              <li>Make sure your hand is visible in the camera</li>
              <li>Practice makes perfect! Use "Let's Practice" to try gestures safely</li>
              <li>You can always click buttons if gestures don't work</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
