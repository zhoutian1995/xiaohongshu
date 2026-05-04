import * as db from './db'

const ACCOUNT_TTL = 24 * 60 * 60  // 24 小时
const SEARCH_TTL = 60 * 60        // 1 小时

export function getCached<T>(key: string): T | null {
  const raw = db.getCache(key)
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export function setCache(key: string, value: unknown, ttl = ACCOUNT_TTL): void {
  db.setCache(key, JSON.stringify(value), ttl)
}

export function accountKey(userId: string): string {
  return `account:${userId}`
}

export function searchKey(keyword: string): string {
  return `search:${keyword}`
}

export { ACCOUNT_TTL, SEARCH_TTL }
