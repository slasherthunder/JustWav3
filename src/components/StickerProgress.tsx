import './StickerProgress.css';

type StickerProgressProps = {
  total: number;
  currentIndex: number;
  labelId?: string;
};

/** Dot-based progress (reduces numeric / percentage focus). */
export function StickerProgress({ total, currentIndex, labelId }: StickerProgressProps) {
  if (total < 1) return null;

  return (
    <div
      className="sticker-progress"
      role="group"
      aria-labelledby={labelId}
      aria-label={`Question ${currentIndex + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`sticker-progress__dot ${i <= currentIndex ? 'sticker-progress__dot--active' : ''}`}
        />
      ))}
    </div>
  );
}
