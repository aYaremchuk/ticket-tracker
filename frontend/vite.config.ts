import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Local dev convenience: proxy /api to the Rails container so `npm run dev`
    // behaves like the nginx-proxied production setup (single origin, no CORS).
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
