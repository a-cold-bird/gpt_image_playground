import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { randomBytes, randomInt } from 'crypto'
import { config } from './config.js'

const dbDir = path.dirname(config.dbPath)
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

const db: InstanceType<typeof Database> = new Database(config.dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT NOT NULL UNIQUE,
    ip TEXT,
    email TEXT UNIQUE,
    daily_limit INTEGER DEFAULT ${config.perUserUnverifiedLimit},
    bonus_quota INTEGER DEFAULT 0,
    aff_code TEXT UNIQUE,
    invited_by INTEGER REFERENCES users(id),
    banned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    ip TEXT,
    status TEXT DEFAULT 'ok',
    error_msg TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_logs(date);
  CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_logs(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_usage_ip_date ON usage_logs(ip, date);
`)

// Migration: add columns to existing tables
try { db.exec('ALTER TABLE usage_logs ADD COLUMN status TEXT DEFAULT \'ok\'') } catch {}
try { db.exec('ALTER TABLE usage_logs ADD COLUMN error_msg TEXT') } catch {}
try { db.exec('ALTER TABLE usage_logs ADD COLUMN ip TEXT') } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS email_codes (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

function ensureConfig(key: string, defaultValue: string) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(key, defaultValue)
  }
}

ensureConfig('global_daily_limit', String(config.globalDailyLimit))
ensureConfig('per_user_daily_limit', String(config.perUserDailyLimit))
ensureConfig('per_user_unverified_limit', String(config.perUserUnverifiedLimit))
ensureConfig('aff_bonus', String(config.affBonus))
ensureConfig('per_ip_daily_limit', '100')
ensureConfig('turnstile_site_key', '')
ensureConfig('turnstile_secret', '')
ensureConfig('builtin_api_key', config.builtinApiKey)
ensureConfig('admin_password', config.adminPassword)

export function getConfig(key: string): string {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? ''
}

export function setConfig(key: string, value: string) {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value)
}

export function getAllConfig(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM config').all() as { key: string; value: string }[]
  const result: Record<string, string> = {}
  for (const row of rows) result[row.key] = row.value
  return result
}

function generateAffCode(): string {
  return randomBytes(6).toString('base64url').slice(0, 8)
}

export interface User {
  id: number
  fingerprint: string
  ip: string | null
  email: string | null
  daily_limit: number
  bonus_quota: number
  aff_code: string
  invited_by: number | null
  banned: number
  created_at: string
  last_seen: string
}

export function getOrCreateUser(fingerprint: string, ip?: string): User {
  let user = db.prepare('SELECT * FROM users WHERE fingerprint = ?').get(fingerprint) as User | undefined
  if (!user) {
    const affCode = generateAffCode()
    let dailyLimit = parseInt(getConfig('per_user_unverified_limit')) || 3

    // Anti-abuse: only 1 unverified user per IP, ever
    if (ip) {
      const existing = (db.prepare(`
        SELECT COUNT(*) as count FROM users WHERE ip = ? AND email IS NULL
      `).get(ip) as { count: number }).count
      if (existing > 0) dailyLimit = 0
    }

    try {
      db.prepare('INSERT INTO users (fingerprint, ip, daily_limit, aff_code) VALUES (?, ?, ?, ?)').run(fingerprint, ip || null, dailyLimit, affCode)
    } catch {
      // UNIQUE constraint — concurrent request created it first
    }
    user = db.prepare('SELECT * FROM users WHERE fingerprint = ?').get(fingerprint) as User
  } else {
    db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP, ip = COALESCE(?, ip) WHERE id = ?').run(ip || null, user.id)
  }
  return user
}

export function getUserById(id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined
}

export function getUserDailyUsage(userId: number, date: string): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND date = ? AND status != \'refunded\'').get(userId, date) as { count: number }
  return row.count
}

export function getGlobalDailyUsage(date: string): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM usage_logs WHERE date = ? AND status != \'refunded\'').get(date) as { count: number }
  return row.count
}

export function getIpDailyUsage(ip: string, date: string): number {
  if (!ip) return 0
  const row = db.prepare('SELECT COUNT(*) as count FROM usage_logs WHERE ip = ? AND date = ?').get(ip, date) as { count: number }
  return row.count
}

export function getIpUnverifiedDailyUsage(ip: string, date: string): number {
  if (!ip) return 0
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM usage_logs l
    JOIN users u ON l.user_id = u.id
    WHERE l.ip = ? AND l.date = ? AND u.email IS NULL
  `).get(ip, date) as { count: number }
  return row.count
}

