export interface QuotaInfo {
  userId: number
  email: string | null
  affCode: string
  hasEmail: boolean
  banned: boolean
  allowed: boolean
  userRemaining: number
  globalRemaining: number
  userLimit: number
  globalLimit: number
}

export async function initQuota(fingerprint: string): Promise<QuotaInfo> {
  const resp = await fetch('/api/quota/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint }),
  })
  const data = await resp.json()
  if (!data.success) throw new Error(data.message)
  return data.data
}

export async function checkQuota(fingerprint: string): Promise<{ allowed: boolean; userRemaining: number; globalRemaining: number; userLimit: number; globalLimit: number }> {
  const resp = await fetch('/api/quota/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint }),
  })
  const data = await resp.json()
  if (!data.success) throw new Error(data.message)
  return data.data
}

export async function getGlobalStats(): Promise<{ globalUsed: number; globalLimit: number; globalRemaining: number }> {
  const resp = await fetch('/api/quota/stats')
  const data = await resp.json()
  if (!data.success) throw new Error(data.message)
  return data.data
}

export async function bindEmail(fingerprint: string, email: string, code: string, affCode?: string): Promise<QuotaInfo> {
  const resp = await fetch('/api/quota/bind-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint, email, code, affCode: affCode || undefined }),
  })
  const data = await resp.json()
  if (!data.success) throw new Error(data.message)
  return data.data
}

export async function sendVerificationCode(email: string): Promise<void> {
  const resp = await fetch('/api/quota/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = await resp.json()
  if (!data.success) throw new Error(data.message)
}

export async function useAffCode(fingerprint: string, affCode: string): Promise<void> {
  const resp = await fetch('/api/quota/use-aff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint, affCode }),
  })
  const data = await resp.json()
  if (!data.success) throw new Error(data.message)
}
