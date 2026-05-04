// ============================================================
// AI 对标账号分析与内容生成工具 v3.0 — Agent 架构类型定义
// ============================================================

// --- 门店问卷 ---

export interface StoreProfile {
  industry: string
  city: string
  district?: string
  storeName: string
  priceRange: string
  targetAudience: string
  businessArea: string
  specialties: string[]
  realAdvantages: string[]
  filmableAssets: string[]
  onCamera: boolean
  onCameraInfo?: string
  postFrequency: string
  existingAccount?: string
  forbiddenTopics?: string[]
  conversionMethod: string
}

// --- 任务 ---

export type JobRunStatus =
  | 'queued'
  | 'spawning'
  | 'running'
  | 'validating'
  | 'repairing'
  | 'completed'
  | 'error'

export type JobMode = 'fast' | 'deep'

export interface Job {
  id: string
  storeProfile: StoreProfile
  mode: JobMode
  runStatus: JobRunStatus
  sandboxPid?: number
  startedAt?: string
  completedAt?: string
  errorMessage?: string
  budget: Budget
}

export interface Budget {
  searchesUsed: number
  profilesUsed: number
  notesUsed: number
  claudeTokensUsed: number
  toolCallsTotal: number
  elapsedMs: number
}

// --- 产物 ---

export type ArtifactType =
  | 'benchmark_accounts'
  | 'account_analysis'
  | 'script_breakdown'
  | 'content_strategy'

export interface Artifact {
  id: string
  jobId: string
  type: ArtifactType
  data: string  // JSON string
  createdAt: string
  validationResult?: 'pass' | 'fail'
  validationErrors?: string[]
  repairAttempt?: number // 0=首次, 1=修复后
}

// --- 工具调用 ---

export interface ToolCall {
  id: string
  jobId: string
  toolName: string
  input: string   // JSON
  output: string   // JSON
  status: 'success' | 'error' | 'budget_exceeded'
  errorMessage?: string
  durationMs: number
  budgetAfterCall: {
    searchesUsed: number
    profilesUsed: number
    notesUsed: number
    claudeTokensUsed: number
  }
  createdAt: string
}

// --- 时间线事件 ---

export type TimelineEventType =
  | 'job_started'
  | 'tool_called'
  | 'tool_completed'
  | 'artifact_saved'
  | 'validation_passed'
  | 'validation_failed'
  | 'repair_started'
  | 'job_completed'
  | 'job_error'

export interface TimelineEvent {
  id: string
  jobId: string
  type: TimelineEventType
  message: string
  data?: string // JSON
  createdAt: string
}

// --- 工具定义 ---

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown> // JSON Schema
  handler: (input: any, context: ToolContext) => Promise<any>
}

export interface ToolContext {
  jobId: string
  mode: JobMode
  storeProfile: StoreProfile
  budget: Budget
  budgetLimits: BudgetLimits
}

// --- 预算限制 ---

export interface BudgetLimits {
  maxSearches: number
  maxProfiles: number
  maxNotes: number
  maxAnalysisCalls: number
  maxClaudeTokens: number
  maxToolCalls: number
  maxElapsedMs: number
  maxCandidateAccounts: number
  maxBenchmarkAccounts: number
  maxScripts: number
}

export const FAST_MODE_LIMITS: BudgetLimits = {
  maxSearches: 6,
  maxProfiles: 15,
  maxNotes: 30,
  maxAnalysisCalls: 10,
  maxClaudeTokens: 80000,
  maxToolCalls: 50,
  maxElapsedMs: 8 * 60 * 1000,
  maxCandidateAccounts: 12,
  maxBenchmarkAccounts: 3,
  maxScripts: 2,
}

export const DEEP_MODE_LIMITS: BudgetLimits = {
  maxSearches: 12,
  maxProfiles: 50,
  maxNotes: 100,
  maxAnalysisCalls: 15,
  maxClaudeTokens: 200000,
  maxToolCalls: 100,
  maxElapsedMs: 15 * 60 * 1000,
  maxCandidateAccounts: 50,
  maxBenchmarkAccounts: 5,
  maxScripts: 3,
}

// --- 校验结果 ---

export interface ValidationResult {
  passed: boolean
  errors: string[]
}
