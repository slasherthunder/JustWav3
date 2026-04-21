import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppAccessibility } from '../contexts/AppAccessibilityContext';
import { SimplifyIcon } from './SimplifyIcon';
import '../pages/Messages.css';
import '../pages/Landing.css';
import './GlobalAccessibility.css';

interface ExtraState {
  fontSize: number; // 80–150 (%)
  lineSpacing: number; // 1.0–2.5
  letterSpacing: number; // 0–4 (px)
  wordSpacing: boolean;
  focusMode: boolean;
  reduceMotion: boolean;
  largeCursor: boolean;
  focusRing: boolean;
  accentColor: string;
  density: 'compact' | 'comfortable' | 'spacious';
  fontStyle: 'default' | 'opendyslexic' | 'serif' | 'mono';
}

const ACCENT_COLORS = [
  { color: '#0891b2', label: 'Teal' },
  { color: '#7c3aed', label: 'Purple' },
  { color: '#059669', label: 'Green' },
  { color: '#d97706', label: 'Amber' },
  { color: '#dc2626', label: 'Red' },
  { color: '#db2777', label: 'Pink' },
];

export function GlobalAccessibilityControls() {
  const {
    messageSpacing,
    setMessageSpacing,
    colorTheme,
    setColorTheme,
    fontPreference,
    setFontPreference,
    viewMode,
    setViewMode,
    simplificationMode,
    setSimplificationMode,
    showAccessibilitySettings,
    setShowAccessibilitySettings,
    setTtsProvider,
    ttsProvider,
  } = useAppAccessibility();

  const rootRef = useRef<HTMLDivElement>(null);
  const lastSpokenRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  const [extra, setExtra] = useState<ExtraState>({
    fontSize: 100,
    lineSpacing: 1.6,
    letterSpacing: 0,
    wordSpacing: false,
    focusMode: false,
    reduceMotion: false,
    largeCursor: false,
    focusRing: true,
    accentColor: '#0891b2',
    density: 'comfortable',
    fontStyle: 'default',
  });

  const setExtra_ = <K extends keyof ExtraState>(key: K, val: ExtraState[K]) =>
    setExtra((prev) => ({ ...prev, [key]: val }));

  // ── Sync context-driven attrs ──────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.setAttribute('data-a11y-spacing', messageSpacing);
    root.setAttribute('data-a11y-theme', colorTheme);
    root.setAttribute('data-a11y-font', fontPreference);
    root.setAttribute('data-a11y-view', viewMode);
    root.classList.toggle('a11y-simplified', simplificationMode);
    body.classList.toggle('high-contrast', colorTheme === 'high-contrast');
    body.classList.toggle('font-opendyslexic', fontPreference === 'opendyslexic');
  }, [messageSpacing, colorTheme, fontPreference, viewMode, simplificationMode]);

  // ── Sync extra attrs ───────────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.style.setProperty('--a11y-font-size', String(extra.fontSize));
    root.style.setProperty('--a11y-line-spacing', String(extra.lineSpacing));
    root.style.setProperty('--a11y-letter-spacing', `${extra.letterSpacing}px`);
    root.style.setProperty('--a11y-word-spacing', extra.wordSpacing ? '0.3em' : '0');
    root.style.setProperty('--a11y-accent', extra.accentColor);

    body.classList.toggle('a11y-focus-mode', extra.focusMode);
    body.classList.toggle('a11y-reduce-motion', extra.reduceMotion);
    body.classList.toggle('a11y-large-cursor', extra.largeCursor);
    body.classList.toggle('a11y-no-focus-ring', !extra.focusRing);
    body.classList.toggle('a11y-word-spacing', extra.wordSpacing);

    root.setAttribute('data-a11y-density', extra.density);
    root.setAttribute('data-a11y-font-style', extra.fontStyle);
  }, [extra]);

  // ── Close panel on outside click / Escape ─────────────────────────────────
  useEffect(() => {
    if (!showAccessibilitySettings) return;
    const handle = (e: Event) => {
      if (e instanceof MouseEvent && rootRef.current && !rootRef.current.contains(e.target as Node))
        setShowAccessibilitySettings(false);
      if (e instanceof KeyboardEvent && e.key === 'Escape') setShowAccessibilitySettings(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handle as EventListener);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handle as EventListener);
    };
  }, [showAccessibilitySettings, setShowAccessibilitySettings]);

  // ── Hover / focus voice reader ─────────────────────────────────────────────
  const speak = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const now = Date.now();
    if (lastSpokenRef.current.text === text && now - lastSpokenRef.current.at < 1200) return;
    lastSpokenRef.current = { text, at: now };
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.length > 140 ? `${text.slice(0, 140)}…` : text);
      u.rate = 0.95;
      u.pitch = 1;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    } catch {
      /* no-op */
    }
  }, []);

  const pickText = (el: HTMLElement | null): string => {
    if (!el) return '';
    const ariaLabel = el.getAttribute('aria-label')?.trim() ?? '';
    const title = el.getAttribute('title')?.trim() ?? '';
    const alt = (el as HTMLImageElement).alt?.trim() ?? '';
    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    const candidate = ariaLabel || title || alt || text;
    return candidate.length > 140 ? `${candidate.slice(0, 140)}…` : candidate;
  };

  useEffect(() => {
    if (ttsProvider !== 'browser') return;

    const onOver = (e: Event) => {
      const t = e.target as HTMLElement | null;
      const focused =
        (t?.closest(
          'button,a,input,select,textarea,[role="button"],[role="link"],[role="menuitem"],[tabindex]',
        ) as HTMLElement | null) ?? t;
      speak(pickText(focused));
    };
    const onFocus = (e: FocusEvent) => speak(pickText(e.target as HTMLElement));

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('focusin', onFocus, true);
    return () => {
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('focusin', onFocus, true);
    };
  }, [ttsProvider, speak]);

  // ── Active-setting count for status badge ──────────────────────────────────
  const activeCount = [
    colorTheme !== 'default',
    fontPreference !== 'default',
    viewMode !== 'comfortable',
    messageSpacing !== 'comfortable',
    simplificationMode,
    ttsProvider === 'browser',
    extra.fontSize !== 100,
    extra.lineSpacing !== 1.6,
    extra.letterSpacing !== 0,
    extra.wordSpacing,
    extra.focusMode,
    extra.reduceMotion,
    extra.largeCursor,
    !extra.focusRing,
    extra.density !== 'comfortable',
    extra.fontStyle !== 'default',
  ].filter(Boolean).length;

  return (
    <div ref={rootRef} className="global-a11y-root">
      <motion.button
        type="button"
        onClick={() => setShowAccessibilitySettings((v) => !v)}
        className="global-a11y-toggle"
        style={{ '--a11y-accent': extra.accentColor } as CSSProperties}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-expanded={showAccessibilitySettings}
        aria-label="Toggle accessibility settings"
      >
        <span aria-hidden>♿</span>
        {activeCount > 0 && (
          <span className="a11y-badge" aria-label={`${activeCount} settings active`}>
            {activeCount}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {showAccessibilitySettings && (
          <motion.div
            className="accessibility-settings-panel global-a11y-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Accessibility settings"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.15 }}
          >
            <div className="accessibility-settings-header">
              <h3>Accessibility</h3>
              <button
                type="button"
                onClick={() => setShowAccessibilitySettings(false)}
                aria-label="Close accessibility settings"
              >
                ✕
              </button>
            </div>

            <div className="messages-a11y-quick-bar" role="toolbar" aria-label="Quick actions">
              <button
                type="button"
                className={`messages-a11y-quick-bar__btn ${simplificationMode ? 'is-active' : ''}`}
                onClick={() => setSimplificationMode((v) => !v)}
                aria-pressed={simplificationMode}
              >
                <SimplifyIcon size={18} />
                {simplificationMode ? 'Detailed view' : 'Simplify text'}
              </button>

              <button
                type="button"
                className={`messages-a11y-quick-bar__btn ${extra.focusMode ? 'is-active' : ''}`}
                onClick={() => setExtra_('focusMode', !extra.focusMode)}
                aria-pressed={extra.focusMode}
              >
                ◎ Focus mode
              </button>

              <button
                type="button"
                className={`messages-a11y-quick-bar__btn ${extra.reduceMotion ? 'is-active' : ''}`}
                onClick={() => setExtra_('reduceMotion', !extra.reduceMotion)}
                aria-pressed={extra.reduceMotion}
              >
                ⟳ Reduce motion
              </button>
            </div>

            <div className="accessibility-settings-content">
              <div className="setting-group">
                <label>Color theme</label>
                <div className="setting-options">
                  {(['default', 'high-contrast', 'warm', 'cool'] as const).map((opt) => (
                    <button
                      key={opt}
                      className={`setting-option ${colorTheme === opt ? 'active' : ''}`}
                      onClick={() => setColorTheme(opt)}
                      aria-pressed={colorTheme === opt}
                    >
                      {opt === 'default'
                        ? 'Default'
                        : opt === 'high-contrast'
                          ? 'High contrast'
                          : opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-group">
                <label>Accent color</label>
                <div className="a11y-swatches">
                  {ACCENT_COLORS.map(({ color, label }) => (
                    <button
                      key={color}
                      className={`a11y-swatch ${extra.accentColor === color ? 'active' : ''}`}
                      style={{ background: color }}
                      onClick={() => setExtra_('accentColor', color)}
                      aria-label={label}
                      aria-pressed={extra.accentColor === color}
                      title={label}
                      type="button"
                    />
                  ))}
                </div>
              </div>

              <div className="setting-group">
                <label>Font style</label>
                <div className="setting-options">
                  {(['default', 'opendyslexic', 'serif', 'mono'] as const).map((opt) => (
                    <button
                      key={opt}
                      className={`setting-option ${extra.fontStyle === opt ? 'active' : ''}`}
                      onClick={() => {
                        setExtra_('fontStyle', opt);
                        setFontPreference(opt === 'opendyslexic' ? 'opendyslexic' : 'default');
                      }}
                      aria-pressed={extra.fontStyle === opt}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-group">
                <label htmlFor="a11y-font-size">
                  Font size <span className="setting-val">{extra.fontSize}%</span>
                </label>
                <input
                  id="a11y-font-size"
                  type="range"
                  min={80}
                  max={150}
                  step={5}
                  value={extra.fontSize}
                  onChange={(e) => setExtra_('fontSize', Number(e.target.value))}
                  className="a11y-slider"
                  aria-valuetext={`${extra.fontSize} percent`}
                />
              </div>

              <div className="setting-group">
                <label htmlFor="a11y-line-spacing">
                  Line spacing <span className="setting-val">{extra.lineSpacing.toFixed(1)}×</span>
                </label>
                <input
                  id="a11y-line-spacing"
                  type="range"
                  min={1}
                  max={2.5}
                  step={0.1}
                  value={extra.lineSpacing}
                  onChange={(e) => setExtra_('lineSpacing', Number(e.target.value))}
                  className="a11y-slider"
                />
              </div>

              <div className="setting-group">
                <label htmlFor="a11y-letter-spacing">
                  Letter spacing{' '}
                  <span className="setting-val">{extra.letterSpacing.toFixed(1)}px</span>
                </label>
                <input
                  id="a11y-letter-spacing"
                  type="range"
                  min={0}
                  max={4}
                  step={0.5}
                  value={extra.letterSpacing}
                  onChange={(e) => setExtra_('letterSpacing', Number(e.target.value))}
                  className="a11y-slider"
                />
              </div>

              <div className="setting-group">
                <label>Message spacing</label>
                <div className="setting-options">
                  {(['compact', 'comfortable'] as const).map((opt) => (
                    <button
                      key={opt}
                      className={`setting-option ${messageSpacing === opt ? 'active' : ''}`}
                      onClick={() => setMessageSpacing(opt)}
                      aria-pressed={messageSpacing === opt}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-group">
                <label>Content density</label>
                <div className="setting-options">
                  {(['compact', 'comfortable', 'spacious'] as const).map((opt) => (
                    <button
                      key={opt}
                      className={`setting-option ${extra.density === opt ? 'active' : ''}`}
                      onClick={() => setExtra_('density', opt)}
                      aria-pressed={extra.density === opt}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-group">
                <label>View mode</label>
                <div className="setting-options">
                  {(['compact', 'comfortable'] as const).map((opt) => (
                    <button
                      key={opt}
                      className={`setting-option ${viewMode === opt ? 'active' : ''}`}
                      onClick={() => setViewMode(opt)}
                      aria-pressed={viewMode === opt}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-divider" />

              <A11yToggle
                label="Screen reader (voice)"
                description="Read hovered elements aloud"
                checked={ttsProvider === 'browser'}
                onChange={(on) => setTtsProvider(on ? 'browser' : 'elevenlabs')}
              />
              <A11yToggle
                label="Word spacing"
                description="Increase space between words"
                checked={extra.wordSpacing}
                onChange={(on) => setExtra_('wordSpacing', on)}
              />
              <A11yToggle
                label="Keyboard focus ring"
                description="Show visible focus outlines"
                checked={extra.focusRing}
                onChange={(on) => setExtra_('focusRing', on)}
              />
              <A11yToggle
                label="Large cursor"
                description="Enlarge the mouse pointer"
                checked={extra.largeCursor}
                onChange={(on) => setExtra_('largeCursor', on)}
              />

              {activeCount > 0 && (
                <div className="a11y-status-bar">
                  <span className="a11y-status-dot" />
                  {activeCount} setting{activeCount !== 1 ? 's' : ''} customized
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function A11yToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="a11y-toggle-row">
      <div className="a11y-toggle-info">
        <span className="a11y-toggle-title">{label}</span>
        <span className="a11y-toggle-desc">{description}</span>
      </div>
      <label className="a11y-switch" aria-label={label}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="a11y-switch-track" />
      </label>
    </div>
  );
}
