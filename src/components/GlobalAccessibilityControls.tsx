import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAppAccessibility } from '../contexts/AppAccessibilityContext';
import { SimplifyIcon } from './SimplifyIcon';
import '../pages/Messages.css';
import '../pages/Landing.css';
import './GlobalAccessibility.css';

/**
 * Messages-equivalent accessibility controls (quick bar + settings panel) for all routes.
 */
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
    ttsProvider,
    setTtsProvider,
    elevenLabsApiKey,
    setElevenLabsApiKeyState,
  } = useAppAccessibility();

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAccessibilitySettings) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setShowAccessibilitySettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccessibilitySettings, setShowAccessibilitySettings]);

  useEffect(() => {
    if (!showAccessibilitySettings) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAccessibilitySettings(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showAccessibilitySettings, setShowAccessibilitySettings]);

  return (
    <div ref={rootRef} className="global-a11y-root" aria-label="Accessibility controls">
      {showAccessibilitySettings && (
        <motion.div
          className="accessibility-settings-panel global-a11y-panel"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
        >
          <div className="accessibility-settings-header">
            <h3>Accessibility Settings</h3>
            <button
              type="button"
              onClick={() => setShowAccessibilitySettings(false)}
              className="close-settings-button"
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>

          <div className="accessibility-settings-content">
            <div className="setting-group">
              <label htmlFor="message-spacing">Message Spacing</label>
              <div className="setting-options">
                <button
                  id="message-spacing-compact"
                  type="button"
                  className={`setting-option ${messageSpacing === 'compact' ? 'active' : ''}`}
                  onClick={() => setMessageSpacing('compact')}
                  aria-pressed={messageSpacing === 'compact'}
                >
                  Compact
                </button>
                <button
                  id="message-spacing-comfortable"
                  type="button"
                  className={`setting-option ${messageSpacing === 'comfortable' ? 'active' : ''}`}
                  onClick={() => setMessageSpacing('comfortable')}
                  aria-pressed={messageSpacing === 'comfortable'}
                >
                  Comfortable
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label htmlFor="color-theme">Color Theme</label>
              <div className="setting-options">
                <button
                  id="color-theme-default"
                  type="button"
                  className={`setting-option ${colorTheme === 'default' ? 'active' : ''}`}
                  onClick={() => setColorTheme('default')}
                  aria-pressed={colorTheme === 'default'}
                >
                  Default
                </button>
                <button
                  id="color-theme-high-contrast"
                  type="button"
                  className={`setting-option ${colorTheme === 'high-contrast' ? 'active' : ''}`}
                  onClick={() => setColorTheme('high-contrast')}
                  aria-pressed={colorTheme === 'high-contrast'}
                >
                  High Contrast
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label htmlFor="font-preference">Font</label>
              <div className="setting-options">
                <button
                  id="font-default"
                  type="button"
                  className={`setting-option ${fontPreference === 'default' ? 'active' : ''}`}
                  onClick={() => setFontPreference('default')}
                  aria-pressed={fontPreference === 'default'}
                >
                  Default
                </button>
                <button
                  id="font-opendyslexic"
                  type="button"
                  className={`setting-option ${fontPreference === 'opendyslexic' ? 'active' : ''}`}
                  onClick={() => setFontPreference('opendyslexic')}
                  aria-pressed={fontPreference === 'opendyslexic'}
                >
                  OpenDyslexic
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label htmlFor="view-mode">View Mode</label>
              <div className="setting-options">
                <button
                  id="view-mode-compact"
                  type="button"
                  className={`setting-option ${viewMode === 'compact' ? 'active' : ''}`}
                  onClick={() => setViewMode('compact')}
                  aria-pressed={viewMode === 'compact'}
                >
                  Compact
                </button>
                <button
                  id="view-mode-comfortable"
                  type="button"
                  className={`setting-option ${viewMode === 'comfortable' ? 'active' : ''}`}
                  onClick={() => setViewMode('comfortable')}
                  aria-pressed={viewMode === 'comfortable'}
                >
                  Comfortable
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label htmlFor="tts-provider">Text-to-Speech Provider</label>
              <div className="setting-options">
                <button
                  id="tts-provider-browser"
                  type="button"
                  className={`setting-option ${ttsProvider === 'browser' ? 'active' : ''}`}
                  onClick={() => setTtsProvider('browser')}
                  aria-pressed={ttsProvider === 'browser'}
                >
                  Browser (Default)
                </button>
                <button
                  id="tts-provider-elevenlabs"
                  type="button"
                  className={`setting-option ${ttsProvider === 'elevenlabs' ? 'active' : ''}`}
                  onClick={() => setTtsProvider('elevenlabs')}
                  aria-pressed={ttsProvider === 'elevenlabs'}
                >
                  ElevenLabs
                </button>
              </div>
              {ttsProvider === 'elevenlabs' && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label
                    htmlFor="elevenlabs-api-key"
                    style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}
                  >
                    ElevenLabs API Key (optional)
                  </label>
                  <input
                    type="password"
                    id="elevenlabs-api-key"
                    value={elevenLabsApiKey}
                    onChange={(e) => {
                      const value = e.target.value;
                      setElevenLabsApiKeyState(value);
                    }}
                    placeholder="Enter your API key"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.875rem',
                    }}
                  />
                  <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Get your API key from{' '}
                    <a
                      href="https://elevenlabs.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--primary-color)' }}
                    >
                      elevenlabs.io
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      <div className="messages-a11y-quick-bar global-a11y-quick-bar" role="toolbar" aria-label="Quick accessibility">
        <button
          type="button"
          className={`messages-a11y-quick-bar__btn ${simplificationMode ? 'is-active' : ''}`}
          onClick={() => setSimplificationMode((v) => !v)}
          aria-pressed={simplificationMode}
        >
          <SimplifyIcon size={18} className="messages-a11y-quick-bar__simplify-icon" />
          {simplificationMode ? 'Detailed view' : 'Simplify text'}
        </button>
        <button
          type="button"
          className={`messages-a11y-quick-bar__btn ${fontPreference === 'opendyslexic' ? 'is-active' : ''}`}
          onClick={() => setFontPreference(fontPreference === 'opendyslexic' ? 'default' : 'opendyslexic')}
          aria-pressed={fontPreference === 'opendyslexic'}
        >
          {fontPreference === 'opendyslexic' ? 'Standard font' : 'Dyslexia-friendly font'}
        </button>
      </div>

      <motion.button
        type="button"
        onClick={() => setShowAccessibilitySettings((v) => !v)}
        className="global-a11y-toggle btn-cyan-solid"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        aria-label="Accessibility settings"
        aria-expanded={showAccessibilitySettings}
      >
        Accessibility
      </motion.button>
    </div>
  );
}
