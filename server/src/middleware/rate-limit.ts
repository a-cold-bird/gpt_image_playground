import { Request, Response, NextFunction } from 'express'

const hits = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.socket.remoteAddress || req.ip || 'unknown'
    const now = Date.now()
    let entry = hits.get(key)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      hits.set(key, entry)
    }
    entry.count++
    if (entry.count > maxRequests) {
      res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' })
      return
    }
    next()
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) hits.delete(key)
  }
}, 60_000)
