import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@react-three/uikit'],
  },
  resolve: {
    dedupe: ['@react-three/fiber', 'three'],
  },
})
