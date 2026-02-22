import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Electric Cloud credentials — loaded from .env (never committed to git)
const env = loadEnv('', process.cwd(), '')
const STREAM_SERVICE_ID = env.STREAM_SERVICE_ID || ''
const STREAM_SECRET = env.STREAM_SECRET || ''

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/stream': {
        target: `https://api.electric-sql.cloud/v1/stream/${STREAM_SERVICE_ID}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/stream/, '/tappitytap-v4'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Authorization', `Bearer ${STREAM_SECRET}`)
          })
        },
      },
    },
  },
})
