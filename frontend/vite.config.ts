import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// 代理目标：Docker 内通过环境变量指定为 http://backend:3000，
// 本地直接运行 npm run dev 时回落到 http://localhost:3000
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,  // Docker 挂载卷需要轮询监听文件变动
    },
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/v1': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/v1beta': {
        target: apiTarget,
        changeOrigin: true,
      }
    }
  }
})
