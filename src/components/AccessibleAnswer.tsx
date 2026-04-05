import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import './AccessibleAnswer.css';

export type AccessibleAnswerState = 'default' | 'correct' | 'incorrect';

export type AccessibleAnswerProps = {
  letter: string;
  value: string;
  color: string;
  onClick: () => void;
  isSelected: boolean;
  state?: AccessibleAnswerState;
  disabled?: boolean;
  /** Optional sticker or icon above the text (e.g. icons mode) */
  visual?: ReactNode;
};

export function AccessibleAnswer({
  letter,
  value,
  color,
  onClick,
  isSelected,
  state = 'default',
  disabled = false,
  visual,
}: AccessibleAnswerProps) {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`answer-tile answer-tile--${state} ${isSelected ? 'answer-tile--selected' : ''}`}
      style={{ borderLeftColor: color }}
      aria-pressed={isSelected}
    >
      {visual && <div className="answer-tile__visual">{visual}</div>}
      <span className="answer-tile__row">
        <span className="answer-tile__letter">{letter}</span>
        <span className="answer-tile__value">{value}</span>
        {isSelected && state === 'default' && (
          <span className="answer-tile__check" aria-hidden>
            ✓
          </span>
        )}
        {state === 'correct' && (
          <span className="answer-tile__check answer-tile__check--success" aria-hidden>
            ✓
          </span>
        )}
        {state === 'incorrect' && (
          <span className="answer-tile__x" aria-hidden>
            ×
          </span>
        )}
      </span>
    </motion.button>
  );
}
