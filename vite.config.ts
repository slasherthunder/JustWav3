import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react()],
})
