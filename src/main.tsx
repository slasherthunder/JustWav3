import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { syncDocumentAccessibilityFromStorage } from './accessibility/syncDocumentAccessibility'

syncDocumentAccessibilityFromStorage()
window.addEventListener('storage', () => {
  syncDocumentAccessibilityFromStorage()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
