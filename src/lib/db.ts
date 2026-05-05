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
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      store_profile TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'fast',
      run_status TEXT NOT NULL DEFAULT 'queued',
      sandbox_pid INTEGER,
      budget_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT,
      completed_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      validation_result TEXT,
      validation_errors_json TEXT,
      repair_attempt INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_artifacts_job ON artifacts(job_id);

    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      tool_name TEXT NOT NULL,
      input_json TEXT,
      output_json TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      duration_ms INTEGER DEFAULT 0,
      budget_after_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tool_calls_job ON tool_calls(job_id);

    CREATE TABLE IF NOT EXISTS timeline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      event_type TEXT NOT NULL,
      message TEXT,
      data_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_job ON timeline_events(job_id);

    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
  `)
}

// --- Job CRUD ---

export function createJob(id: string, storeProfile: string, mode: string): void {
  getDb().prepare(
    'INSERT INTO jobs (id, store_profile, mode, run_status, budget_json) VALUES (?, ?, ?, ?, ?)'
  ).run(id, storeProfile, mode, 'queued', JSON.stringify({
    searchesUsed: 0, profilesUsed: 0, notesUsed: 0,
    claudeTokensUsed: 0, toolCallsTotal: 0, elapsedMs: 0,
  }))
}

export function getJob(id: string): any | undefined {
  const row = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id)
  if (row) {
    (row as any).store_profile = JSON.parse((row as any).store_profile)
    ;(row as any).budget_json = JSON.parse((row as any).budget_json || '{}')
  }
  return row
}

const ALLOWED_COLUMNS = new Set(['started_at', 'completed_at', 'error_message', 'sandbox_pid'])

export function updateJobStatus(id: string, runStatus: string, extra?: Record<string, any>): void {
  const sets = ['run_status = ?']
  const values: any[] = [runStatus]

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (k === 'budget') {
        sets.push('budget_json = ?')
        values.push(JSON.stringify(v))
      } else if (ALLOWED_COLUMNS.has(k)) {
        sets.push(`${k} = ?`)
        values.push(v)
      } else {
        throw new Error(`Invalid column in updateJobStatus: ${k}`)
      }
    }
  }

  values.push(id)
  getDb().prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function getNextQueuedJob(): any | undefined {
  return getDb().prepare("SELECT * FROM jobs WHERE run_status = 'queued' ORDER BY created_at ASC LIMIT 1").get()
}

export function claimNextJob(): any | undefined {
  const database = getDb()
  const claim = database.transaction(() => {
    const row = database.prepare(
      "SELECT * FROM jobs WHERE run_status = 'queued' ORDER BY created_at ASC LIMIT 1"
    ).get() as any
    if (!row) return undefined
    const result = database.prepare(
      "UPDATE jobs SET run_status = 'spawning', sandbox_pid = ? WHERE id = ? AND run_status = 'queued'"
    ).run(process.pid, row.id)
    if (result.changes === 0) return undefined
    row.run_status = 'spawning'
    row.sandbox_pid = process.pid
    row.store_profile = JSON.parse(row.store_profile)
    row.budget_json = JSON.parse(row.budget_json || '{}')
    return row
  })
  return claim()
}

// --- Artifacts ---

export function saveArtifact(id: string, jobId: string, type: string, data: string, repairAttempt = 0): void {
  getDb().prepare(
    'INSERT OR REPLACE INTO artifacts (id, job_id, type, data_json, repair_attempt) VALUES (?, ?, ?, ?, ?)'
  ).run(id, jobId, type, data, repairAttempt)
}

export function getArtifacts(jobId: string): any[] {
  return getDb().prepare('SELECT * FROM artifacts WHERE job_id = ? ORDER BY created_at ASC').all(jobId)
}

export function updateArtifactValidation(id: string, result: string, errors?: string[]): void {
  getDb().prepare(
    'UPDATE artifacts SET validation_result = ?, validation_errors_json = ? WHERE id = ?'
  ).run(result, errors ? JSON.stringify(errors) : null, id)
}

// --- Tool Calls ---

export function insertToolCall(tc: { id: string; jobId: string; toolName: string; input: string; output: string; status: string; errorMessage?: string; durationMs: number; budgetAfter: any }): void {
  getDb().prepare(
    'INSERT INTO tool_calls (id, job_id, tool_name, input_json, output_json, status, error_message, duration_ms, budget_after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(tc.id, tc.jobId, tc.toolName, tc.input, tc.output, tc.status, tc.errorMessage ?? null, tc.durationMs, JSON.stringify(tc.budgetAfter))
}

// --- Timeline Events ---

export function insertTimelineEvent(jobId: string, eventType: string, message: string, data?: any): number {
  const result = getDb().prepare(
    'INSERT INTO timeline_events (job_id, event_type, message, data_json) VALUES (?, ?, ?, ?)'
  ).run(jobId, eventType, message, data ? JSON.stringify(data) : null)
  return Number(result.lastInsertRowid)
}

export function getTimelineEvents(jobId: string, afterId = 0): any[] {
  return getDb().prepare('SELECT * FROM timeline_events WHERE job_id = ? AND id > ? ORDER BY id ASC').all(jobId, afterId)
}

// --- Cache ---

export function getCache(key: string): string | null {
  purgeExpired()
  const row = getDb().prepare("SELECT value FROM cache WHERE key = ? AND expires_at > datetime('now')").get(key)
  return row ? (row as any).value : null
}

export function setCache(key: string, value: string, ttlSeconds: number): void {
  getDb().prepare(
    "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))"
  ).run(key, value, ttlSeconds)
}

function purgeExpired(): void {
  getDb().prepare("DELETE FROM cache WHERE expires_at <= datetime('now')").run()
}