export function recordUsage(userId: number, date: string, status = 'ok', errorMsg?: string) {
  db.prepare('INSERT INTO usage_logs (user_id, date, status, error_msg) VALUES (?, ?, ?, ?)').run(userId, date, status, errorMsg || null)
}

export function refundLastUsage(userId: number, date: string) {
  db.prepare('UPDATE usage_logs SET status = \'refunded\' WHERE id = (SELECT id FROM usage_logs WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1)').run(userId, date)
}

export function finalizeUsageLog(userId: number, date: string, status: string, errorMsg?: string) {
  db.prepare('UPDATE usage_logs SET status = ?, error_msg = ? WHERE id = (SELECT id FROM usage_logs WHERE user_id = ? AND date = ? AND status = \'pending\' ORDER BY id DESC LIMIT 1)').run(status, errorMsg || null, userId, date)
}

export function restoreBonusQuota(userId: number) {
  db.prepare('UPDATE users SET bonus_quota = bonus_quota + 1 WHERE id = ?').run(userId)
}

export function getUserEffectiveLimit(user: User, dailyUsed: number): number {
  // daily_limit refreshes each day; bonus_quota is one-time consumable
  // User gets daily_limit per day + any remaining bonus_quota
  return user.daily_limit + user.bonus_quota
}

export function checkQuota(user: User, date: string, ip?: string): { allowed: boolean; userRemaining: number; globalRemaining: number; userLimit: number; globalLimit: number; ipLimited: boolean } {
  const globalLimit = parseInt(getConfig('global_daily_limit')) || 1000
  const globalUsed = getGlobalDailyUsage(date)
  const userUsed = getUserDailyUsage(user.id, date)
  const userLimit = user.daily_limit + user.bonus_quota

  const ipLimit = parseInt(getConfig('per_ip_daily_limit')) || 100
  const ipUsed = ip ? getIpDailyUsage(ip, date) : 0
  const ipLimited = Boolean(ip) && ipUsed >= ipLimit

  return {
    allowed: !user.banned && userUsed < userLimit && globalUsed < globalLimit && !ipLimited,
    userRemaining: Math.max(0, userLimit - userUsed),
    globalRemaining: Math.max(0, globalLimit - globalUsed),
    userLimit,
    globalLimit,
    ipLimited,
  }
}

export function checkAndReserveQuota(userId: number, fingerprint: string, date: string, ip?: string): { allowed: boolean; userRemaining: number; globalRemaining: number; userLimit: number; globalLimit: number } {
  const result = db.transaction(() => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined
    if (!user || user.banned) {
      return { allowed: false, userRemaining: 0, globalRemaining: 0, userLimit: 0, globalLimit: 0 }
    }
    const globalLimit = parseInt(getConfig('global_daily_limit')) || 1000
    const globalUsed = getGlobalDailyUsage(date)
    const userUsed = getUserDailyUsage(user.id, date)
    const userLimit = user.daily_limit + user.bonus_quota

    const ipLimit = parseInt(getConfig('per_ip_daily_limit')) || 100
    const ipUsed = ip ? getIpDailyUsage(ip, date) : 0
    let ipLimited = Boolean(ip) && ipUsed >= ipLimit

    if (!ipLimited && !user.email && ip) {
      const ipUnverifiedLimit = parseInt(getConfig('per_ip_unverified_limit')) || 5
      const ipUnverifiedUsed = getIpUnverifiedDailyUsage(ip, date)
      if (ipUnverifiedUsed >= ipUnverifiedLimit) ipLimited = true
    }

    const allowed = userUsed < userLimit && globalUsed < globalLimit && !ipLimited
    if (allowed) {
      db.prepare('INSERT INTO usage_logs (user_id, date, status, ip) VALUES (?, ?, \'pending\', ?)').run(user.id, date, ip || null)
      if (userUsed >= user.daily_limit && user.bonus_quota > 0) {
        db.prepare('UPDATE users SET bonus_quota = bonus_quota - 1 WHERE id = ? AND bonus_quota > 0').run(user.id)
      }
    }
    const newBonus = allowed && userUsed >= user.daily_limit ? Math.max(0, user.bonus_quota - 1) : user.bonus_quota
    const newUserLimit = user.daily_limit + newBonus
    return {
      allowed,
      userRemaining: Math.max(0, newUserLimit - userUsed - (allowed ? 1 : 0)),
      globalRemaining: Math.max(0, globalLimit - globalUsed - (allowed ? 1 : 0)),
      userLimit: newUserLimit,
      globalLimit,
    }
  })()
  return result
}

