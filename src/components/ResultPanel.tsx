'use client'
import { useState, useEffect } from 'react'

interface Props {
  jobId: string
  onNewTask: () => void
}

interface ArtifactData {
  type: string
  data_json: any
  validation_result?: string
}

interface JobData {
  id: string
  mode: string
  run_status: string
  store_profile: string
  created_at: string
  completed_at?: string
  error_message?: string
  artifacts: ArtifactData[]
}

type Tab = 'accounts' | 'analysis' | 'scripts'

export function ResultPanel({ jobId, onNewTask }: Props) {
  const [job, setJob] = useState<JobData | null>(null)
  const [tab, setTab] = useState<Tab>('accounts')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/jobs/${jobId}`)
      .then(r => r.json())
      .then(data => { setJob(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [jobId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="text-sm text-muted-foreground">加载结果...</span>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="text-sm text-muted-foreground">未找到任务数据</span>
      </div>
    )
  }

  const artifactsByType = new Map<string, any[]>()
  for (const a of job.artifacts) {
    const arr = artifactsByType.get(a.type) ?? []
    arr.push(a.data_json)
    artifactsByType.set(a.type, arr)
  }

  const benchmarks = artifactsByType.get('benchmark_accounts')?.flatMap(b => b.accounts ?? []) ?? []
  const analyses = artifactsByType.get('account_analysis') ?? []
  const strategies = artifactsByType.get('content_strategy') ?? []

  const profile: any = typeof job.store_profile === 'string' ? JSON.parse(job.store_profile) : job.store_profile

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16">
        {/* Header */}
        <div className="mb-8">
          <button onClick={onNewTask} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            &larr; 新建任务
          </button>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            分析结果
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile?.storeName ?? '门店'} &middot; {job.mode === 'fast' ? '快速模式' : '深度模式'}
          </p>
        </div>

        {/* Status */}
        {job.run_status === 'error' && job.error_message && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {job.error_message}
          </div>
        )}

        {job.run_status === 'completed' && (
          <div className="mb-6 flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
            <span className="size-2 rounded-full bg-green-600" />
            任务完成
          </div>
        )}

        {/* Tabs */}
        <div className="mb-8 flex gap-1 border-b border-border">
          {([
            ['accounts', `对标账号 (${benchmarks.length})`],
            ['analysis', '账号分析'],
            ['scripts', '内容策略'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm transition-colors ${
                tab === key
                  ? 'border-b-2 border-primary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'accounts' && <AccountsTab accounts={benchmarks} />}
        {tab === 'analysis' && <AnalysisTab analyses={analyses} />}
        {tab === 'scripts' && <ScriptsTab strategies={strategies} />}
      </div>
    </div>
  )
}

// --- Accounts Tab ---
function AccountsTab({ accounts }: { accounts: any[] }) {
  if (accounts.length === 0) {
    return <EmptyState message="暂无对标账号数据" />
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((acc: any) => (
        <div key={acc.userId} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">{acc.nickname ?? acc.userId}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{acc.classification?.type ?? '未分类'}</div>
            </div>
            {acc.score != null && (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                {acc.score}分
              </span>
            )}
          </div>
          {acc.followerCount != null && (
            <div className="mt-3 text-xs text-muted-foreground">
              {acc.followerCount.toLocaleString()} 粉丝
            </div>
          )}
          {acc.notes?.length > 0 && (
            <div className="mt-3 text-xs text-muted-foreground">
              {acc.notes.length} 篇笔记
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// --- Analysis Tab ---
function AnalysisTab({ analyses }: { analyses: any[] }) {
  if (analyses.length === 0) {
    return <EmptyState message="暂无分析数据" />
  }

  return (
    <div className="space-y-6">
      {analyses.flatMap((a: any) => (a.accounts ?? []).map((acc: any) => (
        <div key={acc.userId} className="rounded-xl border border-border bg-card p-6">
          <div className="text-sm font-medium text-foreground mb-4">
            {acc.nickname ?? acc.userId}
          </div>
          {(acc.analysis?.evidenceList ?? []).map((item: any, i: number) => (
            <div key={i} className="mb-3">
              <div className="text-sm text-foreground">{item.conclusion}</div>
              {item.evidence?.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.evidence.map((ev: string, j: number) => (
                    <EvidenceTag key={j} noteId={ev} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )))}
    </div>
  )
}

// --- Scripts Tab ---
function ScriptsTab({ strategies }: { strategies: any[] }) {
  const scripts = strategies.flatMap(s => s.scripts ?? [])

  if (scripts.length === 0) {
    return <EmptyState message="暂无内容策略" />
  }

  return (
    <div className="space-y-6">
      {scripts.map((script: any, i: number) => (
        <div key={i} className="rounded-xl border border-border bg-card p-6">
          <div className="text-base font-medium text-foreground">{script.title}</div>
          {script.summary && (
            <p className="mt-2 text-sm text-muted-foreground">{script.summary}</p>
          )}
          {script.shootingChecklist?.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                拍摄清单
              </div>
              <ul className="space-y-1">
                {script.shootingChecklist.map((item: string, j: number) => (
                  <li key={j} className="text-sm text-foreground flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {script.referenceNotes?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1">
              {script.referenceNotes.map((ref: any, j: number) => (
                <EvidenceTag key={j} noteId={ref.noteId ?? ref} label={ref.title} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// --- Evidence Tag ---
function EvidenceTag({ noteId, label }: { noteId: string; label?: string }) {
  return (
    <span className="inline-flex items-center rounded bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground" title={`笔记: ${noteId}`}>
      {label ?? noteId.slice(0, 8)}
    </span>
  )
}

// --- Empty State ---
function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">{message}</div>
  )
}
