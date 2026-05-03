import { Router, Request, Response } from 'express'
import { getOrCreateUser, checkAndReserveQuota, refundLastUsage, restoreBonusQuota, finalizeUsageLog, getConfig } from '../db.js'
import { config } from '../config.js'
import { rateLimit } from '../middleware/rate-limit.js'

const router = Router()

function today() {
  return new Date().toISOString().slice(0, 10)
}

// Anti-bot: track request timestamps per fingerprint
const lastRequest = new Map<string, number>()
setInterval(() => {
  const cutoff = Date.now() - 300_000
  for (const [k, v] of lastRequest) { if (v < cutoff) lastRequest.delete(k) }
}, 60_000)

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = getConfig('turnstile_secret')
  if (!secret) return true
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(ip)}`,
    })
    const data = await resp.json() as { success: boolean }
    return data.success
  } catch {
    return false
  }
}

router.use(rateLimit(20, 60_000))

router.all('/*', async (req: Request, res: Response) => {
  const fingerprint = req.headers['x-fingerprint'] as string
  if (!fingerprint) {
    res.status(400).json({ success: false, message: '缺少用户标识' })
    return
  }

  // Anti-bot checks
  const ua = req.headers['user-agent'] || ''
  if (!ua || ua.length < 20) {
    res.status(403).json({ success: false, message: '请求被拒绝' })
    return
  }

  const now = Date.now()
  const last = lastRequest.get(fingerprint) || 0
  if (now - last < 3000) {
    res.status(429).json({ success: false, message: '操作过快，请稍后' })
    return
  }
  lastRequest.set(fingerprint, now)

  // Turnstile verification (if configured)
  const turnstileToken = req.headers['x-turnstile'] as string
  const turnstileSecret = getConfig('turnstile_secret')
  if (turnstileSecret) {
    if (!turnstileToken) {
      res.status(403).json({ success: false, message: '请完成人机验证', code: 'CAPTCHA_REQUIRED' })
      return
    }
    const valid = await verifyTurnstile(turnstileToken, req.ip || '')
    if (!valid) {
      res.status(403).json({ success: false, message: '验证失败，请重试', code: 'CAPTCHA_FAILED' })
      return
    }
  }

  const apiKey = getConfig('builtin_api_key')
  if (!apiKey) {
    res.status(503).json({ success: false, message: '免费服务暂未配置' })
    return
  }

  const user = getOrCreateUser(fingerprint, req.ip)
  if (user.banned) {
    res.status(403).json({ success: false, message: '账户已被禁用' })
    return
  }

  const quota = checkAndReserveQuota(user.id, fingerprint, today(), req.ip)
  if (!quota.allowed) {
    res.status(429).json({ success: false, message: '今日额度已用完', data: quota })
    return
  }

  const targetPath = req.params[0] || ''
  const targetUrl = `${config.newApiUrl}/v1/${targetPath}`

  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': req.headers['content-type'] || 'application/json',
    }

    const fetchOpts: RequestInit = {
      method: req.method,
      headers,
      signal: AbortSignal.timeout(600_000),
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        const chunks: Buffer[] = []
        for await (const chunk of req as any) chunks.push(chunk)
        const bodyBuf = Buffer.concat(chunks)
        fetchOpts.body = bodyBuf
        headers['Content-Type'] = req.headers['content-type'] as string
        headers['Content-Length'] = String(bodyBuf.byteLength)
      } else {
        fetchOpts.body = JSON.stringify(req.body)
      }
    }

    const upstream = await fetch(targetUrl, fetchOpts)

    res.status(upstream.status)
    upstream.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value)
      }
    })

    const body = await upstream.arrayBuffer()
    res.send(Buffer.from(body))

    if (upstream.ok) {
      finalizeUsageLog(user.id, today(), 'ok')
    } else {
      let errMsg = `HTTP ${upstream.status}`
      try { const j = JSON.parse(Buffer.from(body).toString()); errMsg = j.error?.message || j.message || errMsg } catch {}
      finalizeUsageLog(user.id, today(), 'error', errMsg)
      const usedBefore = quota.userLimit - quota.userRemaining - 1
      refundLastUsage(user.id, today())
      if (usedBefore >= user.daily_limit) {
        restoreBonusQuota(user.id)
      }
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    finalizeUsageLog(user.id, today(), 'error', errMsg)
    const usedBefore = quota.userLimit - quota.userRemaining - 1
    refundLastUsage(user.id, today())
    if (usedBefore >= user.daily_limit) {
      restoreBonusQuota(user.id)
    }
    console.error('[free-proxy] Upstream error:', errMsg)
    if (!res.headersSent) {
      res.status(502).json({ success: false, message: '服务暂时不可用' })
    }
  }
})

export default router
