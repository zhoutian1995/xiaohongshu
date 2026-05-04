// ============================================================
// AI 对标账号分析与内容生成工具 — 核心类型定义
// ============================================================

// --- 门店问卷 ---

export interface StoreProfile {
  // 基础信息
  industry: string
  city: string
  district?: string
  storeName: string

  // 定价与客群
  priceRange: string
  targetAudience: string
  businessArea: string

  // 能力与素材
  specialties: string[]
  realAdvantages: string[]
  filmableAssets: string[]
  onCamera: boolean
  onCameraInfo?: string

  // 运营情况
  postFrequency: string
  existingAccount?: string
  forbiddenTopics?: string[]

  // 转化方式
  conversionMethod: string
}

// --- 任务状态 ---

export type JobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'error'
export type JobMode = 'fast' | 'deep'

export interface Project {
  id: string
  storeProfile: StoreProfile
  mode: JobMode
  status: JobStatus
  currentPhase: number
  createdAt: string
  completedAt?: string
  errorMessage?: string
}

// --- 账号分类 ---

export type AccountType = 'merchant' | 'influencer' | 'deal' | 'user' | 'brand'

export interface ClassifiedAccount {
  userId: string
  nickname: string
  avatar: string
  followers: number
  notesCount: number
  accountType: AccountType | 'uncertain'
  classificationMethod: 'rule' | 'ai'
  classificationEvidence: string
}

// --- 评分 ---

export interface BenchmarkScore {
  localRelevance: number
  industryRelevance: number
  consultCommentRate: number
  activityScore: number
  recentHitRate: number
  hasOrganicHits: boolean
  learnability: number
  overallScore: number
}

// --- 笔记 ---

export type NoteType = 'image' | 'video'
export type PerformanceTier = 'hit' | 'average' | 'low'
export type DataFreshness = 'fresh' | 'stale'

export interface Note {
  noteId: string
  noteUrl: string
  title: string
  content: string
  type: NoteType
  mediaCount: number
  likes: number
  comments: number
  favorites: number
  shares: number
  tags: string[]
  isCollection: boolean
  isDeal: boolean
  publishedAt: string
  collectedAt: string
  dataFreshness: DataFreshness
  performanceTier: PerformanceTier
  scriptBreakdown?: ScriptBreakdown
  commentSamples?: CommentSample[]
}

export interface CommentSample {
  content: string
  likes: number
  type: 'consult' | 'praise' | 'question' | 'other'
}

// --- 对标账号（完整） ---

export interface BenchmarkAccount {
  userId: string
  nickname: string
  avatar: string
  followers: number
  notesCount: number
  accountType: AccountType
  classificationEvidence: string
  notesLast30d: number
  notesLast90d: number
  avgLikes: number
  avgComments: number
  avgFavorites: number
  avgShares: number
  collectToLikeRatio: number
  consultCommentRate: number
  score: BenchmarkScore
  notes: Note[]
  positioning?: string
  contentTypes?: ContentTypeDistribution[]
  analysis?: AccountAnalysis
}

export interface ContentTypeDistribution {
  type: string
  percentage: number
  avgEngagement: number
  evidence: EvidenceReference[]
}

// --- 脚本拆解 ---

export interface ScriptBreakdown {
  titleFormula: string
  coverStyle: string
  structure: string[]
  hookTechnique: string
  ctaTechnique: string
  evidence: EvidenceReference[]
}

// --- 证据引用 ---

export interface EvidenceReference {
  noteId: string
  title: string
  url: string
  relevantData?: string
}

// --- 账号分析 ---

export interface AccountAnalysis {
  positioning: string
  targetAudience: string
  differentiation: string
  contentTypes: ContentTypeDistribution[]
  postingFrequency: string
  postingTimePattern: string
  hitPatterns: string[]
  evidenceList: AnalysisConclusion[]
}

export interface AnalysisConclusion {
  conclusion: string
  evidence: EvidenceReference[]
  metric: string
}

// --- 脚本拆解对比 ---

export interface BreakdownResult {
  hitPatterns: ScriptPattern[]
  averagePatterns: ScriptPattern[]
  differenceFactors: DifferenceFactor[]
  reusableTemplates: ScriptTemplate[]
}

export interface ScriptPattern {
  titleFormula: string
  coverStyle: string
  hookTechnique: string
  ctaTechnique: string
  evidence: EvidenceReference[]
}

export interface DifferenceFactor {
  dimension: string
  hitBehavior: string
  averageBehavior: string
  impact: string
}

export interface ScriptTemplate {
  name: string
  structure: string[]
  applicableScenarios: string
  referenceNotes: EvidenceReference[]
}

// --- 内容策略 ---

export interface ContentStrategy {
  positioning: string
  positioningEvidence: EvidenceReference[]
  weekPlan: DayPlan[]
  topicPool: Topic[]
  scripts: ShootableScript[]
  tagLibrary: TagCategory[]
}

export interface DayPlan {
  day: number
  task: string
  shootingNotes: string
  onCamera: string
}

export interface Topic {
  title: string
  sourceAccount: string
  sourceNoteId: string
  engagement: number
}

export interface ShootableScript {
  title: string
  coverDescription: string
  copy: string
  shootingChecklist: string[]
  tags: string[]
  referenceNotes: EvidenceReference[]
}

export interface TagCategory {
  category: string
  tags: string[]
}

// --- 任务事件（SSE） ---

export type JobEventType =
  | 'job:started'
  | 'phase:started'
  | 'phase:progress'
  | 'phase:completed'
  | 'job:completed'
  | 'job:error'

export interface JobEvent {
  type: JobEventType
  jobId: string
  phase?: number
  message: string
  data?: unknown
  timestamp: string
}

// --- 评分权重 ---

export const FAST_MODE_WEIGHTS = {
  localRelevance: 0.25,
  industryRelevance: 0.20,
  consultCommentRate: 0.10, // 代理指标：收藏/评论比
  activityScore: 0.25,
  recentHitRate: 0.10,
  learnability: 0.10,
}

export const DEEP_MODE_WEIGHTS = {
  localRelevance: 0.25,
  industryRelevance: 0.20,
  consultCommentRate: 0.20,
  activityScore: 0.15,
  recentHitRate: 0.10,
  learnability: 0.10,
}
