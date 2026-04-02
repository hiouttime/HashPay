import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/app/',
  assetsInclude: ['**/*.tgs'],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8181',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
