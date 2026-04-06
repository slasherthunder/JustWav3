/**
 * Applies accessibility preferences from localStorage to document.body / documentElement.
 * Uses the same keys as ParentHome / TeacherHome so settings persist across all routes
 * (Learn, Practice, Messages, Landing, etc.) including full page refresh.
 *
 * Does not run bionic-reading DOM transforms (those require a mounted React tree).
 */

function parseFloatSafe(raw: string | null, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function syncDocumentAccessibilityFromStorage(): void {
  if (typeof document === 'undefined') return;

  const html = document.documentElement;
  const body = document.body;

  const textSize = parseFloatSafe(localStorage.getItem('home-text-size'), 1);
  html.style.setProperty('--text-size-multiplier', String(textSize));

  const highContrast = localStorage.getItem('home-high-contrast') === 'true';
  body.classList.toggle('high-contrast', highContrast);

  const fontPreference = localStorage.getItem('home-font');
  body.classList.toggle('font-opendyslexic', fontPreference === 'opendyslexic');
  if (fontPreference === 'opendyslexic' && !document.querySelector('link[data-opendyslexic]')) {
    const link = document.createElement('link');
    link.setAttribute('data-opendyslexic', 'true');
    link.href = 'https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/open-dyslexic.css';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }

  const reducedMotion = localStorage.getItem('home-reduced-motion') === 'true';
  html.style.setProperty('--motion-reduce', reducedMotion ? '1' : '0');

  const hideImages = localStorage.getItem('hide-images') === 'true';
  body.classList.toggle('hide-images', hideImages);

  const readableFonts = localStorage.getItem('readable-fonts') === 'true';
  body.classList.toggle('readable-fonts', readableFonts);

  const dyslexicFont = localStorage.getItem('dyslexic-font') === 'true';
  body.classList.toggle('dyslexic-font', dyslexicFont);

  const stopAnimations = localStorage.getItem('stop-animations') === 'true';
  if (stopAnimations) {
    html.style.setProperty('--animation-duration', '0s');
    html.style.setProperty('--transition-duration', '0s');
    body.classList.add('stop-animations');
  } else {
    html.style.removeProperty('--animation-duration');
    html.style.removeProperty('--transition-duration');
    body.classList.remove('stop-animations');
  }

  const invertColors = localStorage.getItem('invert-colors') === 'true';
  body.classList.toggle('invert-colors', invertColors);

  const brightness = parseFloatSafe(localStorage.getItem('brightness'), 100);
  const contrast = parseFloatSafe(localStorage.getItem('contrast'), 100);
  const saturation = parseFloatSafe(localStorage.getItem('saturation'), 100);
  const colorFilter = localStorage.getItem('color-filter') || 'none';

  let filterString = '';
  if (invertColors) filterString += 'invert(1) ';
  if (brightness !== 100) filterString += `brightness(${brightness}%) `;
  if (contrast !== 100) filterString += `contrast(${contrast}%) `;
  if (saturation !== 100) filterString += `saturate(${saturation}%) `;
  if (colorFilter === 'grayscale') filterString += 'grayscale(100%) ';

  if (filterString.trim()) {
    html.style.setProperty('filter', filterString.trim());
    body.classList.add('accessibility-filters');
  } else {
    html.style.removeProperty('filter');
    body.classList.remove('accessibility-filters');
  }

  const highlightLinks = localStorage.getItem('highlight-links') === 'true';
  body.classList.toggle('highlight-links', highlightLinks);

  const readingMask = localStorage.getItem('reading-mask') === 'true';
  body.classList.toggle('reading-mask', readingMask);

  const pageStructure = localStorage.getItem('page-structure') === 'true';
  body.classList.toggle('show-page-structure', pageStructure);

  const readingLine = localStorage.getItem('reading-line') === 'true';
  body.classList.toggle('reading-line', readingLine);
}
