import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import quotaRoutes from './routes/quota.js'
import adminRoutes from './routes/admin.js'
import freeProxyRoutes from './routes/free-proxy.js'
import { createProxyRoutes } from './routes/proxy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.set('trust proxy', true)

app.use(cors({ origin: true, credentials: true }))

app.use('/api/quota', express.json({ limit: '16kb' }), quotaRoutes)
app.use('/api/admin', express.json({ limit: '16kb' }), adminRoutes)
app.use('/api/free/v1', express.json({ limit: '50mb' }), freeProxyRoutes)
app.use('/v1', createProxyRoutes())

// Admin panel
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '../views/admin.html'))
})

// Static frontend
const distPath = path.join(__dirname, '../../dist')
app.use(express.static(distPath))
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(config.port, () => {
  console.log(`Playground server running on port ${config.port}`)
  console.log(`Proxying /v1 to ${config.newApiUrl}`)
  console.log(`Admin panel: http://localhost:${config.port}/admin`)
})
