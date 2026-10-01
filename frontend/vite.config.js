import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.js' },
    server: {
      proxy: { '/api': env.API_PROXY || 'http://localhost:8000' },
    },
  }
})
