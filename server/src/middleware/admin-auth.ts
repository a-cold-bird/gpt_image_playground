import { Request, Response, NextFunction } from 'express'
import { timingSafeEqual } from 'crypto'
import { getConfig } from '../db.js'

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  const password = getConfig('admin_password')
  if (!auth || !password) {
    res.status(401).json({ success: false, message: '未授权' })
    return
  }

  const provided = auth.replace('Bearer ', '')
  try {
    const a = Buffer.from(provided)
    const b = Buffer.from(password)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      res.status(401).json({ success: false, message: '未授权' })
      return
    }
  } catch {
    res.status(401).json({ success: false, message: '未授权' })
    return
  }

  next()
}
