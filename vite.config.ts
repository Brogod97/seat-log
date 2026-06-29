import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,  // LAN의 다른 기기(폰·태블릿)에서도 접속 가능하게 노출
  },
})
