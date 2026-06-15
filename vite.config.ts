import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 设置相对路径，兼容 GitHub Pages 子目录和 Vercel 根目录
})
