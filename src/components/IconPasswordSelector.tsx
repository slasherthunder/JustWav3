import { motion } from 'framer-motion';
import './IconPasswordSelector.css';

const PASSWORD_ICONS = ['🔒', '⭐', '🎈', '🌈', '🎨', '🎵', '🎮', '🏀', '🐶', '🐱', '🦄', '🦋', '🌺', '🍎', '🍕', '🍰'];

interface IconPasswordSelectorProps {
  selectedIcons: string[];
  onIconSelect: (icon: string) => void;
  maxIcons?: number;
  label?: string;
}

export function IconPasswordSelector({ 
  selectedIcons, 
  onIconSelect, 
  maxIcons = 3,
  label = "Choose Your Password Icons"
}: IconPasswordSelectorProps) {
  const handleIconClick = (icon: string) => {
    if (selectedIcons.includes(icon)) {
      // Remove icon if already selected
      return;
    }
    if (selectedIcons.length < maxIcons) {
      onIconSelect(icon);
    }
  };

  return (
    <div className="icon-password-selector">
      <label className="icon-password-label">
        <span className="label-icon">🔑</span>
        <span>{label}</span>
        <span className="icon-count">({selectedIcons.length}/{maxIcons})</span>
      </label>
      
      <div className="icon-grid">
        {PASSWORD_ICONS.map((icon, index) => {
          const isSelected = selectedIcons.includes(icon);
          return (
            <motion.button
              key={`${icon}-${index}`}
              type="button"
              className={`icon-button ${isSelected ? 'selected' : ''}`}
              onClick={() => handleIconClick(icon)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              aria-label={`Select ${icon} icon`}
              disabled={!isSelected && selectedIcons.length >= maxIcons}
            >
              <span className="icon-emoji">{icon}</span>
              {isSelected && (
                <motion.span
                  className="check-mark"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  ✅
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>

      {selectedIcons.length > 0 && (
        <motion.div
          className="selected-icons-display"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="selected-label">Your password:</p>
          <div className="selected-icons-list">
            {selectedIcons.map((icon, index) => (
              <motion.span
                key={index}
                className="selected-icon"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: index * 0.1, type: "spring" }}
              >
                {icon}
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}

      {selectedIcons.length < maxIcons && (
        <p className="helper-text">
          Choose {maxIcons - selectedIcons.length} more icon{maxIcons - selectedIcons.length > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

