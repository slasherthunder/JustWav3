import { useState } from 'react';
import './IconPasswordSelector.css';

// High-contrast, distinct emojis grouped by category for better visual distinction
// Animals (distinct colors/shapes)
const ANIMALS = ['🦁', '🐢', '🐧', '🦄', '🐙', '🦊'];
// Nature/Space (simple, iconic)
const NATURE = ['🌵', '🍄', '🌈', '☀️', '🌙', '🌊'];
// Foods (high contrast, fun)
const FOODS = ['🍕', '🍦', '🍩', '🍉', '🍟', '🌮'];
// Activities (clear icons)
const ACTIVITIES = ['🎮', '🎨', '🚀', '⚽', '🚲', '🎸'];
// Objects (sparkly/high-value)
const OBJECTS = ['🎁', '💎', '🎈', '🔑', '👑', '⭐'];

// Combine all categories for variety
const PASSWORD_ICONS = [
  ...ANIMALS,
  ...NATURE,
  ...FOODS,
  ...ACTIVITIES,
  ...OBJECTS
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

  // Helper to find the order of a selected icon
  const getIconOrder = (icon: string) => {
    const index = selectedIcons.indexOf(icon);
    return index >= 0 ? index + 1 : null;
  };

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
          const order = getIconOrder(icon);
          const isJustSelected = justSelected === icon;
          
          return (
            <button
              key={icon}
              type="button"
              className={`icon-button ${isSelected ? 'selected' : ''} ${isJustSelected ? 'wobble' : ''} ${!isSelected && selectedIcons.length >= maxIcons ? 'disabled' : ''}`}
              onClick={() => handleIconClick(icon)}
              aria-pressed={isSelected}
              aria-label={isSelected ? `Deselect ${icon} (position ${order})` : `Select ${icon} icon`}
              disabled={!isSelected && selectedIcons.length >= maxIcons}
            >
              <span className="icon-emoji">{icon}</span>
              {isSelected && order && (
                <span className="order-badge">{order}</span>
              )}
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

