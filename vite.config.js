import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // listen on all network interfaces
    port: process.env.PORT || 5173,  // use Cloud Run PORT or default 5173
    allowedHosts: true // allow requests from any host
  },
})
