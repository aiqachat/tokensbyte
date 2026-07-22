/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Docker: VITE_API_TARGET=http://backend:3000；本地多实例由 dev 脚本注入
const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:3000'
const frontendPort = Number(process.env.FRONTEND_PORT || process.env.VITE_PORT || 5173) || 5173

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_ENABLE_PLUGINS': JSON.stringify(
        env.VITE_ENABLE_PLUGINS ?? 'true'
      ),
    },
    server: {
      host: '0.0.0.0',
      port: frontendPort,
      strictPort: Boolean(process.env.FRONTEND_PORT || process.env.VITE_PORT),
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
        },
        '/assets/icons/': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/home': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/portal': {
          target: apiTarget,
          changeOrigin: true,
        }
      }
    },
    optimizeDeps: {
      include: ['react-resizable'],
    },
    build: {
      assetsDir: 'static', // 避免默认的 assets 目录与前端路由 /assets 冲突，导致 Nginx 报 403
    }
  }
})