export function bindEmail(userId: number, email: string): boolean {
  const verifiedLimit = parseInt(getConfig('per_user_daily_limit')) || 10
  const today = new Date().toISOString().slice(0, 10)
  try {
    db.transaction(() => {
      db.prepare('UPDATE users SET email = ?, daily_limit = ? WHERE id = ?').run(email, verifiedLimit, userId)
      db.prepare('UPDATE usage_logs SET status = \'refunded\' WHERE user_id = ? AND date = ? AND status != \'refunded\'').run(userId, today)
    })()
    return true
  } catch {
    return false
  }
}

export function applyAffCode(userId: number, affCode: string, fingerprint: string): { success: boolean; message: string } {
  const inviter = db.prepare('SELECT * FROM users WHERE aff_code = ?').get(affCode) as User | undefined
  if (!inviter) return { success: false, message: '邀请码无效' }
  if (inviter.id === userId) return { success: false, message: '不能邀请自己' }
  if (inviter.fingerprint === fingerprint) return { success: false, message: '不能邀请自己' }

  const user = getUserById(userId)
  if (!user) return { success: false, message: '用户不存在' }
  if (user.invited_by) return { success: false, message: '已使用过邀请码' }
  if (!user.email) return { success: false, message: '请先绑定邮箱' }
  if (inviter.email && user.email && inviter.email === user.email) return { success: false, message: '不能邀请自己' }

  const maxBonus = 100
  if (inviter.bonus_quota >= maxBonus) return { success: false, message: '邀请人已达到奖励上限' }

  const bonus = parseInt(getConfig('aff_bonus')) || 10
  const txn = db.transaction(() => {
    db.prepare('UPDATE users SET invited_by = ?, bonus_quota = bonus_quota + ? WHERE id = ?').run(inviter.id, bonus, userId)
    db.prepare('UPDATE users SET bonus_quota = MIN(bonus_quota + ?, ?) WHERE id = ?').run(bonus, maxBonus, inviter.id)
  })
  txn()
  return { success: true, message: `双方各获得 ${bonus} 次额外额度` }
}

export function storeEmailCode(email: string, code: string) {
  const expiresAt = Date.now() + 10 * 60 * 1000
  db.prepare('INSERT OR REPLACE INTO email_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, code, expiresAt)
}

export function verifyEmailCode(email: string, code: string): boolean {
  const row = db.prepare('SELECT * FROM email_codes WHERE email = ?').get(email) as { code: string; expires_at: number } | undefined
  if (!row) return false
  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM email_codes WHERE email = ?').run(email)
    return false
  }
  if (row.code !== code) {
    // Delete after 5 wrong attempts (code regeneration required)
    const wrongKey = `wrong:${email}`
    const wrong = (codeAttempts.get(wrongKey) || 0) + 1
    codeAttempts.set(wrongKey, wrong)
    if (wrong >= 5) {
      db.prepare('DELETE FROM email_codes WHERE email = ?').run(email)
      codeAttempts.delete(wrongKey)
    }
    return false
  }
  db.prepare('DELETE FROM email_codes WHERE email = ?').run(email)
  return true
}

const codeAttempts = new Map<string, number>()
setInterval(() => codeAttempts.clear(), 600_000)

