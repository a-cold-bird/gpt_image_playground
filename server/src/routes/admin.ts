import { Router, Request, Response } from 'express'
import { adminAuth } from '../middleware/admin-auth.js'
import { rateLimit } from '../middleware/rate-limit.js'
import { getDashboardStats, getUsers, updateUser, deleteUsers, getUsageLogs, getAllConfig, setConfig, getConfig, getDashboardErrorCount } from '../db.js'
import { config } from '../config.js'

const router = Router()
router.use(rateLimit(20, 60_000))
router.use(adminAuth)

router.get('/dashboard', (_req: Request, res: Response) => {
  const stats = getDashboardStats()
  const errorCount = getDashboardErrorCount()
  res.json({ success: true, data: { ...stats, todayErrors: errorCount } })
})

router.get('/users', (req: Request, res: Response) => {
  const page = parseInt(String(req.query.page || '1'))
  const pageSize = Math.min(parseInt(String(req.query.pageSize || '20')), 100)
  const search = req.query.search ? String(req.query.search) : undefined
  res.json({ success: true, data: getUsers(page, pageSize, search) })
})

router.put('/users/:id', (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id))
  if (isNaN(id)) { res.status(400).json({ success: false, message: '无效 ID' }); return }
  const { daily_limit, bonus_quota, banned } = req.body
  const updates: Record<string, number> = {}
  if (daily_limit !== undefined) { const v = parseInt(daily_limit); if (!isNaN(v) && v >= 0) updates.daily_limit = v }
  if (bonus_quota !== undefined) { const v = parseInt(bonus_quota); if (!isNaN(v) && v >= 0) updates.bonus_quota = v }
  if (banned !== undefined) updates.banned = banned ? 1 : 0
  updateUser(id, updates)
  res.json({ success: true, message: '已更新' })
})

router.post('/users/batch', (req: Request, res: Response) => {
  const { ids, action } = req.body as { ids: number[]; action: string }
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ success: false, message: '请选择用户' })
    return
  }
  if (action === 'ban') {
    for (const id of ids) updateUser(id, { banned: 1 })
    res.json({ success: true, message: `已封禁 ${ids.length} 个用户` })
  } else if (action === 'unban') {
    for (const id of ids) updateUser(id, { banned: 0 })
    res.json({ success: true, message: `已解封 ${ids.length} 个用户` })
  } else if (action === 'delete') {
    deleteUsers(ids)
    res.json({ success: true, message: `已删除 ${ids.length} 个用户` })
  } else {
    res.status(400).json({ success: false, message: '未知操作' })
  }
})

router.get('/config', (_req: Request, res: Response) => {
  const cfg = getAllConfig()
  delete cfg.admin_password
  if (cfg.builtin_api_key) {
    const k = cfg.builtin_api_key
    cfg.builtin_api_key = k.length > 8 ? k.slice(0, 4) + '****' + k.slice(-4) : '****'
  }
  if (cfg.turnstile_secret) {
    const k = cfg.turnstile_secret
    cfg.turnstile_secret = k.length > 8 ? k.slice(0, 4) + '****' + k.slice(-4) : '****'
  }
  res.json({ success: true, data: cfg })
})

router.put('/config', (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>
  for (const [key, value] of Object.entries(updates)) {
    if ((key === 'builtin_api_key' || key === 'turnstile_secret') && value.includes('****')) continue
    setConfig(key, value)
  }
  res.json({ success: true, message: '配置已更新' })
})

router.get('/key-quota', async (_req: Request, res: Response) => {
  try {
    const apiKey = getConfig('builtin_api_key')
    if (!apiKey) {
      res.json({ success: true, data: { configured: false } })
      return
    }
    const resp = await fetch(`${config.newApiUrl}/api/usage/token/`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const body = await resp.json() as any
    if (body.code === true || body.success) {
      res.json({ success: true, data: { configured: true, ...body.data } })
    } else {
      res.json({ success: true, data: { configured: true, error: body.message || 'Invalid key' } })
    }
  } catch (e) {
    res.json({ success: true, data: { configured: false, error: e instanceof Error ? e.message : 'Failed' } })
  }
})

router.get('/logs', (req: Request, res: Response) => {
  const page = parseInt(String(req.query.page)) || 1
  const pageSize = Math.min(parseInt(String(req.query.pageSize)) || 50, 200)
  const date = req.query.date ? String(req.query.date) : undefined
  const userId = req.query.userId ? parseInt(String(req.query.userId)) : undefined
  const status = req.query.status ? String(req.query.status) : undefined
  const sortBy = req.query.sortBy ? String(req.query.sortBy) : undefined
  const sortDir = req.query.sortDir ? String(req.query.sortDir) : undefined
  res.json({ success: true, data: getUsageLogs(page, pageSize, date, userId, status, sortBy, sortDir) })
})

export default router
