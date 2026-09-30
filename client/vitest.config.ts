import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    reporters: process.env.GITHUB_ACTIONS === 'true'
      ? ['default', 'json']
      : undefined,
    outputFile: process.env.GITHUB_ACTIONS === 'true'
      ? { json: `${process.env.RUNNER_TEMP}/lift-vitest-report.json` }
      : undefined,
  },
})
