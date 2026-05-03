import { Router, Request, Response } from 'express'
import { getOrCreateUser, checkQuota, bindEmail, applyAffCode, storeEmailCode, verifyEmailCode, getGlobalDailyUsage, getConfig } from '../db.js'
import { rateLimit } from '../middleware/rate-limit.js'
import { sendVerificationEmail } from '../services/email.js'

const router = Router()

function today() {
  return new Date().toISOString().slice(0, 10)
}

router.post('/init', (req: Request, res: Response) => {
  const { fingerprint } = req.body
  if (!fingerprint) {
    res.status(400).json({ success: false, message: '缺少指纹' })
    return
  }

  const ip = req.ip || req.headers['x-forwarded-for'] as string || ''
  const user = getOrCreateUser(fingerprint, ip)
  const quota = checkQuota(user, today(), ip)

  res.json({
    success: true,
    data: {
      userId: user.id,
      email: user.email,
      affCode: user.aff_code,
      hasEmail: Boolean(user.email),
      banned: Boolean(user.banned),
      ...quota,
      userRemaining: user.banned ? 0 : quota.userRemaining,
      allowed: user.banned ? false : quota.allowed,
    },
  })
})

router.post('/check', (req: Request, res: Response) => {
  const { fingerprint } = req.body
  if (!fingerprint) {
    res.status(400).json({ success: false, message: '缺少指纹' })
    return
  }

  const ip = req.ip || req.headers['x-forwarded-for'] as string || ''
  const user = getOrCreateUser(fingerprint, ip)
  const quota = checkQuota(user, today(), ip)

  res.json({ success: true, data: quota })
})

router.get('/stats', (_req: Request, res: Response) => {
  const globalLimit = parseInt(getConfig('global_daily_limit')) || 1000
  const globalUsed = getGlobalDailyUsage(today())
  res.json({
    success: true,
    data: {
      globalUsed,
      globalLimit,
      globalRemaining: Math.max(0, globalLimit - globalUsed),
    },
  })
})

router.get('/captcha-config', (_req: Request, res: Response) => {
  const siteKey = getConfig('turnstile_site_key')
  res.json({ success: true, data: { enabled: Boolean(siteKey), siteKey } })
})

router.post('/bind-email', rateLimit(5, 60_000), (req: Request, res: Response) => {
  const { fingerprint, email, code, affCode } = req.body
  if (!fingerprint || !email || !code) {
    res.status(400).json({ success: false, message: '缺少参数' })
    return
  }

  if (!verifyEmailCode(email, code)) {
    res.status(400).json({ success: false, message: '验证码无效或已过期' })
    return
  }

  const user = getOrCreateUser(fingerprint)
  if (user.email) {
    res.status(400).json({ success: false, message: '已绑定邮箱' })
    return
  }

  if (!bindEmail(user.id, email)) {
    res.status(400).json({ success: false, message: '该邮箱已被其他用户绑定' })
    return
  }

  let affMsg = ''
  if (affCode) {
    const affResult = applyAffCode(user.id, affCode, fingerprint)
    affMsg = affResult.success ? affResult.message : affResult.message
  }

  const ip = req.ip || req.headers['x-forwarded-for'] as string || ''
  const updated = getOrCreateUser(fingerprint)
  const quota = checkQuota(updated, today(), ip)
  res.json({ success: true, message: '绑定成功' + (affMsg ? '，' + affMsg : ''), data: { email, ...quota } })
  res.json({ success: true, message: '邮箱绑定成功', data: { email, ...quota } })
})

import { randomInt } from 'crypto'

const EMAIL_DOMAIN_WHITELIST = ['qq.com', '163.com', '126.com', 'gmail.com', 'foxmail.com']

router.post('/send-code', rateLimit(3, 60_000), async (req: Request, res: Response) => {
  const { email } = req.body
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: '邮箱格式无效' })
    return
  }

  const domain = email.split('@')[1]?.toLowerCase()
  if (!EMAIL_DOMAIN_WHITELIST.includes(domain)) {
    res.status(400).json({ success: false, message: '仅支持 ' + EMAIL_DOMAIN_WHITELIST.join(', ') + ' 邮箱' })
    return
  }

  const code = String(randomInt(100000, 999999))
  storeEmailCode(email, code)

  try {
    await sendVerificationEmail(email, code)
  } catch (e) {
    console.error('[SMTP] Failed to send email:', e)
    res.status(500).json({ success: false, message: '邮件发送失败，请稍后重试' })
    return
  }

  res.json({ success: true, message: '验证码已发送（请检查邮箱）' })
})

router.post('/use-aff', rateLimit(5, 60_000), (req: Request, res: Response) => {
  const { fingerprint, affCode } = req.body
  if (!fingerprint || !affCode) {
    res.status(400).json({ success: false, message: '缺少参数' })
    return
  }

  const user = getOrCreateUser(fingerprint)
  const result = applyAffCode(user.id, affCode, fingerprint)

  if (!result.success) {
    res.status(400).json(result)
    return
  }

  const updated = getOrCreateUser(fingerprint)
  const quota = checkQuota(updated, today())
  res.json({ success: true, message: result.message, data: quota })
})

export default router
