import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  setTTSProvider as applyTtsProvider,
  setElevenLabsApiKey,
  getElevenLabsApiKey,
} from '../utils/ttsService';
import { syncDocumentAccessibilityFromStorage } from '../accessibility/syncDocumentAccessibility';

export type MessageSpacing = 'compact' | 'comfortable';
export type ColorTheme = 'default' | 'high-contrast' | 'warm' | 'cool';
export type FontPreference = 'default' | 'opendyslexic';
export type ViewMode = 'compact' | 'comfortable';
export type TtsProviderChoice = 'browser' | 'elevenlabs';

type AppAccessibilityValue = {
  messageSpacing: MessageSpacing;
  setMessageSpacing: (v: MessageSpacing) => void;
  colorTheme: ColorTheme;
  setColorTheme: (v: ColorTheme) => void;
  fontPreference: FontPreference;
  setFontPreference: (v: FontPreference) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  simplificationMode: boolean;
  setSimplificationMode: (v: boolean | ((p: boolean) => boolean)) => void;
  showAccessibilitySettings: boolean;
  setShowAccessibilitySettings: (v: boolean | ((p: boolean) => boolean)) => void;
  ttsProvider: TtsProviderChoice;
  setTtsProvider: (v: TtsProviderChoice) => void;
  elevenLabsApiKey: string;
  setElevenLabsApiKeyState: (v: string) => void;
  /** Same class string Messages uses for layout + theme tokens */
  messagesContainerClassNames: string;
};

const AppAccessibilityContext = createContext<AppAccessibilityValue | null>(null);

export function AppAccessibilityProvider({ children }: { children: ReactNode }) {
  const [simplificationMode, setSimplificationMode] = useState(() => {
    return localStorage.getItem('messages-simplification') === 'true';
  });

  const [messageSpacing, setMessageSpacing] = useState<MessageSpacing>(() => {
    const home = localStorage.getItem('home-spacing');
    if (home === 'compact' || home === 'comfortable') return home;
    const saved = localStorage.getItem('messages-spacing');
    return saved === 'compact' || saved === 'comfortable' ? saved : 'comfortable';
  });

  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
    const saved = localStorage.getItem('messages-theme');
    if (
      saved === 'default' ||
      saved === 'high-contrast' ||
      saved === 'warm' ||
      saved === 'cool'
    ) {
      return saved;
    }
    const homeHc = localStorage.getItem('home-high-contrast');
    if (homeHc === 'true') return 'high-contrast';
    return 'default';
  });

  const [fontPreference, setFontPreference] = useState<FontPreference>(() => {
    const home = localStorage.getItem('home-font');
    if (home === 'default' || home === 'opendyslexic') return home;
    const saved = localStorage.getItem('messages-font');
    return saved === 'default' || saved === 'opendyslexic' ? saved : 'default';
  });

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('messages-view-mode');
    return saved === 'compact' || saved === 'comfortable' ? saved : 'comfortable';
  });

  const [showAccessibilitySettings, setShowAccessibilitySettings] = useState(false);

  const [ttsProvider, setTtsProvider] = useState<TtsProviderChoice>(() => {
    const saved = localStorage.getItem('tts-provider');
    if (saved === 'browser' || saved === 'elevenlabs') return saved;
    // Default to "disabled" behavior for hover-reader UX.
    return 'elevenlabs';
  });

  const [elevenLabsApiKey, setElevenLabsApiKeyState] = useState<string>(() => {
    return getElevenLabsApiKey() || '';
  });

  useEffect(() => {
    localStorage.setItem('messages-simplification', simplificationMode ? 'true' : 'false');
  }, [simplificationMode]);

  useEffect(() => {
    localStorage.setItem('messages-spacing', messageSpacing);
    localStorage.setItem('home-spacing', messageSpacing);
  }, [messageSpacing]);

  useEffect(() => {
    localStorage.setItem('messages-theme', colorTheme);
    localStorage.setItem('home-high-contrast', colorTheme === 'high-contrast' ? 'true' : 'false');
    syncDocumentAccessibilityFromStorage();
  }, [colorTheme]);

  useEffect(() => {
    localStorage.setItem('messages-font', fontPreference);
    localStorage.setItem('home-font', fontPreference);
    syncDocumentAccessibilityFromStorage();
  }, [fontPreference]);

  useEffect(() => {
    localStorage.setItem('messages-view-mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    applyTtsProvider(ttsProvider);
  }, [ttsProvider]);

  useEffect(() => {
    if (fontPreference === 'opendyslexic') {
      const existingLink = document.querySelector('link[data-opendyslexic]');
      if (!existingLink) {
        const link = document.createElement('link');
        link.setAttribute('data-opendyslexic', 'true');
        link.href = 'https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/open-dyslexic.css';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
    }
  }, [fontPreference]);

  const setElevenLabsKey = useCallback((value: string) => {
    setElevenLabsApiKeyState(value);
    setElevenLabsApiKey(value || null);
  }, []);

  const messagesContainerClassNames = useMemo(
    () =>
      [
        'messages-app-wrapper',
        'landing-wrapper',
        'brand-bg-light',
        'messages-container',
        'messages-ui-modern',
        `spacing-${messageSpacing}`,
        `theme-${colorTheme}`,
        `font-${fontPreference}`,
        `view-${viewMode}`,
      ].join(' '),
    [messageSpacing, colorTheme, fontPreference, viewMode]
  );

  const value = useMemo<AppAccessibilityValue>(
    () => ({
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
      setElevenLabsApiKeyState: setElevenLabsKey,
      messagesContainerClassNames,
    }),
    [
      messageSpacing,
      colorTheme,
      fontPreference,
      viewMode,
      simplificationMode,
      showAccessibilitySettings,
      ttsProvider,
      elevenLabsApiKey,
      setElevenLabsKey,
      messagesContainerClassNames,
    ]
  );

  return (
    <AppAccessibilityContext.Provider value={value}>{children}</AppAccessibilityContext.Provider>
  );
}

export function useAppAccessibility(): AppAccessibilityValue {
  const ctx = useContext(AppAccessibilityContext);
  if (!ctx) {
    throw new Error('useAppAccessibility must be used within AppAccessibilityProvider');
  }
  return ctx;
}
