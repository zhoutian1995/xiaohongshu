import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DATABASE_PATH ?? './data/xhs.db'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  migrate(db)
  return db
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      store_profile TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'fast',
      status TEXT NOT NULL DEFAULT 'queued',
      current_phase INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS benchmark_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      avatar TEXT,
      followers INTEGER DEFAULT 0,
      notes_count INTEGER DEFAULT 0,
      account_type TEXT NOT NULL,
      classification_method TEXT NOT NULL,
      classification_evidence TEXT,
      notes_last_30d INTEGER DEFAULT 0,
      notes_last_90d INTEGER DEFAULT 0,
      avg_likes REAL DEFAULT 0,
      avg_comments REAL DEFAULT 0,
      avg_favorites REAL DEFAULT 0,
      avg_shares REAL DEFAULT 0,
      collect_to_like_ratio REAL DEFAULT 0,
      consult_comment_rate REAL DEFAULT 0,
      score_json TEXT,
      notes_json TEXT,
      analysis_json TEXT,
      UNIQUE(project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id),
      account_id INTEGER REFERENCES benchmark_accounts(id),
      note_id TEXT NOT NULL,
      note_url TEXT,
      title TEXT,
      content TEXT,
      type TEXT DEFAULT 'image',
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      favorites INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      tags_json TEXT,
      published_at TEXT,
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      performance_tier TEXT,
      breakdown_json TEXT,
      UNIQUE(project_id, note_id)
    );

    CREATE TABLE IF NOT EXISTS job_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id),
      event_type TEXT NOT NULL,
      phase INTEGER,
      message TEXT,
      data_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_job_events_project ON job_events(project_id);
    CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_project ON benchmark_accounts(project_id);

    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
  `)
}

// --- Project CRUD ---

export function createProject(id: string, storeProfile: string, mode: string): void {
  getDb().prepare(
    'INSERT INTO projects (id, store_profile, mode, status) VALUES (?, ?, ?, ?)'
  ).run(id, storeProfile, mode, 'queued')
}

export function getProject(id: string): any | undefined {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
}

export function updateProjectStatus(id: string, status: string, extra?: { currentPhase?: number; errorMessage?: string; completedAt?: string }): void {
  const sets = ['status = ?']
  const values: any[] = [status]

  if (extra?.currentPhase !== undefined) { sets.push('current_phase = ?'); values.push(extra.currentPhase) }
  if (extra?.errorMessage !== undefined) { sets.push('error_message = ?'); values.push(extra.errorMessage) }
  if (extra?.completedAt !== undefined) { sets.push('completed_at = ?'); values.push(extra.completedAt) }

  values.push(id)
  getDb().prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function getNextQueuedProject(): any | undefined {
  return getDb().prepare("SELECT * FROM projects WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1").get()
}

// --- Job Events ---

export function insertJobEvent(projectId: string, eventType: string, phase: number | null, message: string, data?: any): void {
  getDb().prepare(
    'INSERT INTO job_events (project_id, event_type, phase, message, data_json) VALUES (?, ?, ?, ?, ?)'
  ).run(projectId, eventType, phase, message, data ? JSON.stringify(data) : null)
}

export function getJobEvents(projectId: string, afterId = 0): any[] {
  return getDb().prepare('SELECT * FROM job_events WHERE project_id = ? AND id > ? ORDER BY id ASC').all(projectId, afterId)
}

// --- Benchmark Accounts ---

export function upsertBenchmarkAccount(projectId: string, account: any): void {
  getDb().prepare(`
    INSERT INTO benchmark_accounts (project_id, user_id, nickname, avatar, followers, notes_count, account_type, classification_method, classification_evidence, notes_last_30d, notes_last_90d, avg_likes, avg_comments, avg_favorites, avg_shares, collect_to_like_ratio, consult_comment_rate, score_json, notes_json, analysis_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, user_id) DO UPDATE SET
      nickname=excluded.nickname, avatar=excluded.avatar, followers=excluded.followers,
      notes_count=excluded.notes_count, account_type=excluded.account_type,
      classification_method=excluded.classification_method, classification_evidence=excluded.classification_evidence,
      notes_last_30d=excluded.notes_last_30d, notes_last_90d=excluded.notes_last_90d,
      avg_likes=excluded.avg_likes, avg_comments=excluded.avg_comments,
      avg_favorites=excluded.avg_favorites, avg_shares=excluded.avg_shares,
      collect_to_like_ratio=excluded.collect_to_like_ratio, consult_comment_rate=excluded.consult_comment_rate,
      score_json=excluded.score_json, notes_json=excluded.notes_json, analysis_json=excluded.analysis_json
  `).run(
    projectId, account.userId, account.nickname, account.avatar ?? null,
    account.followers, account.notesCount, account.accountType,
    account.classificationMethod, account.classificationEvidence ?? null,
    account.notesLast30d ?? 0, account.notesLast90d ?? 0,
    account.avgLikes ?? 0, account.avgComments ?? 0, account.avgFavorites ?? 0, account.avgShares ?? 0,
    account.collectToLikeRatio ?? 0, account.consultCommentRate ?? 0,
    account.score ? JSON.stringify(account.score) : null,
    account.notes ? JSON.stringify(account.notes) : null,
    account.analysis ? JSON.stringify(account.analysis) : null
  )
}

export function getBenchmarkAccounts(projectId: string): any[] {
  return getDb().prepare('SELECT * FROM benchmark_accounts WHERE project_id = ? ORDER BY id ASC').all(projectId)
}

// --- Cache ---

export function getCache(key: string): string | null {
  purgeExpired()
  const row = getDb().prepare('SELECT value FROM cache WHERE key = ? AND expires_at > datetime("now")').get(key)
  return row ? (row as any).value : null
}

export function setCache(key: string, value: string, ttlSeconds: number): void {
  getDb().prepare(
    'INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, datetime("now", "+" || ? || " seconds"))'
  ).run(key, value, ttlSeconds)
}

function purgeExpired(): void {
  getDb().prepare("DELETE FROM cache WHERE expires_at <= datetime('now')").run()
}
