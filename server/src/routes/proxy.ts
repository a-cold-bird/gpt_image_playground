import { createProxyMiddleware } from 'http-proxy-middleware'
import { config } from '../config.js'

export function createProxyRoutes() {
  return createProxyMiddleware({
    target: config.newApiUrl,
    changeOrigin: true,
    pathRewrite: { '^/v1': '/v1' },
    timeout: 600000,
    proxyTimeout: 600000,
    on: {
      error(err, _req, res) {
        console.error('Proxy error:', err.message)
        if ('writeHead' in res && typeof res.writeHead === 'function') {
          (res as any).writeHead(502, { 'Content-Type': 'application/json' })
          ;(res as any).end(JSON.stringify({ success: false, message: 'API 服务不可用' }))
        }
      },
    },
  })
}
