import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  newApiUrl: (process.env.NEW_API_URL || 'http://127.0.0.1:3000').replace(/\/+$/, ''),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  builtinApiKey: process.env.BUILTIN_API_KEY || '',
  dbPath: process.env.DB_PATH || './data/playground.db',
  globalDailyLimit: parseInt(process.env.GLOBAL_DAILY_LIMIT || '1000'),
  perUserDailyLimit: parseInt(process.env.PER_USER_DAILY_LIMIT || '10'),
  perUserUnverifiedLimit: parseInt(process.env.PER_USER_UNVERIFIED_LIMIT || '3'),
  affBonus: parseInt(process.env.AFF_BONUS || '10'),
}