// Admin queries
export function getUsers(page: number, pageSize: number, search?: string): { users: any[]; total: number } {
  const offset = (page - 1) * pageSize
  const selectCols = `u.*, inv.email as inviter_email, inv.fingerprint as inviter_fingerprint, inv.aff_code as inviter_aff_code,
    (SELECT COUNT(*) FROM users WHERE invited_by = u.id) as invite_count`
  const joinClause = `FROM users u LEFT JOIN users inv ON u.invited_by = inv.id`
  if (search) {
    const like = `%${search}%`
    const total = (db.prepare(`SELECT COUNT(*) as count ${joinClause} WHERE u.fingerprint LIKE ? OR u.email LIKE ? OR u.aff_code LIKE ? OR u.ip LIKE ?`).get(like, like, like, like) as { count: number }).count
    const users = db.prepare(`SELECT ${selectCols} ${joinClause} WHERE u.fingerprint LIKE ? OR u.email LIKE ? OR u.aff_code LIKE ? OR u.ip LIKE ? ORDER BY u.id DESC LIMIT ? OFFSET ?`).all(like, like, like, like, pageSize, offset) as any[]
    return { users, total }
  }
  const total = (db.prepare(`SELECT COUNT(*) as count FROM users`).get() as { count: number }).count
  const users = db.prepare(`SELECT ${selectCols} ${joinClause} ORDER BY u.id DESC LIMIT ? OFFSET ?`).all(pageSize, offset) as any[]
  return { users, total }
}

export function updateUser(id: number, updates: Partial<Pick<User, 'daily_limit' | 'bonus_quota' | 'banned'>>) {
  const sets: string[] = []
  const vals: any[] = []
  if (updates.daily_limit !== undefined) { sets.push('daily_limit = ?'); vals.push(updates.daily_limit) }
  if (updates.bonus_quota !== undefined) { sets.push('bonus_quota = ?'); vals.push(updates.bonus_quota) }
  if (updates.banned !== undefined) { sets.push('banned = ?'); vals.push(updates.banned) }
  if (sets.length === 0) return
  vals.push(id)
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function deleteUsers(ids: number[]) {
  db.transaction(() => {
    for (const id of ids) {
      db.prepare('DELETE FROM usage_logs WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM users WHERE id = ?').run(id)
    }
  })()
}

export function getDashboardStats() {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const todayCount = (db.prepare('SELECT COUNT(*) as count FROM usage_logs WHERE date = ?').get(today) as { count: number }).count
  const yesterdayCount = (db.prepare('SELECT COUNT(*) as count FROM usage_logs WHERE date = ?').get(yesterday) as { count: number }).count
  const totalCount = (db.prepare('SELECT COUNT(*) as count FROM usage_logs').get() as { count: number }).count
  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count
  const todayActiveUsers = (db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM usage_logs WHERE date = ?').get(today) as { count: number }).count
  const globalLimit = parseInt(getConfig('global_daily_limit')) || 1000

  const topUsers = db.prepare(`
    SELECT u.id, u.fingerprint, u.email, u.ip, u.aff_code, COUNT(l.id) as usage_count
    FROM users u JOIN usage_logs l ON u.id = l.user_id WHERE l.date = ?
    GROUP BY u.id ORDER BY usage_count DESC LIMIT 10
  `).all(today) as any[]

  return { today: todayCount, yesterday: yesterdayCount, total: totalCount, totalUsers, todayActiveUsers, globalLimit, globalRemaining: Math.max(0, globalLimit - todayCount), topUsers }
}

export function getUsageLogs(page: number, pageSize: number, date?: string, userId?: number, status?: string, sortBy?: string, sortDir?: string) {
  const offset = (page - 1) * pageSize
  let where = '1=1'
  const params: any[] = []
  if (date) { where += ' AND l.date = ?'; params.push(date) }
  if (userId) { where += ' AND l.user_id = ?'; params.push(userId) }
  if (status && status !== 'all') { where += ' AND l.status = ?'; params.push(status) }

  const allowedSort = ['id', 'date', 'created_at', 'status']
  const orderCol = allowedSort.includes(sortBy || '') ? `l.${sortBy}` : 'l.id'
  const orderDir = sortDir === 'ASC' ? 'ASC' : 'DESC'

  const total = (db.prepare(`SELECT COUNT(*) as count FROM usage_logs l WHERE ${where}`).get(...params) as { count: number }).count
  const logs = db.prepare(`SELECT l.*, u.fingerprint, u.email, u.ip as user_ip FROM usage_logs l JOIN users u ON l.user_id = u.id WHERE ${where} ORDER BY ${orderCol} ${orderDir} LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]
  return { logs, total }
}

export function getDashboardErrorCount() {
  const today = new Date().toISOString().slice(0, 10)
  const row = db.prepare('SELECT COUNT(*) as count FROM usage_logs WHERE date = ? AND status = \'error\'').get(today) as { count: number }
  return row.count
}

export default db
