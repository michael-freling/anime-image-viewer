import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Extract the VERSION variable from the root Taskfile.yml.
 * The line format is `  VERSION: 0.1.0` (YAML scalar, no quotes needed for
 * semver strings). We use a simple regex rather than pulling in a YAML parser
 * to avoid an extra dev-dependency.
 */
function readVersionFromTaskfile(): string {
  try {
    const taskfilePath = path.resolve(__dirname, '..', 'Taskfile.yml')
    const content = fs.readFileSync(taskfilePath, 'utf-8')
    const match = content.match(/^\s*VERSION:\s*(.+)$/m)
    if (match) return match[1].trim()
  } catch {
    // Fall through — the file may be absent in CI or fresh checkouts.
  }
  return 'dev'
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(readVersionFromTaskfile()),
  },
})
