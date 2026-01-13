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
      onIconSelect(icon);
    } else if (selectedIcons.length < maxIcons) {
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
            <button
              key={`${icon}-${index}`}
              type="button"
              className={`icon-button ${isSelected ? 'selected' : ''}`}
              onClick={() => handleIconClick(icon)}
              aria-label={isSelected ? `Deselect ${icon} icon` : `Select ${icon} icon`}
              disabled={!isSelected && selectedIcons.length >= maxIcons}
            >
              <span className="icon-emoji">{icon}</span>
            </button>
          );
        })}
      </div>

      {selectedIcons.length > 0 && (
        <div className="selected-icons-display">
          <p className="selected-label">Your password:</p>
          <div className="selected-icons-list">
            {selectedIcons.map((icon, index) => (
              <span
                key={index}
                className="selected-icon"
              >
                {icon}
              </span>
            ))}
          </div>
        </div>
      )}

      {selectedIcons.length < maxIcons && (
        <p className="helper-text">
          Choose {maxIcons - selectedIcons.length} more icon{maxIcons - selectedIcons.length > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

