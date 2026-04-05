import { useState } from 'react';
import './IconPasswordSelector.css';

// High-contrast, distinct emojis - 3x2 grid (6 emojis)
// Carefully chosen for maximum visual distinction and child appeal
const PASSWORD_ICONS = [
  '🦁', // Lion - orange
  '🐢', // Turtle - green
  '🦄', // Unicorn - purple/pink
  '🍕', // Pizza - yellow/brown
  '🚀', // Rocket - gray/blue
  '⭐'  // Star - yellow
];

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
  const [justSelected, setJustSelected] = useState<string | null>(null);

  const handleIconClick = (icon: string) => {
    if (selectedIcons.includes(icon)) {
      // Deselect if already selected
      onIconSelect(icon);
    } else if (selectedIcons.length < maxIcons) {
      // Select if not at max
      setJustSelected(icon);
      onIconSelect(icon);
      // Clear animation state after animation completes
      setTimeout(() => setJustSelected(null), 300);
    }
  };

  return (
    <div className="icon-password-selector">
      <label className="icon-password-label">
        <span className="label-icon">🔑</span>
        <span>{label}</span>
        <span className={`icon-count ${selectedIcons.length === maxIcons ? 'complete' : ''}`}>
          {selectedIcons.length === maxIcons ? '✅ Ready!' : `(${selectedIcons.length}/${maxIcons})`}
        </span>
      </label>
      
      {/* Slot Visualization - Shows empty placeholders that get filled */}
      <div className="selection-preview-area">
        <p className="slots-label">Fill in your password slots:</p>
        <div className="slots-container">
          {[...Array(maxIcons)].map((_, i) => {
            const icon = selectedIcons[i];
            const order = i + 1;
            return (
              <div 
                key={i} 
                className={`icon-slot ${icon ? 'filled' : 'empty'} ${justSelected === icon ? 'just-filled' : ''}`}
                aria-label={icon ? `Slot ${order}: ${icon}` : `Slot ${order}: Empty`}
              >
                {icon ? (
                  <>
                    <span className="slot-icon">{icon}</span>
                    <span className="slot-number">{order}</span>
                  </>
                ) : (
                  <span className="slot-placeholder">?</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="icon-grid">
        {PASSWORD_ICONS.map((icon) => {
          const isSelected = selectedIcons.includes(icon);
          const isJustSelected = justSelected === icon;
          
          return (
            <button
              key={icon}
              type="button"
              className={`icon-button ${isSelected ? 'selected' : ''} ${isJustSelected ? 'wobble' : ''} ${!isSelected && selectedIcons.length >= maxIcons ? 'disabled' : ''}`}
              onClick={() => handleIconClick(icon)}
              aria-pressed={isSelected}
              aria-label={isSelected ? `Deselect ${icon}` : `Select ${icon} icon`}
              disabled={!isSelected && selectedIcons.length >= maxIcons}
            >
              <span className="icon-emoji">{icon}</span>
            </button>
          );
        })}
      </div>

      {selectedIcons.length < maxIcons && (
        <p className="helper-text">
          Choose {maxIcons - selectedIcons.length} more icon{maxIcons - selectedIcons.length > 1 ? 's' : ''} to complete your password
        </p>
      )}
    </div>
  );
}

