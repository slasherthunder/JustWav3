import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** GitHub Pages serves 404.html for unknown paths; copy SPA shell so deep links work. */
function spa404Fallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    closeBundle() {
      const index = path.resolve(__dirname, 'dist/index.html')
      const dest = path.resolve(__dirname, 'dist/404.html')
      if (fs.existsSync(index)) {
        fs.copyFileSync(index, dest)
      }
    },
  }
}

// GitHub Pages:
// - Project site (repo "my-app"): https://<user>.github.io/my-app/  → base "/my-app/"
// - User site (repo "user.github.io"): https://<user>.github.io/   → base "/" (NOT "/user.github.io/")
// In GitHub Actions, GITHUB_REPOSITORY is "owner/repo".
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const isUserSiteRepo = repoName?.endsWith('.github.io') ?? false
const base =
  process.env.VITE_BASE_PATH ??
  (repoName && !isUserSiteRepo ? `/${repoName}/` : '/')

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), spa404Fallback()],
})
